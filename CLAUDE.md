# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Shape

Static SPA — plain HTML/CSS/JS, no build step, no package manager, no tests.

- **Serve locally:** `python3 -m http.server 8000` from repo root, open `index.html`
- **Deploy:** cPanel Git Version Control pushes directly to web root; `.cpanel.yml` is a no-op stub (`/bin/true`) that must stay
- **DB schema changes:** paste `migration.sql` into Supabase SQL editor (idempotent, not run by tooling)
- **Auth:** 6-word seed phrase → `users` table lookup; no Supabase Auth session
- **Credentials:** Supabase URL + anon key hardcoded in `js/db.js`
- **Version:** displayed in bottom bar (`app-version`); currently v1.7.3
- **PWA:** `manifest.json` at repo root declares the app as `standalone` with `background_color`/`theme_color` `#111418`; `Icon.png` is RGB (no alpha channel) to prevent macOS dock from adding a white outline frame

## Layout

```
#app
└─ #panels  (flex row, gap 10px, padding 10px)
   ├─ #left-wrap   (flex: 2 1 0  — main tree panel, blurred)
   │   └─ #editor → #gutter + #content
   └─ #right-col   (flex: 1 1 0  — column flex, gap 10px)
       ├─ #right-wrap  (to-do panel, blurred)
       │   ├─ #todo-header  (notebook tabs)
       │   ├─ #todo-content
       │   └─ .bottom-bar   (sync LED, version, Settings button)
       └─ #search-bar  (unblurred, always same width as to-do panel)
           └─ #search-input
```

- `#left-wrap` and `#right-col` share available width in a **2:1 ratio** and shrink proportionally at any window size (`min-width:0` on both).
- `#search-bar` sits below `#right-wrap` outside the blurred panel; its event listeners are set up once by `initSearchBar()`.

## Script Load Order

`index.html` loads files in this fixed order — a file may only call into files loaded **before** it:

```
db → state → sync → tree → picker → settings → render → app
```

No ES modules. Every file exports top-level functions and globals by name.

## File Map

### `js/state.js` (170 lines)
All mutable globals and constants. **Never shadow these elsewhere.**

| Symbol | What it is |
|---|---|
| `nodes` | Flat array — the entire tree; hierarchy is implicit by `level` + position |
| `nextId` | Monotonic integer ID counter |
| `focusedNodeId`, `editingNodeId` | Currently focused / editing node id |
| `theme` | Active theme object |
| `notepads`, `activeNotepad` | Notepad list; `null` = main tree active |
| `mainNodes` | Stashed main tree while a notepad is active |
| `undoStack`, `redoStack` | Undo history (max `UNDO_LIMIT = 10`) |
| `dirtyTree`, `dirtyUI`, `dirtySettings` | Persistence dirty flags |
| `todoCollapsed` | Collapse state for to-do panel sections/accounts |
| `GROUP_ORDER` | `['todo', 'done', 'info']` — status bucket render order; contents are mutated by reorder/applyStatuses |
| `THEME_DEFAULTS` | Fallback for every theme CSS property |
| `FONT_OPTIONS` | Fixed list of available font families for the theme panel |
| `BG_LIBRARY` | Fixed list of background images: `[{ id, cat, label, url }]` — Unsplash photos |
| `getCETDate()` | Returns current date normalized to CET |
| `applyTheme(t)` | Pushes theme into `:root` CSS custom properties |
| `applyActiveTheme()` | Picks main or active notepad theme, then calls `applyTheme` |
| `applyStatuses(arr)` | Rebuilds STATUSES, S_ICON, S_LABEL, GROUP_ORDER from saved settings array |
| `pickerOrder()` | Returns statuses in fixed cycle order: todo → done → info → customs. Used by picker — decoupled from drag-reorder order |
| `makeUUID()` | Generates a UUID (uses `crypto.randomUUID` when available) |
| `getDeviceToken()` | Returns a per-device UUID persisted in `localStorage` |

