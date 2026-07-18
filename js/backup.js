// ── Backup, import & readable exports ──────────────────────────
const BACKUP_FORMAT = 'tasker-backup';
const BACKUP_SCHEMA_VERSION = 1;
const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

function syncActiveNotebookForExport() {
  if (activeNotepad === null) {
    mainNodes = nodes;
    mainStatuses = serializeStatuses();
    return;
  }
  const np = notepads.find(n => n.key === activeNotepad);
  if (np) {
    np.nodes = nodes;
    np.statuses = serializeStatuses();
  }
}

function cloneBackupValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function backupMainNodes() {
  return activeNotepad === null ? nodes : mainNodes;
}

function backupMainStatuses() {
  if (activeNotepad === null) return serializeStatuses();
  return mainStatuses.length ? mainStatuses : serializeStatuses();
}

function createBackupPayload() {
  syncActiveNotebookForExport();
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: document.querySelector('.app-version')?.textContent || '',
    data: {
      main: {
        nodes: cloneBackupValue(backupMainNodes()),
        statuses: cloneBackupValue(backupMainStatuses())
      },
      theme: cloneBackupValue(theme),
      notepads: cloneBackupValue(notepads),
      ui: { todoCollapsed: cloneBackupValue(todoCollapsed) }
    }
  };
}

function backupDateStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

