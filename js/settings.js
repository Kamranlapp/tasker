// ── Settings UI ────────────────────────────────────────────────
let editingNotepadKey = null;
let allUsers = null;
let newUserSeed = null;

function openSettings() {
  document.getElementById('settings-screen').classList.add('open');
  renderSettings();
}

function closeSettings() {
  document.getElementById('settings-screen').classList.remove('open');
  applyActiveTheme();
  flushSave();
}

function renderSettings() {
  document.getElementById('seed-display').textContent = currentUser.seed_phrase;
  renderStatusList();
  renderThemePanel();
  renderAdminPanel();
}

// ── Status list ────────────────────────────────────────────────
function renderStatusList() {
  const list = document.getElementById('status-list');
  list.innerHTML = '';
  const ordered = displayOrder().filter(s => s && s !== '');

  ordered.forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'status-row';
    row.dataset.key = s;

    const reorderWrap = document.createElement('div');
    reorderWrap.className = 'status-reorder-btns';

    if (s !== 'todo') {
      const upBtn = document.createElement('button');
      upBtn.className = 'status-reorder-btn';
      upBtn.textContent = '▲';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => {
        const i = STATUSES.indexOf(s);
        const prev = STATUSES.slice(0, i).reverse().find(x => x !== 'todo');
        if (prev === undefined) return;
        const pi = STATUSES.indexOf(prev);
        [STATUSES[i], STATUSES[pi]] = [STATUSES[pi], STATUSES[i]];
        markDirtySettings(); renderStatusList(); render();
      });

      const dnBtn = document.createElement('button');
      dnBtn.className = 'status-reorder-btn';
      dnBtn.textContent = '▼';
      dnBtn.disabled = idx === ordered.length - 2;
      dnBtn.addEventListener('click', () => {
        const i = STATUSES.indexOf(s);
        const next = STATUSES.slice(i + 1).find(x => x !== 'todo');
        if (next === undefined) return;
        const ni = STATUSES.indexOf(next);
        [STATUSES[i], STATUSES[ni]] = [STATUSES[ni], STATUSES[i]];
        markDirtySettings(); renderStatusList(); render();
      });

      reorderWrap.appendChild(upBtn);
      reorderWrap.appendChild(dnBtn);
    }
    row.appendChild(reorderWrap);

    const iconInp = document.createElement('input');
    iconInp.className = 'status-icon-input';
    iconInp.value = S_ICON[s] || '';
    iconInp.maxLength = 2;
    iconInp.addEventListener('change', () => { S_ICON[s] = iconInp.value; markDirtySettings(); });
    row.appendChild(iconInp);

    const lblInp = document.createElement('input');
    lblInp.className = 'status-label-input';
    lblInp.value = S_LABEL[s] || s;
    lblInp.addEventListener('change', () => { S_LABEL[s] = lblInp.value; markDirtySettings(); });
    row.appendChild(lblInp);

    if (s !== 'todo') {
      const delBtn = document.createElement('button');
      delBtn.className = 'status-del-btn';
      delBtn.textContent = '×';
      delBtn.title = 'Remove (tasks move to To-do)';
      delBtn.addEventListener('click', () => removeStatus(s));
      row.appendChild(delBtn);
    }

    list.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'status-add-btn';
  addBtn.textContent = '+ Add status';
  addBtn.addEventListener('click', addNewStatus);
  list.appendChild(addBtn);
}

function addNewStatus() {
  let n = 1;
  while (STATUSES.includes('custom' + n)) n++;
  const key = 'custom' + n;
  STATUSES.push(key);
  pickerStatuses.push(key);
  S_ICON[key] = '🔵';
  S_LABEL[key] = 'Custom ' + n;
  renderStatusList();
  markDirtySettings();
  flushSave();
}

