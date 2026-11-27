# ReadMe

ReadMe is a private, browser-based Markdown editor and reader. Open, edit, preview, organize, and export documents locally. Your workspace stays in this browser unless you explicitly export it or connect a folder for sync.

## Run locally

Requirements: Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

The app runs at the local URL printed by Vite. For a production build use `npm run build`; `npm run preview` serves that build locally.

## Features

- Markdown editing and live preview, with themes, document properties, history, and file organization.
- Workspace agenda for task and document deadlines, link checks, reusable templates, and recovery snapshots.
- Workspace backups, exports, optional local folder sync, and installable offline PWA support.
- No account or application server is required. Documents and settings are stored in browser storage.

## Browser support

Current Chrome and other Chromium browsers are the reference environment. Firefox and Safari support core editing and preview features; file-system access, install prompts, and on-device AI depend on browser support and may be unavailable. The app reports optional capabilities in context and continues to work without them.

## Checks

```sh
npm test
npm run lint
npm run build
npm run test:browser # real Chrome smoke checks (Chrome must be installed)
```

See [Guidelines.md](Guidelines.md) for architecture, interaction standards, testing, and release steps. The in-app Help describes user-facing features.

## Contributing

Keep changes local-first, preserve user data, follow the design tokens and accessibility patterns in `Guidelines.md`, and update Help when user workflows change. Before submitting, run the checks above and manually verify relevant workflows in Chrome at desktop and 390px mobile widths. Do not commit generated build output or workspace data.
