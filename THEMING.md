# Plugin Theming

Closure's UI is painted by its own small kit in `src/ui-kit`
(`tokens.css`, `kit.css`, `index.tsx`) — no external design system. The
Settings header's toggle flips `<html data-theme>` between `dark` (the starting
value) and `light`.

## How it works

1. **Tokens** (`src/ui-kit/tokens.css`) define the palette per theme, the
   spacing / type / radius scales, and a four-rung **level ladder**.
2. **Levels.** A surface says which rung it stands on with `data-level="1".."4"`.
   That element re-declares `--background`, `--background-hover`,
   `--background-pressed` and `--field-fill` for everything inside it, so a card
   is just `<div data-level="4">` painting `background: var(--background)`.
   Fields, tonal buttons and segmented tracks read `--field-fill`, which sits
   one rung off the ground (and steps back from the top rung, so a field on a
   card and a field on the page read alike).
3. **Schemes.** `data-scheme="inverted"` flips the palette for a subtree (the
   Figma card).
4. **The plugin's own chrome** (`src/ui.template.html`) uses `--app-*` aliases
   onto those tokens:

   ```css
   :root {
     --app-bg:           var(--background);
     --app-surface:      var(--background);
     --app-surface-soft: var(--background-hover);
     --app-border:       var(--stroke);
     --app-text:         var(--text);
     --app-text-muted:   var(--text-recessive);
   }
   ```

   These resolve **once, on `:root`**. Anything that sets its own `data-level`
   must paint `var(--background)` directly, not an alias.

## Changing the look

- Palette, spacing, type: `src/ui-kit/tokens.css`.
- Component styling: `src/ui-kit/kit.css`.
- Component behaviour and props: `src/ui-kit/index.tsx`.

Then `npm run ui:build` to regenerate `ui.html` and `code.js`.
