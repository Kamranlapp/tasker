// ── Save ───────────────────────────────────────────────────────
async function saveTree() {
  // Always save the main nodes (not the currently active notebook)
  const mainToSave = activeNotepad === null ? nodes : mainNodes;
  await sb.patch('trees', `?user_id=eq.${currentUser.id}`, { nodes: mainToSave, updated_at: new Date().toISOString() });
}

async function saveUIState() {
  const cn = {}, cg = {};
  const mainToSave = activeNotepad === null ? nodes : mainNodes;
  mainToSave.forEach(n => {
    cn[n.id] = n.collapsed;
    if (n.level === 3 && n.collapsedGroups) cg[n.id] = n.collapsedGroups;
  });
  await sb.patch('ui_state', `?user_id=eq.${currentUser.id}`, {
    collapsed_nodes: cn, collapsed_groups: cg,
    todo_collapsed: todoCollapsed,
    updated_at: new Date().toISOString()
  });
}

async function saveSettings() {
  // Sync active notebook nodes + statuses back into notepads array before saving
  if (activeNotepad !== null) {
    const np = notepads.find(n => n.key === activeNotepad);
    if (np) {
      np.nodes = nodes;
      np.statuses = serializeStatuses();
    }
  }
  // Top-level statuses always reflect the main notebook
  const arr = activeNotepad !== null ? mainStatuses : serializeStatuses();
  await sb.patch('settings', `?user_id=eq.${currentUser.id}`, {
    statuses: arr, theme, notepads,
    updated_at: new Date().toISOString()
  });
}

function markDirtySettings() {
  dirtySettings = true;
  dirtySettingsVersion++;
  setSyncLed('pending');
  scheduleSave();
}

// ── Dirty flags & debounced save ───────────────────────────────
let saveDebounceTimer = null;
let dirtyTreeVersion = 0;
let dirtyUIVersion = 0;
let dirtySettingsVersion = 0;

function markDirtyTree() {
  // When in an extra notebook, tree changes are saved with settings
  if (activeNotepad !== null) {
    dirtySettings = true;
    dirtySettingsVersion++;
  } else {
    dirtyTree = true;
    dirtyTreeVersion++;
  }
  setSyncLed('pending');
  scheduleSave();
}

function markDirtyUI() {
  dirtyUI = true;
  dirtyUIVersion++;
  setSyncLed('pending');
  scheduleSave();
}

function scheduleSave() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => flushSave(), SAVE_DEBOUNCE);
}

async function flushSave() {
  if (!currentUser || isSaving) return;
  const needsSave = dirtyTree || dirtyUI || dirtySettings;
  if (!needsSave) return;
  const saveTreeNow = dirtyTree;
  const saveUINow = dirtyUI;
  const saveSettingsNow = dirtySettings;
  const treeVersion = dirtyTreeVersion;
  const uiVersion = dirtyUIVersion;
  const settingsVersion = dirtySettingsVersion;
  isSaving = true;
  try {
    if (saveTreeNow) await saveTree();
    if (saveUINow) await saveUIState();
    if (saveSettingsNow) await saveSettings();
    if (saveTreeNow && dirtyTreeVersion === treeVersion) dirtyTree = false;
    if (saveUINow && dirtyUIVersion === uiVersion) dirtyUI = false;
    if (saveSettingsNow && dirtySettingsVersion === settingsVersion) dirtySettings = false;
    setSyncLed('uploaded');
  } catch (e) {
    console.error('Save failed:', e);
    setSyncLed('error');
  } finally {
    isSaving = false;
  }
}

// ── Sync loop ──────────────────────────────────────────────────
function startSyncLoop() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(async () => {
    if (!currentUser || isSaving) return;
    const needsSave = dirtyTree || dirtyUI || dirtySettings;
    const saveTreeNow = dirtyTree;
    const saveUINow = dirtyUI;
    const saveSettingsNow = dirtySettings;
    const treeVersion = dirtyTreeVersion;
    const uiVersion = dirtyUIVersion;
    const settingsVersion = dirtySettingsVersion;
    isSaving = true;
    try {
      if (saveTreeNow) await saveTree();
      if (saveUINow) await saveUIState();
      if (saveSettingsNow) await saveSettings();
      if (saveTreeNow && dirtyTreeVersion === treeVersion) dirtyTree = false;
      if (saveUINow && dirtyUIVersion === uiVersion) dirtyUI = false;
      if (saveSettingsNow && dirtySettingsVersion === settingsVersion) dirtySettings = false;
      await registerSession();
      setSyncLed(needsSave ? 'uploaded' : 'synced');
    } catch {
      setSyncLed('error');
    } finally {
      isSaving = false;
    }
  }, SYNC_INTERVAL);
}

