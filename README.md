# Closure

**Export JSON straight from Figma.** A Figma plugin that reads your design
variables and exports them as clean, reference-complete **design-token JSON** —
downloaded locally or pushed straight to **GitLab** and/or **GitHub**.

The UI is a React source built on the plugin's own small, generic component kit
(`src/ui-kit`) — plain React and CSS, no external design system.

## Features

- Exports design tokens from Figma variable collections, including extended/aliased collections.
- **Portable design-token JSON**: `$themes`, `$metadata.tokenSetOrder`, `$figmaVariableReferences`, semantic token types — a widely-supported structure downstream token tooling (Style Dictionary and similar) can consume.
- **W3C DTCG output** (`$value` / `$type` / `$description`, strict type
  mapping, standards-conformant on its own). The **Resolved** switch in
  Settings picks between one document per theme (`tokens_dtcg.json`) and one
  resolved document with the routing evaluated away and the semantic layer
  written once (`tokens_resolved.json`). See [`DTCG.md`](./DTCG.md).
- **Clear this file** (Settings, last block): two buttons, **Clear variables…** and **Clear styles…**, each with its own confirmation — what an import needs, since it only runs into a file with neither.
- **Restore data** (a checkbox under Resolved): a read-only section at the end
  of the file with what the resolved shape flattens — scopes, links and the
  text, effect, grid and paint styles as definitions. A paint style is a list
  of paints (solid, gradient, image), so it is kept as one: a gradient carries
  its stops and the transform that places them, and a stop that binds a
  variable of its own names it like any other binding. An image paint is
  identified by its hash; its bytes are not read. An import writes text, effect
  and grid styles — a paint style is recorded, not yet rebuilt.
