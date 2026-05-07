# AGENTS.md

## What this is

ZTools host plugin — a local-first Markdown note app running inside the ZTools Electron-like shell. React 19 + Vite 6 + TypeScript. ESM package (`"type": "module"`).

## Commands

```bash
npm run dev        # Vite dev server (port 5173, used by ZTools dev mode)
npm run build      # tsc && vite build
npm run test       # vitest run (single test file: src/lib/gitSync.test.ts)
```

No lint, format, or typecheck scripts exist. Run `npx tsc --noEmit` to typecheck manually.

## Architecture

- **Host dependency**: `window.services` (fs, git, process) and `window.ztools` are injected by the ZTools preload script (`public/preload/services.js`). These APIs do not exist in a plain browser — don't assume standard Node/Electron APIs.
- **Plugin manifest**: `public/plugin.json` declares the plugin entry, preload, and search commands.
- **Entry point**: `src/main.tsx` → `src/App.tsx`
- **State**: Zustand store at `src/store/useNoteStore.ts`
- **Editor**: Vditor WYSIWYG mode (`src/components/editor/MainEditor.tsx`). Vditor CSS is imported from `vditor/dist/index.css`. Tailwind v4 preflight can strip list styles from vditor — see `src/main.css` for overrides.
- **Git sync**: Pure-JS via `isomorphic-git` in `src/lib/gitSync.ts`. The preload script shells out to system git for clone operations.
- **Export**: PDF/image export uses Playwright via a child process (`public/preload/export-worker.cjs`).

## Key conventions

- **Path alias**: `@/` maps to `src/` (configured in both `tsconfig.json` and `vite.config.js`).
- **Tailwind CSS v4**: No `tailwind.config.*` file. Theme is defined with CSS-native `@theme` directives in `src/main.css`. Uses oklch color variables for light/dark.
- **shadcn/ui**: Base-nova style, components in `src/components/ui/`. Utility: `cn()` from `src/lib/utils.ts`.
- **Preload is CommonJS**: `public/preload/` has its own `package.json` with `"type"` not set (defaults to CJS). Do not convert to ESM.
- **Draft persistence**: Editor drafts are saved to `localStorage` via `src/lib/editorDraft.ts`, not the filesystem.
- **Custom events**: `src/lib/noteEditorEvents.ts` defines event constants for editor lifecycle (e.g., pre-switch save).

## Gotchas

- The `@ztools-center/ztools-api-types` devDependency provides types for `window.services` and `window.ztools`. If you add new host API calls, check `src/env.d.ts` for the type declarations.
- Vditor ordered lists: Tailwind preflight resets `list-style`. A `.vditor-reset ol { list-style-type: decimal; }` override exists in `src/main.css` — don't remove it.
- File tree operations (create/rename/move/delete/import) go through `src/lib/noteWorkspaceService.ts`, which uses `window.services` fs APIs.
- Tests require vitest (`npm run test`). Only `src/lib/gitSync.test.ts` exists currently.
