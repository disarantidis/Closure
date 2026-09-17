/*
  Table — rows in columns, and the column decides what the cell may be.

  FOUR FILES HAND-ROLL `<table>` TODAY, and two of them carry the same style constants
  written twice: `TH = { textAlign: 'start', padding: 'var(--spacing-component-1)',
  fontWeight: 'var(--weight-medium)', whiteSpace: 'nowrap' }` appears verbatim in both
  `ChipFamily.stories.tsx` and `Badge.stories.tsx`, differing only in TypeScript
  annotation. That is the five-classnames disease `ListItem` was built to cure, caught
  a second time in a second shape — same anatomy every time, a different implementation
  every time. This is that anatomy once, on the foundation.

  A TABLE ROW IS `ListItem`'s ROW MODEL LAID OUT IN COLUMNS, and almost nothing here is
  a new decision. The reasoning is written down once in
  docs/exploration/12-table-surface-decision.md; the parts that bind this file:

    - A ROW PAINTS NOTHING AT REST. `.nd-item` is `background: none` and its colour
      census lists no rest fill at all. A table sits on whatever surface its container
      provides; the rows are content on it, not surfaces of their own.
    - NO ZEBRA STRIPING, and the decisive reason is not taste. A hover paints
      `--nd-fill-hover`, a HALF-ALPHA token, over whatever is beneath it — so over a
      striped row and an unstriped row it composites to two different colours and the
      same state reads at two strengths by row parity. That is the `--stroke-hover`
      regression (17.4:1 at rest, 1.13:1 on hover) with a different variable. Rows are
      separated by a hairline `--stroke-subtle` or by nothing.
    - DENSITY REUSES THE RUNGS THAT EXIST. `small | medium | large`, the same three
      `ListItem` walks, with the same padding formula rather than three picked numbers.

  THE COLUMN OWNS ALIGNMENT, NOT THE CELL — which is the whole reason this is a
  data-driven API and not `<Tr><Td>`. A compositional table makes every call site
  restate `textAlign` on every cell of a column, which is precisely the duplication
  measured above; state it once on the column and a cell that disagrees with its own
  header becomes unwritable. "A component decides; a call site does not get to get it
  wrong."

  THE CAPTION IS REQUIRED, and it is the `DropDownSelect` rule arriving intact: an
  unnamed control is not something to remember to avoid, it is unwritable. A table
  announced as nothing is the same defect — axe found five `select-name` criticals in
  our own docs before `label` became mandatory there. `captionHidden` takes it off the
  screen with `.nd-sr-only`; it never takes it out of the accessibility tree.

  A ROW CAN CARRY ONE ACTION, AND THIS IS A CORRECTION — the first version of this file
  said the INVISIBLE BUTTON PATTERN was "illegal here", because `<tr>` admits only `<td>`
  and `<th>` so there is nowhere to stretch the layer. The premise is true and the
  conclusion does not follow: a `<button>` may not be a CHILD of `<tr>`, but it does not
  need to be — it needs to be POSITIONED against it, and `position: relative` on a `<tr>`
  does establish a containing block. Measured: a layer inside the first cell of a 600px
  row renders at 600, not at its host cell's 137, and it escapes that cell's own
  `overflow: hidden` because the clip cannot reach a box whose containing block is the
  row itself.

  So `rowAction` renders ONE layer per row — one tab stop, one accessible name — and the
  row is hittable end to end. The slots stand down (`pointer-events: none`) and anything
  genuinely operable lifts above and keeps its own press, which is `ListItem`'s
  arrangement exactly and for its defect: when the row itself WAS the button, one press
  fired the inner handler AND the outer one. Measured here: a press at the row's far edge
  fires the row once and the Switch beside it not at all; a press on the Switch fires the
  Switch and leaves the row's count unchanged.

  IT CANNOT BE COMBINED WITH `stripe`, and the type says so rather than the prose — see
  the props union below.

  SELECTION IS NOT HERE EITHER, for `ListItem`'s reason and one of its own: selecting is
  what a control does, so a selectable row is a row with a `Checkbox` in a cell. The row
  fill would not change even then — there is no `--accent-subtle` in the foundation, and
  the alternatives are an invented alpha (banned outright) or a container rung (false
  about two peer rows, since the level number is an identity). That is an open foundation
  question, deliberately not answered by a component.
*/
import type { ReactNode } from 'react'
import { LevelContext, useLevel } from './LevelContext'