// ── Sync LED ───────────────────────────────────────────────────
function setSyncLed(state) {
  const led = document.getElementById('sync-led');
  if (!led) return;
  led.classList.remove('green', 'grey', 'error', 'blink-once', 'blink-twice');
  void led.offsetWidth;
  switch (state) {
    case 'connected':
      led.classList.add('green', 'blink-twice');
      led.addEventListener('animationend', () => led.classList.remove('blink-twice'), { once: true });
      break;
    case 'pending':
      led.classList.add('grey');
      break;
    case 'synced':
      led.classList.add('green');
      break;
    case 'uploaded':
      led.classList.add('green', 'blink-once');
      led.addEventListener('animationend', () => led.classList.remove('blink-once'), { once: true });
      break;
    case 'error':
      led.classList.add('error');
      break;
  }
}

// ── Session ────────────────────────────────────────────────────
async function registerSession() {
  const token = getDeviceToken();
  await sb.upsert('sessions', { user_id: currentUser.id, device_token: token, last_seen: new Date().toISOString() });
}

// ── Load ───────────────────────────────────────────────────────
async function loadUserData() {
  // Tree (main notebook)
  const trees = await sb.get('trees', `?user_id=eq.${currentUser.id}&select=nodes`);
  if (trees.length) {
    nodes = trees[0].nodes?.length ? trees[0].nodes : [];
    nextId = nodes.length ? Math.max(...nodes.map(n => n.id)) + 1 : 1;
  } else {
    nodes = [];
    nextId = 1;
    await sb.post('trees', { user_id: currentUser.id, nodes: [], updated_at: new Date().toISOString() });
  }
  nodes.forEach(n => { if (n.status === '' || n.status == null) n.status = 'todo'; });
  if (nodes.length) focusedNodeId = nodes[0].id;

  // UI state
  const uis = await sb.get('ui_state', `?user_id=eq.${currentUser.id}&select=collapsed_groups,collapsed_nodes,todo_collapsed`);
  if (uis.length) {
    const ui = uis[0];
    todoCollapsed = ui.todo_collapsed || {};
    const cg = ui.collapsed_groups || {};
    const cn = ui.collapsed_nodes || {};
    nodes.forEach(n => {
      if (cn[n.id] !== undefined) n.collapsed = cn[n.id];
      if (n.level === 3 && cg[n.id]) n.collapsedGroups = cg[n.id];
    });
  }

  // Settings
  const sets = await sb.get('settings', `?user_id=eq.${currentUser.id}&select=statuses,theme,notepads`);
  if (sets.length) {
    if (sets[0].statuses?.length) {
      applyStatuses(sets[0].statuses);
      mainStatuses = sets[0].statuses;
    } else {
      mainStatuses = serializeStatuses();
    }
    if (sets[0].theme) theme = { ...THEME_DEFAULTS, ...sets[0].theme };
    if (sets[0].notepads) {
      // Load extra notebooks (filter out old text-notepad 'main' entries)
      notepads = sets[0].notepads
        .filter(n => n.key !== 'main')
        .map(n => {
          const nds = Array.isArray(n.nodes) ? n.nodes : [];
          nds.forEach(nd => { if (nd.status === '' || nd.status == null) nd.status = 'todo'; });
          // Notebooks without saved statuses inherit from main
          const sts = Array.isArray(n.statuses) && n.statuses.length ? n.statuses : mainStatuses.slice();
          return { ...n, nodes: nds, statuses: sts };
        });
    }
  } else {
    const defaultStatuses = STATUSES.map(s => ({ key: s, label: S_LABEL[s], icon: S_ICON[s] }));
    await sb.post('settings', { user_id: currentUser.id, statuses: defaultStatuses, theme: {}, notepads: [], updated_at: new Date().toISOString() });
  }
  applyTheme();

  startSyncLoop();
  setSyncLed('connected');
  checkAndCreateCurrentWeek();
  setInterval(() => {
    const now = getCETDate();
    if (now.getDay() === 1 && now.getHours() === 1) checkAndCreateCurrentWeek();
  }, 60 * 60 * 1000);
}
