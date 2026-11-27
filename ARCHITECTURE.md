# ReadMe architecture and release workflow

## Architecture

ReadMe is a client-side React 19 application built with Vite. `src/App.jsx` owns workspace state and coordinates editor, preview, Files, Library, sync, backup and dialogs. Feature logic with clear boundaries lives in focused modules such as `library.js`, `backup.js`, `folderSync.js`, `workspaceDb.js`, and `themes.js`; reusable UI is in `src/components/`.

The browser is the persistence boundary: small preferences use `localStorage`; workspace documents, history, attachment blobs, and directory handles use IndexedDB through `workspaceDb.js`. `BroadcastChannel` keeps same-origin tabs aligned. Backups are explicit ZIP exports. Folder sync is an optional File System Access API integration and must preserve unresolved external edits.

Styles use design tokens from `src/index.css`; icons are wrapped in `src/icons.jsx`. Optional or heavy browser features are capability-checked and should degrade without blocking editing. In-app user workflows are documented in `HelpDialog.jsx`; keep its names and explanations aligned with the README and Guidelines.

## Release workflow

1. Read `Guidelines.md` and inspect current changes before editing.
2. For a user-visible release, increment `APP_VERSION` in `src/version.js` by 0.1 and add a concise newest-first `RELEASES` entry. Skip the bump only when the task explicitly asks for it.
3. Update Help for user-facing behavior and update README/Guidelines/this file when setup, architecture, or release steps change.
4. Run `npm test`, `npm run lint`, `npm run build`, and `npm run test:browser` with installed Chrome. Check changed flows in light/dark themes, keyboard use, and 390px mobile width.
5. Review the diff and ensure no local workspace data, secrets, or generated build output is included.
6. Commit to `main`; deployment is triggered by the repository's GitHub Actions workflow on push. Confirm the published build and release notes after deployment.

See [Guidelines.md](Guidelines.md) for detailed product and implementation constraints.