- **Import a resolved export back into Figma** (Upload JSON, or from a
  repository) into an empty file: the RADD Foundations architecture is rebuilt
  by rule — collections, modes, aliases, scopes and styles. See
  [`DTCG.md`](./DTCG.md#importing-a-resolved-export).
- **Component contracts**: select a component set and capture it as one contract file (the facts shared by all variants once, what varies by axis), push it to the repository, and later compare the component in Figma against the contract the repository holds.
- **Any architecture, rebuilt from the JSON alone** (`restore.structure`): a Resolved export made with Restore data on (the default) carries the file's whole variable graph inside itself (`src/structure-graph.js`): every collection with its modes, default mode and hidden flag; every variable with its type, scopes, description, code syntax and position; every cell as an alias to a named variable or a literal; and the text, effect, grid and paint styles in the file's own spelling. It is small because it is written as what the data shows, not cell by cell: each name is a *front* plus a *tail* and each tail is written once for the whole file; an alias that keeps the tail and changes the front (`.scheme` → `_restricted`) is one *rule* per front and mode, optionally limited to the tails that do or do not contain one segment (a layer that skips a step for elevation); the cells that follow no rule are listed one by one, so what is stored always expands to what the file had. Measured on the real RADD 2.2 graph: 14,660 cells in 65 KB, and decode(encode(graph)) gives back every line. The import (`src/import-structure.js`) uses it when none of the built-in rules (RADD Foundations v2, ODS Foundations v3) recognise the document, which is why a file of any layering round-trips and the built-in paths are untouched. A record written by a newer version is refused with that reason. **What it cannot hold**: aliases to variables of a library (counted as `external`, left out), the inheritance of an extended collection, empty collections, and a collection's default mode when it is not the first (Figma's plugin API cannot reorder modes). The record has no collection or architecture name in it; a name with a dot in it is carried safely (`spacing/0.5`). **What it carries but the import cannot write**: a cell whose value is not a plain colour, number, string or boolean for its variable's type — seen on a real file (Pomegranate Identity) as a colour bound through one alias with its opacity bound through a second (`{ color: {…}, opacity: {…} }`), 513 cells across elevation shadows, gradients and "glass" materials, which `figma.variables.createVariable` + `setValueForMode` has no call for. The record keeps the cell exactly as Figma gave it either way (`structure-graph.js` never interprets a value); the import (`import-structure.js`) reports each one by collection, path and mode rather than refuse the whole file over it, or guess at a write Figma would reject.
- **File structure**, captured automatically: when the plugin opens it reads which collections the file has, their modes, and how they route into each other (which collection a variable points into, and how its name changes on the way; an alias that carries no part of the name across is counted as a *binding*, not a route). Nothing to press and nothing is written to the file. Settings offers it as `<file>.structure.json` (a small Tonal "Download structure" button under a short note that says why: a Resolved export evaluates the routing away, so the structure is kept), and shows that block only while the Resolved switch is on, because a Resolved export is the one that evaluates the structure away. The summary line, the layer chain and the match line that used to be there are gone from Settings; the match is still made and still named in the import report. Several files' structures can be saved on one computer, so each file keeps a small index line (its layering) and only the newest three keep the full structure, which keeps `figma.clientStorage` (about 5 MB for the whole plugin) from filling up. A file is recognised as **the same file** (same collection ids), **the same structure** (same collections and modes in the same order, e.g. a copy) or **close to** one already saved, and Settings says which. **On import**, a Resolved JSON is matched to a saved structure from its own schemes, accent schemes, light/dark modes and breakpoints (each is the mode set of one collection, found by modes, never by name), and the import report says whether one fits, the closest one lacks something, or none does. This match only *names* a saved structure in the import report; it rebuilds nothing. Rebuilding a layering the plugin has no rules for is done from the JSON itself, see the next item.
- **Figma variable descriptions** are exported as DTCG `$description` on each token.
- **Typography parity**: backfills `core.lineHeights` / `core.letterSpacing` so composite references like `{lineHeights.*}` / `{letterSpacing.*}` resolve instead of dangling (see `ensureCoreLineHeightsLetterSpacing` in `code.js`).
- **Per-breakpoint typography** and a **dimension math layer** (`N*{dimension.base}`).
- **Reference-closure validation**: flags any dangling `{token.references}` before you ship the JSON — this is what the plugin is named for.
- **Download** locally, or **push to GitLab** (incl. self-hosted / Enterprise) **and/or GitHub** — add both and switch which one Push actually targets from the main screen. Settings persist in `figma.clientStorage`.
- Each provider keeps its **own** repository/project, branch and saved folder paths — all editable in Settings; a token can be **cleared** without tearing down the rest. The JSON file name is shared across Download and every push destination, edited once on the main screen.
- **Push to a new GitHub branch**: the Push card's Branch field is a picker — pick an existing branch or type a new name, and the branch is created from the repository's default branch before the push (`src/github-branch.js`). A name that is already taken is reused when picked, or gets the next free `-2`, `-3`… when asked for as a new branch.
- **Compare** the Figma file with the JSON in the repository (resolved exports included; the branch to read is selectable). The GitHub card shows when it last synced as soon as the plugin opens.
- A **commit message is required** to push (the Push button stays disabled until you enter one).
- Export runs with validation stats (collection count + token count).
- **Dark and light UI** from the plugin's own tokens (`src/ui-kit/tokens.css`); the Settings header toggles the theme.

Details: [`TYPOGRAPHY.md`](./TYPOGRAPHY.md) · [`DTCG.md`](./DTCG.md) · [`THEMING.md`](./THEMING.md)

## UI overview

```
┌──────────────────────────────────────────────┐
│  Closure                       v1.4.0     ⚙  │   ← title · version · settings
├──────────────────────────────────────────────┤
│  ▸ <Figma file name>      1k Tokens · 18MB   │   ← collections accordion + summary
├──────────────────────────────────────────────┤
│  ⬢ GitHub  Synced just now [Push|Compare]    │   ← last sync, shown on open
│  [ Branch  main      ]  [ Folder path  /  ]  │   ← GitHub: pick a branch or type a new one
│  [ JSON name  tokens_resolved.json        ]  │   ← file name shared by every destination
│  [ Enter commit message…                  ]  │   ← required
│  [ Push to GitHub ]                       ⬇  │   ← push + download
└──────────────────────────────────────────────┘
```

On GitLab the card has no Branch field: Push and Compare use the branch saved
in Settings, and the row holds the folder path and the JSON name.
The theme toggle lives in the Settings header, next to Back.

**Push** writes the file to the chosen branch (a new name creates the branch
first).

### An empty file

A file with no variables has nothing to export, so the main screen offers two
ways to bring tokens in instead:

