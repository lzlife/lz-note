# AGENTS.md

## What this is

ZTools host plugin — a local-first Markdown note app running inside the ZTools Electron-like shell. React 19 + Vite 6 + TypeScript. ESM package (`"type": "module"`).

## Commands

```bash
npm run dev        # Vite dev server (port 5173, used by ZTools dev mode)
npm run build      # tsc && vite build
npm run test       # vitest run (single test file: src/lib/gitSync.test.ts)
```

No lint, format, or typecheck scripts exist. Run `node node_modules/typescript/bin/tsc --noEmit --project tsconfig.json` to typecheck manually.

## Architecture

- **Host dependency**: `window.services` (fs, git, process) and `window.ztools` are injected by the ZTools preload script (`public/preload/services.js`). These APIs do not exist in a plain browser — don't assume standard Node/Electron APIs.
- **Plugin manifest**: `public/plugin.json` declares the plugin entry, preload, and search commands.
- **Entry point**: `src/main.tsx` → `src/App.tsx`
- **State**: Zustand store at `src/store/useNoteStore.ts`
- **Editor**: Vditor WYSIWYG mode (`src/components/editor/MainEditor.tsx`). Vditor CSS is imported from `vditor/dist/index.css`. Tailwind v4 preflight can strip list styles from vditor — see `src/main.css` for overrides.
- **Git sync**: Pure-JS via `isomorphic-git` in `src/lib/gitSync.ts`. The preload script shells out to system git for clone operations.
- **Export**: PDF/image export uses Playwright via a child process (`public/preload/export-worker.cjs`).

## Editor features (`MainEditor.tsx`)

- **Vditor WYSIWYG mode** with full toolbar: undo/redo, headings, bold/italic/strike, line, quote, lists, task list, code/inline-code, emoji, image upload, link, table, edit-mode switching, outline, fullscreen
- **Image upload**: Files saved to `.resources/` dir relative to the active file, with timestamped filenames and relative path insertion
- **Slash command menu** (`SlashCommandMenu.tsx`): Type `/` to trigger a popup with 13 commands — headings 2-6, inline code, code block, quote, unordered/ordered/task list, link, table. Supports keyboard navigation (ArrowUp/Down/Enter/Escape), real-time text filtering, auto-boundary detection (menu repositions if near viewport edges), click-outside-to-close
- **Auto-save drafts**: On every `input` event → localStorage draft; debounced 400ms flush to disk on file changes
- **Draft recovery**: On file switch, recovers draft if `updatedAt > mtime` or within 1-minute window
- **Theme sync**: Editor theme follows `next-themes` resolvedTheme — dark/classic editor, dark/light content, github-dark/github code
- **Slash menu closure on Backspace**: Native `input` listener on the editor element checks for `/` presence and closes menu immediately (bypasses Vditor's 800ms undoDelay)

## File management (`src/components/layout/`)

- **Sidebar** (`Sidebar.tsx`): File tree with refresh, expand-all, import, new-file, new-folder buttons; search filtering; drag-to-root move
- **File tree node** (`SidebarFileTreeNode.tsx`): Recursive tree rendering with expand/collapse, click-to-open, inline rename, drag-and-drop, right-click context menu, delete confirmation dialog
- **Right-click menu** (`SidebarNodeMenu.tsx`): Folder → new note / new folder / import / export / rename / delete; File → copy / export (MD/HTML/PDF/Image) / rename / delete
- **Editor top bar** (`EditorTopBar.tsx`): Current filename display with inline rename; Git sync button; more menu → Git repo settings / local store settings
- **Settings dialogs**: `LocalStoreDialog.tsx` for workspace path selection; `SettingsDialog.tsx` for Git URL/token/branch/sync-strategy configuration

## Git sync (`src/lib/gitSync.ts`)

Full sync workflow: `precheck` → `pull` (snapshot-based conflict resolution) → `diff` → `commit` → `push`. Supports three strategies: `full_sync`, `pull_only`, `manual_only`. Uses `isomorphic-git` for all git operations. Startup auto-sync in `App.tsx`.

## Export (`src/lib/exportManager.ts` + `noteExportService.ts`)

Four formats: Markdown (`.md`), HTML (`.html`), PDF (via Playwright), Image PNG/JPG (via Playwright). File export via `window.ztools.showSaveDialog`; folder export via `window.ztools.showOpenDialog` + `window.services.copy`.

## Key conventions

- **Path alias**: `@/` maps to `src/` (configured in both `tsconfig.json` and `vite.config.js`).
- **Tailwind CSS v4**: No `tailwind.config.*` file. Theme is defined with CSS-native `@theme` directives in `src/main.css`. Uses oklch color variables for light/dark.
- **shadcn/ui**: Base-nova style, components in `src/components/ui/`. Utility: `cn()` from `src/lib/utils.ts`.
- **Preload is CommonJS**: `public/preload/` has its own `package.json` with `"type"` not set (defaults to CJS). Do not convert to ESM.
- **Draft persistence**: Editor drafts are saved to `localStorage` via `src/lib/editorDraft.ts`, not the filesystem.
- **Custom events**: `src/lib/noteEditorEvents.ts` defines event constants for editor lifecycle (e.g., pre-switch save).
- **Storage abstraction**: `src/lib/storage.ts` — key-value store wrapping `window.ztools.dbStorage` with `localStorage` fallback.
- **CSS customizations**: `src/main.css` contains `.slash-command-*` styles for the slash command popup and `.vditor-reset ol` for ordered list rendering.

## Gotchas

- The `@ztools-center/ztools-api-types` devDependency provides types for `window.services` and `window.ztools`. If you add new host API calls, check `src/env.d.ts` for the type declarations.
- Vditor ordered lists: Tailwind preflight resets `list-style`. A `.vditor-reset ol { list-style-type: decimal; }` override exists in `src/main.css` — don't remove it.
- File tree operations (create/rename/move/delete/import) go through `src/lib/noteWorkspaceService.ts`, which uses `window.services` fs APIs.
- Tests require vitest (`npm run test`). Only `src/lib/gitSync.test.ts` exists currently.
- **Vditor's `options.input` callback has 800ms default delay** (`undoDelay: 800`). The slash menu uses a native `input` listener on the editor element to bypass this delay for immediate Backspace detection.
- **`handleNativeKeydown`** is bound inside Vditor's `after` callback on `.vditor-wysiwyg` element. Any listener bound there must be cleaned up in the effect's return function. Currently: `keydown` and `input` listeners are managed.