/* the row ladder's rungs — a table's rows stand beside the same rows a list has, and
   `ListItem` already named them. See Checkbox for why this is `ButtonSize`. */
import type { ButtonSize } from './Button'

export type TableAlign = 'start' | 'end'

/*
  THE STRIPE'S LEVEL, AND WHY `1` IS NOT IN THIS TYPE.

  `knowledge-levels.md`: "L1 is exempt from the ink requirement... It is a well, an inset
  field, a track; it carries no body text. L2–L4 clear AA against every mark in every
  state." A striped ROW is the one thing in the system that is unambiguously carrying body
  text, so it is the one place the exemption cannot be spent. Striping to L1 would put the
  table's prose on the only surface in the foundation not measured against the ink.

  Leaving `1` out of the type is the kit's usual move — the bad state is not documented as
  a warning, it is unwritable.
*/
export type TableStripe = 2 | 3 | 4

export type TableColumn<R> = {
  /** identity for React, and the cell reader's default key into the row */
  key: string
  /** the column's name, in the header. A string unless you truly need a node */
  header: ReactNode
  /**
   * where the column's content sits. Defaults to `start` — or to `end` when `numeric`
   * is set, because a column of figures read down its last digit is the entire reason
   * numeric columns align right, and making callers say both would be two statements
   * of one intent.
   */
  align?: TableAlign
  /**
   * draw the figures with `tabular-nums`. Not a synonym for `align` — one says where
   * the column sits, the other how its digits are cut — but it does supply the default
   * above. Established practice rather than a new idea: node.css already spends
   * tabular figures in five places, and the retired `--mono` token BECAME this property.
   */
  numeric?: boolean
  /**
   * the column's width — any CSS length or percentage, applied through `<colgroup>` so it
   * is stated ONCE per column rather than on every cell. Earned by the stress case: with
   * nothing declared, a prose column collapsed to five lines while `tokens-drift` broke
   * across two, because auto table layout distributes by content and a table full of
   * controls has no content to distribute by.
   */
  width?: string
  /**
   * keep the column on one line. For the labels, dates and identifiers that read as one
   * token and mean less broken in half — measured: `tokens-drift` wrapped to `tokens-` /
   * `drift` in a table that had room to spare elsewhere.
   */
  nowrap?: boolean
  /**
   * THE CELL IS THE TARGET, and its content is a slot.
   *
   * A control column sets this, and then every body cell in it renders as a `<label>` that
   * fills the whole cell — padding included — instead of a `<span>` that wraps only the
   * content. Press anywhere in the cell and the control inside it flips, NATIVELY, with no
   * handler in between: the input is a descendant of the label, so the platform forwards
   * the press itself.
   *
   * IT IS `ListControlItem`'s MODEL, HOSTED BY A CELL RATHER THAN A ROW, and it is the only
   * way a table can meet the target floor for a bare control. `Checkbox`, `Radio` and
   * `Switch` shed their own 24 min-height under `labelHidden` on purpose — "the slot that
   * holds it does the centring" — because in a list the ROW is the label and supplies the
   * target. A `<tr>` cannot be that label, since it admits only `<td>` and `<th>`. A `<td>`
   * can. Measured before: a bare Switch in a plain cell had an 18px hit area against a floor
   * of 24. Measured after: the hit area is the cell.
   *
   * WHAT THE COLUMN MUST HOLD FOR THIS TO BE TRUE, and both halves are real constraints
   * rather than advice:
   *
   *  - EXACTLY ONE control, rendered with `labelHidden`. Two inputs inside one `<label>` is
   *    ambiguous — the platform picks the first and the second becomes unreachable by the
   *    cell press — and a control that draws its own `<label>` would nest one inside another,
   *    which is invalid HTML where "the browser's click-forwarding gets to choose which one
   *    it obeys".
   *  - THE HEADER NAMES IT. `labelHidden` is documented as being ONLY for a control whose
   *    row already names it, so that WCAG 2.5.3 holds because the visible text naming the
   *    control is the same string. In a table that visible text is the COLUMN HEADER, which
   *    is why `header` is what a control column must spell properly.
   *
   * The header cell is never a label — a column name is not a control.
   */
  control?: boolean
  /** what to render for this column in a given row. Defaults to `String(row[key])` */
  cell?: (row: R, index: number) => ReactNode
}

