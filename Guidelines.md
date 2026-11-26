# Client-Side Tool Guidelines

These are the standards we built and tested while making **ReadMe**, a Markdown reader and editor that runs entirely in the browser (React 19 + Vite PWA, <https://readme.guptasahil.in>).

Give this file to an agent or a new project to bring another client-side dev tool up to the same level. Every rule here was either built deliberately or learned from a bug, so treat them as defaults, not suggestions.

The file is organised in 14 sections:

1. [Principles](#1-principles)
2. [Stack and project setup](#2-stack-and-project-setup)
3. [Design tokens](#3-design-tokens)
4. [Themes](#4-themes)
5. [Icons](#5-icons)
6. [Components and interaction patterns](#6-components-and-interaction-patterns)
7. [Layout, responsiveness, motion](#7-layout-responsiveness-motion)
8. [Accessibility](#8-accessibility)
9. [Storage, files and folders](#9-storage-files-and-folders)
10. [Browser platform features](#10-browser-platform-features)
11. [On-device AI](#11-on-device-ai)
12. [Testing and verification](#12-testing-and-verification)
13. [Writing UI copy](#13-writing-ui-copy)
14. [Working agreement (for agents)](#14-working-agreement-for-agents)

There is also a [release checklist](#release-checklist) at the end.

---

## 1. Principles

- **Private by default.** Everything runs and is stored in the browser. Nothing is uploaded, and "no server involved" is a feature, so say it in the UI. For example, a share link carries the document inside the URL itself.
- **Never lose user data.** Every destructive action is undoable, recorded in version history, or both. Closing is never deleting. Sync never overwrites silently.
- **Works everywhere, better in Chromium.** Detect each capability and degrade gracefully. Examples: the File System Access API, on-device AI, `FileSystemObserver` and the View Transitions API.
- **Offline-first PWA.** Installable, opens files from the OS, accepts shares, and works offline.
- **One design system.** Tokens, themes, icons, hovers and tooltips are consistent on every surface, in every theme, including high contrast.
- **Verified, not assumed.** Every change is checked in real Chrome, and checked for accessibility in every theme, before it ships.

## 2. Stack and project setup

| Concern | Choice |
|---|---|
| UI | React 19 (functional components and hooks) |
| Build | Vite, `@vitejs/plugin-react` |
| CSS | Tailwind v4 (`@import "tailwindcss"`, `@tailwindcss/typography`) plus a token-based custom stylesheet |
| Icons | `@icon-park/react` (Apache-2.0), wrapped. See [§5](#5-icons) |
| Unit tests | Vitest + jsdom + Testing Library (`@testing-library/react`, `jest-dom`) |
| Browser tests | Playwright scripts driving **real Chrome** (`playwright-core` with `executablePath` set to the installed Chrome), plus `axe-core` |
| Lint | ESLint 9 flat config with `react-hooks` (v7, which includes `set-state-in-effect`) and `react-refresh` |
| Deploy | GitHub Pages via a GitHub Actions workflow on push to `main`, with a custom domain through `public/CNAME` |
| Heavy libraries | Code-split and lazy-loaded (Mermaid, CodeMirror, KaTeX/MathJax, pdfmake, docx, JSZip). Export-only libraries are **not** precached by the service worker |

**Scripts:** `dev`, `build`, `lint` (`eslint .`), `test` (`vitest run`), `preview`.

**Before every commit:**
- `npx eslint .` reports zero problems;
- `npx vitest run` passes;
- `npm run build` succeeds;
- the browser checks in [§12](#12-testing-and-verification) pass.

## 3. Design tokens

All colour comes from CSS custom properties on `:root`, overridden per theme. **Never hard-code a colour in a component.** Inline styles use `var(--token)` too.

```css
:root {
  color-scheme: light;
  /* surfaces */
  --bg-app: #ebecf6;  --bg-editor: #f8f9fe;  --bg-preview: #ffffff;
  --bg-header: rgba(255,255,255,.84);  --bg-toolbar: rgba(246,247,253,.92);  --bg-toc: rgba(245,246,253,.96);
  /* lines */
  --border: #dfe2f0;  --border-light: #edf0f9;  --border-strong: #c5cae0;
  /* text: 1 = strongest … 4 = faintest (still ≥ 4.5:1 on its background) */
  --text-1: #14172b;  --text-2: #2f3460;  --text-3: #5e6392;  --text-4: #6b7194;
  /* brand */
  --accent: #6d28d9;  --accent-2: #4f46e5;
  --accent-soft: rgba(109,40,217,.075);  --accent-border: rgba(109,40,217,.19);  --accent-glow: rgba(109,40,217,.18);
  /* code */
  --code-bg: #f2f3f9;  --code-header-bg: #e8eaf4;  --code-border: #d5d8ec;  --code-lang-color: #5a6187;
  /* elevation */
  --shadow-sm: 0 1px 2px rgba(20,24,80,.05), 0 0 0 1px rgba(20,24,80,.03);
  --shadow-md: 0 4px 16px rgba(20,24,80,.07), 0 1px 3px rgba(20,24,80,.04);
  --shadow-lg: 0 14px 40px rgba(20,24,80,.11), 0 4px 12px rgba(20,24,80,.05);
  --shadow-xl: 0 24px 64px rgba(20,24,80,.16), 0 8px 24px rgba(20,24,80,.08);
  /* interaction */
  --icon-hover-bg: color-mix(in srgb, var(--accent) 15%, transparent);
  --icon-hover-fg: var(--accent);
}
```

Rules:

- **Text tiers.** `--text-1` is for headings and body, `--text-2` for secondary text, `--text-3` for meta and hints, and `--text-4` for the faintest labels. Every tier must pass 4.5:1 on **every** surface it can sit on, in **every** theme.
  - Watch tinted rows such as `--accent-soft` selections: `--text-4` failed there. Selected rows should move one tier stronger (`--text-4` → `--text-2`).
  - Small UPPERCASE tags and `kbd` hints are where contrast failures hide.
- **Derived colours** use `color-mix(in srgb, …)` so they follow the theme automatically.
- **Typography.** `--font-sans` is Inter (falling back to system-ui) and `--font-mono` is JetBrains Mono (falling back to Fira Code). Turn on antialiasing and use `font-variant-numeric: tabular-nums` for counters and timers.
- **Scrollbars.** 4px wide, a transparent track, and a rounded thumb tinted for dark mode.
- **Radius scale.**

  | Radius | Used for |
  |---|---|
  | 6–8px | Small controls |
  | 10–14px | Menus, cards and toasts |
  | 24–28px | Hero cards and slides |
  | 999px | Pills, tags and round icon hovers |

- **Density.** Support `data-density="comfortable|compact"` on the app shell.

## 4. Themes

### Model

Themes are defined in one place, `themes.js`:

```js
export const THEMES = [
  { id: 'light', label: 'Light', dark: false, swatch: ['#ffffff', '#6d28d9'] },
  { id: 'dark',  label: 'Dark',  dark: true,  swatch: ['#1b1c2e', '#a78bfa'] },
  { id: 'sepia', label: 'Sepia', dark: false, swatch: ['#f5ecdb', '#9a5212'] },
  // `extra` themes appear only when "Additional themes" is on in Settings
  { id: 'neon', label: 'Neon Pink', dark: true, extra: true, classes: ['theme-neon'], swatch: [...] },
  { id: 'neon-rainbow', label: 'Neon Rainbow', dark: true, extra: true, classes: ['theme-neon', 'theme-neon-rainbow'], swatch: [...] },
  // ocean, forest, sun, monokai, nord, solarized …
]
export const themeClasses = t => t.classes ?? (t.extra ? [`theme-${t.id}`] : [])
export const ALL_THEME_CLASSES = [...new Set(THEMES.flatMap(themeClasses))]
export const availableThemes = extra => THEMES.filter(t => extra || !t.extra)
export const nextTheme = (current, extra) => { /* cycle through availableThemes */ }
```

- On `<html>`, a dark theme adds `dark` plus its own classes. Always remove `ALL_THEME_CLASSES` before adding the new ones.
- **Base set:** Light, Dark and Sepia. **Optional set:** Neon (Pink, Blue, Green, Purple and Rainbow), Ocean, Forest, Sun, Monokai, Nord, Solarized and Marble (white surfaces, black accent; icons keep the default violet tint via `--ip-tone`).
- **Theme families share a base class.** All neon variants use `theme-neon` and set `--neon-1 … --neon-6` as RGB triplets (`rgb(var(--neon-2))`). Rainbow also defines `--rainbow: linear-gradient(…)`, which borders and progress bars use when it's present: `var(--rainbow, linear-gradient(135deg, var(--accent), var(--accent-2)))`.
- **Every theme overrides the full token set:** surfaces, text tiers, accent, code, shadows and icon variables.
- **Code blocks follow the theme.** Each theme maps to a matching syntax style, for example:

  | Theme | Syntax style |
  |---|---|
  | Monokai | okaidia |
  | Nord | nord |
  | Solarized | solarizedlight |
  | Ocean | materialOceanic |
  | Forest | gruvboxLight |
  | Neon | synthwave84 |
  | Dark | oneDark |
  | Light | vibrant |

### Theme UX

- The header theme button cycles through the available themes. Its icon changes per theme: Sun/Moon, BookOpen for sepia, Zap for neon, Sunrise for Sun, Palette for Monokai, Snowflake for Nord, SunDim for Solarized, Contrast for Marble, Waves for Ocean and Leaf for Forest. It animates in with `theme-icon-enter`.
- **Default theme.** Settings → Appearance has a Default theme select ("Last used", then Main and Additional optgroups), stored as `defaultTheme` in the app settings. On launch a valid default wins over the last-used theme. Picking an additional theme as the default turns Additional themes on, and turning them off clears an additional default.
- The Settings → Appearance picker shows **live mini previews**: a tiny page drawn with the theme's own classes, so the tokens apply locally. A swatch alone isn't enough.
- Theme switches use the **View Transitions API** when available:

  ```js
  function withThemeTransition(update) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!document.startViewTransition || reduce) { update(); return }
    document.startViewTransition(() => flushSync(update))
  }
  ```

- Brand marks such as the logo tile take per-theme colours (`--logo-bg`). Never let a logo turn into a solid blob in high contrast: in high contrast the tile uses `var(--accent)` and the glyph uses `var(--bg-preview)`.

### High contrast

- `html.high-contrast` is an independent switch that works **with every theme**. Write `html.high-contrast.theme-X` overrides for each theme.
- High contrast makes text one tier stronger (e.g. `--text-3` → `--text-2`), gives borders solid strong colours, gives frames solid borders instead of gradients, uses slightly thinner icon strokes, and draws dark outer and inner strokes on multi-colour icons.

### Lite mode

- `html.lite-mode` saves memory by turning off syntax colours, diagrams, link previews, decorative animations and pets.

## 5. Icons

**Library:** IconPark (`@icon-park/react`), which is colourful, modern and Apache-2.0. Wrap it once (`icons.jsx`) and export it under stable names, so components never import the library directly and you can swap libraries later.

```jsx
const SLOTS = ['#0a0b01', '#0a0b02', '#0a0b03', '#0a0b04'] // outer stroke, outer fill, inner stroke, inner fill
export const LARGE_ICON = 16
export const IconStyleContext = createContext('two-tone')   // 'two-tone' on light themes, 'filled' on dark

function make(ParkIcon, name) {
  function Icon({ size = 24, strokeWidth, fill, variant, className, style, color, 'aria-hidden': ariaHidden, ...rest }) {
    const small = useContext(IconStyleContext)
    const px = Number(size) || 24
    let theme = variant ?? (px >= LARGE_ICON ? 'multi-color' : small)
    if (fill && fill !== 'none') theme = 'filled'           // keep Lucide-style "solid" meaning
    return createElement(ParkIcon, {
      ...rest, theme, size: px, fill: SLOTS,
      strokeWidth: strokeWidth ? Number(strokeWidth) * 2 : 4,
      className: `ip ip-${theme}${className ? ` ${className}` : ''}`,
      style: color ? { ...style, color } : style,
      'aria-hidden': ariaHidden ?? true,                     // decorative by default
    })
  }
  Icon.displayName = name
  return Icon
}
export const Search = make(ParkSearch, 'Search')
```

The CSS maps the placeholder colours to theme tokens, so icons restyle with each theme:

```css
:root {
  --ip-stroke: currentColor;  --ip-tone: var(--accent);  --ip-tone-opacity: .32;
  --ip-on-fill: var(--bg-preview);  --ip-pop: #f59e0b;
  --ip-mc-stroke: color-mix(in srgb, var(--accent) 45%, #14102a);
  --ip-mc-fill: var(--accent);  --ip-mc-inner-stroke: #fff;  --ip-mc-inner-fill: var(--ip-pop);
}
.dark { --ip-mc-stroke: color-mix(in srgb, var(--accent) 35%, #fff); --ip-mc-inner-stroke: #15112b; --ip-pop: #fbbf24; --ip-tone-opacity: .4; }
.ip [stroke="#0a0b01"] { stroke: var(--ip-stroke); }   .ip [fill="#0a0b01"] { fill: var(--ip-stroke); }
.ip-two-tone [fill="#0a0b02"] { fill: var(--ip-tone); fill-opacity: var(--ip-tone-opacity); }
.ip-filled [fill="#0a0b01"] { fill: var(--ip-body, var(--ip-stroke)); }
.ip-filled [fill="#FFF" i] { fill: var(--ip-on-fill); }
.ip-multi-color [stroke="#0a0b01"] { stroke: var(--ip-mc-stroke); } /* …and so on for slots 02–04 */
/* Guard: icon wrappers must never pick up styles written for text spans. */
.i-icon.ip { flex: none !important; padding: 0 !important; background: none !important; border: 0 !important; min-width: 0 !important; }
```

Rules learned the hard way:

- **Size picks the style.** Icons of 16px and up are multi-colour. Smaller icons are two-tone on light themes and filled on dark themes.
- **Dark themes need three tones on filled icons** (light outline, coloured body, cut-out details) through `--ip-body`. Otherwise small icons look single-coloured.
- **Feature colours.** Per-feature hues come from a `--feat` variable (e.g. AI is purple, export green, danger red), so a toolbar reads at a glance.
- **The same action uses the same icon everywhere.** Our highlighter differed between edit and view modes, and the user noticed.
- **Check every icon after a swap.** In a browser, scan for icon spans that are positioned, stretched, or still have unmapped placeholder colours (`rgb(10, 11, 1–4)`).
- **Watch the wrapper span.** IconPark renders `<span class="i-icon i-icon-<name> ip ip-<theme>">`. Selectors like `.x > span` or `span { flex: 1 }` will match it, so exclude it with `:not(.i-icon)`.
- **ESLint doesn't catch undefined JSX components** (a missing icon import crashed a menu). Run a quick script that compares the `<Capitalised` tags used in each file with its imports and declarations.

## 6. Components and interaction patterns

### Icon buttons and hovers

- **Every** icon button gets the same **round** hover (`background: var(--icon-hover-bg); color: var(--icon-hover-fg); border-radius: 999px`) inside a **square hit area** of at least 28–32px.
- Danger buttons override the hover colours: `--icon-hover-bg: rgba(239,68,68,.14); --icon-hover-fg: #ef4444`.
- Scope toolbar-wide rules so they don't leak into popovers, e.g. `.toolbar button:not(.popover *)`.
- Hover circles in scrolling strips get clipped. Give toolbar groups `height: auto` and use `::before` dividers (plain lines, not capsules) between groups.

### Tooltips

- **CSS tooltip** for normal buttons: `button[data-tooltip]::after { content: attr(data-tooltip) }`, with edge-aligned variants (`tooltip-start` / `tooltip-end`) and the header variant aligned right.
  - Hide it while that button's menu is open: `button[aria-expanded="true"][data-tooltip]::after { display: none }`.
- **Portal tooltip** for anything inside a horizontally scrolling strip (CSS tooltips get clipped there). Use a `useHoverTooltip()` hook driven by `data-tip`:
  - 350ms delay, then shown instantly when moving to a neighbouring button;
  - shown at once on `:focus-visible`;
  - hidden on scroll and pointer-down;
  - clamped to the viewport.
- **Every icon-only button needs both** an `aria-label` and a tooltip with the same wording. Labels can be removed to save space (e.g. "Write README" and "Templates" became icon-only) only if hover still names them.

### Menus

- Use `role="menu"` / `role="menuitem"`. The trigger has `aria-haspopup="menu"` and `aria-expanded`. Arrow keys move between items, Escape closes and returns focus, and clicking outside closes.
- Group related actions into split buttons: New ▾ (templates, write README), Upload ▾ (open files, import from URL), Download ▾ (Save File in Place first, then Markdown, PDF…, Word, HTML, Export all .zip, Backup, Restore).
- Context menus (right-click, Shift+F10) are grouped by separators:
  1. Rename, Duplicate, Pin, Colour
  2. Reveal, Compare, Download
  3. Close, Close others, Close to the right, Reopen closed
  4. **Delete permanently…** (danger colour, last)
- Size menu and popover widths so labels fit on one line, give option buttons equal widths (`flex: 1 1 0`), and keep the menu inside the viewport.

### Dialogs

- Use `role="dialog" aria-modal="true" aria-labelledby`. Close on backdrop mouse-down (not click) and on Escape.
- Focus once on open, using a hook that reads callbacks from a ref so parent re-renders don't steal focus:

  ```js
  export function useDialogKeys(onClose, { focus, canClose } = {}) {
    const latest = useRef({ onClose, canClose })
    useEffect(() => { latest.current = { onClose, canClose } })
    useEffect(() => {
      focus?.()
      const onKey = e => { if (e.key === 'Escape' && !(latest.current.canClose && !latest.current.canClose())) { e.preventDefault(); latest.current.onClose() } }
      window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  }
  ```

- **Settings dialog:** side navigation with Workspace, Appearance, Features, Storage and About. Toggles are `role="switch"` checkboxes with a label and a one-line description.
- **Help dialog:** sectioned how-to with search. **Shortcuts sheet:** opened with `?`, grouped by area.

### Search and command palette

- **Command palette (⌘/Ctrl+K)** searches files, headings, commands and templates.
  - Use the combobox pattern: the input has `role="combobox"`, `aria-controls`, `aria-expanded` and `aria-activedescendant`; the list is `role="listbox"` with `role="option"` and `aria-selected` on each item.
  - Scroll the highlighted item into view.
- **Search across files (⌘/Ctrl+Shift+F):**
  - deferred query (`useDeferredValue`);
  - at least two characters;
  - per-file and total result caps;
  - grouped results with snippets and `<mark>`;
  - Enter jumps to the line and selects the match;
  - it includes closed files, tagged "closed", and opening one reopens it.

### Toasts

- A single toast at the bottom centre with `role="status" aria-live="polite"`. It has tones (info, success, warning) and a duration.
- **It can carry an action (`Undo`).** Use this for every destructive action instead of a confirm dialog wherever possible.

### Empty states

- Use one shared `EmptyState` component (icon, title, one helpful sentence) for no results, nothing found and no files.
- On the workspace empty screen, all primary tiles go **in one row** and are wide enough that their text never wraps or overflows. Use consistent icon styles across tiles. If a tile is conditional, swap it (e.g. Reopen closed tab ↔ Restore a backup) so the count stays fixed.

### Banners

- Inline `role="alert"` banners above the editor for conflicts, offering Reload/Use theirs, Compare (a side-by-side diff) and Keep mine.

### Editors

- The **simple textarea editor is the default**. A code editor (CodeMirror) is opt-in.
- **Programmatic edits must keep native undo working.** Apply them with `document.execCommand('insertText')` on a focused textarea. Fall back to `setRangeText` plus an `input` event. Never set the whole value from React state for a toolbar action, because that wipes the undo stack.

  ```js
  function applyTextareaEdit(ta, { from, to, text, cursor, cursorEnd }) {
    if (ta.applyEdit) { ta.applyEdit({ from, to, text, cursor, cursorEnd }); return } // CodeMirror adapter
    ta.focus(); ta.setSelectionRange(from, to)
    let ok = false
    try { ok = text ? document.execCommand('insertText', false, text) : from === to || document.execCommand('delete') } catch {}
    if (!ok) { ta.setRangeText(text, from, to, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })) }
    ta.setSelectionRange(cursor, cursorEnd ?? cursor)
  }
  // Toolbar actions: diff old vs new (common prefix/suffix) and apply only the changed span.
  ```

- Formatting toolbar groups are separated by thin lines. The toolbar scrolls sideways and the mouse wheel scrolls it horizontally.
- Also expected: slash commands, smart lists and auto-pairs, find & replace (case, whole word, regex, all files), paste or drop images, and drag a file from the Files panel to insert a relative link.

### Presentation mode

- One slide per H1/H2, ignoring headings inside code fences. The frame has a thick themed border near the screen edges (6–7px, gradient or `--rainbow`, rounded 24–28px).
- **Long slides scroll inside the frame:**
  - stage `align-items: flex-start`;
  - slide `min-height: 100%`, `justify-content: safe center`;
  - every slide opens scrolled to the top;
  - ↓, PageDown and Space scroll first, then go to the next slide; ←/→ always change slides.
- **Text zoom:** − / % (reset) / + buttons and keys, stored in localStorage and kept across slides.
- **Speaker notes** go after a `???` line. **S** opens the presenter window: `window.open` from the click (so blockers allow it), with styles and `<html>` classes copied and kept in sync, and content rendered through `createPortal`. It shows the notes, the next slide, a timer, a clock and Previous/Next, and keys work in both windows. If the popup is blocked, show the notes inline instead.
- Keys: F for fullscreen, T for theme, Esc to exit (and close the presenter window).

### Presentation mode patterns

- **Settings live in one normalised object** (`src/presentationSettings.js`: defaults, allowed values, `normalize…`), stored under a `readme-` key so backups include it. Settings → Presentation edits it; the slide toolbar changes things for the current session only.
- **The presentation has its own theme.** It starts in the default presentation theme (or the last one used in a presentation) and the app's theme comes back on exit.
- **Slide breaks are configurable** (heading level 1–6, optional `---` after a blank line). Every helper that maps headings to slides takes the same split options.
- **Pen and laser are drawn on a canvas over the stage** that only takes the pointer while the pen is on. Strokes belong to a slide; fading ink is removed after its time, permanent ink stays until cleared. The toolbar sits above the canvas and stays usable.
- **Keys keep working when focus falls out.** If the focused control is removed, a window-level listener still handles keys whose target is `body`.
- **Escape unwinds one layer at a time:** blank screen → active tool → exit.
- **Popovers close on an outside click, not on hover-out,** and always have a visible × and Escape.

### Never use the browser's own dialogs

- **No `alert()`, `confirm()` or `prompt()`.** They look foreign, block the page and can't be styled or tested well. Use the app's components instead:
  - messages and errors → a **toast** (`tone: 'success' | 'warning' | 'info'`, optional `action: { label, run }` such as Undo);
  - questions → **`askConfirm({ title, message, details, confirmLabel, danger, icon })`**, which resolves `true`/`false` (`ConfirmDialog`, `role="alertdialog"`; `danger` makes the button red and focuses Cancel so Enter can't destroy anything);
  - text input → **`askText({ title, label, placeholder, hint, validate, confirmLabel })`**, which resolves the text or `null` (`PromptDialog`, inline validation, Enter/Escape).
- Destructive actions confirm first *and* offer Undo in the toast afterwards.

### Tooltips inside scrolling areas

- Buttons in toolbars use `data-tooltip` (CSS, drawn inside the button). Anything inside a scrolling container (tab bar, file list) uses **`data-tip`** instead: one floating `GlobalTooltip` draws it above everything in the same style, so it is never clipped. Never use the native `title` attribute for tooltips.

### Export formats

- Confluence export uses **storage format** (XHTML + `ac:`/`ri:` macros: code macro, `ac:task-list`, info/tip/note/warning panels, `ac:image`), built from the Markdown AST (unified + remark), not by scraping the rendered page. The clipboard carries storage format as `text/plain` and clean HTML as `text/html`, so pasting into the Confluence editor *and* into its source editor both work. Tests check the output is well-formed XML.
- Presentation exports follow presentation mode: one 16:9 landscape page per slide, framed in the theme accent, content centred. Text size is the same on every slide. The PDF (pdfmake) centres slides that fit and lets long slides flow onto the next page (slide breaks via `pageBreakBefore`, skipped on an empty page so no blank pages). The PowerPoint (pptxgenjs, lazy-loaded and kept out of the offline precache) estimates paragraph, table-row and picture heights and splits long slides into “(continued)” slides (tables repeat their header row) — PowerPoint's shrink-to-fit is not honoured by other viewers, so never rely on it. Tables are real tables, diagrams/images pictures, `???` notes speaker notes. Check exports visually (render pages with `pdftoppm`, PowerPoint via LibreOffice `soffice --convert-to pdf`), not just in unit tests.

## 7. Layout, responsiveness, motion

- The header is a three-column grid (`auto | minmax(0,1fr) | auto`) so items never overlap. At 1280, 1100 and 900px, check that header items don't overlap.
- At phone width (390px), there must be **no horizontal page scroll**. Editor and Preview become tabs.
- Dropdowns and dialogs must stay inside the viewport at every width.
- **Motion:** short (≤ 320ms), eased in-and-out or springy entrance animations (`fadeIn`, `slideUp`, `dropIn`, `popIn`). Slides move in the direction of travel.
  - **Everything respects `prefers-reduced-motion`.** That includes smooth scroll (`behavior: reduced ? 'auto' : 'smooth'`), view transitions and pulsing dots.
- Printing: `no-print` on all chrome. Exports use dedicated renderers.

## 8. Accessibility

Target: **zero axe violations** in every view, in every theme, with and without high contrast.

- Use real `<button>` elements. Never put an interactive element inside another (an outline row is a `div` containing a `toc-link` button, not a `role="button"` row containing buttons).
- Landmarks: `header`, `main`, `nav aria-label="Files and commands"` for the tab strip, and `aside aria-label="Files"` for the file tree (`role="tree"` / `treeitem` / `group`, with `aria-expanded` on folders).
- Mark toggles with `aria-pressed`, current navigation with `aria-current="page"`, and announce live counters and toasts with `aria-live="polite"`.
- Icons are `aria-hidden` by default. The button carries the label.
- Contrast traps to check every time:
  - meta text on tinted, selected or hovered rows;
  - `kbd` hints in menus;
  - UPPERCASE micro-tags;
  - code-block language labels and copy buttons;
  - neon themes.
- Disabled controls are exempt from contrast requirements (WCAG). Exclude `:disabled` from the axe contrast run rather than raising disabled colours. Also wait for entrance animations to finish (≈ 400ms) before running axe, or it measures half-transparent text.

## 9. Storage, files and folders

### Where data lives

| Data | Store |
|---|---|
| Workspace (open files, active id, **closed files**) | IndexedDB `state` store, key `workspace` (debounced write ~300ms) |
| Version history (≤ 30 snapshots per file) | IndexedDB `history` store |
| Folder handle + sync state (`written: Map path→text`, `paths: Map id→path`) | IndexedDB (handles and Maps are structured-cloneable) |
| Small settings and UI preferences (theme, density, reader prefs, zoom) | `localStorage`, prefixed `readme-…`, every access wrapped in `try/catch` |
| Lightweight mirror of files for fallback / cross-tab | `localStorage` (`readme-files`), quota errors ignored |

- `navigator.storage.persist()` can be requested from Settings → Storage. Show usage with `navigator.storage.estimate()`, and if the browser refuses, explain why.

### Files and tabs

- **Closing is not deleting.** Closed files stay in the Files panel (muted, tagged *closed*, inside their folder). Click one to reopen it, × removes it from the list, and "Clear N closed files" removes them all.
  - The list is capped at 100, persisted with the workspace, included in backups, shared between tabs, and searchable.
  - Reopen-last works with ⌘/Ctrl+Shift+T in the installed app and with Alt+Shift+T anywhere (match on `event.code`, because macOS Option changes `event.key`).
- **Delete permanently** asks first and offers Undo. It removes the file from the sync folder only if nobody changed it there, and **never** touches a file opened from disk.
- Folders are virtual paths (`notes/plan.md`). You can drag a file onto a folder, rename a folder, and close a folder.
- Version history records a snapshot before every risky operation: before clearing, before reloading from disk, the folder's version before syncing, and the replaced version after a conflict.
- **Backup/restore** is one `.zip` containing `files/…`, `closed/…`, and a manifest with settings and history. Validate it on read and say plainly what is wrong.

### Disk files (File System Access API)

- Open files with `showOpenFilePicker` (fall back to `<input type="file">`). Keep the `FileSystemFileHandle` in IndexedDB with the file so **Save in place survives reloads**. ⌘/Ctrl+S saves every file: to the browser, and to disk where there's a handle.
- Detect changes made outside the app:
  - check on focus, on `visibilitychange`, on a 3s poll while visible, and with `FileSystemObserver` where available;
  - compare `lastModified` and the text;
  - with no local edits, reload silently with a toast;
  - with local edits, show the conflict banner.

### Sync to a folder (`showDirectoryPicker`)

- Write changed files after a short pause in editing (1.2s), and pull on window focus.
- **Run one sync at a time.** If a sync is requested while one is running, queue a single follow-up.
- **Remember what was last written (path → text) and which path each file id was last written to, across reloads.** Without this:
  - closed files get re-imported as new files;
  - renamed files get duplicated under their old name.
- **A rename moves the file in the folder.** Write the new path, then delete the old one only if its content is unchanged since the app last wrote it.
- When a file has changed in both places, write nothing until the user picks a version (Use folder version / Compare / Keep mine).
- When a file is deleted in the folder, close it in the app (it stays listed) and tell the user. Don't write it back unless it's reopened.
  - Confirm it is really gone (`NotFoundError`). The folder scan skips dotfiles, deep folders and large files, so "missing from the scan" doesn't mean deleted.
- Start syncing only after the workspace has loaded from IndexedDB, otherwise every file looks new.
- Show sync status as a header icon with a coloured dot (synced, syncing, conflict, needs permission, error). Clicking it opens Settings.
- Re-request permission with `handle.requestPermission({ mode: 'readwrite' })` from a click when the state is `prompt`.

### Multiple tabs

- Use a `BroadcastChannel` to share open files, the active id and the closed list.
  - Ignore your own messages and messages older than your last local edit.
  - Suppress echoes by comparing a serialized snapshot.
  - Keep handles local: they aren't shared, so merge them back in when applying updates from another tab.

### Links between files

- Relative links (`../docs/My%20Guide.md#setup`) are encoded per path segment. Clicking one in the preview opens or reopens the target file in the app and scrolls to the anchor. A missing target shows a toast instead of navigating away.

## 10. Browser platform features

| Feature | API | Notes |
|---|---|---|
| Installable app | Web App Manifest (`display`, `id`, `scope`, `icons`, `theme_color`) | Use an SVG favicon |
| Open `.md` from the OS | `file_handlers` + `window.launchQueue.setConsumer` | Wait until the workspace has loaded |
| OS share sheet → app | `share_target` POST → service worker stores it in a cache "inbox" → redirect `/?shared=1` | |
| Offline | Service worker precaches the shell and a build-generated `precache-manifest.json` | Versioned cache names, old ones deleted on activate, `skipWaiting` + `clients.claim`. **Unregister the SW in dev**: a stale production SW on the dev port served old assets and hid new icons |
| Files on disk | `showOpenFilePicker`, `showSaveFilePicker`, `showDirectoryPicker`, `FileSystemObserver` | Feature-detect each; fall back to inputs and downloads |
| Persistent storage | `navigator.storage.persist/persisted/estimate` | |
| Keep screen awake | `navigator.wakeLock.request('screen')` | Re-acquire on `visibilitychange` |
| Read aloud | `speechSynthesis` | Pause/resume, cancel on unmount |
| Smooth theme change | `document.startViewTransition` + `flushSync` | Skip when reduced motion is on |
| Fullscreen | `element.requestFullscreen` | Track `fullscreenchange` |
| Second window | `window.open` + `createPortal` | Copy stylesheets, mirror `<html>` classes with a `MutationObserver` |
| Clipboard | `navigator.clipboard.writeText` | Share links, copy code |
| Cross-tab | `BroadcastChannel` | |

## 11. On-device AI

- Use Chrome's built-in APIs: `Summarizer`, `Translator`, `LanguageDetector`, `Proofreader`, `Writer` and `LanguageModel`. Nothing leaves the device, so say that in the UI.
- Feature-detect and call `availability()`. Show download progress the first time, and abort with an `AbortController`.
- **Always have a non-AI fallback.** Example: "Write a README" uses a built-in generator when AI is unavailable, and offers a "Use quick version" button while the model is slow.
- Make output length relative to the input size. Summarize long documents part by part, then combine the parts.
- Show an "unsupported" notice with the requirements instead of hiding the feature silently.
- Provide a single switch (Settings → Features → Hide AI features) that removes every AI button.

## 12. Testing and verification

### Unit tests (Vitest + jsdom)

- Render the real `<App/>` with a seeded IndexedDB (`fake-indexeddb` or the same helpers) and drive it through roles and names (`getByRole('button', { name: … })`).
- Unit-test pure helpers: slide splitting and notes, zoom clamping, relative links, backups, and folder sync against an **in-memory directory-handle mock**.
- When UI moves (e.g. an option moves into a different menu), update the tests in the same change.

### Real-browser checks (Playwright + real Chrome, headless)

Keep reusable scripts in a scratch folder and run them against `vite preview` of the production build:

1. **Visual / accessibility sweep:**
   - every view in Light and Dark, with no console errors, no icon problems and no horizontal scroll, plus a full axe run;
   - every menu and dialog opens, stays on screen and closes with Escape;
   - colour-contrast axe on 14 themes × with/without high contrast, in two views;
   - header overlap checks at 1280, 1100, 900 and 390px.
2. **Functional walk-through** (around 35 steps): typing → preview, rendering (tables, math, mermaid, callouts, tasks, marks), persistence across reload, toolbar plus undo/redo, slash menu, outline, collapse, filter, bookmarks, find, find & replace, new/rename/duplicate/close, search across files, compare, palette, every export (check file name and size), share-link round trip, history, section focus, presentation, theme, settings toggles, shortcuts sheet, templates, empty state, mobile.
3. **Storage and files:**
   - closed-files list (persists, reopens, removes, clears, works in the empty state);
   - sync between two pages;
   - Storage panel;
   - backup → restore;
   - disk open → ⌘S → outside change → reload keeps the handle;
   - folder sync: connect, import, outside edit, app edit, closed and renamed files after reload, conflicts, deletion, stop syncing.

Techniques that made this possible:

- **Use OPFS as a stand-in for the user's disk.** `navigator.storage.getDirectory()` returns real `FileSystemDirectoryHandle`s, so you can:
  - store one in IndexedDB as the sync folder;
  - stub `window.showOpenFilePicker` to return OPFS file handles;
  - simulate other apps editing or deleting files.

  This exercises the actual sync code; only the native pickers stay untested and need a manual check.
- Seed state with `addInitScript`, guarded by a `sessionStorage` flag so reloads keep their state.
- Collect `pageerror` and console errors during every run and treat them as failures.
- Take screenshots of anything visual and **look at them**. The squeezed presenter notes and a mid-row "CLOSED" tag were only caught that way.

Pitfalls:

- `Meta+Z` doesn't reach native undo in headless Chrome on macOS. Test undo with `document.execCommand('undo')` with the field focused.
- `innerText` applies `text-transform`, so `closed` reads as `CLOSED`. Match case-insensitively.
- An element hidden until hover (`display: none` actions) can't be force-clicked. Hover its row first.
- Playwright `fill()` doesn't simulate real typing for undo history. Type for undo tests.
- Save screenshots to absolute scratch paths. A relative `../x.png` landed outside the project.
- `getByRole(name)` with duplicates fails strict mode. Scope by container or class.
- Check the live site after deploy against the new bundle hash, not the cached one.

## 13. Writing UI copy

- Use plain words and sentence case: "Delete permanently…", "Keep mine", "Use folder version".
- Say what happened and how to undo it: "“plan.md” was deleted from the sync folder, so it was closed. Reopen it from the Files panel to put it back."
- Errors explain the cause and the next step: "Your browser can’t save to folders. Use desktop Chrome or Edge, or back up the workspace instead."
- Use an ellipsis (…) only when an action opens another step (a dialog or a picker).
- Help and tooltips use the same names as the buttons. Help covers every feature and is searchable.

## 14. Working agreement (for agents)

- Implement → verify in real Chrome → lint, tests, build → report what was verified and what wasn't, honestly.
- **Commit and push only when the user asks.** Work in small batches; when the user asks for batches, push after each verified batch.
- Don't make changes the user didn't ask for. If you spot problems, list them as suggestions.
- Respect explicit constraints (for example: don't modify the code editor component; keep the simple editor as the default).
- Pre-existing bugs found during verification get fixed or reported, never hidden.
- **Version every deployment.** The app version and release notes live in one place (`src/version.js`: `APP_VERSION` shown in Settings → About, `RELEASES` shown in Settings → Versions). Every push to `main` deploys, so in the same commit bump the minor number (1.3 → 1.4 → 1.5) and add a release entry at the top: date plus only meaningful changes (at most 4 points, fewer is fine; skip small fixes), keeping the last 5. Use a major bump (2.0) only when the user asks for one.
- Keep a task list file (for example `Pending.md`) when the user maintains one. Mark items ✅ with a one-line note on what was done, and keep it out of commits unless asked.

---

## Release checklist

- [ ] Tokens only: no hard-coded colours. New surfaces work in all themes and in high contrast.
- [ ] Icons go through the wrapper. Sizes and styles are correct, decorative icons are `aria-hidden`, and every icon button has a label and a tooltip.
- [ ] Hovers are round and consistent. Tooltips aren't clipped and are hidden while their menu is open.
- [ ] Menus, dialogs and palettes are keyboard-complete (arrows, Enter, Escape, focus return) with correct ARIA.
- [ ] Destructive actions are undoable (toast Undo and/or version history). Programmatic edits keep native undo.
- [ ] Data persists across reloads and between tabs, is included in backups, and nothing is silently overwritten.
- [ ] Capabilities are feature-detected with fallbacks. The app works offline and the service worker is versioned.
- [ ] No horizontal scroll at 390px. Header doesn't overlap at 900–1280px. Reduced motion is respected.
- [ ] Zero axe violations in every theme, with and without high contrast. No console errors.
- [ ] `eslint .` is clean, `vitest run` passes, `vite build` succeeds, the browser scripts pass, and screenshots have been reviewed.
- [ ] Help, the shortcuts sheet and the About text are updated for new features.
- [ ] The version in `src/version.js` is bumped and a `RELEASES` entry (date + meaningful changes only) is added.