### `js/db.js` (50 lines)
Thin `fetch` wrapper around Supabase REST. Exposes:
- `sb.get(table, params)` — GET with query params
- `sb.post(table, body)` — INSERT
- `sb.patch(table, params, body)` — UPDATE
- `sb.upsert(table, body)` — merge-duplicate upsert (used for `sessions`)
- `sb.query(table, method, body, params)` — raw method; call directly for DELETE

### `js/sync.js` (197 lines)
All persistence and network I/O.

| Function | What it does |
|---|---|
| `markDirtyTree()` / `markDirtyUI()` / `markDirtySettings()` | Set flag + schedule debounced save — **call after every mutation** |
| `flushSave()` | Writes all dirty tables; guarded by `isSaving` |
| `scheduleSave()` | Debounces `flushSave` by `SAVE_DEBOUNCE = 2000ms` |
| `saveTree()` | PATCHes `trees` table (main nodes only, never notepad nodes) |
| `saveUIState()` | PATCHes `ui_state` (collapsed flags + `todoCollapsed`) |
| `saveSettings()` | Syncs live `nodes` into active notepad entry, then PATCHes `settings` |
| `loadUserData()` | Loads all three tables + seeds state on login |
| `startSyncLoop()` | Fires `flushSave` + `registerSession` every `SYNC_INTERVAL = 60000ms` |
| `registerSession()` | Upserts `{ user_id, device_token, last_seen }` into `sessions` table |
| `setSyncLed(state)` | Updates the status LED: `'connected'` (double-blink green), `'pending'` (grey), `'synced'` (green), `'uploaded'` (single-blink green), `'error'` (red) |

**Notepad persistence quirk:** while a notepad is active, tree edits call `markDirtySettings` (not `markDirtyTree`) because notepad nodes live in the `settings` row. `markDirtyTree()` handles this automatically — it sets `dirtySettings` instead when `activeNotepad !== null`.

### `js/tree.js` (500 lines)
Tree model operations, calendar logic, view-model builder.

| Function | What it does |
|---|---|
| `buildRows()` | **View-model builder.** Returns `rows[]` consumed by `render()`. Groups level-4 tasks by `status` into `GROUP_ORDER` buckets under each level-3 account; attaches level-5 subs to their parent task within the bucket. Respects `collapsedGroups` per account. |
| `pushUndo()` / `undo()` / `redo()` | Snapshot `nodes` before a mutation; undo/redo swap via stacks |
| `toggleCollapse(row)` / `toggleSiblings(row)` | Collapse node or group row; shift-click collapses all siblings |
| `addChild(ni)` | Enter-key handler on level-2/3 node: inserts a level-3 account or level-4 task |
| `moveTaskToAccount(taskId, accId, newStatus)` | Splices a task+subs to a new account |
| `moveSubToTask(subId, taskId)` | Splices a sub-entry to a new task |
| `insertTaskBefore(srcId, refId)` / `insertTaskAfter(srcId, refId)` | Positional drag-reorder for level-4 tasks (carries subs) |
| `nestTaskUnderTask(srcId, targetId)` | Converts a level-4 task (with no subs) to level-5 sub under another task |
| `insertSubBefore(srcId, refId)` / `insertSubAfter(srcId, refId)` | Positional drag-reorder for level-5 subs |
| `promoteSubToTask(srcId, refTaskId, pos)` | Promotes a level-5 sub to a level-4 task, placed before/after `refTaskId` |
| `normalizeCalendar()` | Calls `mergeDuplicates()` then re-parents weeks into correct months |
| `mergeDuplicates()` | Merges calendar nodes with duplicate names; **preserves level-5 subs with their parent tasks** |
| `checkAndCreateCurrentWeek()` | Auto-creates Year/Month/Week scaffold; runs on login + hourly |
| `getCalendarWeek(date)` | Returns ISO `{ week, year }` |

Row ordering note: `buildRows()` output order differs from `nodes` array order (tasks are re-grouped by status). `nodeIdx` in each row is the true index into `nodes` — always use it for splicing.

