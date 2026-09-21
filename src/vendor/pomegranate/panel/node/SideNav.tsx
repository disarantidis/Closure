/*
  SideNav — a vertical column of destinations, one of which is the page you are on.

  THE ARIA IDENTITY IS NOT `menu`, NOT `tablist`, NOT `tree`. APG has no "sidenav" pattern, and
  a nav is none of those three. `role="menu"` announces a list of ACTIONS (its children are
  `menuitem`); `role="tablist"` claims panels switchable in any order without a URL change;
  `role="tree"` is filesystem hierarchy with expand/collapse. A side navigation is an
  ORDERED LIST OF DESTINATIONS, one of which is current — and the platform mints exactly the
  right hook for that: `<nav>` + `<ol>` + `aria-current="page"`. This is the same call
  `Stepper` made for its own "ordered list of named things, one of which is current" (it uses
  `aria-current="step"` for the sequence's identity); the side nav is the same shape with the
  destination-shaped value of the same attribute.

  ITEMS ARE ANCHORS, NOT BUTTONS. A nav item goes somewhere. That means `href`, "open in new
  tab" from a right-click, and a URL the screen reader announces before it says "link". A
  button would silently take those away. When the caller needs `onClick` semantics without a
  URL (a "log out" row in the nav's chrome, say), the item still renders as a `<button>` — the
  same fork `ListItem` already makes. But the DEFAULT is an anchor because the DEFAULT shape
  of a nav item is a destination.

  THE COMPONENT IS PRESENTATIONAL. It does not read `useLocation`, it does not know about a
  router, it does not import `react-router-dom`. That is `Menu`'s posture and `Combobox`'s
  posture and the kit's posture everywhere else. Callers on a router wrap items in their own
  `NavLink` (see the story) and pass its `isActive` back through the `current` prop; callers
  without one pass `current` from wherever their route state lives. The kit's one contract is
  the *shape*.

  SECTIONS ARE `<h3>` + THEIR OWN `<ol>`, INSIDE THE SAME `<nav>`. That is Polaris's shape and
  it is what screen readers read cleanly — a heading, then a list belonging to it. The
  alternative (one `<ol>` with a heading-shaped `<li>`) puts a non-item into the list and lies
  to any reader that walks by list semantics. Bare items rendered outside a `SideNav.Section`
  are collected into an implicit `<ol>` with no heading, which is the honest thing for a nav
  with no groups.

  KEYBOARD IS THE PLATFORM'S. Each `<a>` is a natural tab stop and Tab / Shift+Tab walk them
  — the same behaviour every site nav people already know. No roving tabindex, no arrow-key
  handling. Menu carries that machinery because a menu is one tab stop hiding many items; a
  side nav has no such compression, and adding roving tabindex to a nav breaks the "Tab
  through the interface's stops" mental model. When the nav genuinely holds many items and
  Tab-count becomes the complaint, that is a follow-up, not the first cut.

  TWO SHAPES, ONE COMPONENT: `variant="fixed"` (the default) is the labelled column above;
  `variant="rail"` is the narrow, icon-only strip that lives at the edge of a chrome and
  shows its label in a tooltip on hover or focus. That is one prop away because it is the
  same DOM: the icon and the label are already both there, and the rail simply visually
  hides the label (leaving it in the a11y tree, which is what keeps the anchor's name)
  and asks the kit's `Tooltip` — the WCAG 1.4.13-compliant one, not the native `title`
  attribute — to make it hoverable. `SideNav.Section`'s title uses the same visually-
  hidden treatment in a rail: the group still exists in the reading order, the heading is
  simply not rendered visually because there is no room for group labels next to a stack
  of icons.
  See `docs/exploration/14-side-navigation-scope.md` for the full scoping.

  SUBPAGES ARE ITEMS INSIDE ITEMS, ONE LEVEL DEEP. A `SideNav.Item` may carry other
  `SideNav.Item`s among its children — those become the sub-destinations of the parent,
  disclosed under it by a chevron on the trailing edge. A PARENT ROW IS A PURE
  DISCLOSURE: the whole row is one `<button aria-expanded aria-controls>` and the click
  toggles the sublist. This is a REVISION of the shape §15 scoped: the first cut
  carried the WAI Disclosure pattern with a SEPARATE chevron button so a parent could
  still be a link, but the accepted answer is that split affordances (row = navigate,
  chevron = toggle) fail on touch and hide the toggle from casual pointer users. A
  parent is now a toggle; a parent that also wants its own landing page adds an explicit
  first sub-item — an "Overview", "All reports", whatever the caller names it — that
  carries the parent URL. That is the SLACK / VS CODE / GITHUB convention; it is
  honest about the parent-vs-page distinction and it makes the row's one click do one
  thing.

  Depth is capped at two: a sub-item may not itself carry sub-items. The cap is
  enforced at render via a nesting-depth context; a would-be third level is silently
  rendered as a leaf. See `docs/exploration/15-side-navigation-subpages-scope.md` for
  the original scoping and this changelog entry for the revision.

  NO ROUTING, NO SEARCH, NO WORKSPACE CHROME. Every one of those is either the caller's
  job (routing, search, chrome) or a decision the kit has already made once (`data-scheme`
  covers pole choice from the outside).

  ── USAGE RULES for the caller ──────────────────────────────────────────────────────

  These are conventions the kit does NOT enforce at runtime (there is no warning, no
  refusal). They are the reading the component was designed for; a nav that breaks
  them still renders, and still passes the a11y contract, but reads as inconsistent
  next to one that keeps them.

  1. ICONS ARE CONSISTENT PER LEVEL. The kit has TWO icon categories in a SideNav —
     the TOP-LEVEL row (every parent AND every non-parent leaf directly under the
     `<SideNav>`, including those inside a `SideNav.Section`) and the SUB-ITEM row
     (every leaf nested inside a parent). Within each category, either every item
     has a `leading` node or none of them do. Mixing a leading-icon row with a
     no-leading row inside the same category makes the labels step (the `leading`
     slot's 16px reserve only applies to rows that USE it) and the eye reads that
     step as accidental. The two categories MAY differ: top-level rows can carry
     icons while sub-items go label-only, as long as each category stays uniform.

  2. ONE CURRENT AT A TIME. Only ONE item across the whole SideNav should carry
     `current={true}`. `aria-current="page"` is a per-page fact; two rows claiming to
     be the current page is a lie the shared indicator will show physically (it
     picks the first match). If two things need highlighting, one of them is a
     different state — hover, chosen, active — and belongs to a different attribute.

  3. LABELS ARE SHORT AND SCANNABLE. A nav label is a destination name, not a
     sentence — one or two words is the target; anything longer ellipses at the
     row's edge. If the label needs a subtitle, use ListItem instead: SideNav does
     not carry a subtitle slot, and adding one would push the rung taller than every
     other item in the nav.

  4. PARENTS HAVE NO URL. A `SideNav.Item` that carries sub-items is a pure
     disclosure — clicking it opens or closes. Callers who want the parent to also
     LEAD somewhere add an explicit first sub-item that carries the URL ("Overview",
     "All reports", whatever the domain calls it). The type refuses `href` on a
     parent-shaped item because the interaction cannot be two things at once.

  5. `trailing` IS FOR CHROME, `notification` IS FOR ACTIVITY. Chevrons pointing
     out, timestamps, tag pills — those go into `trailing`. Unread counts and
     "something is here" dots go into `notification`, which is the ONE prop both the
     fixed and rail variants render (the rail hides trailing entirely). Mixing the
     two is legal but the rail user only sees the notification signal.

  6. INLINE CONTENT LIVES IN SLOTS, NOT IN ITEMS. To place a banner, a hint, an
     action button, or any non-item content at a fixed position, use one of the four
     slot components — `SideNav.Header` and `SideNav.Footer` for the top and bottom
     of the whole nav; `SideNav.SubHeader` and `SideNav.SubFooter` for the top and
     bottom of a parent's sublist. Do NOT hack it in by putting non-item children
     inside a `SideNav.Item` — those go into the item's LABEL and read as part of
     the row's name.

     `Header` and `Footer` accept both bare content AND `SideNav.Item` rows — a
     footer with a "Log out" row plus a version string is common. Consecutive items
     are auto-wrapped in an `<ol>` for a11y; non-item content renders inline. Items
     in the footer participate in the shared current-item indicator the same way
     any other item does, so a caller who marks a footer row `current={true}` will
     see the indicator slide onto it.

  7. SIDENAV SITS ON THE RAISED RUNG. The container that holds a SideNav should be
     a Card (or Card-shaped surface) on the rung ABOVE the page's own — a page at
     `data-level="1"` gets a Card at `level={2}`, a page at level 2 gets a Card at
     level 3. The SideNav paints against that raised rung and reads as a floating
     panel over the page, which is what a nav's own identity says out loud — a
     chrome fixture, not part of the document's body flow.

  8. THE CONTAINER FOLLOWS CARD PADDING RULES ON ALL FOUR SIDES. The `Card` around
     a SideNav uses its normal `--nd-card-pad` on inline AND block sides, so the
     rows sit inset from the card's sides AND the top/bottom by the same DS-recom-
     mended padding (see the CardLayoutProposal story: small 12 · medium 16 ·
     large ~24). Callers do NOT override `padding` or `--nd-card-pad` inline —
     the `:has()` rule below couples them per SideNav size, matching Card's own
     `s-small/s-medium/s-large` ladder.

  9. TOOLBAR AT THE TOP OF THE CONTENT AREA, FOOTER AT THE BOTTOM. When the SideNav
     fills the height of its container, `SideNav.Toolbar` sits at the top of the
     Card's content area (inset from the raw card top edge by `--nd-card-pad`) and
     `SideNav.Footer` sits at the bottom (same inset, pushed by
     `margin-block-start: auto`). The middle groups occupy the space between and
     scroll if they overflow. This is `margin-block-start: auto` on
     `.nd-sidenav-footer` plus `flex: 1 1 auto` on `.nd-sidenav`, so the layout
     works with zero caller effort as soon as the nav has a bounded height. A
     short nav (no fill) reads exactly the same as before — the auto-margin only
     bites when there is free space to consume.

  10. THE CARD'S CORNER AND PADDING MATCH CARD'S OWN SIZE LADDER, PER SIDENAV
      SIZE. Small → `--radius-small` + `--spacing-component-3` (Card `s-small`),
      medium → `--radius-medium` + `--spacing-component-4` (Card default), large
      → `--radius-large` + `--spacing-component-6` (Card `s-large`). Every value
      is a DS token the Card itself already publishes — the coupling means a
      caller who writes `<SideNav size="large">` gets a Card corner and inline
      padding that match the `s-large` Card, whatever `size` prop they actually
      set on the Card. The per-size paddings match the recommendations in the
      CardLayoutProposal story (12 / 16 / ~24). Card block padding still uses
      the same `--nd-card-pad` on all four sides so the wash box is inset
      symmetrically from every card edge.

      This coupling exists to obey the DS rule
      "**a large card holds large buttons, a small card small ones**"
      (SPACING-RULES.md Part A — density rungs are inheritable, enforced by
      `node-kit-test.mjs §47`). A SideNav sitting in a Card at size N should
      have `size={N}` too; the `:has()` rule handles the reverse so the caller
      needs to keep only ONE side of the pair current (write `<SideNav
      size="large">` under a default Card and the Card's rung follows; write
      `<Card size="large">` around a default SideNav and the caller should
      also write `size="large"` on the SideNav to match the DS rule — and the
      Toolbar's rail toggle and every row inside will read at that rung).

      The item's own wash-box corner scales alongside via `--nd-sidenav-item-
      radius` — extra-small (6) / small (8) / medium (12) — so the card corner
      and the item corner move together and read as one visual family.
*/
import { Children, createContext, Fragment, isValidElement, useContext, useId, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Badge } from './Badge'
import { Tooltip } from './Tooltip'