type TableBase<R> = {
  /**
   * the table's accessible name — REQUIRED, and a string on purpose, for the reason
   * `ListItem`'s title is a string: a name announced as its markup is announced as
   * nothing.
   */
  caption: string
  /** take the caption off the screen without taking it out of the accessibility tree */
  captionHidden?: boolean
  columns: TableColumn<R>[]
  rows: R[]
  /** a stable identity per row — never the array index, which reorders into the wrong row */
  rowKey: (row: R, index: number) => string
  /** the density rung — `ListItem`'s three, not a second vocabulary */
  size?: ButtonSize
  /** hairline `--stroke-subtle` between rows. Off by default: the type ladder separates
      them already, and a rule earns its place only when the rows are dense enough to slip */
  rules?: boolean
  /**
   * paint every second row at a named LEVEL — the banded table, asked for explicitly and
   * built the system's own way rather than with an invented tint.
   *
   * The level is set as `data-level` on the row, so it is not a background alone: the whole
   * row becomes that rung, and every component inside it re-resolves its own fill against
   * the new ground the way a nested island already does everywhere else in the kit. A Tag
   * on a banded row paints the band's rung, not the table's.
   *
   * IT IS AN IDENTITY, NOT A RANK, so which one reads depends on what the table is standing
   * on — a table on an L3 card striped to `3` bands nothing, and the component cannot know
   * its own ground to warn you. Pick the rung that differs from the surface beneath.
   *
   * TWO THINGS IT IS NOT COMPATIBLE WITH, both recorded rather than guessed. Turning both
   * `rules` and `stripe` on states one separation twice. And if this component ever grows a
   * row HOVER, the two must be re-decided together: `--nd-fill-hover` is half-alpha, so it
   * composites differently over a banded row than over a plain one and one state would read
   * at two strengths by row parity — the `--stroke-hover` regression's shape. That argument
   * does not bite today only because no row here is hoverable.
   */
  stripe?: TableStripe
  /**
   * shown in place of the rows when there are none. One line, standing where the rows
   * would stand — NOT an icon-and-heading block, because nothing in this repo calls for
   * one: `Combobox.emptyMessage` renders exactly this shape, and `NodeEmpty`'s only two
   * call sites use it as a trailing caption rather than an empty state at all.
   */
  emptyMessage?: ReactNode
}

