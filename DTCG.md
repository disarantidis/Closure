# DTCG output format

Closure exports **DTCG** ([design-tokens.org](https://tr.designtokens.org/format/)).
Settings → **W3C DTCG** has one choice left, the **Resolved** switch (see
[The resolved shape](#the-resolved-shape)); the Legacy JSON tree is the
intermediate this conversion runs over, no longer an output.

## Where it sits

```
Figma variables
  → transformToFinalFormat()   (code.js)   native tree, keyed by collection
  → toTokenFormat()            (code.js)   sets + $themes + $metadata
  → toDtcgFormat()             (src/dtcg-format.js)   ← DTCG, pure JSON→JSON
```

Running as a post-transform means DTCG inherits every normalization the default
path already does — typography composites, elevation composites, line-height /
letter-spacing semantics, alias-path fixes, dimension math — instead of
reimplementing it. `src/dtcg-format.js` runs both inlined in the plugin UI
(bundled into `ui.html` by `scripts/build-ui.js`) and in Node
(`scripts/dtcg-preview.js`).

## What it does

The switch drives `dtcgShape = 'themes'` — **standalone, standards-conformant
W3C DTCG**, not an intermediate shape that needs another tool to finish:

- **One fully resolved document per `$themes` entry.** Each theme's sets are
  deep-merged (later sets in `tokenSetOrder` win), so
  every document is self-contained — nothing else to load, nothing else to
  merge.
- **Renames** `value` / `type` / `description` → `$value` / `$type` /
  `$description`, and **strictly maps every type** to its DTCG equivalent
  (`spacing`/`sizing`/`borderRadius`/… → `dimension`, etc. — see `TYPE_MAP` in
  `src/dtcg-format.js`) rather than passing the Legacy JSON tree's own
  proprietary type names through.
- **Aliases stay aliases** — `$value: "{color.blue}"` is valid DTCG (the spec
  defines token references with exactly this syntax; consuming tools resolve
  them). What "resolved" means here is *closure*: every alias is checked to
  resolve to something inside that same theme document
  (`validateDtcgClosure`), never dangling out to a set the document didn't
  merge in — so the output needs no companion file to be complete.
- **Figma variable descriptions** ride along as `$description` on each token.
- Vendor/Legacy-JSON-only metadata (which sets built the document, its
  `tokenSetOrder`) is confined to a root `$extensions.com.closure.legacyJson`
  block, which a strict DTCG consumer can simply ignore.
- **The file name swaps with the format** so a DTCG export never overwrites the
  default JSON: `tokens.json` → `tokens_dtcg.json`. Suffixing and stripping are
  exact inverses, so toggling round-trips.
- Descriptions are opt-in at the source: `transformToFinalFormat(raw, {
  includeDescriptions: true })`, which the UI sets only for a DTCG export, so
  the default export is unchanged.

`src/dtcg-format.js` has two other shapes — `'partial'` (a minimally-renamed
DTCG flavour, `$themes`/`$metadata` left at the document root, proprietary
types untouched; a downstream `build-dtcg.js` elsewhere finishes it into
strict DTCG) and `'sets'` (strict type mapping, but organized per Legacy
JSON set rather than per resolved theme, so it can still alias across
documents). Both remain reachable from `scripts/dtcg-preview.js` for anyone
who wants that partial export instead — the plugin's own
Settings switch does not use either.

## Node tools (no Figma needed)

```bash
npm run dtcg:preview -- <export.json>   # convert an existing export + report
                                        # token counts, types still to map,
                                        # math expressions, description coverage,
                                        # per-document reference closure
npm run dtcg:selftest                   # format / description-dedupe / file-name checks
```

## The resolved shape

The export is always W3C DTCG. Settings → **W3C DTCG** has one card, the
**Resolved** switch: off writes one document per theme (`tokens_dtcg.json`), on
writes this shape (`tokens_resolved.json`). The same shape is also reachable
from the CLI as `--shape resolved`, described below.

Where the three shapes above mirror how a file is *authored* (one document per
collection x mode, alias hops kept as cross-document references), this one
mirrors how it is *consumed*: the routing resolved away, each token sitting
under exactly the choices it actually varies with, referencing the primitive
collection rather than inlining values.

```bash
node scripts/dtcg-preview.js <graph.json> --shape resolved \
     [--config scripts/resolved-config.example.js] [-o out.json]
```

### In the plugin

Built in the sandbox by `buildResolvedDocument()` in `src/code.source.js`,
because the raw variable graph and the value formatters both live there — the
UI only ever sees the transformed tree, which has already collapsed the alias
hops this shape resolves.

The layout roles are read off the derived data, not off collection names: the
breakpoint axis is the one some group depends on ALONE, and the scheme and mode
axes are the first two of the widest group. A file with no such shape gets the
derived form back rather than being forced into a layout that does not fit.

The plugin needs nothing stated. It detects the layout roles, holds still
whatever the layout cannot place (saying which, in the export's own
`$extensions`), and slugs mode names into path segments — `S Mobile` becomes
`mobile`.

**What it will not do is contradict the spec on a system's behalf.** Measured
against one real reference document, 2,845 tokens differ in `$type` alone
because that system calls letter spacing a `number` rather than a length, and
drops a `colours/` namespace while keeping `elevation/`. Those are conventions
somebody chose, not facts about the file, so they live in the CLI's `--config`
— a file versioned next to the tokens it describes — rather than in plugin
settings.

Both routes run the same code: `PomEmitResolved.document()` owns the layout,
the fitting and the fallbacks, and the plugin and `dtcg-preview.js` each supply
only hooks and vocabulary.

### It takes a raw variable graph, not a token tree

`<graph.json>` is the array of collections `extractVariables()` produces in
`code.js`, with `valuesByMode` and `{ type: 'VARIABLE_ALIAS', id }` intact.
A Legacy JSON or DTCG export **cannot** stand in: both have already collapsed
the alias hops this shape exists to resolve. Hand it one and it says so and
exits 1.

To get one out of the plugin, run an extract and press **Cmd/Ctrl + Shift + G**.
That downloads `<file name>.graph.json` — the raw extraction the UI is already
holding. It is bound to a chord rather than given a button because it is for
working on the exporter, not for exporting: nothing in the UI advertises it and
no product flow depends on it.

The extraction carries two fields only this shape reads:

| field | why |
|---|---|
| `scopes` | where Figma allows a variable to be used (`CORNER_RADIUS`, `GAP`, `FONT_SIZE`) — the same semantic distinction token types key off, as metadata instead of a name |
| `defaultModeId` | which mode answers when nothing has chosen one; without it a resolver has to guess `modes[0]` |

Both are additive and the default export ignores them.

### Nothing about the shape is configured

`src/resolve-architecture.js` and `src/emit-resolved.js` measure every
structural fact from the graph: which collection holds raw values (out-degree
0), which variables are consumed (per-variable in-degree 0), what the axes are
(multi-mode collections), what order to nest them in (observed precedence,
topologically sorted), which axes each token varies with (resolve it and see
what the walk entered), and which branches actually exist.

Verified on two unrelated systems. One has 11 collections and 5 axes; the other
has 14 and 7, including two the first does not have at all:

```
axis order   .breakpoint > .scheme > .mode > _restricted > .secondary
44 real branches (a naive product of the 5 axes would be 3600)

axis order   .breakpoint > .scheme > _restricted > .mode > .section > .card > .secondary
670 real branches (a naive product of the 7 axes would be 36000)
```

Branch paths are **ragged on purpose**: a branch records only the questions its
walk asked, so a scheme that never routes through the light/dark switch is one
branch, not two identical ones.

### What `--config` supplies is vocabulary

See `scripts/resolved-config.example.js`. It carries only what is true of one
design system and unknowable from its graph:

| key | what it is for |
|---|---|
| `pin` | axes to hold at one mode rather than branch over |
| `renameMode` | what to call a mode in the output path |
| `renameToken` | namespaces implied by the group, removed from the leaf |
| `typeHints` | semantic types a file's names carry but its metadata does not |
| `toDocument` | optional: reshape the derived groups into a house layout |

Without a config the emitter still runs and reports the derived shape.

`toDocument` maps branches onto fixed nesting levels, so it can only carry the
axes it has somewhere to put. Point a layout at a file with an axis it was not
written for and the surplus branches collide; the CLI counts the derived total
against what the layout kept and names the axes it had no level for rather than
letting the loss pass silently:

```
  ! the layout kept 9182 of 129646 derived tokens (120464 collapsed onto paths already taken).
    it has no level for: .secondary, .section, .card
```

### Descriptions

A Figma variable description is carried through as `$description`, the same as
in the shipped export. It is never mandatory: a token without one has **no
`$description` key at all** rather than an empty one, and the CLI flags it as a
bug if any empty ones appear.

A token carries its **own** description, not the one belonging to whatever it
resolves to — a semantic token and the primitive under it describe different
things, and inheriting would attribute the primitive's note to every token
routed through it.

```
$description 119996 (93% of tokens)
```

### Token types

In descending order of authority: a `typeHints` answer, then the variable's own
Figma `scopes`, then what its consumers resolved to (propagated along alias
edges), then its Figma type.

Only ~3% of variables carry a narrowing scope, but they are almost exactly the
consumption layer, and propagation carries that down — measured on a real file,
**scopes plus propagation alone reproduce 95% of a hand-written name table's
answers from 215 scoped variables out of 7,984.** That is why the primitive
collection needs no name table of its own.

Hints outrank both deliberately. Propagation is an *inference* — a primitive is
typed by whatever happens to consume it — so a plain number consumed through an
effect slot propagates as a dimension. Where a house document says otherwise,
`typeHints` states it and wins; inference only fills silence. (`shadows/` and
`grids/` in the example config are exactly this case.)

## What a resolved document says about itself

**Four roots.** `core` (primitives), `foundation` (the semantic layer, written
once), `breakpoint.<breakpoint>` and `mode.<mode>.<scheme>`. Every name is
lowercase. A `foundation` token aliases its default context (the first scheme,
the light mode, the first breakpoint) and carries
`$extensions["com.desquared.radd"] = { layer, path }` to re-target itself:
`layer: "scheme"` resolves to `mode.<mode>.<scheme>.<path>`, `layer:
"breakpoint"` to `breakpoint.<breakpoint>.<path>`. A token that varies with no
axis (radius, strokes, component sizes) is a plain alias of `core` or a literal
and has no such extension.

**The root metadata**, under the same namespace: `modes`, `schemes`,
`modeIndependentSchemes`, `accentSchemes`, `foundationDefaults` and
`foundationContext`. It is what lets a reader recognise the shape without a file
name.

**No build stamp.** A resolved document carries no `com.closure` or
`$figmaStructure`; the import tells it apart by `foundationDefaults`.

### The `restore` section

Always written, as the last key of the metadata, and small: **what the
architecture's rules cannot say, and nothing else.** It is read-only and
advisory — nothing in it is a token — and an import that does not find it still
rebuilds the file, from the rules.

The rules (`src/architecture-radd.js`, applied by `src/import-resolved.js`)
already make the variables, their scopes, the text and effect styles, the grid
style, the underline of the Link styles, the upper-case `FAB` and the one link
whose variable has another name. So the section holds only the difference
between that and the file it came from (`src/restore-slim.js` computes it, in
the plugin panel, on the finished document):

| key | holds |
|---|---|
| `architecture` | `{ id, version }`, when the file's collections are the RADD Foundations architecture |
| `styles.patches` | per style name, only the fields that differ from what the rules make from this document — a `bound` entry of `null` means that field is not bound |
| `styles.added` / `styles.removed` | a style the rules would not make, and one they would make that the file does not have |
| `scopes` | only the variables whose scopes are not the rule's |
| `links` | only the renames that are not the architecture's own |

On the RADD file the full record was 37 KB; the section is now about 350 bytes
(three text styles bound to a variable the convention would not pick), and the
document imports to the same variables, scopes and styles.

Because it is a difference, **the document's own values win.** A font size
changed in Tokens Studio since the export is the new size on import; the section
only says how a style differs *in kind* (a field left unbound, bound to another
scale).

Older files carry the full record — `collections`, `scopes`, `links`,
`synthesized` and `styles` as lists of definitions — and are still read.

## Importing a resolved export

A resolved document has had its routing evaluated away, so it cannot be
*measured* back into collections. It can be *rebuilt*, because the architecture
is regular: `src/architecture-radd.js` holds the rules (collection names, modes,
which palette each scheme and light/dark reads, the `_restricted` permission
layer, creation order) and `src/import-resolved.js` lays the document's leaves
back into that chain — core, the four palettes, `_restricted`, `.mode`,
`.scheme`, `.breakpoint`, `foundation`, `layout` — as rows the ordinary import
pipeline compiles and applies.

**Any other layering** is rebuilt from `$extensions["com.desquared.radd"].restore.structure`,
the file's own graph (collections, modes, variables with type, scopes, description, code
syntax and order, every cell as an alias by name or a literal, and the styles), written by
the exporter when Restore data is on. It is used only when neither built-in rule set
recognises the document, and reads nothing of the token tree. Aliases to library variables,
extended-collection inheritance and empty collections are not part of it. See the README.

Measured on the RADD file: 11 collections, 3,180 variables, 11,486 values;
11,470 of the original's 11,481 values come back identical, every collection but
two byte-identical, all 30 styles identical.

What does not come back:

- **Lower case.** Variable names are lowercase, except the five core groups the
  per-theme export looks up in camel case (`fontFamilies`, `fontSize`,
  `fontWeights`, `paragraphSpacing`, `paragraphIndent`), which get their capitals
  back; without them that export reports their references as broken (style names, from
  `restore.styles`, keep their capitals).
- **`FONT_VARIATIONS`.** Figma reports the scope but refuses to write it; it is
  left out and counted.
- **Ids.** Variables and styles are new ones.
- **Links to a differently-named variable that two tokens share.** They come
  back named after the token that reads them, the way the reference document
  names them.
- **Quirks of the original that the rules would not choose.** A text style
  bound to another scale's variable, or a field left unbound, is only restored
  from the `restore` section; without it the style is bound the way the
  convention says.

Into an empty file only: the import refuses a file that already has variables or
styles, and refuses before writing anything if a font a text style needs (Inter
Bold, Medium) is not available.

## Diagnostics

Every extract logs `Figma descriptions: N of M variables (P%)` to the console,
counted on the raw extraction — so an empty `$description` tells you whether the
file has no descriptions or the export is losing them.
