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

## Diagnostics

Every extract logs `Figma descriptions: N of M variables (P%)` to the console,
counted on the raw extraction — so an empty `$description` tells you whether the
file has no descriptions or the export is losing them.
