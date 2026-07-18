// ── Offline state cache ────────────────────────────────────────
const OFFLINE_DB_NAME = 'tasker-offline';
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORE = 'snapshots';

let offlineAuthUserId = null;
let offlineCacheTimer = null;
let offlineCachePromise = null;

function setOfflineAuthUser(authUser) {
  offlineAuthUserId = authUser?.id || currentUser?.auth_user_id || null;
}

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB is unavailable.')); return; }
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) db.createObjectStore(OFFLINE_STORE, { keyPath: 'authId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open the offline database.'));
  });
}

async function readOfflineSnapshot(authId = offlineAuthUserId) {
  if (!authId) return null;
  const db = await openOfflineDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(OFFLINE_STORE, 'readonly').objectStore(OFFLINE_STORE).get(authId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Could not read offline data.'));
    });
  } finally {
    db.close();
  }
}

function offlineClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createOfflineSnapshot() {
  if (!currentUser || !offlineAuthUserId) return null;
  const mainSnapshot = activeNotepad === null ? nodes : mainNodes;
  const mainStatusSnapshot = activeNotepad === null
    ? serializeStatuses()
    : (mainStatuses.length ? mainStatuses : serializeStatuses());
  const notepadSnapshot = offlineClone(notepads);

  if (activeNotepad !== null) {
    const active = notepadSnapshot.find(np => np.key === activeNotepad);
    if (active) {
      active.nodes = offlineClone(nodes);
      active.statuses = offlineClone(serializeStatuses());
    }
  }

  return {
    authId: offlineAuthUserId,
    savedAt: new Date().toISOString(),
    user: offlineClone(currentUser),
    activeNotepad,
    mainNodes: offlineClone(mainSnapshot),
    mainStatuses: offlineClone(mainStatusSnapshot),
    notepads: notepadSnapshot,
    theme: offlineClone(theme),
    todoCollapsed: offlineClone(todoCollapsed),
    pending: {
      tree: !!dirtyTree,
      ui: !!dirtyUI,
      settings: !!dirtySettings
    }
  };
}

async function writeOfflineSnapshot(snapshot) {
  if (!snapshot) return;
  const db = await openOfflineDb();
  try {
    await new Promise((resolve, reject) => {
      const req = db.transaction(OFFLINE_STORE, 'readwrite').objectStore(OFFLINE_STORE).put(snapshot);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Could not cache offline data.'));
    });
  } finally {
    db.close();
  }
}

async function saveOfflineSnapshot() {
  clearTimeout(offlineCacheTimer);
  const snapshot = createOfflineSnapshot();
  if (!snapshot) return false;
  const previous = offlineCachePromise;
  offlineCachePromise = (async () => {
    if (previous) await previous.catch(() => {});
    await writeOfflineSnapshot(snapshot);
  })();
  try {
    await offlineCachePromise;
    return true;
  } catch (e) {
    console.warn('Offline cache save failed:', e);
    return false;
  }
}

function queueOfflineSnapshot() {
  clearTimeout(offlineCacheTimer);
  offlineCacheTimer = setTimeout(() => saveOfflineSnapshot(), 100);
}

function restoreOfflineSnapshot(snapshot) {
  if (!snapshot?.user || !Array.isArray(snapshot.mainNodes) || !Array.isArray(snapshot.mainStatuses)) return false;
  currentUser = snapshot.user;
  theme = { ...THEME_DEFAULTS, ...(snapshot.theme || {}) };
  notepads = Array.isArray(snapshot.notepads) ? snapshot.notepads : [];
  todoCollapsed = snapshot.todoCollapsed || {};
  ensureProjectsNotepad(snapshot.mainStatuses);

  const cachedActive = snapshot.activeNotepad;
  const activeExists = cachedActive !== null && notepads.some(np => np.key === cachedActive);
  activeNotepad = activeExists ? cachedActive : null;
  if (activeNotepad === null) {
    nodes = snapshot.mainNodes;
    mainNodes = [];
    mainStatuses = [];
    applyStatuses(snapshot.mainStatuses);
  } else {
    mainNodes = snapshot.mainNodes;
    mainStatuses = snapshot.mainStatuses;
    const np = notepads.find(n => n.key === activeNotepad);
    nodes = np?.nodes || [];
    applyStatuses(np?.statuses?.length ? np.statuses : snapshot.mainStatuses);
  }

  nodes.forEach(n => { if (n.status === '' || n.status == null) n.status = 'todo'; });
  nextId = nodes.length ? Math.max(...nodes.map(n => n.id)) + 1 : 1;
  focusedNodeId = nodes[0]?.id || null;
  editingNodeId = null;
  undoStack.length = 0;
  redoStack.length = 0;

  dirtyTree = !!snapshot.pending?.tree;
  dirtyUI = !!snapshot.pending?.ui;
  dirtySettings = !!snapshot.pending?.settings;
  if (dirtyTree) dirtyTreeVersion++;
  if (dirtyUI) dirtyUIVersion++;
  if (dirtySettings) dirtySettingsVersion++;
  return true;
}

async function cachedAppUser(authUser) {
  setOfflineAuthUser(authUser);
  try {
    const snapshot = await readOfflineSnapshot(authUser?.id);
    if (!snapshot?.user) return null;
    const cachedEmail = snapshot.user.email?.trim().toLowerCase();
    const authEmail = authUser?.email?.trim().toLowerCase();
    if (cachedEmail && authEmail && cachedEmail !== authEmail) return null;
    return snapshot.user;
  } catch (e) {
    console.warn('Offline user lookup failed:', e);
    return null;
  }
}

window.addEventListener('pagehide', () => {
  if (currentUser) saveOfflineSnapshot();
});
