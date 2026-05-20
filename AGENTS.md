# AGENTS.md

Repository guide for Codex-style agents. Use this file as the quick map before opening source files.

## Project snapshot

- Static single-page app: plain HTML, CSS, and global-scope JavaScript. There is no bundler, package manager, or automated test suite.
- Local run: `python3 -m http.server 8000` from the repository root, then open `http://localhost:8000/`.
- Deployment: cPanel Git Version Control deploys the checked-in files directly. Keep `.cpanel.yml` as the no-op `/bin/true` stub.
- Database: Supabase REST is called directly from the browser. Schema changes live in `migration.sql` and are pasted manually into the Supabase SQL editor.
- Authentication: users sign in with a 6-word seed phrase looked up in the `users` table; the app does not use Supabase Auth sessions.
- Current visible app version is in `index.html` as `.app-version` (`v1.8.6`). If behavior changes visibly, update cache-busting query strings and version consistently.

## File map

| Path | Purpose |
| --- | --- |
| `index.html` | Defines login, settings, main two-panel app shell, mobile tabs, script load order, PWA links, and app version. |
| `css/style.css` | All styling: fonts, background layers, login/settings screens, tree rows, notebook bar, to-do panel, mobile layout, onboarding hints. |
| `js/db.js` | Supabase URL/key plus thin `sb.get/post/patch/upsert/query` fetch wrapper. |
| `js/state.js` | Constants and mutable globals (`nodes`, `currentUser`, dirty flags, statuses, theme, notepads), theme/status helpers, CET date helper. |
| `js/sync.js` | Persistence, debounced saves, sync LED, session registration, and loading user data from Supabase. |
| `js/tree.js` | Tree model operations: undo/redo, flat-tree row building, collapse, add/move/nest/reparent, calendar/week normalization. |
| `js/picker.js` | Inline status picker lifecycle and cycling. |
| `js/settings.js` | Settings screen: statuses, theme controls, notepad CRUD, admin user management. |
| `js/render.js` | DOM rendering and interaction wiring for main tree, status mode, drag/drop, editing, notebook switcher, search, to-do panel. |
| `js/hints.js` | Onboarding hint card content. |
| `js/onboarding.js` | Hint card rendering/navigation and first-run display. |
| `manifest.json` | PWA manifest; `Icon.png` is the app icon. |
| `migration.sql` | Manual Supabase migration notes/statements. |
| `hint-design.html` | Standalone hint-design/reference page, not part of the main runtime script chain. |

## Script load order and dependency rule

`index.html` loads scripts in this exact order:

```text
db → state → sync → tree → picker → settings → render → hints → onboarding → app
```

There are no ES modules. Every script exports functions and state via global names. A file may rely only on globals created by earlier scripts, or on functions that are invoked later after all scripts have loaded. When adding a new JavaScript file, add its `<script>` tag in `index.html` and verify this order explicitly.

## Runtime architecture

- `nodes` is a flat array; hierarchy is encoded by `level` plus position, not by child arrays.
- Levels are: `0 Year → 1 Month → 2 Week → 3 Account → 4 Task → 5 Sub-entry`.
- A node's parent is the nearest previous node with `level === node.level - 1`.
- Tasks can have statuses; empty/null statuses should normalize to `todo`.
- Level-5 sub-entries can be plain text, a single URL rendered as a link, or an inline attachment (`isAttachment`, `dataUrl`, file metadata). Avoid introducing large inline files.
- Extra notebooks store their own `nodes`, `statuses`, and theme data in `settings.notepads`; the main tree is saved separately in the `trees` table.
- `activeNotepad === null` means the main notebook. When an extra notebook is active, `mainNodes`/`mainStatuses` hold the main notebook while `nodes`/status globals reflect the active notebook.

## Persistence and mutation checklist

For tree/user-visible mutations, follow this pattern unless a nearby function intentionally does otherwise:

1. Call `pushUndo()` before changing tree data.
2. Mutate the existing global state (`nodes`, statuses, theme, `notepads`, `todoCollapsed`, etc.).
3. Mark the right dirty flag:
   - `markDirtyTree()` for tree content; in extra notebooks it routes into settings saving.
   - `markDirtyUI()` for collapse/search/to-do UI state.
   - `markDirtySettings()` for statuses, theme, notepads, or account/settings changes.
4. Call `render()` or the narrower render helper if the change should be visible immediately.

Saves are debounced by `SAVE_DEBOUNCE` and flushed by `flushSave()` / `startSyncLoop()`. Do not bypass the existing `sb` wrapper unless adding a REST operation that cannot fit it.

## UI and interaction landmarks

- Main layout: `#panels` is a flex row with `#left-wrap` for the tree/editor and `#right-col` for notebook bar, to-do panel, bottom bar, and search.
- `#notebook-bar` is outside `#right-wrap`; `#search-bar` is below it and remains unblurred.
- Notebook switching and view-mode toggling live in `js/render.js` near `notebookKeys()`, `cycleNotebook()`, `switchNotebook()`, `buildRightTabs()`, and `toggleViewMode()`.
- To-do panel rendering and search live in `js/render.js` near `applySearchCollapse()`, `initSearchBar()`, and `buildTodoPanel()`.
- Settings UI is built imperatively in `js/settings.js`; admin controls are shown only for `currentUser.role === 'admin'`.
- Onboarding hints are split between data (`js/hints.js`) and UI logic (`js/onboarding.js`).


## Git workflow expectations

- GitHub is the source of truth for branch state and CI results.
- Work in the branch explicitly selected for the task; if none is named, default to `test`.
- Do not create additional branches unless explicitly requested.
- Do not open pull requests unless explicitly requested.
- Push completed changes to the selected working branch; never target `main` unless separately and explicitly requested.
- Do not deploy manually; deployment to test should run via GitHub Actions after push to `test`.

## Conventions to preserve

- Keep section-banner comments in the existing style: `// ── Name ─────────────────...`.
- Keep DOM construction imperative; this app intentionally has no framework or templates.
- Do not shadow mutable globals from `js/state.js` in other files.
- Keep status display order and picker cycle order separate: display order is reorderable, picker order is intentionally stable via `pickerOrder()`.
- Drag/drop in `js/render.js` uses the module-level `dragState`, not native `dataTransfer` for internal node moves.
- Do not wrap imports in `try/catch`; this repo currently has no imports.
- Avoid adding build tooling unless explicitly requested.

## Manual checks

- Syntax smoke check: `node --check js/*.js`.
- Static app smoke run: `python3 -m http.server 8000` and open the app in a browser.
- If you change visible UI, take a screenshot after serving locally when the environment supports it.
- If you change database shape, update `migration.sql` and note that it must be run manually in Supabase.