```
┌──────────────────────────────────────────────┐
│  Closure                       v1.4.0     ⚙  │
├──────────────────────────────────────────────┤
│                      ⬢                       │
│        No variable collections found.        │
│   Add variables in Figma, or bring tokens    │
│   in from a JSON file.                       │
│                                              │
│       [ ⇪  Upload JSON              ]        │   ← a file from this computer
│       [ ⑂  Connect a repository     ]        │   ← a file from GitHub or GitLab
└──────────────────────────────────────────────┘
```

- **Upload JSON** opens the Import page with the file chooser already open.
- **Connect a repository** reads from the connected provider. With one
  provider set up it pulls straight from it; with both it opens the Import page
  to pick one; with none it takes you to Settings to add one.

Either way the Import page shows what the JSON holds and what would change
before anything is written (see [`DTCG.md`](./DTCG.md#importing-a-resolved-export)).

### Compare

Switch the repository card to **Compare**: the Branch field becomes a list of
the repository's branches, the Folder path and a file picker choose which JSON
to read, and the button becomes **Compare**. It opens the Compare page, which
sets the repository's JSON beside this Figma file's export and reports what
differs.

```
┌──────────────────────────────────────────────┐
│  ⇄ Compare                              [←]  │   ← the page, Back at the right edge
├──────────────────────────────────────────────┤
│  <Figma file name>                           │   ← this Figma file and its JSON name
│            ↓                                 │
│  GitHub · tokens_resolved.json @ main        │   ← the repository, file and branch
├──────────────────────────────────────────────┤
│  The differences                             │   ← where it starts: one entry per cause
│   mode.light.surface   Figma  {a.b.500}      │
│                        GitHub {a.b.600}      │
│   12 more tokens follow from this one        │
├──────────────────────────────────────────────┤
│  ~ value changed        +  only here         │
│  − only in the repo     →  points somewhere new
│  = aliased one side     ↴  moved here        │   ← counts; the tokens are listed below
├──────────────────────────────────────────────┤
│  [ ← Update Figma from GitHub ]              │   ← imports the repo's JSON into this file
└──────────────────────────────────────────────┘
```

**The differences** comes first and is the answer: it lists the causes, not every
affected token. Each entry names a token and shows the Figma side and the
repository side next to each other. For a reference that points somewhere new,
only the part of the path that differs is highlighted, and a line says how many
more tokens follow from it. A token that exists on one side only lists a few
sample names and the count. A value that is the same but held as a plain value
on one side and as a link to a token on the other says so. The card shows the
first six causes and counts the rest. The tables with every token sit below
under **More detail**, and are left out when the card already explains
everything.

When nothing differs the report is replaced by **In sync**: the two files hold
the same tokens, value for value, and pushing right now would change nothing.
If the repository's JSON is a different shape from the one this file would
export (Resolved against per-theme DTCG), the page says so and does not
compare. A file that has not finished producing its export, or a read that
fails, is reported in words rather than as an empty page.

Settings holds the **W3C DTCG** card (the Resolved switch), the **File structure** block (shown only while Resolved is on: a short note on why it is kept, and a Tonal "Download structure" button) and, for each provider you've added
(GitLab and/or GitHub — either can be added or removed independently), its own
token / repo / branch / saved folder paths. The main screen's own GitLab/GitHub
tab is what actually picks which one Push targets when both are added. On first
run a two-step dialog asks which provider(s) you want, then hands you to the
fields each one still needs.

## Installation

1. **Clone** this repo locally.
2. `npm install`
3. `npm run ui:build` — regenerates `ui.html` from its sources (see below).
4. **Load in Figma Desktop**: Plugins → Development → Import plugin from manifest → select `manifest.json`.
5. **Run**: Plugins → **Closure**.

## Building the UI

> **`ui.html` and `code.js` are generated output — do not edit them by hand.**
> Your changes will be overwritten by the next `npm run ui:build`.

| File | What it is |
|---|---|
| `src/code.source.js` | The plugin sandbox: extraction and token transforms |
| `src/ui.template.html` | Markup, CSS and the plugin's vanilla-JS logic |
| `src/ui-react/buttons.tsx` | Every kit component mounted into that markup |
| `src/ui-kit/` | The component kit: `index.tsx` (components), `tokens.css` (palette, levels, spacing, type), `kit.css` (component styles) |
| `src/dtcg-format.js` | DTCG conversion (inlined into `ui.html`, also runs in Node) |

`scripts/build-ui.js` bundles `buttons.tsx` with **esbuild** and inlines the JS
and CSS into the template, because a Figma plugin's `ui` must be **one**
self-contained file. It builds `code.js` the same way and for the same reason —
a plugin's `main` must also be one file, and the sandbox has no module loader —
by prepending the shared modules (`resolve-architecture.js`, `emit-resolved.js`,
`dtcg-format.js`, `styles-capture.js`, `import-apply.js`, `component-capture.js`…,
see `MODULES` in `scripts/build-ui.js`) to `src/code.source.js`. The import,
compare and contract modules are inlined into `ui.html` the same way. `buttons.tsx` mounts the kit's components into
`<span id="…-mount">` placeholders and exposes `window.Pom*` bridges the
template's vanilla script drives — so `code.js` and the template's logic are
independent of which design system paints the controls.

```bash
npm run ui:build       # regenerate ui.html from its sources
npm run ui:typecheck   # tsc --noEmit over src/ui-react (optional)
npm run dtcg:preview   # convert an export to DTCG outside Figma + report
npm run dtcg:selftest  # DTCG format / description-dedupe checks

# the self-tests (each runs in Node, no Figma needed)
npm run resolved:selftest         npm run import:selftest
npm run resolved-import:selftest  npm run component:selftest
npm run github-branch:selftest    npm run parity:selftest
npm run styles-capture:selftest   npm run clear:selftest
npm run source-quality:selftest   npm run structure:selftest
npm run structure-store:selftest
npm run structure-select:selftest
npm run architecture-ods:selftest
npm run emit-subtle:selftest
npm run resolved-ods:selftest
npm run structure-graph:selftest

# resolved export outside Figma, from a raw variable graph
node scripts/dtcg-preview.js <graph.json> --shape resolved \
     --config scripts/resolved-config.example.js
```

The **Resolved** switch in the plugin produces the same document as
`--shape resolved`: the raw Figma variable graph re-shaped the way a consumer
reads it rather than the way it is authored, with the architecture derived from
the file instead of being told it — see [`DTCG.md`](./DTCG.md#the-resolved-shape---shape-resolved).

## Technical architecture

```javascript
// Export pipeline (src/code.source.js — the plugin sandbox)
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
UI            ──'applyImport' / 'clearVariables'──────────────────▶  code.js   (import, Clear)
UI            ──'captureComponent' / 'rememberContractPath'───────▶  code.js   (component contracts)
UI            ──'structureGet'; code.js ──'structureCaptured'─────▶  UI        (file structure; code.js also captures on open)
UI            ── Download / Push / Pull / Compare with GitLab and/or GitHub (fetch, from the UI iframe)
```

The push runs from the plugin's UI iframe via `fetch`; the sandbox makes no
network calls. The export reads Figma variables directly through the plugin API
— no external server or service is required.

## Push, pull and compare with GitLab / GitHub

The ⚙ button opens **Settings**, where you add GitLab, GitHub, or both; each
keeps its own saved folder paths (picked on the main screen), so the pushed
path is `folder + filename` per destination — the file name itself is shared.
With both added, the main screen's own GitLab/GitHub tab picks which one is
the active push target; Push always sends to exactly one destination at a
time. Each provider's token field has a **Clear** button (confirmed).

On GitHub the Branch field of the Push card is a picker: an existing branch,
or a new name — the branch is then created from the repository's default
branch before the push runs (`src/github-branch.js`). The card shows when it
last synced with the repository as soon as the plugin opens. In **Compare** the
Branch field becomes a list of the repository's branches, so you can read from
the one a designer is working on. These pickers are GitHub only: on GitLab,
Push and Compare use the branch saved in Settings.

### Network allowlist (important for Enterprise)

A Figma plugin can only reach domains listed in `manifest.json` →
`networkAccess.allowedDomains`. It ships with:

```json
"allowedDomains": [
  "https://gitlab.com",
  "https://api.github.com"
]
```

To push to another self-hosted / Enterprise GitLab, add that instance's origin
and re-import the plugin from the manifest.

## Files

```
Closure/
├── code.js                 # GENERATED — built from src/, do not edit
├── ui.html                 # GENERATED — built from src/, do not edit
├── manifest.json           # Plugin configuration + network allowlist
├── src/
│   ├── code.source.js      # Plugin sandbox source (export, import, capture, messages)
│   ├── ui.template.html    # UI source: markup, CSS, vanilla-JS logic
│   ├── ui-react/buttons.tsx # Kit components mounted into the template
│   ├── ui-kit/             # The component kit (index.tsx, tokens.css, kit.css)
│   │
│   │   # Export
│   ├── dtcg-format.js      # DTCG conversion (inlined into ui.html and code.js, also runs in Node)
│   ├── resolve-architecture.js # Mode-vector resolver over the variable graph
│   ├── emit-resolved.js    # The Resolved document, derived from the graph
│   ├── styles-capture.js   # Text / effect / grid / paint styles read as definitions
│   ├── restore-slim.js     # The restore section, reduced to what the rules cannot say
│   │
│   │   # Import and compare
│   ├── import-ir.js · import-manifest.js · import-resolved.js · architecture-radd.js
│   ├── import-derive.js · import-compile.js · import-apply.js · import-verify.js
│   ├── import-diff.js · import-filter.js · source-quality.js
│   ├── json-diff.js        # Compare: this file's JSON against the JSON in the repository
│   │
│   │   # Component contracts
│   ├── component-capture.js · component-contract.js · component-file.js · component-diff.js
│   │
│   ├── structure-capture.js # The file's collections, modes and routes, read from the variable graph
│   ├── structure-graph.js   # The whole variable graph as a small record (encode/decode), written into the Resolved export as restore.structure
│   ├── import-structure.js  # Rebuilds a Resolved export of any layering from that record
│   ├── structure-select.js  # Which saved structure an imported JSON belongs to, judged by modes alone
│   ├── architecture-ods.js  # The ODS Foundations routing rules (.scheme → _restricted → .mode → .section → .card), verified 18,010/18,010 against the live file; the Resolved import (`src/import-resolved.js`) rebuilds an ODS export through it (recognised by `restore.architecture = ods-foundations`; an export from before the `-subtle` leaves is refused with that reason). Measured on a real ODS export: 13 collections, 7,979 variables, 31,152 aliases, compiled with no open question; 12 of 13 collections match the live variable counts exactly, `.breakpoint` had 173 of 177, because four variables of it are routed through or never read (`stretch-grid/margins`, `stretch-grid/gutters`, `overflow-grid/margins`, `fixed-grid/gutters`) and the evaluated document does not carry them. The export now records them in `restore.hops` (`extras`: where each points; `via`: which variables the document has that route through one) and the import puts them back. Needs a fresh export to take effect. The same section carries `descriptions` (the descriptions of the routing layers and palettes, stored as one template over the path per text, with the names it applies to; a text that would not round-trip is kept literal) and `coreScopes` (the primitives' non-empty scopes), because the document's own tokens hold neither. Measured against the live file before they existed: 3,030 of 6,779 descriptions and 12 primitive scopes were lost. When a graph has this layering, the Resolved export's `restore` section also carries `subtle`: every `-subtle` palette leaf with the core colour it points at, because the document's cells never reach them
│   │
│   └── github-branch.js    # Create a branch for a push to GitHub
├── scripts/                # build-ui.js, the *-selftest.js suites, dtcg-preview,
│   │                       # dtcg-descriptions, import-plan, resolved-roundtrip,
│   │                       # resolved-config.example.js
│   └── __fixtures__/       # checked-in inputs for the self-tests
├── README.md               # This file
├── DTCG.md                 # DTCG and Resolved output format, importing a resolved export
├── TYPOGRAPHY.md           # Typography parity (lineHeights / letterSpacing)
├── THEMING.md              # Plugin UI theming (tokens, levels, theme toggle)
└── BACKLOG.md              # Known limitations & follow-ups
```

## Keyboard shortcuts
- **Tab** — move focus between UI elements
- **Enter** / **Space** — activate the focused control
- **Esc** — close the open dialog, or the plugin

---

**Product:** Closure (`manifest.json`, v1.4.0)
**Status:** ✅ Active development