/*
  THE THREE SHAPES A TABLE MAY TAKE, and why this is a union rather than three more optional
  props on one object.

  A BANDED TABLE AND AN ACTIONABLE TABLE CANNOT BE THE SAME TABLE. A row action brings a row
  HOVER, and `--nd-fill-hover` is a half-alpha token: composited over a banded row it lands on
  a different ground than over a plain one, so one state would read at two strengths by row
  parity. That is the `--stroke-hover` regression's exact shape — a state swap that measured
  17.4:1 at rest and 1.13:1 on hover because nothing checked the PAIR. The note on `stripe`
  predicted this the day the band shipped; the union is that prediction enforced instead of
  repeated.

  AND `rowActionLabel` IS REQUIRED WHERE `rowAction` IS. The layer is an invisible button, so
  its accessible name cannot come from its contents — there are none. A row action without a
  name is a button announced as nothing, which is `DropDownSelect`'s `label` lesson arriving
  a third time. Making it a separate optional prop would let the two disagree; making it part
  of the same variant means they cannot.
*/
type TableBanded<R> = TableBase<R> & {
  stripe: TableStripe
  rowAction?: never
  rowActionLabel?: never
}
type TableActionable<R> = TableBase<R> & {
  stripe?: never
  /** the row's ONE action — see `rowActionLabel`, which ships with it or not at all */
  rowAction: (row: R, index: number) => void
  /** what the row's action is called, per row. The layer is invisible and has no contents
      to be named by, so this is the accessible name and there is no fallback */
  rowActionLabel: (row: R, index: number) => string
}
type TablePlain<R> = TableBase<R> & {
  stripe?: never
  rowAction?: never
  rowActionLabel?: never
}
export type TableProps<R> = TableBanded<R> | TableActionable<R> | TablePlain<R>

