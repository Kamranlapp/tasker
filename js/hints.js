// ── Hint card definitions ──────────────────────────────────────
// Each hint: { id, title, rows[] }
// Row demo items:
//   { k: '↵' }       → key badge (animated press)
//   { rc: true }     → right-click mouse animation
//   { arrow: true }  → animated expand arrow + child bar
//   { drag: true }   → sliding bar (drag gesture)
//   { hold: true }   → fill bar (hold timer)
//   { file: true }   → CSS file icon with drop bounce
//   { swipe: true }  → two-finger swipe gesture
//   { tab: true }    → tab click highlight
//   { t: '↔' }       → plain icon / symbol

const HINTS = [
  {
    id: 'entries',
    title: 'Entries & Status',
    rows: [
      { demo: [{ rc: true }],              text: '<b>Right-click</b> any task — change status' },
      { demo: [{ k: '↵' }],               text: '<b>Enter</b> on sub — add sibling sub' },
      { demo: [{ k: '⇧' }, { k: '↵' }],  text: '<b>Shift+Enter</b> on task — add sub-entry' },
    ]
  },
  {
    id: 'collapse',
    title: 'Collapse & Expand',
    rows: [
      { demo: [{ arrow: true }],           text: 'Click <b>▶</b> — expand · collapse' },
      { demo: [{ rc: true }],              text: '<b>Right-click</b> row — expand · collapse' },
      { demo: [{ k: '⇧' }, { rc: true }], text: '<b>Shift + right-click</b> — all siblings' },
    ]
  },
  {
    id: 'notebooks',
    title: 'Notebooks & View',
    rows: [
      { demo: [{ swipe: true }],              text: '<b>2-finger swipe</b> — cycle notebooks' },
      { demo: [{ k: '⇧' }, { swipe: true }], text: '<b>Shift + swipe</b> — toggle Acc · Status view' },
      { demo: [{ tab: true }],               text: 'Click <b>tab</b> — switch notebook directly' },
    ]
  },
  {
    id: 'drag',
    title: 'Drag & Drop',
    rows: [
      { demo: [{ drag: true }], text: '<b>Drag</b> task — reorder or move to account' },
      { demo: [{ hold: true }], text: '<b>Hold 800ms</b> while dragging — make sub-task' },
      { demo: [{ file: true }], text: '<b>Drag file</b> onto task — attach file' },
      { demo: [{ t: '🔗' }],   text: 'Sub-task with URL — becomes a <b>clickable link</b>' },
    ]
  },
];
