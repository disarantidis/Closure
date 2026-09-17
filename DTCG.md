# DTCG output format

Closure can export **DTCG** ([design-tokens.org](https://tr.designtokens.org/format/))
instead of its default token JSON — toggle **Settings → Output format**.

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

## The resolved shape (`--shape resolved`)

An experimental fourth shape, reachable **only** from the CLI — the plugin's
Settings switch does not offer it and no shipped export changes.

Where the three shapes above mirror how a file is *authored* (one document per
collection x mode, alias hops kept as cross-document references), this one
mirrors how it is *consumed*: the routing resolved away, each token sitting
under exactly the choices it actually varies with, referencing the primitive
collection rather than inlining values.

```bash
node scripts/dtcg-preview.js <graph.json> --shape resolved \
     [--config scripts/resolved-config.example.js] [-o out.json]
```

### It takes a raw variable graph, not a token tree

`<graph.json>` is the array of collections `extractVariables()` produces in
`code.js`, with `valuesByMode` and `{ type: 'VARIABLE_ALIAS', id }` intact.
A Legacy JSON or DTCG export **cannot** stand in: both have already collapsed
the alias hops this shape exists to resolve. Hand it one and it says so and
exits 1.

> Producing that dump still needs a plugin-side hook — the plugin currently
> only hands the UI its transformed tree. Until that exists the flag is
> driven from a graph captured by other means.

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

### Token types

Figma's own `scopes` where a variable narrows them, then propagated along alias
edges to the primitives — a primitive reached only by tokens scoped
`CORNER_RADIUS` is a radius, and the graph says so. Only ~3% of variables carry
a narrowing scope, but they are almost exactly the consumption layer, which is
why the primitive collection needs no name table. `typeHints` covers whatever
nothing consumes.

## Diagnostics

Every extract logs `Figma descriptions: N of M variables (P%)` to the console,
counted on the raw extraction — so an empty `$description` tells you whether the
file has no descriptions or the export is losing them.
