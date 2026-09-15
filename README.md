# Closure

**Export JSON straight from Figma.** A Figma plugin that reads your design
variables and exports them as clean, reference-complete **design-token JSON** —
downloaded locally or pushed straight to GitHub.

## Features

- Exports design tokens from Figma variable collections, including extended/aliased collections.
- **Portable design-token JSON**: `$themes`, `$metadata.tokenSetOrder`, `$figmaVariableReferences`, semantic token types — a widely-supported structure that downstream token tooling (Style Dictionary and similar) can consume.
- **Typography parity**: backfills `core.lineHeights` / `core.letterSpacing` so composite references like `{lineHeights.*}` / `{letterSpacing.*}` resolve instead of dangling (see `ensureCoreLineHeightsLetterSpacing` in `code.js`).
- **Per-breakpoint typography**: breakpoint typography is written per mode, so responsive scales (e.g. `display` 72→96px) export correctly per breakpoint.
- **Dimension math layer**: where applicable, reconstructs expressions like `N*{dimension.base}` and `{dimension.1}*N`.
- **Reference-closure validation**: flags any dangling `{token.references}` before you ship the JSON — this is what the plugin is named for (see below).
- Export as a **single document** or **separate documents** per token set.
- **Download** locally or **Push to Git** (GitHub API; settings persisted in `figma.clientStorage`).
- Export runs with validation stats (collection count + token count).
- **Light / dark theme toggle** for the plugin UI (🌙 / ☀️), remembered across sessions.

Details: [`TYPOGRAPHY.md`](./TYPOGRAPHY.md)

> **Note:** The output format is fixed to a single, portable design-token JSON
> structure. A legacy "Native" format toggle still exists in the code but is
> hidden (`#export-mode-control`, `display:none`). Every export is the token JSON.

## UI

Closure's UI is built to the **disarantidis_ReactJS** design system:
a warm-neutral palette with a monochrome accent, DS tokens for radius / spacing /
type, and DS components — button, segmented control, checkbox (with a mixed /
indeterminate "select all"), text field, card, and scheme-island alerts / toast.

```
┌────────────────────────────────────────┐
│  Closure                    🌙   ⚙      │   ← title · theme toggle · Git settings
│  Export JSON straight from Figma        │   ← subtitle
├────────────────────────────────────────┤
│  Single Document | Separate Documents   │
├────────────────────────────────────────┤
│  Collections list (checkboxes)          │
├────────────────────────────────────────┤
│  N Collections        Nk Tokens         │   ← validation stats
├────────────────────────────────────────┤
│  [ commit message ]                     │
│  [ Push to Git ]   Download single      │
└────────────────────────────────────────┘
```

## Export flow

1. Open **Closure** — collections are extracted automatically on open.
2. Choose **Single Document** or **Separate Documents**.
3. (Optional) select specific collections, or leave all selected.
4. **Download** the JSON, or fill in a commit message and **Push to Git**.

## Installation

1. **Clone / open** this repo locally.
2. **Load in Figma Desktop**:
   - Plugins → Development → Import plugin from manifest
   - Select `manifest.json`
3. **Run**: Plugins → **Closure**

## Technical architecture

```javascript
// Export pipeline (code.js)
- extractVariables()        → Figma variables → raw collections
- transformToFinalFormat()  → native tree
- toTokenFormat()           → $themes, foundation, breakpoints, typography fixes
- validateReferenceClosure()→ catches dangling {token.references}
```

Message flow:
```
UI (ui.html)  ──'extract'──▶  code.js: figma.variables.getLocalVariableCollectionsAsync()
UI            ──'transform'─▶  code.js: toTokenFormat()
UI            ── Download / Push to Git
```

The export reads Figma variables directly through the plugin API — no external server or service is required.

## Extended / aliased collections

The export resolves alias chains across collections so that downstream tools receive fully linked tokens. Token sets are produced per collection/mode (e.g. `core`, `mode/light`, scheme sets, breakpoints), with `$figmaVariableReferences` mapping back to the originating Figma variable IDs.

The verified RADD alias chain is:
```
foundation → .scheme → .mode → .section → .card → leaf (.white/.black/.magenta-*/.secondary) → .core
```
Every middle link must be present in the export or references dangle — which the closure validation catches.

## Reference-closure validation

After building the JSON, the plugin scans every `{token.reference}` and checks it resolves to a token that exists in the output. If not, a warning shows the broken-reference count and which token sets are missing, so an incomplete/partial export never ships silently. This closure check is where the plugin gets its name.

## Push to Git

Fill in the GitHub settings (token, repo, filepath, branch) via the ⚙ button. Settings are stored in `figma.clientStorage`. The manifest whitelists only `https://api.github.com` for this — the plugin makes no other network calls.

## Troubleshooting

### Collections don't appear
- Open the console: Plugins → Development → Open Console.
- Re-open the plugin to force a fresh extract.
- Check the diagnostic logs (e.g. `[Closure v8] Collection "..."`).

### Broken references warning after export
- The export references a token set that wasn't included. Make sure every referenced collection (e.g. `.section` / `.card`) is present, then re-extract.

## Files

```
Closure/
├── code.js                 # Export + token transforms
├── ui.html                 # UI, Git push, light/dark toggle
├── manifest.json           # Plugin configuration + network allowlist
├── README.md               # This file
├── TYPOGRAPHY.md           # Typography parity (lineHeights / letterSpacing)
├── THEMING.md              # Plugin UI theming (light/dark toggle)
└── BACKLOG.md              # Known limitations & follow-ups
```

## Export format

The export targets a portable design-token JSON (single file, slash-delimited token sets, `$themes`, `$metadata`).

### Themes
- Theme objects (per collection/mode) with `selectedTokenSets`.
- `$figmaVariableReferences` → Figma variable IDs.
- `$figmaCollectionId` / `$figmaModeId` where applicable.
- Theme IDs change per export session (expected with Figma).

### Token sets
- **Foundation** — spacing, sizing, radius, colours, typography, strokes, grid, elevation, variant.
- **Mode** — Light / Dark (+ elevation composites where defined).
- **Scheme** — the scheme/leaf sets present in the file.
- **Breakpoints** — Mobile, Tablet, Laptop, Desktop, Large Desktop (+ per-breakpoint typography composites).
- **Layout** — `layout/layout` where columns exist.
- **Restrictions** — where present in the file.

### Known limitations
- `BACKLOG.md` — math expressions and edge cases.
- `TYPOGRAPHY.md` — what "parity" does and does not mean.

## Keyboard shortcuts
- **Tab** — move focus between UI elements
- **Enter** — activate the focused button (e.g. Download)
- **Esc** — close the plugin

---

**Product:** Closure (`manifest.json`) · pipeline logs: `Closure v8`
**Status:** ✅ Active development / production use