function removeStatus(key) {
  nodes.forEach(n => { if (n.status === key) n.status = 'todo'; });
  markDirtyTree();
  STATUSES = STATUSES.filter(s => s !== key);
  pickerStatuses = pickerStatuses.filter(s => s !== key);
  delete S_ICON[key];
  delete S_LABEL[key];
  renderStatusList();
  markDirtySettings();
  flushSave();
}

// ── Theme panel ────────────────────────────────────────────────
function renderThemePanel() {
  const panel = document.getElementById('theme-panel');
  if (!panel) return;
  panel.innerHTML = '';

  const ALL_KEY = '__all__';

  // ── Notebook selector (styled like main page) ─────────────────
  const nbSel = document.createElement('div');
  nbSel.className = 'settings-nb-selector';

  const mkNbTab = (key, emoji, name) => {
    const tab = document.createElement('div');
    tab.className = 'settings-nb-tab' + (editingNotepadKey === key ? ' active' : '');
    const em = document.createElement('span'); em.className = 'settings-nb-tab-emoji'; em.textContent = emoji;
    const nm = document.createElement('span'); nm.textContent = ' ' + name;
    tab.appendChild(em); tab.appendChild(nm);
    tab.addEventListener('click', () => { editingNotepadKey = key; renderThemePanel(); });
    return tab;
  };

  nbSel.appendChild(mkNbTab(ALL_KEY, '🌐', 'All'));
  nbSel.appendChild(mkNbTab(null, '📋', 'Main'));
  notepads.forEach(np => nbSel.appendChild(mkNbTab(np.key, np.emoji || '📝', np.name || np.key)));

  if (notepads.length < 2) {
    const addBtn = document.createElement('span');
    addBtn.className = 'settings-nb-add';
    addBtn.textContent = '+';
    addBtn.title = 'Add notebook';
    addBtn.addEventListener('click', addNotepad);
    nbSel.appendChild(addBtn);
  }
  panel.appendChild(nbSel);

  // Notepad edit row (only when a specific notepad is selected)
  if (editingNotepadKey !== null && editingNotepadKey !== ALL_KEY) {
    const np = notepads.find(n => n.key === editingNotepadKey);
    if (np) {
      const editRow = document.createElement('div');
      editRow.className = 'notepad-edit-row';

      const emojiInp = document.createElement('input');
      emojiInp.className = 'notepad-emoji-input';
      emojiInp.value = np.emoji || '📝';
      emojiInp.maxLength = 2;
      emojiInp.addEventListener('change', () => { np.emoji = emojiInp.value; markDirtySettings(); renderThemePanel(); });
      editRow.appendChild(emojiInp);

      const nameInp = document.createElement('input');
      nameInp.className = 'notepad-name-input';
      nameInp.value = np.name || '';
      nameInp.placeholder = 'Name';
      nameInp.addEventListener('change', () => { np.name = nameInp.value; markDirtySettings(); renderThemePanel(); });
      editRow.appendChild(nameInp);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'notepad-copy-btn';
      copyBtn.textContent = '📋 Copy from Main';
      copyBtn.title = 'Copy main notebook styling to this notebook';
      copyBtn.addEventListener('click', () => {
        np.theme = JSON.parse(JSON.stringify(theme));
        markDirtySettings();
        applyTheme(np.theme);
        renderThemePanel();
      });
      editRow.appendChild(copyBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'notepad-del-btn';
      delBtn.textContent = '×';
      delBtn.title = 'Remove notebook';
      delBtn.addEventListener('click', () => removeNotepad(np.key));
      editRow.appendChild(delBtn);

      panel.appendChild(editRow);
    }
  }

  // Which theme to edit (All → main theme, propagate to all on save)
  let editTheme = theme;
  if (editingNotepadKey !== null && editingNotepadKey !== ALL_KEY) {
    const np = notepads.find(n => n.key === editingNotepadKey);
    if (np) { if (!np.theme) np.theme = { ...THEME_DEFAULTS }; editTheme = np.theme; }
  }

  const applyNow = () => {
    applyTheme(editTheme);
    if (editingNotepadKey === ALL_KEY) {
      notepads.forEach(np => { np.theme = { ...editTheme }; });
    }
    markDirtySettings();
  };

  // ── Helpers ──────────────────────────────────────────────────
  const mkColorCell = (label, colorKey, th, sizeKey) => {
    const cell = document.createElement('div'); cell.className = 'theme-cell';
    const lbl = document.createElement('span'); lbl.className = 'theme-cell-label'; lbl.textContent = label;
    const controls = document.createElement('div'); controls.className = 'theme-cell-controls';
    const wrap = document.createElement('div'); wrap.className = 'theme-color-wrap';
    const inp = document.createElement('input'); inp.type = 'color'; inp.className = 'theme-color-input';
    inp.value = th[colorKey] || THEME_DEFAULTS[colorKey]; wrap.appendChild(inp); controls.appendChild(wrap);
    const hex = document.createElement('input'); hex.className = 'theme-hex theme-hex-sm';
    hex.value = inp.value; hex.spellcheck = false; controls.appendChild(hex);
    if (sizeKey !== undefined) {
      const si = document.createElement('input'); si.type = 'number';
      si.className = 'theme-size-input'; si.min = 8; si.max = 36; si.step = 1;
      si.value = th[sizeKey] || THEME_DEFAULTS[sizeKey];
      si.addEventListener('change', () => { th[sizeKey] = parseInt(si.value) || THEME_DEFAULTS[sizeKey]; applyNow(); });
      controls.appendChild(si);
    }
    const onc = v => { th[colorKey] = v; applyNow(); };
    inp.addEventListener('input', () => { hex.value = inp.value; onc(inp.value); });
    hex.addEventListener('change', () => {
      let v = hex.value.trim();
      if (/^#?[0-9a-fA-F]{6}$/.test(v)) { if (!v.startsWith('#')) v = '#' + v; inp.value = v; hex.value = v; onc(v); }
      else hex.value = th[colorKey] || THEME_DEFAULTS[colorKey];
    });
    cell.appendChild(lbl); cell.appendChild(controls);
    return cell;
  };

  const mkColorRow = (label, colorKey, th, sizeKey) => {
    const row = document.createElement('div'); row.className = 'theme-row';
    if (label) { const lbl = document.createElement('span'); lbl.className = 'theme-label'; lbl.textContent = label; row.appendChild(lbl); }
    const wrap = document.createElement('div'); wrap.className = 'theme-color-wrap';
    const inp = document.createElement('input'); inp.type = 'color'; inp.className = 'theme-color-input';
    inp.value = th[colorKey] || THEME_DEFAULTS[colorKey]; wrap.appendChild(inp); row.appendChild(wrap);
    const hex = document.createElement('input'); hex.className = 'theme-hex';
    hex.value = inp.value; hex.spellcheck = false; row.appendChild(hex);
    const onc = v => { th[colorKey] = v; applyNow(); };
    inp.addEventListener('input', () => { hex.value = inp.value; onc(inp.value); });
    hex.addEventListener('change', () => {
      let v = hex.value.trim();
      if (/^#?[0-9a-fA-F]{6}$/.test(v)) { if (!v.startsWith('#')) v = '#' + v; inp.value = v; hex.value = v; onc(v); }
      else hex.value = th[colorKey] || THEME_DEFAULTS[colorKey];
    });
    if (sizeKey !== undefined) {
      const si = document.createElement('input'); si.type = 'number';
      si.className = 'theme-size-input'; si.min = 8; si.max = 36; si.step = 1;
      si.value = th[sizeKey] || THEME_DEFAULTS[sizeKey];
      si.addEventListener('change', () => { th[sizeKey] = parseInt(si.value) || THEME_DEFAULTS[sizeKey]; applyNow(); });
      row.appendChild(si);
    }
    return row;
  };

  const mkSliderRow = (label, key, th, max, step = 1, min = 0) => {
    const row = document.createElement('div'); row.className = 'theme-row';
    if (label) { const lbl = document.createElement('span'); lbl.className = 'theme-label'; lbl.textContent = label; row.appendChild(lbl); }
    const wrap = document.createElement('div'); wrap.className = 'theme-range-wrap';
    const range = document.createElement('input'); range.type = 'range'; range.className = 'theme-range';
    range.min = min; range.max = max; range.step = step;
    range.value = Math.min(Math.max(th[key] ?? THEME_DEFAULTS[key], min), max);
    const val = document.createElement('span'); val.className = 'theme-range-val'; val.textContent = range.value + 'px';
    const updateTrack = () => {
      const pct = (range.value - range.min) / (range.max - range.min) * 100;
      range.style.background = `linear-gradient(to right,#88c0d0 ${pct}%,#1a1f27 ${pct}%)`;
    };
    wrap.appendChild(range); wrap.appendChild(val); row.appendChild(wrap);
    range.addEventListener('input', () => { th[key] = parseInt(range.value); val.textContent = range.value + 'px'; updateTrack(); applyNow(); });
    updateTrack();
    return row;
  };

  const mkToggle = (opt1, opt2, isOpt1, onChange) => {
    const row = document.createElement('div'); row.className = 'theme-row';
    const tog = document.createElement('div'); tog.className = 'theme-toggle';
    [opt1, opt2].forEach((opt, i) => {
      const btn = document.createElement('span');
      btn.className = 'theme-toggle-btn' + ((i === 0) === isOpt1 ? ' active' : '');
      btn.textContent = opt;
      btn.addEventListener('click', () => onChange(i === 0));
      tog.appendChild(btn);
    });
    row.appendChild(tog);
    return row;
  };

  // ── Font Colors & Sizes (2-column grid, font picker in 6th slot) ─
  const fcGroup = document.createElement('div'); fcGroup.className = 'theme-group';
  const fcTitle = document.createElement('div'); fcTitle.className = 'theme-group-title'; fcTitle.textContent = 'Font Colors & Sizes';
  fcGroup.appendChild(fcTitle);
  const fcGrid = document.createElement('div'); fcGrid.className = 'theme-colors-grid';
  [['Year','yearColor','yearSize'],['Month','monthColor','monthSize'],
   ['Week','weekColor','weekSize'],['Account','accountColor','accountSize'],
   ['Text','textColor','textSize']]
    .forEach(([l,c,s]) => fcGrid.appendChild(mkColorCell(l, c, editTheme, s)));
  const fontCell = document.createElement('div'); fontCell.className = 'theme-cell';
  const fontCellLbl = document.createElement('span'); fontCellLbl.className = 'theme-cell-label'; fontCellLbl.textContent = 'Font';
  const fontSel = document.createElement('select'); fontSel.className = 'theme-font-select';
  FONT_OPTIONS.forEach(opt => {
    const o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label;
    if ((editTheme.fontFamily || THEME_DEFAULTS.fontFamily) === opt.value) o.selected = true;
    fontSel.appendChild(o);
  });
  fontSel.addEventListener('change', () => { editTheme.fontFamily = fontSel.value; applyNow(); });
  fontCell.appendChild(fontCellLbl); fontCell.appendChild(fontSel);
  fcGrid.appendChild(fontCell);
  fcGroup.appendChild(fcGrid);
  fcGroup.appendChild(mkSliderRow('Horizontal shift', 'indentSize', editTheme, 55, 5, 5));
  panel.appendChild(fcGroup);

  // ── Background ────────────────────────────────────────────────
  const bgGroup = document.createElement('div'); bgGroup.className = 'theme-group';
  const bgTitle = document.createElement('div'); bgTitle.className = 'theme-group-title'; bgTitle.textContent = 'Background';
  bgGroup.appendChild(bgTitle);
  const bgIsColor = (editTheme.bgMode || 'color') !== 'image';
  bgGroup.appendChild(mkToggle('Color', 'Image', bgIsColor, isColor => {
    editTheme.bgMode = isColor ? 'color' : 'image'; applyNow(); renderThemePanel();
  }));
  if (!bgIsColor) {
    const grid = document.createElement('div'); grid.className = 'bg-image-grid';
    BG_LIBRARY.forEach(img => {
      const thumb = document.createElement('div');
      thumb.className = 'bg-image-thumb' + (editTheme.bgImageId === img.id ? ' selected' : '');
      thumb.style.backgroundImage = `url('${img.url}')`;
      const lbl = document.createElement('span'); lbl.className = 'bg-image-label';
      lbl.textContent = img.label;
      thumb.appendChild(lbl);
      thumb.addEventListener('click', () => { editTheme.bgImageId = img.id; applyNow(); renderThemePanel(); });
      grid.appendChild(thumb);
    });
    bgGroup.appendChild(grid);
  } else {
    bgGroup.appendChild(mkColorRow('Color', 'bg', editTheme));
  }
  panel.appendChild(bgGroup);

  // ── Main Panel + Right Panel (side by side) ───────────────────
  const panelsRow = document.createElement('div'); panelsRow.className = 'theme-panels-row';

  const mkPanelCol = (title, bgModeKey, colorKey, blurKey, blurMax) => {
    const col = document.createElement('div'); col.className = 'theme-panel-col';
    const t = document.createElement('div'); t.className = 'theme-group-title'; t.textContent = title; col.appendChild(t);
    const isColor = (editTheme[bgModeKey] || 'color') !== 'blur';
    col.appendChild(mkToggle('Color', 'Blur', isColor, ic => {
      editTheme[bgModeKey] = ic ? 'color' : 'blur'; applyNow(); renderThemePanel();
    }));
    col.appendChild(isColor ? mkColorRow(null, colorKey, editTheme) : mkSliderRow(null, blurKey, editTheme, blurMax, 5));
    return col;
  };

  panelsRow.appendChild(mkPanelCol('Main Panel', 'mainBgMode', 'mainBg', 'mainBlur', 45));
  panelsRow.appendChild(mkPanelCol('Right Panel', 'rightBgMode', 'rightBg', 'rightBlur', 45));
  panel.appendChild(panelsRow);
}

function addNotepad() {
  if (notepads.length >= 2) return; // max 2 extra (3 total including main)
  let n = 1;
  while (notepads.some(np => np.key === 'nb' + n)) n++;
  const key = 'nb' + n;
  notepads.push({ key, name: 'Notebook ' + n, emoji: '📝', nodes: [], theme: { ...THEME_DEFAULTS }, statuses: serializeStatuses() });
  editingNotepadKey = key;
  renderThemePanel();
  markDirtySettings();
}

function removeNotepad(key) {
  showDeleteNotepadModal(key);
}

function showDeleteNotepadModal(key) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const box = document.createElement('div');
  box.className = 'modal-box';

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'Delete notebook';

  const text = document.createElement('div');
  text.className = 'modal-text';
  text.innerHTML = 'That will delete all the data in the notebook.<br>Are you sure you want to delete? If yes, type <strong>"delete data"</strong>';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'modal-input';
  inp.placeholder = 'Type "delete data"';
  inp.autocomplete = 'off';
  inp.spellcheck = false;

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-cancel-btn';
  cancelBtn.textContent = 'Cancel';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'modal-delete-btn';
  deleteBtn.textContent = 'Delete';
  deleteBtn.disabled = true;

  inp.addEventListener('input', () => { deleteBtn.disabled = inp.value !== 'delete data'; });

  const close = () => overlay.remove();
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });

  deleteBtn.addEventListener('click', () => {
    close();
    const idx = notepads.findIndex(np => np.key === key);
    if (idx === -1) return;
    const removed = notepads[idx];
    if (activeNotepad === key) switchNotebook(null);
    notepads = notepads.filter(np => np.key !== key);
    if (editingNotepadKey === key) editingNotepadKey = null;
    renderThemePanel();
    showUndoDeleteToast(removed, idx);
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(deleteBtn);
  box.appendChild(title);
  box.appendChild(text);
  box.appendChild(inp);
  box.appendChild(actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  setTimeout(() => inp.focus(), 50);
}

function showUndoDeleteToast(removed, originalIdx) {
  let toast = document.getElementById('delete-undo-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'delete-undo-toast';
    const msg = document.createElement('span'); msg.className = 'undo-toast-msg'; msg.textContent = 'Notebook deleted.';
    const undoBtn = document.createElement('button'); undoBtn.id = 'undo-delete-btn'; undoBtn.textContent = 'Undo';
    const countdown = document.createElement('span'); countdown.id = 'undo-countdown';
    toast.appendChild(msg); toast.appendChild(undoBtn); toast.appendChild(countdown);
    document.body.appendChild(toast);
  }

  const undoBtn = document.getElementById('undo-delete-btn');
  const countdown = document.getElementById('undo-countdown');
  clearTimeout(toast._finalTimer);
  clearInterval(toast._tickTimer);
  let secondsLeft = 5;
  countdown.textContent = secondsLeft + 's';
  toast.classList.add('visible');

  undoBtn.onclick = () => {
    clearTimeout(toast._finalTimer);
    clearInterval(toast._tickTimer);
    notepads.splice(originalIdx, 0, removed);
    toast.classList.remove('visible');
    renderThemePanel();
    markDirtySettings();
  };

  toast._tickTimer = setInterval(() => {
    secondsLeft--;
    countdown.textContent = secondsLeft + 's';
    if (secondsLeft <= 0) clearInterval(toast._tickTimer);
  }, 1000);

  toast._finalTimer = setTimeout(() => {
    clearInterval(toast._tickTimer);
    toast.classList.remove('visible');
    markDirtySettings();
    flushSave();
  }, 5000);
}

// ── Admin panel ────────────────────────────────────────────────
function renderAdminPanel() {
  const panel = document.getElementById('admin-panel');
  if (!panel) return;
  panel.innerHTML = '';
  if (currentUser.role !== 'admin') return;

  const sec = document.createElement('div');
  sec.className = 'admin-section';

  const title = document.createElement('div');
  title.className = 'admin-section-title';
  title.textContent = 'Admin — Users';
  sec.appendChild(title);

  if (!allUsers) {
    const loadBtn = document.createElement('button');
    loadBtn.className = 'seed-btn';
    loadBtn.textContent = 'Load users';
    loadBtn.addEventListener('click', async () => {
      try {
        allUsers = await sb.get('users', '?select=id,display_name,role,seed_phrase&order=display_name');
        renderAdminPanel();
      } catch (e) { console.error('Failed to load users:', e); }
    });
    sec.appendChild(loadBtn);
  } else {
    allUsers.forEach(u => {
      const row = document.createElement('div');
      row.className = 'admin-user-row';

      const name = document.createElement('span');
      name.className = 'admin-user-name';
      name.textContent = (u.display_name || 'unnamed') + (u.id === currentUser.id ? ' (you)' : '');
      row.appendChild(name);

      const sel = document.createElement('select');
      sel.className = 'admin-role-select';
      ['user', 'admin'].forEach(r => {
        const opt = document.createElement('option');
        opt.value = r; opt.textContent = r;
        if (u.role === r) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', async () => {
        try {
          await sb.patch('users', `?id=eq.${u.id}`, { role: sel.value });
          u.role = sel.value;
        } catch (e) { console.error('Failed to update role:', e); }
      });
      row.appendChild(sel);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'admin-icon-btn';
      copyBtn.textContent = '📋';
      copyBtn.title = 'Copy seed phrase';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(u.seed_phrase || '');
        copyBtn.textContent = '✓';
        setTimeout(() => copyBtn.textContent = '📋', 1500);
      });
      row.appendChild(copyBtn);

      if (u.id !== currentUser.id) {
        const delBtn = document.createElement('button');
        delBtn.className = 'admin-icon-btn admin-del-btn';
        delBtn.textContent = '×';
        delBtn.title = 'Delete user';
        delBtn.addEventListener('click', () => deleteUser(u));
        row.appendChild(delBtn);
      }

      sec.appendChild(row);
    });

    const createBtn = document.createElement('button');
    createBtn.className = 'admin-create-btn';
    createBtn.textContent = '+ Create new user';
    createBtn.addEventListener('click', createNewUser);
    sec.appendChild(createBtn);

    if (newUserSeed) {
      const res = document.createElement('div');
      res.className = 'admin-seed-result';
      res.innerHTML = `New user created!<br>Seed: <strong>${newUserSeed}</strong>`;
      const copyBtn = document.createElement('button');
      copyBtn.className = 'seed-btn';
      copyBtn.style.marginTop = '6px';
      copyBtn.textContent = 'Copy seed';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(newUserSeed);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy seed', 1500);
      });
      res.appendChild(document.createElement('br'));
      res.appendChild(copyBtn);
      sec.appendChild(res);
    }
  }
  panel.appendChild(sec);
}

