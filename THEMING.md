# Plugin Theming

Closure's UI is **dark-only** and built to the **Pomegranate
(disarantidis_ReactJS)** design system — the vendored kit in
`src/vendor/pomegranate` (`tokens.css`, `node.css`, and the components under
`panel/node/`). There is no light/dark toggle.

## How it works

Two layers cooperate:

1. **The Pomegranate components paint themselves.** Every control
   (`Button`, `Switch`, `Checkbox`, `SegmentedControl`, `DropDownSelect`,
   `Dialog`, `Toast`, `Alert`, `Accordion`, `Tag`, `Skeleton`, and the field
   adapters) uses the kit's own `.nd-*` classes from `node.css`, which resolve
   Pomegranate tokens (`--surface`, `--container-1..4`, `--text`, `--accent`,
   `--stroke`, `--radius-*`, `--spacing-*`, …) defined in `tokens.css`. Both are
   bundled into `ui.html` by `npm run ui:build`.

2. **The plugin's own chrome** (header, panels, layout in
   `src/ui.template.html`) uses a small set of `--app-*` variables that are
   **aliased onto the Pomegranate tokens**, so the plugin's plain CSS and its
   components always resolve to the same palette:

   ```css
   :root {
     --app-bg:           var(--surface);          /* the ground */
     --app-surface:      var(--container-3);       /* raised panels */
     --app-surface-soft: var(--container-3-hover);
     --app-border:       var(--stroke);
     --app-border-strong:var(--stroke-subtle);
     --app-text:         var(--text);
     --app-text-muted:   var(--text-recessive);
     --app-accent:       var(--accent);
     /* … */
   }
   ```

## Dark palette

`<html data-theme="dark">` is set statically, which selects Pomegranate's dark
values (`html[data-theme='dark']` in `tokens.css`): a `#1A1A1A` ground, warm
neutral surfaces, and a **monochrome white accent**. Pomegranate's own light
palette lives on bare `:root`, but nothing in this app switches to it.

## Re-theming

- To change the **palette**, edit the vendored `tokens.css` (or re-vendor it
  from the kit) and `npm run ui:build`.
- To change how the plugin's own chrome maps onto the palette, edit the
  `:root { --app-* }` block in `src/ui.template.html`, then rebuild.
- Component styling is the kit's — change it in `src/vendor/pomegranate/styles/node.css`.

> `ui.html` is generated. Never hand-edit it; edit the sources and run
> `npm run ui:build`.
