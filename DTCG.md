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

- **Renames** `value` / `type` / `description` → `$value` / `$type` /
  `$description`, keeping `$themes` and `$metadata` at the document root (the
  "partial" shape a downstream strict-DTCG generator consumes).
- **Figma variable descriptions** ride along as `$description`, and are
  **de-duplicated**: a description belongs to the variable, so instead of
  repeating it on every mode's token it is hoisted once to a root
  `$extensions` map keyed by the token path. `scripts/dtcg-descriptions.js`
  is the reference reader that rehydrates it.
- **The file name swaps with the format** so a DTCG export never overwrites the
  default JSON: `tokens.json` → `tokens_dtcg.json`. Suffixing and stripping are
  exact inverses, so toggling round-trips.
- Descriptions are opt-in at the source: `transformToFinalFormat(raw, {
  includeDescriptions: true })`, which the UI sets only for a DTCG export, so
  the default export is unchanged.

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