### `js/picker.js` (63 lines)
Single-instance status picker.

| Function | What it does |
|---|---|
| `openPicker(nodeId, anchorEl, isMain)` | Opens picker on anchor; if called again on the same node, advances instead |
| `advancePicker()` | Cycles to the next status in picker order; resets `COMMIT_DELAY` timer |
| `commitPicker()` | Applies `pendingStatus` if changed, cleans up |
| `dismissPicker()` | Cancels and removes picker without applying |

Always use `dismissPicker()` / `commitPicker()` — never touch `picker` directly. `COMMIT_DELAY` timer auto-commits on idle.

### `js/render.js` (908 lines)

| Section | Lines | What it does |
|---|---|---|
| DOM helpers + drag | 1–156 | `mk(tag, style)` — element factory; `dragState`; `startDrag`, `endDrag`, `clearDropIndicators`, `canNest`, `attachDropTarget`, `attachRowDragEvents` |
| File attachments | 158–192 | `attachFilesToTask`, `linkDomain` |
| Main render | 194–238 | `render()` rebuilds DOM from `buildRows()`, calls `syncGutterHeights()` and `buildTodoPanel()` |
| Group row | 240–286 | `renderGroupRow` — status-bucket header with drag target |
| Node row | 288–440 | `renderNodeRow` — indentation, label, delete/drag handles, expand toggle; `attachLabelExpand` |
| Edit input | 442–500 | `renderEditInput` — `<textarea>` for levels 4–5, `<input>` for 0–3; Enter commits, Shift+Enter newline |
| Node events | 501–594 | `attachNodeEvents`, `handleNodeKeydown` — keyboard model |
| Notebook switching | 595–656 | `notebookKeys()`, `cycleNotebook(dir)`, `switchNotebook(key)` — swaps `nodes`/`mainNodes`, re-renders, clears search |
| Right panel tabs | 657–689 | `buildRightTabs` — notebook tab bar; **Shift+click** any tab to cycle notebooks |
| Search collapse | 690–777 | `applySearchCollapse()` — updates `todoCollapsed` to expand matching sections/accounts; `initSearchBar()` — wires `#search-input` once on first `buildTodoPanel` call |
| To-Do panel | 778–908 | `buildTodoPanel` — cross-account view grouped into Older / Previous week / Current week sections, collapsible |

**Notebook quick-switch:**
- **Shift+click** any notebook tab → cycles to the next notebook
- **2-finger horizontal swipe** over `#right-wrap` → cycles notebooks (accumulates 60px of `deltaX`, 600ms cooldown)
- **Shift + 2-finger horizontal swipe** over `#right-wrap` → toggles `viewMode` between `'acc'` and `'status'`; fades `#content` only (to-do panel unchanged)
- Switching notebooks clears `searchQuery` and restores `todoCollapsed`

**View mode (`viewMode`):**
- Module-level string: `'acc'` (grouped by account) | `'status'` (grouped by status)
- Toggled by clicking the Acc/Status switch in the tab bar, or by Shift+swipe
- `toggleViewMode()` fades `#content` out (300 ms), swaps mode, fades back in — identical motion to notebook switch but scoped to main panel only

**Search (`#search-input` / `#search-bar`):**
- Module-level `searchQuery` and `preSearchCollapsed` track state
- On input: saves `todoCollapsed` snapshot, calls `applySearchCollapse()` to expand matching sections/accounts and collapse others, then `buildTodoPanel()` renders normally
- **Esc**: clears query and restores the pre-search `todoCollapsed` snapshot
- Search is scoped to the active notebook; clears on notebook switch

**Indentation:**
- All levels use `node.level` as the indent unit count (0→1→2→3→4→5 spans, each `indentSize` px wide)
- Levels 4 and 5 get an additional fixed **15 px** spacer so entries clear the group-row emoji
- Group rows sit at 4 indent units (between account at 3 and tasks at 4)
- To-do panel indentation also scales with `theme.indentSize`: week at `2×`, account at `3×`, item at `4× + 15px` (offset by the 10px outer margin)
- `indentSize` is configurable via the Settings theme slider

