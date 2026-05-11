// ── Constants ──────────────────────────────────────────────────
const COMMIT_DELAY = 1000;
const UNDO_LIMIT = 10;
const SYNC_INTERVAL = 60000;
const SAVE_DEBOUNCE = 2000;

const FONT_OPTIONS = [
  { label: 'Menlo / Mono (default)', value: "'Menlo','Monaco','Courier New',monospace" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono',monospace" },
  { label: 'Fira Code', value: "'Fira Code',monospace" },
  { label: 'Consolas', value: "'Consolas','Courier New',monospace" },
  { label: 'System Sans', value: "system-ui,-apple-system,'Segoe UI',sans-serif" },
  { label: 'Inter', value: "'Inter',sans-serif" },
  { label: 'Roboto', value: "'Roboto',sans-serif" },
  { label: 'Poppins', value: "'Poppins',sans-serif" },
  { label: 'Barlow (+ Cyrillic)', value: "'Barlow',sans-serif" },
  { label: 'Josefin Sans', value: "'Josefin Sans',sans-serif" },
  { label: 'Raleway (+ Cyrillic)', value: "'Raleway',sans-serif" },
  { label: 'Creame', value: "'Creame',sans-serif" },
  { label: 'World of Water', value: "'World of Water',sans-serif" },
  { label: 'Southern Beach', value: "'Southern Beach',sans-serif" },
];

const BG_LIBRARY = [
  { id:'bg1',  label:'Background 1',  url:'images/Background1.jpg' },
  { id:'bg2',  label:'Background 2',  url:'images/Background2.jpg' },
  { id:'bg3',  label:'Background 3',  url:'images/Background3.jpg' },
  { id:'bg4',  label:'Background 4',  url:'images/Background4.jpg' },
  { id:'bg5',  label:'Background 5',  url:'images/Background5.jpg' },
  { id:'bg6',  label:'Background 6',  url:'images/Background6.jpg' },
  { id:'bg7',  label:'Background 7',  url:'images/Background7.jpg' },
  { id:'bg8',  label:'Background 8',  url:'images/Background8.jpg' },
  { id:'bg9',  label:'Background 9',  url:'images/Background9.jpg' },
  { id:'bg10', label:'Background 10', url:'images/Background10.jpg' },
  { id:'bg11', label:'Background 11', url:'images/Background11.jpg' },
  { id:'bg12', label:'Background 12', url:'images/Background12.jpg' },
  { id:'bg13', label:'Background 13', url:'images/Background13.jpg' },
  { id:'bg14', label:'Background 14', url:'images/Background14.jpg' },
  { id:'bg15', label:'Background 15', url:'images/Background15.jpg' },
  { id:'bg16', label:'Background 16', url:'images/Background16.jpg' },
  { id:'bg17', label:'Background 17', url:'images/Background17.jpg' },
];

const THEME_DEFAULTS = {
  bg: '#111418', mainBg: '#272d36', rightBg: '#0d1118', notepadBg: '#1a1f27',
  mainBlur: 20, rightBlur: 40, indentSize: 18,
  yearColor: '#ffffff', monthColor: '#aad4e8', weekColor: '#88c0d0', accountColor: '#c2185b', textColor: '#cdd6f4',
  yearSize: 16, monthSize: 14, weekSize: 13, accountSize: 13, textSize: 13,
  allFontSize: 0,
  fontFamily: "'Menlo','Monaco','Courier New',monospace",
  bgMode: 'color', bgImageId: null,
  mainBgMode: 'color', rightBgMode: 'color'
};

// ── Mutable State ──────────────────────────────────────────────
let currentUser = null;
let nodes = [];
let nextId = 1;
let focusedNodeId = null;
let editingNodeId = null;
let dirtyTree = false;
let dirtyUI = false;
let dirtySettings = false;
let syncTimer = null;
let isSaving = false;
let todoCollapsed = {};
let theme = { ...THEME_DEFAULTS };
let notepads = [];        // extra notebooks: [{key, name, emoji, nodes:[], statuses:[]}]
let activeNotepad = null; // null = main notebook, else notebook key
let mainNodes = [];       // backup of main nodes while viewing extra notebook
let mainStatuses = [];    // backup of main statuses while viewing extra notebook
let picker = null;

const undoStack = [];
const redoStack = [];

let STATUSES = ['todo', 'done', 'info'];        // display order (▲▼ reorderable)
let pickerStatuses = ['todo', 'done', 'info'];  // picker cycle order (fixed, insertion order)
let S_ICON = { 'todo': '⚠️', 'done': '✅', 'info': 'ℹ️' };
let S_LABEL = { 'todo': 'To-do', 'done': 'Done', 'info': 'Info' };

// ── Helpers ────────────────────────────────────────────────────
let _bgActiveLayer = 'a';
let _bgCurrentUrl = null;
let _bgCleanupTimer = null;

function crossfadeBg(url) {
  if (url === _bgCurrentUrl) return;
  _bgCurrentUrl = url;
  clearTimeout(_bgCleanupTimer); // cancel any pending layer cleanup from previous transition
  const layerA = document.getElementById('bg-layer-a');
  const layerB = document.getElementById('bg-layer-b');
  if (!layerA || !layerB) return;
  const outgoing = _bgActiveLayer === 'a' ? layerA : layerB;
  const incoming = _bgActiveLayer === 'a' ? layerB : layerA;
  if (url) {
    // Reset incoming layer instantly (no transition) so we can position it cleanly
    incoming.style.transition = 'none';
    incoming.style.opacity = '0';
    incoming.style.backgroundImage = `url('${url}')`;
    incoming.getBoundingClientRect(); // force reflow before re-enabling transition
    incoming.style.transition = '';
    // Cross-fade
    incoming.style.opacity = '1';
    outgoing.style.opacity = '0';
    _bgActiveLayer = _bgActiveLayer === 'a' ? 'b' : 'a';
    _bgCleanupTimer = setTimeout(() => {
      outgoing.style.backgroundImage = '';
    }, 900);
  } else {
    layerA.style.opacity = '0';
    layerB.style.opacity = '0';
    _bgCleanupTimer = setTimeout(() => {
      layerA.style.backgroundImage = '';
      layerB.style.backgroundImage = '';
    }, 900);
  }
}

function makeUUID() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function getDeviceToken() {
  let t = localStorage.getItem('device_token');
  if (!t) { t = makeUUID(); localStorage.setItem('device_token', t); }
  return t;
}

function applyStatuses(arr) {
  // Rebuild display order (STATUSES) from arr as-is
  STATUSES = arr.map(s => s.key);
  S_ICON = {};
  S_LABEL = {};
  arr.forEach(s => { S_ICON[s.key] = s.icon; S_LABEL[s.key] = s.label; });
  // Rebuild picker order
  const withRank = arr.every(s => s.pickerRank !== undefined);
  if (withRank) {
    pickerStatuses = [...arr].sort((a, b) => a.pickerRank - b.pickerRank).map(s => s.key);
  } else {
    // Fallback for old data: well-known keys first in fixed order, then custom keys by numeric suffix (= insertion order)
    const known = ['todo', 'done', 'info'].filter(k => arr.some(s => s.key === k));
    const customs = arr.filter(s => !['todo', 'done', 'info'].includes(s.key));
    customs.sort((a, b) => (parseInt(a.key.replace(/\D/g, '')) || 0) - (parseInt(b.key.replace(/\D/g, '')) || 0));
    pickerStatuses = [...known, ...customs.map(s => s.key)];
  }
}

function serializeStatuses() {
  const pOrder = pickerOrder();
  return displayOrder().map(s => ({
    key: s, icon: S_ICON[s], label: S_LABEL[s],
    pickerRank: pOrder.indexOf(s)
  }));
}

// Display order: STATUSES array order, but 'todo' always last
function displayOrder() {
  const nonTodo = STATUSES.filter(s => s && s !== 'todo');
  return STATUSES.includes('todo') ? [...nonTodo, 'todo'] : nonTodo;
}

function applyTheme(t) {
  const th = t || theme;
  const r = document.documentElement.style;
  const D = THEME_DEFAULTS;

  // Body background: image (crossfade layers) or solid color
  if (th.bgMode === 'image' && th.bgImageId) {
    const lib = BG_LIBRARY.find(i => i.id === th.bgImageId);
    crossfadeBg(lib ? lib.url : null);
  } else {
    crossfadeBg(null);
    r.setProperty('--c-bg', th.bg || D.bg);
  }

  // Main panel
  if (th.mainBgMode === 'blur') {
    r.setProperty('--c-main-bg', 'rgba(17,20,24,0.35)');
    r.setProperty('--c-main-blur', (th.mainBlur ?? D.mainBlur) + 'px');
  } else {
    r.setProperty('--c-main-bg', th.mainBg || D.mainBg);
    r.setProperty('--c-main-blur', '0px');
  }

  // Right panel
  if (th.rightBgMode === 'blur') {
    r.setProperty('--c-right-bg', 'rgba(17,20,24,0.2)');
    r.setProperty('--c-right-blur', (th.rightBlur ?? D.rightBlur) + 'px');
  } else {
    r.setProperty('--c-right-bg', th.rightBg || D.rightBg);
    r.setProperty('--c-right-blur', '0px');
  }

  r.setProperty('--indent-size', (th.indentSize ?? D.indentSize) + 'px');

  r.setProperty('--c-year',    th.yearColor    || D.yearColor);
  r.setProperty('--c-month',   th.monthColor   || D.monthColor);
  r.setProperty('--c-week',    th.weekColor    || D.weekColor);
  r.setProperty('--c-account', th.accountColor || D.accountColor);
  r.setProperty('--c-text',    th.textColor    || D.textColor);
  r.setProperty('--c-notepad-bg', th.notepadBg || D.notepadBg);

  // Font sizes
  const all = th.allFontSize || 0;
  r.setProperty('--fs-year',    (all || th.yearSize    || D.yearSize)    + 'px');
  r.setProperty('--fs-month',   (all || th.monthSize   || D.monthSize)   + 'px');
  r.setProperty('--fs-week',    (all || th.weekSize    || D.weekSize)    + 'px');
  r.setProperty('--fs-account', (all || th.accountSize || D.accountSize) + 'px');
  r.setProperty('--fs-text',    (all || th.textSize    || D.textSize)    + 'px');
  r.setProperty('--c-font', th.fontFamily || D.fontFamily);

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', th.bg || D.bg);
}

// Picker cycle order: 'todo' always first, then rest in pickerStatuses (insertion) order
function pickerOrder() {
  const nonTodo = pickerStatuses.filter(s => s && s !== 'todo');
  return pickerStatuses.includes('todo') ? ['todo', ...nonTodo] : nonTodo;
}

function applyActiveTheme() {
  if (activeNotepad === null) { applyTheme(); return; }
  const np = notepads.find(n => n.key === activeNotepad);
  applyTheme(np?.theme || theme);
}

function getCETDate() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const month = now.getUTCMonth();
  const isCEST = month > 2 && month < 9;
  const offset = isCEST ? 2 : 1;
  return new Date(utc + offset * 3600000);
}
