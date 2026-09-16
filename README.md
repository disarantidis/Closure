# Closure

**Export JSON straight from Figma.** A Figma plugin that reads your design
variables and exports them as clean, reference-complete **design-token JSON** —
downloaded locally or pushed straight to **GitLab** and/or **GitHub**.

The UI is built from a React source with our own **Pomegranate
(disarantidis_ReactJS)** design system.

## Features

- Exports design tokens from Figma variable collections, including extended/aliased collections.
- **Portable design-token JSON**: `$themes`, `$metadata.tokenSetOrder`, `$figmaVariableReferences`, semantic token types — a widely-supported structure downstream token tooling (Style Dictionary and similar) can consume.
- **Two output formats**, chosen with the **Output format** switch in Settings:
  the default token JSON, or **W3C DTCG** (`$value` / `$type` / `$description`,
  strict type mapping, one fully resolved, self-contained document per theme —
  standards-conformant on its own, no downstream finishing step). DTCG exports
  to its own file name (`tokens_dtcg.json`) so it never overwrites the default
  JSON. See [`DTCG.md`](./DTCG.md).
- **Figma variable descriptions** are exported as DTCG `$description` on each token.
- **Typography parity**: backfills `core.lineHeights` / `core.letterSpacing` so composite references like `{lineHeights.*}` / `{letterSpacing.*}` resolve instead of dangling (see `ensureCoreLineHeightsLetterSpacing` in `code.js`).
- **Per-breakpoint typography** and a **dimension math layer** (`N*{dimension.base}`).
- **Reference-closure validation**: flags any dangling `{token.references}` before you ship the JSON — this is what the plugin is named for.
- **Download** locally, or **push to GitLab** (incl. self-hosted / Enterprise), **GitHub**, or **both**. Settings persist in `figma.clientStorage`.
- Each provider keeps its **own** repository/project, branch, saved folder paths and file name — all editable in Settings; a token can be **cleared** without tearing down the rest.
- A **commit message is required** to push (the Push button stays disabled until you enter one).
- Export runs with validation stats (collection count + token count).
- **Dark UI** built to the **Pomegranate** design system (`src/vendor/pomegranate`).

Details: [`TYPOGRAPHY.md`](./TYPOGRAPHY.md) · [`DTCG.md`](./DTCG.md) · [`THEMING.md`](./THEMING.md)

## UI overview

```
┌────────────────────────────────────────┐
│  Closure                    v1.4.0  ⚙   │   ← title · version · settings
├────────────────────────────────────────┤
│  ▸ <Figma file name>   1k Tokens · 18MB │   ← collections accordion + summary
├────────────────────────────────────────┤
│  ⬢ GitLab                               │
│  [ folder ▾ ]  [ tokens.json ]          │   ← per push destination
│  [ commit message ]  (required)         │
│  [ Push to GitLab ]              ⬇       │   ← push + download
└────────────────────────────────────────┘
```

Settings holds the **Output format** switch, the **push destination** (GitLab /
GitHub / both), and each provider's token / repo / branch / filename / saved
folder paths. On first run a two-step dialog asks which destination(s) you want,
then hands you to the fields each one still needs.

## Installation

1. **Clone** this repo locally.
2. `npm install`
3. `npm run ui:build` — regenerates `ui.html` from its sources (see below).
4. **Load in Figma Desktop**: Plugins → Development → Import plugin from manifest → select `manifest.json`.
5. **Run**: Plugins → **Closure**.

## Building the UI

> **`ui.html` is generated output — do not edit it by hand.** Your changes will be
> overwritten by the next `npm run ui:build`.

| File | What it is |
|---|---|
| `src/ui.template.html` | Markup, CSS and the plugin's vanilla-JS logic |
| `src/ui-react/buttons.tsx` | Every Pomegranate component mounted into that markup |
| `src/vendor/pomegranate/` | Vendored copy of the Pomegranate kit (components + `tokens.css` / `node.css`) |
| `src/dtcg-format.js` | DTCG conversion (inlined into `ui.html`, also runs in Node) |