/*
  BASE — what every row shares. `children` is the label and the accessible name; the
  DOM's link text and the a11y name are one thing rather than two that can disagree.

  `leading` matches ListItem's slot of the same name: a fixed 16px reserve that centres
  whatever the caller drops in — an `<Icon>`, a coloured mark, an avatar, a swatch. It
  is decorative (the wrapper carries `aria-hidden`), and the caller is free to bring any
  element because a nav's leading affordance is not always an icon. Rows with a leading
  glyph and rows without one align their labels in the SAME column, because the reserve
  is a property of the box rather than of its contents — the same rule ListItem's leading
  slot answers to, imported here so a list of rows and a list of nav items read side by
  side without one of them stepping right.
*/
type Base = {
  /** the row's label and its accessible name */
  children: ReactNode
  /** the leading slot — an Icon, a mark, an avatar, any decorative node. Fixed 16px reserve. */
  leading?: ReactNode
  /** anything after the label — Tag, a chevron, a timestamp. For "N unread", use `notification` */
  trailing?: ReactNode
  /** the current page — sets `aria-current="page"`, not just a class */
  current?: boolean
  /** unavailable; goes out of the tab order via `aria-disabled` and, on buttons, `disabled` */
  disabled?: boolean
  /*
    THE PERMISSION LEVEL. Distinct from `disabled`, which is a SYSTEM state (broken,
    coming soon, off in this build). `permission` is what the user CAN do with the
    destination, not whether the destination works:

      readOnly   the row leads to a view-only destination — text goes recessive, an
                 eye glyph joins the trailing edge, the click still fires (the caller
                 navigates to the viewer page). The nav is honest about the reach,
                 the destination is honest about the mode.
      locked     the row is inaccessible — text goes recessive, a padlock glyph
                 joins the trailing edge, the row is out of the tab order and clicks
                 no-op. NOT dimmed the way `disabled` is: `locked` is a permission
                 fact the user can act on (request access, upgrade); `disabled` is a
                 system fact they cannot.

    A row that is `disabled` overrides `permission` — the more restrictive state wins
    and the row reads as unavailable, not as a permission the user could gain.
  */
  permission?: 'readOnly' | 'locked'
  /** a hover title. On a rail this becomes the tooltip content */
  tooltip?: string
  /*
    THE UNREAD-COUNT SIGNAL. `true` is a dot ("something is here"), a number is a count
    ("5 things are here"). This is separate from `trailing` because it means one specific
    thing — pending activity — and both variants have to render it: fixed shows it inline
    at the row's end, rail overlays it on the icon's top-right corner. `trailing` is for
    everything else (a chevron, a timestamp, a chip); if both are set, the notification
    sits before the trailing content in DOM order.
  */
  notification?: number | true
  /*
    SUB-ITEMS live in `children` alongside the label — a `SideNav.Item` inside the
    parent's `children` becomes a sub-destination. `defaultOpen` seeds the uncontrolled
    disclosure state; `open` + `onOpenChange` switch the row into controlled mode. Only
    a top-level item (depth 0) accepts sub-items — a would-be third level renders as a
    leaf because the type cannot say "children may not have children of this type" and
    the render enforcement is honest enough to catch every case.
  */
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/*
  A DESTINATION OR AN ACTION, NEVER BOTH — the same construction Combobox uses for its
  select-vs-typeahead axis, and ListItem uses for its action-vs-stated one. A nav ITEM is
  the destination case: it renders `<a href>` and behaves like a link (right-click, middle-
  click, "open in new tab" — the platform features a button silently discards). The action
  case exists for the rare row that has no URL: a "log out" or "collapse the nav" at the
  bottom of the chrome. That row still deserves the SideNav's shape, but it renders as a
  `<button>` because there is nowhere to go.

  A single component cannot promise both at the compile line, so the type forks: an item
  with `href` refuses `onClick`'s exclusive alternatives, and vice versa. The runtime shape
  after the fork is one component tree and one CSS ladder — the divergence is at the outer
  element only.
*/
type Destination = Base & {
  /** where this item leads. When set, the row renders as `<a href>` */
  href: string
  /** an intercepting handler — the same event `<a>` would fire */
  onClick?: (e: ReactMouseEvent<HTMLAnchorElement>) => void
}
type Action = Base & {
  /** the row is a button; a click does something rather than going somewhere */
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
  href?: never
}
/*
  DISCLOSURE — a row with neither `href` nor `onClick`, valid only when it holds
  sub-items in its `children`. The type cannot say "must have SideNav.Item children"
  without conditional-typing the caller into knots; the runtime enforces it: an item
  with no href, no onClick and no sub-items renders as a dead-inert button, which is
  the honest picture of "the caller declared nothing". A parent's click behaviour
  (toggle the sublist) is added by the render, not the type — a Disclosure item that
  happens to have sub-items becomes a parent automatically.
*/
type Disclosure = Base & {
  href?: never
  onClick?: never
}

export type SideNavItemProps = Destination | Action | Disclosure

/** The label the section groups its items under. Optional in the type, present in practice
    — a section without a title is just an extra visual boundary the DS does not need. */
export type SideNavSectionProps = {
  title: string
  children: ReactNode
}

/*
  SLOT COMPONENTS — four named containers for content that is NOT a nav item: a top
  banner, a bottom action, a hint above a sublist, an "add" affordance below one. The
  kit ships four rather than one polymorphic slot because their positions are honest:
  a caller reading `SideNav.SubHeader` knows exactly where it lands and never has to
  guess based on DOM inference. Each is a plain container; the caller composes the
  content out of the kit (Toast, Button, Tag, or plain text).

  ARIA HYGIENE — `Header` and `Footer` render as `<div>`s and sit OUTSIDE any `<ol>`
  in the `<nav>`, so they are landmark-legal. `SubHeader` and `SubFooter` render as
  `<li role="presentation">` INSIDE the sublist `<ol>` — an `<ol>` may only contain
  `<li>`, and `role="presentation"` removes the item from the a11y tree so the sublist
  still announces its true item count.

  SLOTS DO NOT PARTICIPATE IN `current` — even if a caller puts a Button inside one
  that looks like a nav row, the shared indicator does not move onto it and the row
  does not carry `aria-current`. The querySelector that drives the indicator matches
  `.nd-sidenav-item[aria-current='page']` specifically, so stray anchors in slots are
  ignored.
*/
export type SideNavHeaderProps = { children: ReactNode }
export type SideNavFooterProps = { children: ReactNode }
export type SideNavSubHeaderProps = { children: ReactNode }
export type SideNavSubFooterProps = { children: ReactNode }

/*
  HEADER AND FOOTER may hold arbitrary content (a logo, a version string, a divider) OR
  full `SideNav.Item` rows (a "log out" affordance, an account row, an "add page"
  button). When items appear alongside non-item content, the runs of items are wrapped
  in their own `<ol>` so the a11y tree announces them as a list — an item outside any
  list reads as "link, link, link" without list context, which lies about the shape of
  the slot. Non-item content renders inline as the caller wrote it. Both slots share
  the splitter so the two ends of the nav behave the same way.
*/
function splitFooterOrHeaderChildren(children: ReactNode): ReactNode[] {
  const parts = Children.toArray(children)
  const rendered: ReactNode[] = []
  let itemRun: ReactNode[] = []
  const flush = (key: string | number) => {
    if (itemRun.length === 0) return
    rendered.push(
      <ol key={`ol-${key}`} className="nd-sidenav-list">{itemRun}</ol>,
    )
    itemRun = []
  }
  parts.forEach((child, i) => {
    if (isValidElement(child) && child.type === SideNavItem) {
      itemRun.push(child)
    } else {
      flush(i)
      rendered.push(<Fragment key={i}>{child}</Fragment>)
    }
  })
  flush('tail')
  return rendered
}
function SideNavHeader({ children }: SideNavHeaderProps) {
  return <div className="nd-sidenav-header">{splitFooterOrHeaderChildren(children)}</div>
}
function SideNavFooter({ children }: SideNavFooterProps) {
  return <div className="nd-sidenav-footer">{splitFooterOrHeaderChildren(children)}</div>
}
function SideNavSubHeader({ children }: SideNavSubHeaderProps) {
  return <li role="presentation" className="nd-sidenav-subheader">{children}</li>
}
function SideNavSubFooter({ children }: SideNavSubFooterProps) {
  return <li role="presentation" className="nd-sidenav-subfooter">{children}</li>
}

/*
  SIDENAV.TOOLBAR — the structural top row of the nav: a left content slot for the
  caller's chrome (logo, search field, workspace title) and an icon-button on the
  trailing edge that toggles the SideNav between `fixed` and `rail`. The toolbar is
  the ONE control the SideNav ships that talks to its own variant — every other
  variant switch is the caller's business — because "collapse the sidebar to a rail"
  is a nav-owned affordance every consumer implements the same way, and every kit
  writing its own once is one kit too many.

  In rail mode the left slot is hidden (a 32-square is too narrow for search or a
  logo) and only the toggle button remains, so the user can always return the nav to
  fixed mode from where they collapsed it.

  The toggle icon reads the CURRENT variant and the writing direction, and rotates
  a single chevron accordingly: in fixed, it points toward the leading edge (the
  "collapse me" direction); in rail, it points away from the leading edge (the
  "expand me" direction). `--writing-direction`-agnostic via `transform`.

  The variant lives on the SideNav (controlled `variant` + `onVariantChange`, or
  uncontrolled `defaultVariant`); the toolbar reads it via `VariantContext` and calls
  the setter on click.
*/
type VariantSetter = (next: 'fixed' | 'rail') => void
const VariantContext = createContext<{ variant: 'fixed' | 'rail'; setVariant: VariantSetter | null }>({
  variant: 'fixed',
  setVariant: null,
})

export type SideNavToolbarProps = {
  /** the LEFT slot — search, logo, workspace name, or nothing */
  children?: ReactNode
  /** accessible name for the toggle button; defaults per state */
  collapseLabel?: string
  expandLabel?: string
}
function SideNavToolbar({ children, collapseLabel = 'Collapse navigation', expandLabel = 'Expand navigation' }: SideNavToolbarProps) {
  const { variant, setVariant } = useContext(VariantContext)
  const isRail = variant === 'rail'
  const onClick = () => setVariant?.(isRail ? 'fixed' : 'rail')
  return (
    <div className="nd-sidenav-toolbar">
      {children !== undefined && (
        <div className="nd-sidenav-toolbar-left">{children}</div>
      )}
      <button
        type="button"
        className="nd-sidenav-toolbar-toggle"
        aria-label={isRail ? expandLabel : collapseLabel}
        aria-expanded={!isRail}
        onClick={onClick}
        disabled={setVariant === null}
      >
        <span className="nd-sidenav-toolbar-toggle-glyph" data-collapsed={isRail || undefined} aria-hidden>
          <ChevronGlyph />
        </span>
      </button>
    </div>
  )
}

/*
  THE WRAPPER — `<nav>` with a REQUIRED `aria-label`. A landmark without a label is one of
  many nameless landmarks the screen reader lists ("navigation, navigation, navigation"), and
  a page with two nav landmarks (the site's header and this) needs both named or the reader
  cannot tell them apart. The kit refuses the omission at the type line rather than warning
  at runtime.
*/
export type SideNavSize = 'small' | 'medium' | 'large'
export type SideNavProps = {
  /** the required accessible name for this navigation landmark */
  label: string
  /*
    THE SHAPE. `fixed` is the labelled column; `rail` is the icon-only strip that lives at
    the very edge of the chrome and surfaces the label on hover/focus via `Tooltip`. Same
    children, same DOM — the difference is a visual mode, not a different component.

    Controlled with `variant` + `onVariantChange`; uncontrolled with `defaultVariant`
    (defaulting to `fixed`). `SideNav.Toolbar`'s toggle button flips the variant when
    the caller either accepts control or leaves it uncontrolled; without the toolbar,
    the variant is whatever the caller passes.
  */
  variant?: 'fixed' | 'rail'
  defaultVariant?: 'fixed' | 'rail'
  onVariantChange?: (variant: 'fixed' | 'rail') => void
  /*
    THE SIZE. Same three rungs `ListItem` publishes — `small` (24px rung, microcopy
    type), `medium` (32px rung, body-s type — the default, and the "standard nav"
    size), `large` (44px rung, body-l type). Applies to every row (parent, leaf,
    sub-item) as one — a nav is a stack, and a stack that mixes sizes reads as an
    accidental drift. Rail items square to the same rung.
  */
  size?: SideNavSize
  /** SideNav.Item and SideNav.Section — mixed order allowed */
  children: ReactNode
}

/*
  THE ITEM NEEDS TO KNOW ITS SHAPE. A rail item wraps its trigger in a `Tooltip` and the
  fixed item does not, and that decision cannot be inferred from the item's own props —
  it belongs to the SideNav wrapping it. React Context is the right hop: the wrapper sets
  it once, every descendant reads it, and the caller writes `<SideNav variant="rail">`
  without ever touching each item.
*/
const RailContext = createContext(false)

/*
  THE ITEM ALSO NEEDS TO KNOW ITS DEPTH. Top-level items may carry sub-items; sub-items
  may not. The kit could ask the caller to enforce this by hand (or by refusing at the
  type line), but the honest place is here — the render pass already walks the tree, so
  it can cap the recursion at depth 1 without asking the caller for anything. The context
  starts at 0 at the SideNav root and increments through each sub-list, so a hypothetical
  third level reads depth 2 and renders as a leaf even if the caller nested items three
  deep.
*/
const NestingDepthContext = createContext(0)

/*
  CHILDREN SPLITTING — the honest ARIA shape needs `<h3>` + `<ol>` for each section, and a
  bare group of items rendered outside any section becomes its own headless `<ol>`. React
  makes this a per-render walk: collect contiguous non-section children into a group, flush
  when a section boundary arrives, then render each group as one `<ol>`.

  A section child renders itself (its own `<div>` + `<h3>` + `<ol>`), which is why the
  splitter never descends into it.
*/
function groupChildren(children: ReactNode) {
  const nodes = Children.toArray(children)
  const groups: Array<{ kind: 'items'; nodes: ReactNode[] } | { kind: 'section'; node: ReactNode }> = []
  let toolbar: ReactNode = null
  let header: ReactNode = null
  let footer: ReactNode = null
  let bucket: ReactNode[] = []
  const flush = () => { if (bucket.length) { groups.push({ kind: 'items', nodes: bucket }); bucket = [] } }
  for (const n of nodes) {
    if (!isValidElement(n)) { bucket.push(n); continue }
    if (n.type === SideNavToolbar) { toolbar = n; continue }
    if (n.type === SideNavHeader) { header = n; continue }
    if (n.type === SideNavFooter) { footer = n; continue }
    if (n.type === SideNavSection) { flush(); groups.push({ kind: 'section', node: n }); continue }
    bucket.push(n)
  }
  flush()
  return { toolbar, header, footer, groups }
}

/*
  THE SHARED MOVING INDICATOR — one bar per SideNav, absolutely positioned inside the
  `<nav>`, that slides between two shapes:

  - a full-height (60%) LINE, on whatever row carries `aria-current="page"` and is
    currently visible (its sublist parent, if any, is open); OR
  - a 4×4 DOT on a COLLAPSED parent whose sub-item is current — the "the current page
    is somewhere under this closed section" signal.

  Both shapes are drawn by the SAME DOM element with the SAME inline-styled `top` and
  `block-size`, so a state change (a click, or opening a collapsed parent) animates
  BOTH the move AND the growth in one smooth motion — dot on the parent grows into a
  line on the newly-visible sub-item, or vice versa when the parent collapses.

  The 4px-across shape at 4px tall reads as a dot because `border-radius: --radius-full`
  in the CSS rounds a 4×4 square into a circle; grown to 20-ish tall, the same rounding
  gives a pill/bar. One primitive, two readings.

  Measurement re-runs on React re-renders (useLayoutEffect deps include children),
  `aria-current` / `aria-expanded` / `hidden` mutations anywhere in the nav
  (MutationObserver), and layout / size changes (ResizeObserver on the nav).
*/
type IndicatorRect = { top: number; left: number; height: number } | null
const DOT_SIZE = 4 /* matches --spacing-component-0 — the indicator's inline-size in CSS */
function useCurrentItemIndicator(navRef: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  const [rect, setRect] = useState<IndicatorRect>(null)
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const navRect = nav.getBoundingClientRect()
      /* Prefer the actual current item when it is visible. Scoped to `.nd-sidenav-item`
         so a stray anchor inside a slot (Header, Footer, SubHeader, SubFooter) does not
         hijack the indicator. */
      const current = nav.querySelector('.nd-sidenav-item[aria-current="page"]') as HTMLElement | null
      if (current) {
        const r = current.getBoundingClientRect()
        if (r.height > 0) {
          setRect({
            top: r.top - navRect.top + r.height * 0.2,
            left: r.left - navRect.left,
            height: r.height * 0.6,
          })
          return
        }
      }
      /* Fall back to a collapsed parent that carries a current descendant — draw the
         dot at the parent's leading centre so a state change animates it into place. */
      const parent = nav.querySelector(
        '[data-descendant-current="true"][aria-expanded="false"]',
      ) as HTMLElement | null
      if (parent) {
        const r = parent.getBoundingClientRect()
        if (r.height > 0) {
          setRect({
            top: r.top - navRect.top + r.height / 2 - DOT_SIZE / 2,
            left: r.left - navRect.left,
            height: DOT_SIZE,
          })
          return
        }
      }
      setRect(null)
    }
    measure()
    const mo = new MutationObserver(measure)
    mo.observe(nav, {
      attributes: true,
      attributeFilter: ['aria-current', 'aria-expanded', 'hidden'],
      subtree: true,
    })
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    return () => { mo.disconnect(); ro.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return rect
}

export function SideNav({ label, variant, defaultVariant, onVariantChange, size = 'medium', children }: SideNavProps) {
  const { toolbar, header, footer, groups } = groupChildren(children)
  const navRef = useRef<HTMLElement>(null)
  /*
    VARIANT STATE — controlled if `variant` is set (caller owns), uncontrolled otherwise
    (SideNav owns, seeded from `defaultVariant`). The toolbar's toggle calls the setter
    published on `VariantContext`; a caller who wants a rail with no toggle simply
    omits `SideNav.Toolbar`, and the variant stays whatever they passed.
  */
  const [uncontrolledVariant, setUncontrolledVariant] = useState<'fixed' | 'rail'>(defaultVariant ?? 'fixed')
  const currentVariant = variant ?? uncontrolledVariant
  const setVariant: VariantSetter = (next) => {
    if (variant === undefined) setUncontrolledVariant(next)
    onVariantChange?.(next)
  }
  const indicator = useCurrentItemIndicator(navRef, [children, currentVariant])
  return (
    <VariantContext.Provider value={{ variant: currentVariant, setVariant }}>
      <RailContext.Provider value={currentVariant === 'rail'}>
        <nav ref={navRef} aria-label={label} className="nd-sidenav" data-variant={currentVariant} data-size={size}>
          <span
            className="nd-sidenav-indicator"
            aria-hidden
            style={
              indicator
                ? {
                    opacity: 1,
                    top: `${indicator.top}px`,
                    left: `${indicator.left}px`,
                    blockSize: `${indicator.height}px`,
                  }
                : { opacity: 0 }
            }
          />
          {toolbar}
          {header}
          {groups.map((g, i) =>
            g.kind === 'section'
              ? g.node
              : (
                  <ol key={i} className="nd-sidenav-list">
                    {g.nodes}
                  </ol>
                ),
          )}
          {footer}
        </nav>
      </RailContext.Provider>
    </VariantContext.Provider>
  )
}

function SideNavSection({ title, children }: SideNavSectionProps) {
  const id = useId()
  return (
    <div className="nd-sidenav-section">
      <h3 id={id} className="nd-sidenav-section-title">{title}</h3>
      <ol aria-labelledby={id} className="nd-sidenav-list">
        {children}
      </ol>
    </div>
  )
}

/*
  THE ROW. Two branches at the outer element (anchor vs button); the inner shape is identical
  so the icon, the label and the trailing slot all read from one place.

  `aria-current="page"` is the ONLY signal for the current row. There is no `is-selected`
  class (that word belongs to chosen-among-peers surfaces — a Card, a day cell), no
  `is-active` (that belongs to a flyout's open trigger), and no ARIA state that duplicates
  what `aria-current` already says. The CSS selects `[aria-current='page']` directly.

  `aria-disabled` announces the unavailable state; on buttons the platform's `disabled`
  attribute also fires so the click never dispatches. On anchors there is no `disabled`
  attribute — the intercepting `onClick` no-ops and `tabIndex={-1}` removes the row from
  the tab order.
*/
/*
  THE TWO PERMISSION GLYPHS are drawn inline rather than reached through `Icon` because the
  kit's `IconName` catalogue is a curated semantic set and neither "view" nor "lock" is on
  it yet. Inline SVG is the same escape hatch `Cursor`, `PieChart`, `ProgressBar` and
  `Logo` already use for one-off glyphs; the size follows the row's type through the
  container's `1lh × 1em` pattern, and `currentColor` lets the recessive text token flow
  in. When the icon set grows to cover these two, this pair moves to `<Icon>` and this
  block deletes.
*/
function ViewGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-6 6-8 10-8s8 2 10 8c-2 6-6 8-10 8s-8-2-10-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
/*
  THE CHEVRON points DOWN at rest and flips to UP when the parent is open — the
  collapse-caret convention (Fluent, Material, most operating-system settings panes).
  Reading DOWN at rest says "the content this hides lives BELOW" more literally than a
  right-facing arrow does; UP on open says "click to fold it back up". A single 180°
  rotation on `data-open` is enough — the SVG itself does not swap.
*/
function ChevronGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

/*
  CHILDREN OF A `SideNav.Item` may hold TWO things: the label (a string / span / whatever
  the caller wrote between the tags), AND — for a parent — the sub-items to disclose
  below it. React's model gives us one `children` slot, so the render pass splits them:
  a child of type `SideNavItem` is a sub-item; every other child is part of the label.
  Whitespace-only strings from JSX indentation are filtered so a nicely-indented parent
  does not carry visible whitespace into its label span.
*/
function splitLabelAndSubItems(children: ReactNode) {
  const label: ReactNode[] = []
  const subItems: ReactNode[] = []
  let subHeader: ReactNode = null
  let subFooter: ReactNode = null
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === SideNavItem) {
      subItems.push(child)
    } else if (isValidElement(child) && child.type === SideNavSubHeader) {
      subHeader = child
    } else if (isValidElement(child) && child.type === SideNavSubFooter) {
      subFooter = child
    } else if (typeof child === 'string' && child.trim() === '') {
      /* JSX indentation between tags — drop it */
    } else {
      label.push(child)
    }
  }
  return { label, subItems, subHeader, subFooter }
}

