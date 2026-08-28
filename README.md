# JSON Exporter

A Figma plugin that exports design variables as **Token Studio–compatible JSON**.

## Features

- Exports design tokens from Figma variable collections, including extended/aliased collections.
- **Token Studio–compatible JSON**: `$themes`, `$metadata.tokenSetOrder`, `$figmaVariableReferences`, semantic token types.
- **Typography parity**: backfills `core.lineHeights` / `core.letterSpacing` (Token Studio paths) so composite references like `{lineHeights.*}` / `{letterSpacing.*}` resolve instead of dangling (see `ensureCoreTokenStudioLineHeightsLetterSpacing` in `code.js`).
- **Per-breakpoint typography**: breakpoint typography is written per mode, so responsive scales (e.g. `display` 72→96px) export correctly per breakpoint.
- **Dimension math layer**: where applicable, reconstructs expressions like `N*{dimension.base}` and `{dimension.1}*N` for alignment with Token Studio.
- **Reference-closure validation**: flags any dangling `{token.references}` before you ship the JSON (see below).
- Export as a **single document** or **separate documents** per token set.
- **Download** locally or **Push to Git** (GitHub API; settings persisted in `figma.clientStorage`).
- Export runs with validation stats (collection count + token count).
- **Light / dark theme toggle** for the plugin UI (🌙 / ☀️), remembered across sessions.

Details: [`TOKEN_STUDIO_TYPOGRAPHY.md`](./TOKEN_STUDIO_TYPOGRAPHY.md)

> **Note:** The output format is **locked to Token Studio**. A legacy "Native" format toggle still exists in the code but is hidden (`#export-mode-control`, `display:none`). Every export is Token Studio JSON.

## UI overview

```
┌────────────────────────────────────────┐
│  JSON Exporter              🌙   ⚙      │   ← title · theme toggle · Git settings
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

1. Open **JSON Exporter** — collections are extracted automatically on open.
2. Choose **Single Document** or **Separate Documents**.
3. (Optional) select specific collections, or leave all selected.
4. **Download** the JSON, or fill in a commit message and **Push to Git**.

## Installation

1. **Clone / open** this repo locally.
2. **Load in Figma Desktop**:
   - Plugins → Development → Import plugin from manifest
   - Select `manifest.json`
3. **Run**: Plugins → **JSON Exporter**

## Technical architecture

```javascript
// Export / Token Studio pipeline (code.js)
- extractVariables()        → Figma variables → raw collections
- transformToFinalFormat()  → native tree
- toTokenStudioFormat()     → $themes, foundation, breakpoints, typography fixes
- validateReferenceClosure()→ catches dangling {token.references}
```

Message flow:
```
UI (ui.html)  ──'extract'──▶  code.js: figma.variables.getLocalVariableCollectionsAsync()
UI            ──'transform'─▶  code.js: toTokenStudioFormat()
UI            ── Download / Push to Git
```

The export reads Figma variables directly through the plugin API — no external server or service is required.

## Extended / aliased collections

The export resolves alias chains across collections so that downstream tools receive fully linked tokens. In Token Studio output, token sets are produced per collection/mode (e.g. `core`, `mode/light`, scheme sets, breakpoints), with `$figmaVariableReferences` mapping back to the originating Figma variable IDs.

The verified RADD alias chain is:
```
foundation → .scheme → .mode → .section → .card → leaf (.white/.black/.magenta-*/.secondary) → .core
```
Every middle link must be present in the export or references dangle — which the closure validation catches.

## Reference-closure validation

After building the JSON, the plugin scans every `{token.reference}` and checks it resolves to a token that exists in the output. If not, a warning shows the broken-reference count and which token sets are missing, so an incomplete/partial export never ships silently.

## Push to Git

Fill in the GitHub settings (token, repo, filepath, branch) via the ⚙ button. Settings are stored in `figma.clientStorage`. The manifest whitelists only `https://api.github.com` for this — the plugin makes no other network calls.

## Troubleshooting

### Collections don't appear
- Open the console: Plugins → Development → Open Console.
- Re-open the plugin to force a fresh extract.
- Check the diagnostic logs (e.g. `[JSON Exporter v8] Collection "..."`).

### Broken references warning after export
- The export references a token set that wasn't included. Make sure every referenced collection (e.g. `.section` / `.card`) is present, then re-extract.

## Files

```
RADD-Foundation-JSON-Export-Plugin/
├── code.js                      # Export + Token Studio transforms
├── ui.html                      # UI, Git push, light/dark toggle
├── manifest.json                # Plugin configuration + network allowlist
├── README.md                    # This file
├── TOKEN_STUDIO_TYPOGRAPHY.md   # Token Studio typography parity (lineHeights / letterSpacing)
├── THEMING.md                   # Plugin UI theming (light/dark toggle)
└── BACKLOG.md                   # Known limitations & follow-ups
```

## Token Studio export format

The export targets **Token Studio–style** JSON (single file, slash-delimited token sets, `$themes`, `$metadata`).

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
- `TOKEN_STUDIO_TYPOGRAPHY.md` — what "parity" does and does not mean.

## Keyboard shortcuts
- **Tab** — move focus between UI elements
- **Enter** — activate the focused button (e.g. Download)
- **Esc** — close the plugin

---

**Product:** JSON Exporter (`manifest.json`) · pipeline logs: `JSON Exporter v8`
**Status:** ✅ Active development / production use
