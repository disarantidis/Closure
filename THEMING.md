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
     --app-bg:           var(--background);        /* the ground */
     --app-surface:      var(--background);         /* resolves per data-level */
     --app-surface-soft: var(--background-hover);
     --app-border:       var(--stroke);
     --app-border-strong:var(--stroke-subtle);
     --app-text:         var(--text);
     --app-text-muted:   var(--text-recessive);
     --app-accent:       var(--accent);
     /* … */
   }
   ```

   ### Level composition

   Pomegranate has **one** fill name, `--background`, moved by `[data-level]`
   islands (docs/knowledge-levels.md) — `--surface` / `--container-*` don't
   exist. Closure's ground is the **darkest** rung:

   ```html
   <html data-theme="dark" data-mode="dark" data-level="1" data-surface="normal">
   ```

   `data-surface="normal"` is required alongside a level-1/3/4 ground — without
   it the ground paints translucent ("the ground is never glass"; only the
   default level-2 ground is solid without it). Every mounted React subtree in
   `buttons.tsx` is wrapped in a `LevelContext.Provider value={1}` so the kit's
   components compute their fill from that same ground. A field sits one rung
   above its ground for free (`fieldLevel`), so fields read as level 2 with no
   extra wiring; the collections `Accordion` sets `level={2}` explicitly to
   read as the one raised card; dialogs are level 4.

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