**Row highlight behaviour:**
- Main tab: `.row.focused` background is suppressed via `#left-wrap:not(:hover) .row.focused { background: transparent }` — highlight disappears when mouse leaves the panel
- To-do tab: CSS `:hover` only — no persistent highlight

**Scrollbars:**
- Custom `::-webkit-scrollbar` rules lock the thumb to `rgba(0,0,0,0.55)` on track, hover, and active — no style change on mouse-over
- Firefox covered by `scrollbar-color` / `scrollbar-width: thin` on `*`

### `js/settings.js` (560 lines)

| Section | Lines | What it does |
|---|---|---|
| Settings UI shell | 1–23 | `openSettings()`, `closeSettings()`, `renderSettings()` |
| Status list | 25–141 | CRUD for custom statuses; `todo` undeletable; drag-reorder changes `GROUP_ORDER`; row layout: drag handle → key-label → icon input → label input → × → spacer |
| Theme panel + notepad tabs | 143–412 | `renderThemePanel()`, `addNotepad()` (max 2 extra), `removeNotepad()` — per-notepad theme editing with copy-from-main |
| Admin panel | 414–560 | `renderAdminPanel()`, `deleteUser()`, `createNewUser()` — user list loads on demand; only shown to `role = 'admin'` accounts |

### `js/app.js` (159 lines)
Login form, auto-login from `localStorage`, `showApp()` / `showLogin()`, global keyboard shortcuts (Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo), countdown logout with abort, logout-other-sessions, and boot sequence.

## Tree Model Quick Reference

`nodes` is a **flat array**; hierarchy is position + level:

```
0 Year  →  1 Month  →  2 Week  →  3 Account  →  4 Task  →  5 Sub-entry
```

- A node's parent = nearest preceding node with `level = N − 1`
- Level-5 subs: plain text, link (single URL → rendered as `<a>`), or attachment (`isAttachment:true`, base64 `dataUrl` stored inline — avoid large files)
- No "Unsorted" (`''`) status — nodes with `status === ''` are normalized to `'todo'` on load. `removeStatus()` also reassigns to `'todo'`
- Drag-reorder in Settings changes display bucket order (`GROUP_ORDER`) but **not** picker cycle order — picker always uses `pickerOrder()`
- Drag-drop uses module-level `dragState` (not `dataTransfer`); task moves carry their level-5 children
- Drag onto a task for 800 ms activates nest mode (`drop-nest` indicator) — drops convert task to sub or move sub under task

## Keyboard Shortcuts

| Key | Context | Action |
|---|---|---|
| Enter | Level 0–3 node | Add child node |
| Enter | Level 4–5 node | Add sibling node |
| Shift+Enter | Edit mode | Insert newline |
| Shift+Enter | Level 4 node (focused) | Add sub-entry |
| Delete / Backspace | Level 3–5 node | Delete node (and children) |
| F2 | Any node | Enter edit mode |
| Ctrl/Cmd+Z | Global | Undo |
| Ctrl/Cmd+Shift+Z | Global | Redo |
| Esc | Search input | Clear search, restore collapse state |
| Shift+Click | Notebook tab | Cycle to next notebook |

## Mutation Checklist

Before every tree mutation:
1. `pushUndo()` — snapshot before change
2. Mutate `nodes`
3. `markDirtyTree()` / `markDirtyUI()` / `markDirtySettings()` — whichever applies
4. `render()` if the change should be visible immediately

## Conventions

- Section-banner comments (`// ── Name ──`) are the file table of contents — keep the style when extending
- Add new logic to the existing file it belongs in; new files require adding a `<script>` tag and respecting load order
- DOM built imperatively with `mk(tag, style)` — no templating library

## Branch Policy

Develop on the branch specified in the task prompt (`claude/<slug>`), not on `main`. Open a PR when ready.
