# Mailautumn — Development Guidelines

## Project Overview

Mailautumn is a Slack-style AI email hub built on the Mailspring sync engine. Electron desktop app wrapping the `mailsync` C++ binary.

- **Display name**: Mailautumn
- **Internal name**: mailspring-next (DO NOT change — safeStorage keyring key depends on it)
- **Working directory**: `mailspring-next/` — all code edits happen here, NOT in `Mailspring/`

## Tech Stack

- **Shell**: Electron (latest)
- **Bundler**: Vite (via electron-vite)
- **Frontend**: React 18 + TypeScript + Tailwind CSS v4
- **State**: Jotai (atomic model — NOT Zustand, NOT Redux)
- **DB reads**: better-sqlite3 (preload/utility process)
- **DB writes**: mailsync (child process, JSON stdio)
- **Credentials**: Electron safeStorage
- **Rich text**: TipTap v2 (compose/reply)
- **Linting**: ESLint flat config + Husky + lint-staged

## Common Commands

```bash
npm run dev          # Start dev mode (Electron + Vite HMR)
npm run build        # Build main + preload + renderer to out/
npm run typecheck    # TypeScript strict check (both main + renderer)
npm run lint         # ESLint across src/
npm run dist:linux   # Package for Linux (AppImage + deb)
```

**DANGER**: `npm start`, `npm test`, `npm run test-window` in the parent `Mailspring/` directory launch full old Electron. Never run from CLI.

**IMPORTANT**: Changes to `src/main/` or `src/preload/` require `npm run build` (or `npx electron-vite build`) — HMR only covers the renderer.

## Architecture

- **Main process** (`src/main/`): Electron main, IPC handlers, mailsync bridge, AI pipeline, OAuth, identity server
- **Preload** (`src/preload/`): contextBridge API surface — every renderer→main call goes through here
- **Renderer** (`src/renderer/`): React app, Jotai atoms, components, theme system, plugin system
- **mailsync**: C++ binary at `resources/mailsync/mailsync.bin`, communicates via JSON over stdio

---

## SOPs

### SOP 1: Git Commit Discipline

- **Small, feature-scoped commits.** One feature/fix per commit, not bundles.
- **Conventional commit format**: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- **NO Co-Authored-By signature.** User preference.
- **Run `npm run typecheck` before pushing.** The pre-commit hook runs lint-staged (ESLint on staged `.ts/.tsx` files). Typecheck is manual but required before push.
- **Review diffs** before committing. No accidental debug code, console.log, or credential leaks.

### SOP 2: No Arbitrary Tailwind Values

Never use bracket notation for sizes, spacing, or colors:
- Bad: `text-[11px]`, `w-[327px]`, `min-w-[280px]`, `gap-[6px]`
- Good: `text-xs`, `w-72`, `min-w-64`, `gap-1.5`

Use standard Tailwind utilities or extend the theme in `index.css` via `@theme` if a value is genuinely needed. Color hex in brackets (e.g., `text-[#4285f4]`) is acceptable only for one-off brand colors that don't warrant a theme variable.

### SOP 3: TypeScript Quality

- **No empty `.catch(() => {})`** — Always log or handle: `.catch(err => console.error('[context]', err))`
- **Minimize `any`** — Use proper types. `any` is a warning in ESLint; reduce count over time.
- **No `as any` casts** without a comment explaining why.
- **Typecheck must pass** (`npm run typecheck`) before merging. Zero tolerance for type errors.

### SOP 4: Frontend Action Handler Pattern

For any user-triggered action that calls the backend:

1. **Guard** — check preconditions (account exists, thread selected, etc.)
2. **Loading state** — set `sending`/`loading` to true
3. **API call** — `await window.api.someMethod(...)`
4. **Check result** — `if (result && !result.sent)` or `if (result.error)` — show error to user
5. **Update UI** — only on success
6. **Clear loading** — in `finally` block

Never `console.error` without also showing UI feedback. API failure ≠ empty state — show an error message.

### SOP 5: Optimistic UI Safety

When doing optimistic updates (star, archive, mark read, etc.):

1. Call `markOptimistic()` before updating atoms
2. Update the Jotai atom immediately (optimistic)
3. Fire the IPC task (fire-and-forget with `.catch(err => console.error(...))`)
4. The `isOptimisticWindow()` guard suppresses delta-triggered reloads for 2s to avoid flickering

### SOP 6: IPC Contract

- Every renderer→main call goes through `src/preload/index.ts`
- Every preload method maps to an `ipcMain.handle()` in `src/main/ipc-handlers.ts`
- Keep these two files in sync. If you add a preload method, add the handler. If you add a handler, expose it in preload.
- Main process uses `electron-log` for logging (not `console.log`). Renderer uses the logger module at `src/renderer/lib/logger.ts` for structured logging.

### SOP 7: mailsync Task Serialization

All database writes go through mailsync via `queueTask()`. The `serializeTask()` function in `mailsync.ts` maps renderer task objects to the format the C++ binary expects.

- Every task type (`ChangeStarredTask`, `SendDraftTask`, etc.) must have a `case` in the `switch` block
- If you add a new task type, add the case AND rebuild (`npx electron-vite build`) — stale builds silently drop tasks
- Test sends after any change to task serialization

### SOP 8: Pre-Commit Code Audit

Before committing, verify:

1. **Scope** — Is this commit focused on one thing?
2. **Typecheck** — `npm run typecheck` passes
3. **Lint** — `npm run lint` has zero errors (warnings are tracked, not blocking)
4. **No console.log** — Use `electron-log` (main) or the logger module (renderer)
5. **No hardcoded secrets** — API keys, tokens, passwords never in source
6. **No empty `.catch()`** — Always log errors
7. **No arbitrary Tailwind values** — Use standard utilities
8. **Build works** — `npm run build` succeeds

### SOP 9: Plugin Development

Plugins use the slot-based registry at `src/renderer/plugins/registry.ts`:

- Register components for named slots (e.g., `message-sidebar`)
- Plugin code lives in `src/renderer/plugins/<name>/`
- Backend for plugins uses separate SQLite databases (not `edgehill.db`)
- Plugins are opt-in via settings toggles
- Follow the same TypeScript, lint, and testing standards as core code

---

## Key Docs

- `DECISIONS.md` — Confirmed architecture and design decisions
- `PROJECT_PLAN.md` — Original phase breakdown
- `FEATURE_INVENTORY.md` — 16-client, 84-feature cross-reference