function downloadTextFile(fileName, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJsonBackup() {
  const payload = createBackupPayload();
  downloadTextFile(`tasker-backup_${backupDateStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  showSavedToast('Backup downloaded');
}

function exportNotebooksSnapshot() {
  syncActiveNotebookForExport();
  return [
    { key: null, name: 'Main', emoji: '📋', nodes: cloneBackupValue(backupMainNodes()), statuses: cloneBackupValue(backupMainStatuses()) },
    ...notepads.map(np => ({
      key: np.key,
      name: np.name || np.key,
      emoji: np.emoji || '📝',
      nodes: cloneBackupValue(np.nodes || []),
      statuses: cloneBackupValue(np.statuses || backupMainStatuses())
    }))
  ];
}

function oneLineText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').trim();
}

function markdownText(value) {
  return oneLineText(value).replace(/([\\`*_{}\[\]()#+.!|>-])/g, '\\$1');
}

function exportMarkdown() {
  const books = exportNotebooksSnapshot();
  const lines = ['# Tasker export', '', `Exported: ${new Date().toLocaleString()}`, ''];
  books.forEach(book => {
    lines.push(`## ${book.emoji} ${markdownText(book.name)}`, '');
    if (!book.nodes.length) {
      lines.push('_Empty notebook_', '');
      return;
    }
    const minLevel = Math.min(...book.nodes.map(n => n.level));
    const statusMap = Object.fromEntries((book.statuses || []).map(s => [s.key, `${s.icon || ''} ${s.label || s.key}`.trim()]));
    book.nodes.forEach(node => {
      const indent = '  '.repeat(Math.max(0, node.level - minLevel));
      let text = node.isAttachment ? `📎 ${node.fileName || node.text || 'Attachment'}` : (node.text || 'Untitled');
      if (node.level === LEVEL_TASK && node.status) text += ` — ${statusMap[node.status] || node.status}`;
      lines.push(`${indent}- ${markdownText(text)}`);
    });
    lines.push('');
  });
  downloadTextFile(`tasker-export_${backupDateStamp()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  showSavedToast('Markdown downloaded');
}

function csvCell(value) {
  let text = oneLineText(value);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

function nodeType(level) {
  return ['year', 'quarter', 'month', 'week', 'account', 'task', 'sub-entry'][level] || 'unknown';
}

function exportCsv() {
  const rows = [['notebook', 'node_id', 'parent_id', 'level', 'type', 'status', 'status_label', 'text', 'attachment_name', 'attachment_size_bytes']];
  exportNotebooksSnapshot().forEach(book => {
    const parents = [];
    const statusMap = Object.fromEntries((book.statuses || []).map(s => [s.key, s.label || s.key]));
    book.nodes.forEach(node => {
      parents[node.level] = node.id;
      parents.length = node.level + 1;
      const parentId = node.level > 0 ? (parents[node.level - 1] ?? '') : '';
      rows.push([
        `${book.emoji} ${book.name}`.trim(), node.id, parentId, node.level, nodeType(node.level),
        node.status || '', statusMap[node.status] || '', node.text || '',
        node.isAttachment ? (node.fileName || '') : '', node.isAttachment ? (node.size || '') : ''
      ]);
    });
  });
  const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  downloadTextFile(`tasker-export_${backupDateStamp()}.csv`, csv, 'text/csv;charset=utf-8');
  showSavedToast('CSV downloaded');
}

function validateStatuses(value, location) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${location}: statuses are missing.`);
  const keys = new Set();
  value.forEach((s, i) => {
    if (!s || typeof s !== 'object' || typeof s.key !== 'string' || !s.key) throw new Error(`${location}: invalid status at position ${i + 1}.`);
    if (keys.has(s.key)) throw new Error(`${location}: duplicate status "${s.key}".`);
    keys.add(s.key);
  });
  if (!keys.has('todo')) throw new Error(`${location}: the required "todo" status is missing.`);
}

function validateNodes(value, location) {
  if (!Array.isArray(value)) throw new Error(`${location}: nodes must be an array.`);
  const ids = new Set();
  value.forEach((n, i) => {
    if (!n || typeof n !== 'object') throw new Error(`${location}: invalid node at position ${i + 1}.`);
    if (!Number.isInteger(n.id) || n.id < 0 || ids.has(n.id)) throw new Error(`${location}: invalid or duplicate node id at position ${i + 1}.`);
    if (!Number.isInteger(n.level) || n.level < LEVEL_YEAR || n.level > LEVEL_SUB) throw new Error(`${location}: invalid level at position ${i + 1}.`);
    if (typeof n.text !== 'string') throw new Error(`${location}: invalid text at position ${i + 1}.`);
    if (n.isAttachment && typeof n.dataUrl !== 'string') throw new Error(`${location}: attachment data is missing at position ${i + 1}.`);
    ids.add(n.id);
  });
}

function validateBackupPayload(payload) {
  if (!payload || payload.format !== BACKUP_FORMAT) throw new Error('This is not a Tasker backup file.');
  if (payload.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error(`Unsupported backup version: ${payload.schemaVersion ?? 'unknown'}.`);
  const data = payload.data;
  if (!data || typeof data !== 'object' || !data.main) throw new Error('The backup data is incomplete.');
  validateNodes(data.main.nodes, 'Main notebook');
  validateStatuses(data.main.statuses, 'Main notebook');
  if (!data.theme || typeof data.theme !== 'object' || Array.isArray(data.theme)) throw new Error('The main theme is invalid.');
  if (!Array.isArray(data.notepads)) throw new Error('The notebook list is invalid.');
  const keys = new Set();
  data.notepads.forEach((np, i) => {
    if (!np || typeof np !== 'object' || typeof np.key !== 'string' || !np.key || keys.has(np.key)) throw new Error(`Invalid notebook at position ${i + 1}.`);
    keys.add(np.key);
    validateNodes(np.nodes, `Notebook "${np.name || np.key}"`);
    validateStatuses(np.statuses, `Notebook "${np.name || np.key}"`);
  });
}

async function restoreBackupPayload(payload) {
  validateBackupPayload(payload);
  const data = cloneBackupValue(payload.data);

  clearTimeout(saveDebounceTimer);
  await flushSave();

  activeNotepad = null;
  nodes = data.main.nodes;
  mainNodes = [];
  mainStatuses = [];
  notepads = data.notepads;
  theme = { ...THEME_DEFAULTS, ...data.theme };
  todoCollapsed = data.ui?.todoCollapsed && typeof data.ui.todoCollapsed === 'object' ? data.ui.todoCollapsed : {};
  applyStatuses(data.main.statuses);
  ensureProjectsNotepad(data.main.statuses);

  nextId = nodes.length ? Math.max(...nodes.map(n => n.id)) + 1 : 1;
  focusedNodeId = nodes[0]?.id || null;
  editingNodeId = null;
  editingNotepadKey = null;
  undoStack.length = 0;
  redoStack.length = 0;
  searchQuery = '';
  preSearchCollapsed = null;
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  dirtyTree = true;
  dirtyUI = true;
  dirtySettings = true;
  dirtyTreeVersion++;
  dirtyUIVersion++;
  dirtySettingsVersion++;
  setSyncLed('pending');
  await flushSave();

  applyTheme();
  render();
  renderSettings();
  showSavedToast('Backup restored');
}

async function importJsonBackup(file, button) {
  if (!file) return;
  if (file.size > MAX_BACKUP_BYTES) {
    alert('The backup is larger than 100 MB and cannot be imported.');
    return;
  }
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Checking…';
  try {
    const payload = JSON.parse(await file.text());
    validateBackupPayload(payload);
    const exported = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString() : 'unknown date';
    const ok = confirm(`Restore Tasker backup from ${exported}?\n\nThis will replace the main notebook, all other notebooks, statuses, themes and UI state for this account.`);
    if (!ok) return;
    button.textContent = 'Restoring…';
    await restoreBackupPayload(payload);
  } catch (e) {
    console.error('Backup import failed:', e);
    alert('Could not restore this backup.\n\n' + (e?.message || 'Invalid file.'));
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderBackupPanel() {
  const panel = document.getElementById('backup-panel');
  if (!panel) return;
  panel.innerHTML = '';

  const section = document.createElement('div');
  section.className = 'backup-section';
  const title = document.createElement('div');
  title.className = 'backup-section-title';
  title.textContent = 'Backup & Export';
  const text = document.createElement('div');
  text.className = 'backup-section-text';
  text.textContent = 'JSON restores all Tasker data. Markdown and CSV are readable exports of every notebook.';
  const actions = document.createElement('div');
  actions.className = 'backup-actions';

  const makeButton = (label, onClick, extraClass = '') => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'backup-btn' + (extraClass ? ' ' + extraClass : '');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    actions.appendChild(btn);
    return btn;
  };

  makeButton('Download JSON', exportJsonBackup);
  const importBtn = makeButton('Restore JSON', () => fileInput.click(), 'import');
  makeButton('Export Markdown', exportMarkdown);
  makeButton('Export CSV', exportCsv);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    await importJsonBackup(file, importBtn);
    fileInput.value = '';
  });

  section.appendChild(title);
  section.appendChild(text);
  section.appendChild(actions);
  section.appendChild(fileInput);
  panel.appendChild(section);
}
