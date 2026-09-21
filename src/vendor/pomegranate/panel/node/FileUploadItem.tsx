/*
  FileUploadItem — one file, and everything that has happened to it.

  IT IS A COMPOSITION, NOT A DRAWING. The row is `ListItem`, the bar is `ProgressBar`, the ✕
  is `Button`, the glyph is the catalogue's. This file adds no paint of its own beyond the
  block that holds the two together, and that is the point: a file row hand-rolled at a call
  site picks its own two type sizes and drifts from the rows beside it — the exact defect the
  field family spent an audit removing. `ProgressBar`'s own stories have used "Uploading the
  mark" as their worked example since it shipped, including the failed case; this is that
  example, made a component.

  THE STATE IS DERIVED, AND SO THERE IS NO `status` PROP. What a caller knows is an amount
  and possibly a reason it stopped; the ending follows from those without being told twice:

    error present            → failed
    progress at or past max  → done
    otherwise                → active

  A `status` prop beside `progress` is two props that can disagree about one fact, and the
  disagreement always ships eventually — a bar sitting at 100% announcing "uploading".
  Removability derives the same way: an item handed `onRemove` has a ✕, and one that is not
  cannot be told it is removable.

  A FAILURE WITH NO AMOUNT DRAWS A FULL FAILED BAR, which is ProgressBar's own construction
  (`value={100} state="failed"`) and not an invention here: a file the server refused on
  sight never had an amount, and an empty red track reads as "0% done" rather than "stopped".

  THERE IS NO INDETERMINATE MODE, deliberately. ProgressBar expresses "we don't know" by
  omitting `value`, and this component COULD pass that through — but it would need a second
  way to say "in flight" that is not a number, and every shape for that is either a mode prop
  (banned) or a null-means-something rule (worse). No consumer has asked for it. The kit's
  named-consumer rule says a capability arrives with the flow that needs it, so when one
  does, the honest addition is a union arm here and `value={undefined}` passed down — not a
  boolean bolted on now.
*/
import type { CSSProperties, ReactNode } from 'react'
import { Button, type ButtonSize } from './Button'
import { DismissIcon, FileIcon, ImageIcon, TextIcon } from './Icon'
import { ListItem } from './ListItem'
import { ProgressBar } from './ProgressBar'
import { useFileUploadList } from './FileUploadListContext'

/*
  THE SIZE, IN THE UNITS A FILE MANAGER USES. Decimal rather than binary — macOS, Windows
  and every browser's own download shelf report a 1,500,000-byte file as 1.5 MB, and a kit
  that says 1.4 MiB beside them is correct and unrecognisable.

  IT SHOWS A DECIMAL ONLY WHERE ONE SAYS SOMETHING. Bytes are whole, and a fraction that
  came out as zero is dropped — "240.0 KB" and "976.6 bytes" are both noise, and the first of
  those is what the first draft printed. What survives is the digit a person actually compares
  against a limit: 18.4 KB, 41.2 MB, and a plain 92 KB where there was nothing to say.
*/
const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'] as const

