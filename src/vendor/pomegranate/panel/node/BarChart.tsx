/*
  BarChart — categories of bars, drawn by composing `Bar`. It is the first component that is a
  CHART rather than a control, and it earns its place by owning the two things a bare row of `Bar`s
  cannot: the SCALE (values become lengths against a shared maximum) and the CHROME around the plot
  (a value axis with gridlines, a target line, category labels, a legend). The bars themselves are
  still `Bar` — one per series per category, sized by this component and painted in the series'
  scheme — so a chart column inherits the cell drawing, the radius and the per-bar `data-scheme`
  for free, and nothing here names a colour.

  GROUPED IS THE GENERAL CASE, SINGLE FALLS OUT OF IT. `series` names the groups (their legend
  labels and their schemes); each `data` category carries one value per series. One series is simply
  a group of one — there is no separate single-series path to drift from the grouped one.

  THE BAR'S LENGTH IS THE VALUE, NOT ITS FILL. A meter fills a fixed track to show a level; a chart
  makes the whole bar as long as the value. So each column is sized by THIS component (its wrapper
  is `value/max` of the plot) and the `Bar` inside is drawn full and solid — `segments={1}` by
  default, a single lit cell. Ask for more `segments` and the solid bar gains tick divisions without
  changing its length. The fill direction inside the Bar never shows, because the bar is always full.

  TONE IS THE SERIES', DECLARED — which is legitimate here for the reason Bar.tsx gives: a chart is a
  drawing, and colouring a series by intent is DATA. The derived-tone rule stays with the meters.

  ACCESSIBILITY IS A NAMED IMAGE FOR NOW. The plot is one `role="img"` with a required `label`, and
  each bar carries its own `aria-label` (category, series, value). A parallel data table is the
  honest next step and is deliberately left open rather than faked.
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef, useId } from 'react'
import { Bar } from './Bar'
import type { BarScheme } from './Bar'

export type BarChartOrientation = 'vertical' | 'horizontal'

/* a series is a group across every category — its legend name and the scheme its bars carry */
export type BarChartSeries = { key: string; label: string; scheme?: BarScheme }

/* a category is one label on the axis, carrying one value per series (aligned to `series` order).
   `content` rides INSIDE that category's bar — an avatar and labels laid over the fill, forwarded to
   the Bar's own slot. It only lands where a category has ONE bar to host it: a stacked chart (one
   bar per category) or a single-series chart. In a multi-series GROUPED chart there is no single bar
   to carry it, so it is dropped. And the caveat that rides with any in-chart slot: a bar is exactly
   as long as its value, so on a short bar the content clips — it suits long bars and stacked totals. */
export type BarChartCategory = { label: string; values: number[]; content?: ReactNode }

/* a horizontal reference line — the dashed "expected / target" marker across the plot */
export type BarChartTarget = { value: number; label?: string }

/* which bar was pressed — its place in the grid and the datum it drew, so one handler can serve
   every bar and still know exactly which one it was */
export type BarClickInfo = {
  categoryIndex: number
  category: string
  seriesIndex: number
  series: BarChartSeries
  value: number
}