async function deleteUser(u) {
  if (!confirm(`Delete "${u.display_name || 'unnamed'}"? This cannot be undone.`)) return;
  try {
    await sb.query('sessions', 'DELETE', null, `?user_id=eq.${u.id}`);
    await sb.query('trees', 'DELETE', null, `?user_id=eq.${u.id}`);
    await sb.query('ui_state', 'DELETE', null, `?user_id=eq.${u.id}`);
    await sb.query('settings', 'DELETE', null, `?user_id=eq.${u.id}`);
    await sb.query('users', 'DELETE', null, `?id=eq.${u.id}`);
    allUsers = allUsers.filter(x => x.id !== u.id);
    renderAdminPanel();
  } catch (e) { console.error('Failed to delete user:', e); }
}

async function createNewUser() {
  const wordList = [
    'alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel','india','juliet',
    'kilo','lima','mike','november','oscar','papa','quebec','romeo','sierra','tango',
    'uniform','victor','whiskey','xray','yankee','zulu','anchor','breeze','coral','drift',
    'ember','frost','grove','haven','ivory','jade','karma','lunar','maple','nexus',
    'oasis','pearl','quest','ridge','solar','terra','unity','vivid','wren','zenith'
  ];
  const pick = () => wordList[Math.floor(Math.random() * wordList.length)];
  const seed = [pick(), pick(), pick(), pick(), pick(), pick()].join(' ');
  const name = 'User ' + Math.floor(Math.random() * 9000 + 1000);
  try {
    await sb.post('users', { seed_phrase: seed, display_name: name, role: 'user' });
    const newUsers = await sb.get('users', `?seed_phrase=eq.${encodeURIComponent(seed)}&select=id`);
    if (newUsers.length) {
      const uid = newUsers[0].id;
      const defaultStatuses = [
        { key: 'todo', label: 'To-do', icon: '⚠️' },
        { key: 'done', label: 'Done', icon: '✅' },
        { key: 'info', label: 'Info', icon: 'ℹ️' }
      ];
      await sb.post('settings', { user_id: uid, statuses: defaultStatuses, theme: {}, notepads: [] });
      await sb.post('ui_state', { user_id: uid, collapsed_nodes: {}, collapsed_groups: {}, todo_collapsed: {} });
      await sb.post('trees', { user_id: uid, nodes: [], updated_at: new Date().toISOString() });
    }
    newUserSeed = seed;
    allUsers = await sb.get('users', '?select=id,display_name,role,seed_phrase&order=display_name');
    renderAdminPanel();
  } catch (e) {
    console.error('Failed to create user:', e);
  }
}