export function formatFileSize(bytes: number): string {
  /* "1 bytes" was on screen before this line existed — the singular is the only irregular
     form in the ladder, since no other unit is ever reached with a value of exactly one */
  if (bytes < 1000) {
    const whole = Math.round(bytes)
    return `${whole} ${whole === 1 ? 'byte' : UNITS[0]}`
  }
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value.toFixed(1).replace(/\.0$/, '')} ${UNITS[unit]}`
}

export type FileUploadItemProps = {
  /*
    THE FILE'S NAME, WHICH IS ALSO THE ROW'S NAME — and the name every control inside the
    row borrows. A ✕ labelled "Remove" in a list of six is six identical buttons to a screen
    reader; "Remove mark.svg" is the one the person meant.
  */
  name: string
  /*
    HOW BIG THE FILE IS, IN BYTES — and it is `bytes` rather than `size` because in this kit
    `size` is the RUNG, on every component that has one. The collision was real rather than
    theoretical: this component shipped with `size` meaning bytes, so adding the ladder every
    other component carries was a type error, which is the compiler reporting a naming defect
    it could see and a reader could not. `bytes` also says the unit, which `size` never did.

    Absent draws no subtitle — a caller who has not measured it yet must not be made to invent
    a number.
  */
  bytes?: number
  /*
    THE MIME TYPE, USED FOR ONE THING: which glyph fronts the row. The kind table already
    draws a picture and a note; anything else takes the blank sheet. It is not a validation
    input — `FileUpload` owns that, before an item exists.
  */
  type?: string
  /** the amount uploaded so far, against `max`. Its presence is what draws the bar */
  progress?: number
  /** what `progress` is measured against. 100 (a percentage) unless the caller counts bytes */
  max?: number
  /*
    WHY IT STOPPED, IN WORDS. The bar turning red is a second signal and never the only one
    (WCAG 1.4.1, and 3.3.1 for the reason in text) — which is why this is a string rather
    than a boolean: there is no way to say "failed" here without saying why.
  */
  error?: string
  /*
    THE ROW'S RUNG, AND IT IS ONE PROP FOR TWO PARTS. `ListItem` and `ProgressBar` each carry
    the same three names, so the row passes what it is given to both rather than translating —
    a table mapping a `medium` row to a `small` bar would be inventing a second scale, which is
    the argument `CARD_PART_SIZE` makes for a card's parts and which holds here for the same
    reason. The type follows: microcopy / body-s / body-l, `ListItem`'s own ladder.

    IT IS ALIASED (§25), not restated. `ButtonSize` is the ladder `ListItem` itself stands on;
    a fresh `'small' | 'medium' | 'large'` here would be a fourth copy of three words that look
    identical until the day one of them moves.

    SIBLINGS AGREE. A list of rows shares one rung — the caller spreads it, exactly as it
    spreads `CARD_PART_SIZE` to a card's parts, and for the reason stated there: a context that
    silently rewrote a member's size would make an explicit `size` on that member a lie.
  */
  size?: ButtonSize
  /** hand it a remover and it has a ✕; hand it none and it cannot be told it is removable */
  onRemove?: () => void
  /*
    REPLACES THE DERIVED GLYPH — a thumbnail of the picture, an Avatar, a Spinner while the
    row is still resolving. `leading` and not `icon`: six components against two settled that
    vocabulary (§25), and the logical name survives a right-to-left document where `left`
    does not. `FileUpload`'s own slot is the same word for the same reason.
  */
  leading?: ReactNode
  /** placement only — margin and grid position belong to the list that holds the row */
  style?: CSSProperties
}

/*
  GLYPH BY TYPE, AND THE CHAIN ENDS IN A DRAWING RATHER THAN A HOLE. COMPOSITION-RULES:
  content is a chain, not a choice — a caller passes `icon` or the type decides or the blank
  sheet stands in, and every link resolves to something drawable. A file whose type the
  browser could not determine arrives as `''`, which is the common case for a drag from some
  archive tools, and it lands on the sheet like every other unknown.
*/
function glyphFor(type?: string) {
  if (type?.startsWith('image/')) return <ImageIcon size="100%" />
  if (type?.startsWith('text/')) return <TextIcon size="100%" />
  return <FileIcon size="100%" />
}

export function FileUploadItem({
  name,
  bytes,
  type,
  progress,
  max = 100,
  error,
  size = 'small',
  onRemove,
  leading,
  style,
}: FileUploadItemProps) {
  const { willRemove } = useFileUploadList()

  const failed = error != null
  /* a refusal that never had an amount fills the track rather than leaving it empty */
  const value = progress ?? (failed ? max : undefined)
  const showBar = value != null
  const state = failed ? 'failed' : value != null && value >= max ? 'done' : 'active'

  return (
    <div className={`nd-uploaditem s-${size}`} style={style}>
      <ListItem
        size={size}
        title={name}
        /* the reason displaces the size, because a person reading a failed row is not
           reading its bytes; the size returns the moment the error is cleared */
        subtitle={error ?? (bytes != null ? formatFileSize(bytes) : undefined)}
        leading={<span className="nd-uploaditem-glyph">{leading ?? glyphFor(type)}</span>}
        trailing={
          onRemove && (
            <Button
              variant="ghost"
              kind="icon-button"
              /* 24 — `spacing.group.target.minimum` itself, which is what Button's `small`
                 IS. A control that only has to be hittable does not grow with the row. */
              size="small"
              /* the row is the surface; a control standing on someone else's surface does
                 not frost it a second time */
              glass={false}
              label={`Remove ${name}`}
              leading={<DismissIcon />}
              onClick={() => {
                /* noted while this button is still in the DOM — by the time the list has
                   re-rendered without it, `document.activeElement` is `<body>` and the
                   index it was standing on is unrecoverable */
                willRemove()
                onRemove()
              }}
            />
          )
        }
        readOnly
      />
      {showBar && (
        /*
          THE BAR IS NAMED AND THE NAME IS HIDDEN. The row above it already says the file's
          name in text, so drawing it twice would announce the row twice; leaving the bar
          unnamed would announce a percentage of nothing. Hidden-and-present is the same
          construction Checkbox, Radio and Switch use for their labels.
        */
        <ProgressBar
          label={`Uploading ${name}`}
          labelHidden
          value={value}
          max={max}
          state={state}
          size={size}
        />
      )}
    </div>
  )
}