`scripts/build-ui.js` bundles `buttons.tsx` with **esbuild** and inlines the JS
and CSS into the template, because a Figma plugin's `ui` must be **one**
self-contained file. `buttons.tsx` mounts the Pomegranate components into
`<span id="…-mount">` placeholders and exposes `window.Radd*` bridges the
template's vanilla script drives — so `code.js` and the template's logic are
independent of which design system paints the controls.

```bash
npm run ui:build       # regenerate ui.html from its sources
npm run ui:typecheck   # tsc --noEmit over src/ui-react (optional)
npm run dtcg:preview   # convert an export to DTCG outside Figma + report
npm run dtcg:selftest  # DTCG format / description-dedupe checks
```

## Technical architecture

```javascript
// Export pipeline (code.js — the plugin sandbox)
- extractVariables()        → Figma variables → raw collections
- transformToFinalFormat()  → native tree (opt-in { includeDescriptions } for DTCG)
- toTokenFormat()           → $themes, foundation, breakpoints, typography fixes
- validateReferenceClosure()→ catches dangling {token.references}
// DTCG is a pure post-transform over that tree (src/dtcg-format.js)
```

Message flow:
```
UI (ui.html)  ──'extract' / 'GET_FILE_INFO' / 'LOAD_GIT_SETTINGS'──▶  code.js
UI            ──'transform' { includeDescriptions }───────────────▶  code.js
UI            ──'SAVE_GIT_SETTINGS'───────────────────────────────▶  code.js
UI            ── Download / Push to GitLab and/or GitHub (fetch, from the UI iframe)
```

The push runs from the plugin's UI iframe via `fetch`; the sandbox makes no
network calls. The export reads Figma variables directly through the plugin API
— no external server or service is required.

## Push to GitLab / GitHub

The ⚙ button opens **Settings**, where you add GitLab, GitHub, or both; each
keeps its own saved folder paths (picked on the main screen) and file name, so
the pushed path is `folder + filename` per destination. A "both" push runs the
two sequentially and reports each outcome, so one failing does not abort the
other. Each provider's token field has a **Clear** button (confirmed).

### Network allowlist (important for Enterprise)

A Figma plugin can only reach domains listed in `manifest.json` →
`networkAccess.allowedDomains`. It ships with:

```json
"allowedDomains": [
  "https://gitlab.com",
  "https://gitlab.devops.telekom.de",
  "https://api.github.com"
]
```

To push to another self-hosted / Enterprise GitLab, add that instance's origin
and re-import the plugin from the manifest.

## Files

```
Closure/
├── code.js                 # Export + token transforms (plugin sandbox)
├── ui.html                 # GENERATED — built from src/, do not edit
├── manifest.json           # Plugin configuration + network allowlist
├── src/
│   ├── ui.template.html    # UI source: markup, CSS, vanilla-JS logic
│   ├── dtcg-format.js       # DTCG conversion (inlined into ui.html, also runs in Node)
│   ├── ui-react/buttons.tsx # Pomegranate components mounted into the template
│   └── vendor/pomegranate/  # Vendored Pomegranate kit (components + tokens.css/node.css)
├── scripts/                # build-ui.js, dtcg-preview/selftest/descriptions
├── README.md               # This file
├── TYPOGRAPHY.md           # Typography parity (lineHeights / letterSpacing)
├── DTCG.md                 # DTCG output format
├── THEMING.md              # Plugin UI theming (dark, Pomegranate tokens)
└── BACKLOG.md              # Known limitations & follow-ups
```

## Keyboard shortcuts
- **Tab** — move focus between UI elements
- **Enter** / **Space** — activate the focused control
- **Esc** — close the open dialog, or the plugin

---

**Product:** Closure (`manifest.json`, v1.4.0) · design system: Pomegranate (disarantidis_ReactJS)
**Status:** ✅ Active development