export type BarChartProps = {
  /* REQUIRED — the chart's accessible name; the plot is a `role="img"` and this names it */
  label: string
  labelHidden?: boolean
  series: BarChartSeries[]
  data: BarChartCategory[]
  /* the top of the scale. Omit and it is the largest value present (and the target), so the tallest
     bar reaches the top; give it to pin the axis to a round number or a known ceiling */
  max?: number
  /* how many gridlines/ticks divide the axis, including the baseline and the top. Default 4 */
  ticks?: number
  target?: BarChartTarget
  orientation?: BarChartOrientation
  /* cells per bar — `1` is a solid bar (the default); more adds tick divisions without changing length */
  segments?: number
  /* the plot's extent along the VALUE axis in px — a column chart's height, a bar chart's width. The
     other axis grows with the number of categories. Default 200 */
  size?: number
  /* how axis ticks and bar names read a value. Default rounds to a whole number */
  formatValue?: (value: number) => string
  showLegend?: boolean
  /*
    MAKE EVERY BAR ITS OWN TARGET. Give this and each bar becomes an independently clickable `Bar`
    (a real button, with its own hover/press/focus and its own accessible name), reporting which
    category and series it was. Omit it and the bars stay a drawing. Per-bar disabled/pending is a
    later, richer value shape; this is the click.
  */
  onBarClick?: (info: BarClickInfo) => void
  /*
    WHICH BAR IS SELECTED — its ring shows and every bar reports its selected state. Pair with
    `onBarClick` to select on click. Omit for a chart with no selection.
  */
  selectedBar?: { categoryIndex: number; seriesIndex: number } | null
  /*
    A HOVER PANEL ON EACH BAR — a list of the category's series (swatch, name, value), shown while a
    bar is hovered, focused or selected. On by default; it is the legend with the numbers filled in
    for the category under the pointer. Set false for a bare chart.
  */
  tooltip?: boolean
  /*
    STACKED — each category is ONE segmented bar instead of a group of solid ones: the series become
    the SEGMENTS of a single weighted `Bar`, each in its own scheme, and the bar's length is the
    category TOTAL. Clicking/selecting a segment maps to that series through the same `onBarClick` /
    `selectedBar`, and the hover panel is the same breakdown.
  */
  stacked?: boolean
  style?: CSSProperties
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const defaultFormat = (v: number) => String(Math.round(v))

export const BarChart = forwardRef<HTMLDivElement, BarChartProps>(function BarChart(
  {
    label,
    labelHidden = false,
    series,
    data,
    max,
    ticks = 4,
    target,
    orientation = 'vertical',
    segments = 1,
    size = 200,
    formatValue = defaultFormat,
    showLegend = true,
    onBarClick,
    selectedBar,
    tooltip = true,
    stacked = false,
    style,
  },
  ref
) {
  const id = useId()
  const vertical = orientation === 'vertical'

  /* the scale — the largest reading present unless pinned, and never zero so a length is defined.
     Stacked bars are measured by their TOTAL (the sum of the stack), grouped bars by each value. */
  const totals = data.map((d) => d.values.reduce((t, v) => t + (v || 0), 0))
  const present = (stacked ? totals : data.flatMap((d) => d.values)).concat(target ? [target.value] : [])
  const ceiling = Math.max(1, max ?? Math.max(0, ...present))

  /* the gridline fractions, baseline (0) through the top (1), `ticks` divisions between */
  const lines = Array.from({ length: ticks + 1 }, (_, i) => i / ticks)

  /* the position of a fraction along the value axis, and the length of a bar — the one pair of
     inline styles that turn with the orientation, so everything else is orientation-blind */
  const at = (f: number): CSSProperties => (vertical ? { insetBlockEnd: `${f * 100}%` } : { insetInlineStart: `${f * 100}%` })
  const lengthOf = (v: number): CSSProperties =>
    vertical ? { blockSize: `${clamp01(v / ceiling) * 100}%` } : { inlineSize: `${clamp01(v / ceiling) * 100}%` }

  const legend: ReactNode = showLegend && series.some((s) => s.label) && (
    <div className="nd-barchart-legend">
      {series.map((s) => (
        <span className="nd-barchart-legend-item" key={s.key}>
          <span className="nd-barchart-swatch" {...(s.scheme ? { 'data-scheme': s.scheme } : {})} aria-hidden="true" />
          {s.label}
        </span>
      ))}
    </div>
  )

  /* the hover panel for a category — the legend with this category's numbers filled in */
  const tipFor = (cat: BarChartCategory): ReactNode => (
    <div className="nd-barchart-tip">
      <div className="nd-barchart-tip-head">{cat.label}</div>
      <ul className="nd-barchart-tip-list">
        {series.map((s, i) => (
          <li className="nd-barchart-tip-row" key={s.key}>
            <span className="nd-barchart-swatch" {...(s.scheme ? { 'data-scheme': s.scheme } : {})} aria-hidden="true" />
            <span className="nd-barchart-tip-label">{s.label}</span>
            <span className="nd-barchart-tip-value">{formatValue(cat.values[i] ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div
      ref={ref}
      className={['nd-barchart', `o-${orientation}`].join(' ')}
      style={{ ['--nd-barchart-size' as string]: `${size}px`, ...style }}
    >
      {!labelHidden && (
        <div className="nd-barchart-head" id={id}>
          {label}
        </div>
      )}
      {legend}
      <div className="nd-barchart-body" role="img" aria-label={label} {...(labelHidden ? {} : { 'aria-labelledby': id })}>
        {/* the value axis — a tick label at every gridline, positioned to sit on its line */}
        <div className="nd-barchart-axis" aria-hidden="true">
          {lines.map((f) => (
            <span className="nd-barchart-tick" key={f} style={at(f)}>
              {formatValue(f * ceiling)}
            </span>
          ))}
        </div>
        <div className="nd-barchart-plot">
          <div className="nd-barchart-grid" aria-hidden="true">
            {lines.map((f) => (
              <div className="nd-barchart-gridline" key={f} style={at(f)} />
            ))}
          </div>
          {target && (
            <div className="nd-barchart-target" style={at(clamp01(target.value / ceiling))} aria-hidden="true">
              {target.label && <span className="nd-barchart-target-label">{target.label}</span>}
            </div>
          )}
          <div className="nd-barchart-cats">
            {data.map((cat, ci) =>
              stacked ? (
                /* one segmented bar per category — the series ARE the segments, the length is the total */
                <div className="nd-barchart-group" key={ci}>
                  <div className="nd-barchart-col" style={lengthOf(totals[ci])}>
                    <Bar
                      orientation={vertical ? 'vertical' : 'horizontal'}
                      size="fill"
                      segments={series.map((s, si) => ({ amount: cat.values[si] ?? 0, active: true, scheme: s.scheme }))}
                      {...(onBarClick
                        ? { onSegmentClick: (si: number) => onBarClick({ categoryIndex: ci, category: cat.label, seriesIndex: si, series: series[si], value: cat.values[si] ?? 0 }) }
                        : {})}
                      {...(selectedBar !== undefined
                        ? { selectedSegments: !!selectedBar && selectedBar.categoryIndex === ci ? [selectedBar.seriesIndex] : [] }
                        : {})}
                      {...(tooltip ? { tooltip: tipFor(cat), tooltipSide: 'top' } : {})}
                      label={`${cat.label}: ${formatValue(totals[ci])}`}
                    >
                      {cat.content}
                    </Bar>
                  </div>
                </div>
              ) : (
                <div className="nd-barchart-group" key={ci}>
                  {series.map((s, si) => {
                    const v = cat.values[si] ?? 0
                    return (
                      <div className="nd-barchart-col" key={s.key} style={lengthOf(v)}>
                        <Bar
                          orientation={vertical ? 'vertical' : 'horizontal'}
                          size="fill"
                          segments={segments}
                          value={1}
                          max={1}
                          {...(s.scheme ? { scheme: s.scheme } : {})}
                          {...(onBarClick
                            ? { onClick: () => onBarClick({ categoryIndex: ci, category: cat.label, seriesIndex: si, series: s, value: v }) }
                            : {})}
                          {...(selectedBar !== undefined
                            ? { selected: !!selectedBar && selectedBar.categoryIndex === ci && selectedBar.seriesIndex === si }
                            : {})}
                          {...(tooltip ? { tooltip: tipFor(cat), tooltipSide: 'top' } : {})}
                          label={`${cat.label}, ${s.label}: ${formatValue(v)}`}
                        >
                          {/* only a one-bar-per-category chart has a single bar to host the slot */}
                          {series.length === 1 ? cat.content : undefined}
                        </Bar>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        </div>
        {/* the category labels — one per group, aligned to the plot's cross axis */}
        <div className="nd-barchart-cats-labels" aria-hidden="true">
          {data.map((cat, ci) => (
            <span className="nd-barchart-cat-label" key={ci}>
              {cat.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
})