/*
  THE EMPTY ROW SPANS THE TABLE, and it has to be a real row in a real cell: a `<div>`
  between `<tbody>` and `<tr>` is invalid markup that browsers hoist OUT of the table,
  which puts the message above the header rather than where the rows were.
*/
export function Table<R>({
  caption,
  captionHidden = false,
  columns,
  rows,
  rowKey,
  size = 'small',
  rules = false,
  stripe,
  rowAction,
  rowActionLabel,
  emptyMessage,
}: TableProps<R>) {
  /*
    A DECLARED WIDTH ONLY BINDS UNDER FIXED LAYOUT, which is why this is derived rather
    than exposed. Under `table-layout: auto` a `<col>` width is a SUGGESTION the browser
    overrules from content — measured: a column declared at 32% rendered at roughly half
    that, because auto layout had already given the space to a column of long tag names.
    Declaring a width is a statement that content should stop deciding, so the layout mode
    follows the declaration instead of being a second switch a caller can set to disagree
    with it.
  */
  const inheritedLevel = useLevel()
  const fixed = columns.some((c) => c.width)
  const cls = [
    'nd-table',
    `s-${size}`,
    rules ? 'is-ruled' : '',
    fixed ? 'is-fixed' : '',
    stripe ? 'is-striped' : '',
  ]
    .filter(Boolean)
    .join(' ')

  /* the column's alignment, resolved once here rather than per cell — see the header */
  const alignOf = (c: TableColumn<R>): TableAlign => c.align ?? (c.numeric ? 'end' : 'start')
  const cellCls = (c: TableColumn<R>, body = true) =>
    [
      'nd-table-cell',
      `al-${alignOf(c)}`,
      c.numeric ? 'is-numeric' : '',
      c.nowrap ? 'is-nowrap' : '',
      body && c.control ? 'is-control' : '',
    ]
      .filter(Boolean)
      .join(' ')

  /*
    EVERY CELL'S CONTENT SITS IN ONE INLINE BOX, and this is the change the stress case
    forced. A `<td>` cannot be `display: flex` — that destroys the column sizing that is
    the entire point of a table — so the flexing happens one element in.

    It buys three things a bare `<td>` cannot: several things in one cell get the kit's
    gap instead of touching (two Tags rendered side by side had NO space between them);
    a control gets a centre line to sit on; and the whole box is pinned to `1lh`, which
    is `.nd-step-text`'s rule verbatim — "pinned to the label's line, not to the block —
    the lesson `.nd-item` already paid for when a row grew a second line and its trailing
    slot slid down beside the explanation". A five-line description in one cell must not
    drag the Switch in the next cell down to its middle.
  */
  const inner = (content: ReactNode) => <span className="nd-table-cellinner">{content}</span>

  /*
    WHERE THE ROW'S LAYER LIVES — the first cell that is not a control cell.

    It is ONE layer for the whole row, not one per cell, and that is an accessibility
    decision rather than an economy: four layers would be four tab stops and four announced
    buttons for one action. One layer is one tab stop with one name.

    It works because `position: relative` on a `<tr>` DOES establish a containing block —
    measured, a layer inside the first cell of a 600px row rendered at 600, not at the
    cell's 137. This corrects the claim made when this component shipped, that the invisible
    button pattern was impossible here: a `<button>` may not be a CHILD of `<tr>`, which is
    true, but it does not need to be — it needs to be POSITIONED against it.

    The host cell's own `overflow: hidden` does not clip it either, for the same structural
    reason: the layer's containing block is the row, an ancestor of the clipping cell, so
    the clip does not reach it. Measured at 600 wide inside a 292 wide clipped cell, still
    hittable at the row's far edge. A nowrap first column keeps its truncation AND the row
    keeps its target.

    A control cell is skipped because it is already a `<label>` that owns its own area; the
    layer would be arguing with it over the same pixels.
  */
  const hitAt = rowAction ? Math.max(0, columns.findIndex((c) => !c.control)) : -1
  /*
    THE LABEL CARRIES THE CELL'S PADDING, WHICH IS THE WHOLE POINT. If the padding stayed on
    the `<td>` the label would cover only the content box and the target would stop short of
    the cell's edges — the air above and below the control would look pressable and not be.
    The cell zeroes its own padding under `.is-control` and the label takes it, so the target
    is the entire cell including its top and bottom air.
  */
  const controlInner = (content: ReactNode) => (
    <label className="nd-table-cellinner">{content}</label>
  )

  return (
    <table className={cls}>
      <caption className={captionHidden ? 'nd-sr-only' : 'nd-table-caption'}>{caption}</caption>
      {/* widths belong to the COLUMN, and `<colgroup>` is where the platform keeps them —
          one declaration each, rather than a width repeated down every cell of a column */}
      {fixed && (
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={c.width ? { inlineSize: c.width } : undefined} />
          ))}
        </colgroup>
      )}
      <thead className="nd-table-head">
        <tr className="nd-table-row">
          {columns.map((c) => (
            /* `scope="col"` is not decoration — without it a screen reader cannot say
               which column a cell belongs to, which is the whole affordance of a table */
            <th key={c.key} scope="col" className={cellCls(c, false)}>
              {inner(c.header)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="nd-table-body">
        {rows.length === 0
          ? emptyMessage != null && (
              <tr className="nd-table-row is-empty">
                <td className="nd-table-empty" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            )
          : rows.map((row, i) => (
              /* the band is `data-level` and not a background alone — see `stripe`. The
                 row paints `--background`, which is "whichever rung the subtree is set to",
                 so the attribute and the paint cannot disagree — and it publishes that rung
                 to React as well, so a field in a banded row steps from the band it is on
                 rather than from the table's own ground (LevelContext.tsx). */
              <LevelContext.Provider
                key={rowKey(row, i)}
                value={stripe && i % 2 === 1 ? stripe : inheritedLevel}
              >
              <tr
                className={['nd-table-row', rowAction ? 'is-actionable' : ''].filter(Boolean).join(' ')}
                data-level={stripe && i % 2 === 1 ? stripe : undefined}
              >
                {columns.map((c, ci) => (
                  <td key={c.key} className={cellCls(c)}>
                    {ci === hitAt && rowAction && (
                      /* the layer carries the whole semantic — role, name, focus, keyboard —
                         and draws no ring of its own; the ROW draws one on its behalf via
                         `:has`, because a ring on an invisible layer rings nothing */
                      <button
                        type="button"
                        className="nd-table-hit"
                        aria-label={rowActionLabel?.(row, i)}
                        onClick={() => rowAction(row, i)}
                      />
                    )}
                    {(c.control ? controlInner : inner)(
                      c.cell ? c.cell(row, i) : String((row as Record<string, unknown>)[c.key] ?? ''),
                    )}
                  </td>
                ))}
              </tr>
              </LevelContext.Provider>
            ))}
      </tbody>
    </table>
  )
}
