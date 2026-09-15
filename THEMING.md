# Plugin Theming

This document describes how the Closure plugin themes its own UI.

The UI is styled to the **disarantidis_ReactJS** design system — a
warm-neutral palette with a monochrome accent (black in light, white in dark).
The theming *mechanism* below is unchanged; only the palette values are the DS's.

---

## Current behavior: light / dark toggle

The plugin UI is themed by a **manual light / dark switch** in the header (🌙 / ☀️). It does **not** derive its colors from the open Figma file.

### How it works

1. All UI colors are CSS custom properties defined on `:root` (the dark theme):

   ```css
   :root {
     --app-bg: #1A1A1A;
     --app-surface: rgba(255,255,255,0.055);
     --app-border: rgba(238,238,238,0.12);
     --app-text: #EEEEEE;
     --app-text-muted: #979797;
     --app-accent: #FFFFFF;   /* monochrome accent (white in dark) */
     /* + structural DS tokens: --radius-*, --sp-*, --type-*, shadows … */
   }
   ```

2. A `body.theme-light` block overrides those variables with a light palette:

   ```css
   body.theme-light {
     --app-bg: #D6D6D3;
     --app-surface: rgba(252,252,252,0.5);
     --app-border: #DEDEDC;
     --app-text: #1A1A1A;
     --app-text-muted: #585858;
     --app-accent: #000000;   /* monochrome accent (black in light) */
     /* ... */
   }
   ```

3. The header toggle adds/removes the `theme-light` class and persists the choice:

   ```javascript
   var THEME_KEY = 'json-exporter-theme';
   function applyTheme(mode) {
     document.body.classList.toggle('theme-light', mode === 'light');
     try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
   }
   // On load: read localStorage, default to 'dark'.
   // On click: flip between 'light' and 'dark'.
   ```

Because every element references `var(--app-*)`, flipping the class re-themes the
whole UI instantly. Default is **dark**; the last choice is restored on next open.

### Adding a themed property

1. Add the variable to `:root` (dark) **and** to `body.theme-light`:
   ```css
   :root            { --app-new-color: #default-dark; }
   body.theme-light { --app-new-color: #default-light; }
   ```
2. Use it in CSS:
   ```css
   .my-element { color: var(--app-new-color); }
   ```

---

## Legacy (dormant): token-driven theming

An earlier version themed the plugin UI dynamically from the **open file's color
tokens**, via a "collection modes" preview banner. That banner is now hidden
(`.collection-modes-banner { display:none }`) and the plugin theme is controlled
only by the light/dark toggle above.

The code still exists in `ui.html` but is **inactive**: `rebuildThemeOptions()`
early-returns while the banner is hidden, so it no longer overrides the
`--app-*` variables. The notes below document that dormant mechanism in case it
is ever re-enabled (remove the inline `display:none` on the banner section).

### Token extraction (code.js)

Variables are read with `figma.variables.getLocalVariableCollectionsAsync()`. For
each variable the plugin stores `name`, `type`, `valuesByMode`, and
`resolvedValuesByMode`. Alias chains (e.g. `foundation → .scheme → .mode → .core`)
are resolved to final RGB values.

### Token-to-CSS mapping

When a collection/mode was selected, tokens were mapped to CSS variables by
**suffix matching**, so a token matched regardless of its collection prefix:

```javascript
function findColorByName(colorVars, modeId, patterns) {
  for (var pattern of patterns) {
    for (var v of colorVars) {
      var name = v.name.toLowerCase();
      if (name === pattern || name.endsWith('/' + pattern)) {
        return colorToCss(v.resolvedValuesByMode[modeId]);
      }
    }
  }
  return null;
}
```

| CSS variable | Token pattern | Purpose |
|---|---|---|
| `--app-bg` | `basic/background` | Main background |
| `--app-surface` | `basic/background-subtle`, `basic/background-card` | Cards, inputs |
| `--app-border` | `basic/stroke`, `basic/stroke-subtle` | Borders, dividers |
| `--app-text` | `basic/text` | Primary text |
| `--app-text-muted` | `basic/text-recessive` | Secondary text |
| `--app-accent` | `basic/accent` | Buttons, active states |
| `--app-on-accent` | `basic/on-accent`, `basic/text-on-accent` | Text on accent backgrounds |
| `--app-success` | `feedback/success` | Success states |
| `--app-danger` | `feedback/error` | Error states |

### The collection-modes banner

The banner rendered one row per color collection with **2+ modes** (single-mode
collections and `restriction` / `_restricted` collections were excluded). Two row
types existed:

- **Standalone** — a single mode dropdown (e.g. `.mode` → `light` / `dark`).
- **Extension group** — when several collections shared the same mode set, a
  collection dropdown + a mode dropdown.

It also wired **dependency gating**: dropdowns with no visual effect under the
current scheme/card were greyed out (`dep-disabled` + a `.dep-hint`) via
`updateDependencyStates()` + `rowRegistry`. The verified rules for the reference
file are recorded in project notes (e.g. `.secondary` only matters when
`.scheme = secondary` or `.card` is a secondary-card variant). All of this only
runs if the banner is made visible again.

### Color conversion & fallbacks

RGB values from Figma (0–1 range) are converted to `rgb()` / `rgba()` strings, and
each mapped slot falls back to a sensible default if its token is missing
(e.g. `--app-bg` → `#121212`, `--app-accent` → `#007AFF`).

---

## Layout & resize

The plugin uses a flexible column layout (header → controls → scrolling
collections list → stats bar → actions). A drag handle at the bottom lets the user
resize the window height:

```javascript
// UI → code.js
parent.postMessage({ pluginMessage: { type: 'resize', height: newHeight } }, '*');

// code.js
if (msg.type === 'resize') { figma.ui.resize(380, msg.height); return; }
```
