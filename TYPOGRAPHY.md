# Typography parity (Closure)

This document describes the **problem we fixed**, **what changed in `code.js`**, and **how that relates** to the exported design-token JSON vs Figma variables for the **Closure** Figma plugin.

## Problem

Downstream tools (Style Dictionary and other design-token transforms) expect **semantic typography token groups** under `core`:

- `core.lineHeights` — keys `0`…`3`, `type: "lineHeights"`, values as **percentage strings** (e.g. `"100%"`, `"130%"`).
- `core.letterSpacing` — keys `0`…`8`, `type: "letterSpacing"`, values as **percentage strings** (e.g. `"-5%"` … `"0.5%"`).

Typography composites in the export reference these paths, e.g.:

- `{lineHeights.0}` … `{lineHeights.3}`
- `{letterSpacing.0}` … `{letterSpacing.8}`

The plugin also emitted **kebab-case** groups (`line-heights`, `letter-spacing`) with **different paths** and often `type: "number"` (e.g. multipliers `100`, `120`). Those **do not** satisfy references to `{lineHeights.*}` / `{letterSpacing.*}`.

**Symptom:** Aliases pointed at `lineHeights` / `letterSpacing` while those groups were **missing** from `core`, so resolution broke even when `dimension` and colours were correct.

## Solution (implemented in `code.js`)

We added **`ensureCoreLineHeightsLetterSpacing(core)`**, called from **`toTokenFormat`** immediately after **`ensureCoreTextCaseAndDecorationPrimitives`**.

Behaviour:

1. **`lineHeights`**
   - If `0`–`3` are not all present, we try to derive semantic entries from **`core["line-heights"]`** using the multiplier map (`100`→`0`, `130`→`1`, `120`→`2`, `125`→`3`) and coerce values to `%` strings.
   - If still incomplete, we fill from **reference defaults**: `100%`, `130%`, `120%`, `125%`.
   - If all four exist but values lack `%`, we normalize where appropriate.

2. **`letterSpacing`**
   - If fewer than **nine** entries (`0`–`8`), we merge with **reference defaults** (the same percentages as the reference token file).
   - Existing entries from Figma are preserved where present; missing indices are filled.

This makes **`{lineHeights.*}`** and **`{letterSpacing.*}`** resolvable without requiring an external tool to be the source of those groups in Figma.

## Related code (for navigation)

- `toTokenFormat` — wires in the ensure step after core is built.
- Existing helpers such as **`syncTypographyCompositeLineHeights`**, **`applyNatoCompositeRefStrings`**, **`walkAndFinalizeNatoTypographyComposites`** — still assume these semantic groups exist; the ensure step supplies them.

## What this does *not* guarantee

- **Identical JSON to another tool's export**: `core` may still differ in **key order**, extra kebab groups (`font-sizes`, `font-weights`, …), **Inter** vs another family, or **`Elevation`** inside `core` if that only exists in another tool's file shape.
- **Same numeric result** for every token unless **Figma variables** match the same design decisions (family, scale, modes). The plugin exports **what Figma stores**; another tool's JSON may reflect a different snapshot or typography scale.
- **Full math expressions** everywhere: Figma variables are mostly **values** and **aliases**, not arbitrary expressions. Expressions like `N*{dimension.base}` in JSON are often **reconstructed** in export logic where supported (e.g. dimension base), not read as a stored formula from Figma.

## Verification

After a reload of the plugin in Figma and a fresh export:

1. Open the JSON and check **`core.lineHeights`** and **`core.letterSpacing`** exist with the expected keys and `%` values.
2. Search for **`{lineHeights.`** and **`{letterSpacing.`** in composites and confirm those paths exist under `core`.

## Related files

- **`TYPOGRAPHY.md`** (this file) — typography parity for semantic composite references.
- **`README.md`** — product overview: **Closure** (design-token JSON export).
- **`THEMING.md`** — plugin UI theming (light/dark toggle).
- **`BACKLOG.md`** — known limitations (e.g. math expressions).