/*
  THE LABEL AS A STRING. The tooltip, the chevron's ARIA name, and the rail hint all
  want a plain string to sit inside; the label may be a string, an array of strings, or
  a ReactNode with its own children. This walks the label parts and concatenates every
  string it finds — enough for the common case (a plain-text label) and honest about
  the uncommon one (a label with mixed content just uses the string parts).
*/
function labelToString(label: ReactNode[]): string {
  return label
    .map((node) => (typeof node === 'string' ? node : ''))
    .join('')
    .trim()
}

/*
  DESCENDANT-CURRENT SCAN. If any sub-item carries `current={true}`, the parent gets a
  subtle "descendant is current" mark — a thin variant of the leading bar — so the
  sighted user can tell that the current page is under a parent that is not itself the
  current row. The scan is one level deep, matching the two-level cap enforced in §5.1.
*/
function hasCurrentSubItem(subItems: ReactNode[]): boolean {
  return subItems.some((item) => {
    if (!isValidElement(item)) return false
    const props = item.props as SideNavItemProps
    return props.current === true
  })
}

function SideNavItem(props: SideNavItemProps) {
  const isRail = useContext(RailContext)
  const depth = useContext(NestingDepthContext)
  /*
    SPLIT CHILDREN. The label and (for a parent) the sub-items ride in one `children`
    slot; the render pass separates them here. At depth 1 and beyond we DROP sub-items
    silently — the depth cap is a shape decision, not a caller error, and a warning
    would fire at every render on a component that mostly composes correctly.
  */
  const { label: labelParts, subItems: rawSubItems, subHeader, subFooter } = splitLabelAndSubItems(props.children)
  const subItems = depth === 0 ? rawSubItems : []
  const hasSubItems = subItems.length > 0
  const labelText = labelToString(labelParts)
  /*
    THE DISCLOSURE STATE. Controlled if `open` is set (caller owns the state and passes
    `onOpenChange`); uncontrolled otherwise, seeded from `defaultOpen` and toggled by the
    chevron. `useState` runs either way — its result is only READ in the uncontrolled
    case. No `defaultOpen` warning when both are set; the type refuses that combination
    upstream at the caller's site is a follow-up (the same shape Combobox and Popover
    take today does not enforce it either).
  */
  const [uncontrolledOpen, setUncontrolledOpen] = useState(props.defaultOpen ?? false)
  const isOpen = props.open ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (props.open === undefined) setUncontrolledOpen(next)
    props.onOpenChange?.(next)
  }
  const childListId = useId()
  const descendantCurrent = hasSubItems && hasCurrentSubItem(subItems)
  /*
    THE NOTIFICATION SLOT. Fixed mode renders the count as an inline Badge before
    `trailing`; rail mode ALWAYS renders a dot, regardless of whether the caller passed
    a number — the icon-only 32-square has no room for a two-digit pill without eating
    the glyph, and the sighted signal a rail owes its user is "something is here", not
    the exact count. The count still lives in the Badge's `label` (Badge's dot mode is
    icon-only, so the `label` is required for a11y anyway), which puts it in the
    anchor's accessible name — a screen reader on the rail still hears "Inbox 12, link".
    The two-digit-in-rail pattern (Slack's) is a follow-up: a smaller pill overhanging
    the icon's corner that clips to the row, which needs both a Badge size the kit does
    not currently ship and a corner clip that respects the row's border-radius.
  */
  const notificationLabel =
    typeof props.notification === 'number'
      ? `${props.notification} notifications`
      : 'notifications'
  const notification =
    props.notification === undefined
      ? null
      : isRail || typeof props.notification !== 'number' ? (
          <span className="nd-sidenav-item-notification">
            <Badge variant="primary" label={notificationLabel} />
          </span>
        ) : (
          <span className="nd-sidenav-item-notification">
            <Badge variant="primary" label={notificationLabel}>
              {props.notification}
            </Badge>
          </span>
        )
  /*
    THE PERMISSION LEVEL feeds three things: the visual class (recessive text, glyph on
    the trailing edge), the interaction shape (`locked` is out of the tab order like
    `disabled`), and an SR-only suffix that appends the reason to the accessible name so
    a screen reader hears "Reports (locked), link" rather than a silent lock icon. The
    glyph is `aria-hidden`; the SR text carries the fact instead. Rail mode hides the
    glyph — a corner-lock in a 32-square is a follow-up; the recessive text and the
    tooltip's item name still communicate the reduced state to a rail sighted user.
  */
  const isLocked = props.permission === 'locked' && !props.disabled
  const isReadOnly = props.permission === 'readOnly' && !props.disabled
  const permissionGlyph = isLocked ? <LockGlyph /> : isReadOnly ? <ViewGlyph /> : null
  const permissionSuffix = isLocked ? ' (locked)' : isReadOnly ? ' (view only)' : ''
  const content = (
    <>
      {props.leading !== undefined && (
        <span className="nd-sidenav-item-leading" aria-hidden>
          {props.leading}
        </span>
      )}
      <span className="nd-sidenav-item-label">{labelParts}</span>
      {permissionSuffix && <span className="nd-sr-only">{permissionSuffix}</span>}
      {notification}
      {props.trailing !== undefined && (
        <span className="nd-sidenav-item-trailing">{props.trailing}</span>
      )}
      {permissionGlyph && (
        <span className="nd-sidenav-item-permission" aria-hidden>
          {permissionGlyph}
        </span>
      )}
      {hasSubItems && (
        <span className="nd-sidenav-item-chevron" data-open={isOpen || undefined} aria-hidden>
          <ChevronGlyph />
        </span>
      )}
    </>
  )
  const current = props.current ? ('page' as const) : undefined
  const inactive = props.disabled || isLocked
  const disabled = props.disabled || undefined
  const permissionClass = isLocked ? ' is-locked' : isReadOnly ? ' is-readonly' : ''
  /*
    THE HOVER HINT. In the fixed variant we pass through the caller's `tooltip` as a native
    `title` attribute — cheap, unobtrusive, matches what any other row does. In the rail
    variant the label is not visible any more, so the row NEEDS a hoverable, keyboard-safe
    hint of what it is, and `title` fails 1.4.13 on all three counts. `Tooltip` is the
    kit's answer — same string, wrapped around the trigger, no props to memorise. When the
    caller passed a `tooltip` string, that wins (they know their content best); otherwise
    the label itself is the hint, because that IS the anchor's name and reading it back is
    what the sighted rail user is missing.
  */
  const railHint = labelText || undefined
  const railHintFull = railHint !== undefined && permissionSuffix ? `${railHint}${permissionSuffix}` : railHint
  const nativeTitle = isRail ? undefined : props.tooltip
  const tooltipText = isRail ? (props.tooltip ?? railHintFull) : undefined

  const nested = depth > 0

  /*
    THE PARENT ROW is a single `<button aria-expanded aria-controls>` — the WHOLE row
    is the toggle, and any `href` the caller wrote is deliberately dropped. Split
    affordances (row navigates, chevron toggles) failed the touch and pointer readings
    that gave rise to this component; a parent that also wants its own landing page
    adds an explicit sub-item that carries the URL — an "Overview" or "All reports"
    child, whatever the caller names it — and the click behaviour of the parent row
    stays one thing: it opens or closes what is under it. Anything the caller passed
    as `onClick` still fires alongside the toggle so analytics and instrumentation
    stay unbroken.

    `aria-expanded` reflects the current state; `aria-controls` points at the
    sublist id. Toggling flips both the attribute and the sublist's `hidden` at once.
    A parent that is `disabled` or `locked` refuses the toggle the same way it would
    refuse a navigation.
  */
  if (hasSubItems) {
    const onParentClick = () => {
      if (inactive) return
      setOpen(!isOpen)
      /* fire caller's onClick if present — parents are toggles, but instrumentation
         can still ride along. Type on `props.onClick` is anchor-flavoured for a
         destination and button-flavoured for an action; a synthetic click event is
         hard to fake, so we call it with no argument via the safe cast. */
      const cb = (props as { onClick?: (...args: unknown[]) => void }).onClick
      if (typeof cb === 'function') cb()
    }
    const parentTrigger = (
      <button
        type="button"
        className={`nd-sidenav-item${permissionClass}`}
        aria-expanded={isOpen}
        aria-controls={childListId}
        aria-current={current}
        aria-disabled={disabled || (isLocked || undefined)}
        disabled={props.disabled || isLocked}
        onClick={onParentClick}
        title={nativeTitle}
        data-nested={nested || undefined}
        data-descendant-current={descendantCurrent || undefined}
      >
        {content}
      </button>
    )
    const parentWithTooltip =
      tooltipText !== undefined ? (
        <Tooltip text={tooltipText} side="end" delay={200}>
          {parentTrigger}
        </Tooltip>
      ) : (
        parentTrigger
      )
    /*
      THE SUBLIST SITS ON THE PARENT'S OWN RUNG — no recess, no separate ground. The
      visual break between the parent row and its sub-items is carried by the top
      divider that the CSS draws on the sublist, and by the bottom divider that the
      CSS draws only when another list item follows the parent. Sub-items paint their
      hover / current wash against the SAME `--background` any other row in this
      SideNav paints against, so a group opening does not shift the visual weight of
      the surface — only the row-count changes.
    */
    return (
      <li className="nd-sidenav-item-parent">
        {parentWithTooltip}
        <ol
          id={childListId}
          className="nd-sidenav-list nd-sidenav-sublist"
          hidden={!isOpen}
        >
          {subHeader}
          <NestingDepthContext.Provider value={depth + 1}>
            {subItems}
          </NestingDepthContext.Provider>
          {subFooter}
        </ol>
      </li>
    )
  }

  /*
    LEAF: anchor or button as declared by the type. Unchanged from the flat SideNav —
    this branch is what every non-parent item renders as, including a would-be
    third-level item whose sub-items we dropped upstream.
  */
  const trigger =
    'href' in props && props.href !== undefined ? (
      <a
        className={`nd-sidenav-item${permissionClass}`}
        href={inactive ? undefined : props.href}
        onClick={
          inactive
            ? (e: ReactMouseEvent<HTMLAnchorElement>) => e.preventDefault()
            : props.onClick
        }
        aria-current={current}
        aria-disabled={disabled || (isLocked || undefined)}
        tabIndex={inactive ? -1 : undefined}
        title={nativeTitle}
        data-nested={nested || undefined}
        data-descendant-current={descendantCurrent || undefined}
      >
        {content}
      </a>
    ) : (
      <button
        type="button"
        className={`nd-sidenav-item${permissionClass}`}
        onClick={inactive ? undefined : props.onClick}
        aria-current={current}
        aria-disabled={disabled || (isLocked || undefined)}
        disabled={props.disabled || isLocked}
        title={nativeTitle}
        data-nested={nested || undefined}
        data-descendant-current={descendantCurrent || undefined}
      >
        {content}
      </button>
    )
  const wrappedTrigger =
    tooltipText !== undefined ? (
      <Tooltip text={tooltipText} side="end" delay={200}>
        {trigger}
      </Tooltip>
    ) : (
      trigger
    )
  return <li>{wrappedTrigger}</li>
}

SideNav.Item = SideNavItem
SideNav.Section = SideNavSection
SideNav.Toolbar = SideNavToolbar
SideNav.Header = SideNavHeader
SideNav.Footer = SideNavFooter
SideNav.SubHeader = SideNavSubHeader
SideNav.SubFooter = SideNavSubFooter
