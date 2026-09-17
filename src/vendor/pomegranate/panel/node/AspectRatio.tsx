/*
  AspectRatio — the layout stops depending on the asset.

  THE PROBLEM IS VISIBLE IN THIS APP TODAY. Both image sites let the upload decide the shape of
  the thing around it: `.cp-image img` is `max-height: 200px`, `.un-img` is `height: auto` with a
  460px cap. Drop in a wide photo and the panel is short; drop in a tall one and it is not. A node
  card's height jumps with whatever someone happened to upload, which is the one thing a card in a
  grid must not do.

  RESEARCHED THROUGH ASTRYX, WHICH SHIPS ONE — the first peer component this kit has been able to
  compare against rather than fill a gap for. Three of its four props are taken: `fit`, children
  positioned to fill, and the rule that the CHILD should not repeat `width`/`height`/`object-fit`
  because the container owns them.

  WHAT IS NOT TAKEN IS ITS `ratio`, AND THAT IS THE WHOLE POINT. Astryx's is a free number —
  `ratio={16/9}`, or 3.7 if you like. That is a utility. A design system's job here is to say
  which shapes exist, so this one takes NAMES and nothing else. A caller who needs 3.7 does not
  need this component; they need a div.

  THE SET IS NOT INVENTED FROM GENERAL PRACTICE. Three of the five are already in this codebase —
  `1/1` three times, `16/10` and `4/5` twice each in the site's own stylesheet — so the scale is
  mostly a record of what this design language already does, plus the two obvious gaps.

  NO ELLIPSE, THOUGH ASTRYX HAS ONE. A circular image in this kit is an `Avatar`: it owns the
  shape AND the fallback chain — src to fallbackSrc to icon to initials — which a clipped box
  cannot do. One drawing for one idea, and the cross-reference instead of the duplicate.

  AND THE RATIOS BELONG IN THE FOUNDATION, NOT HERE. The foundation ships twenty groups and none
  of them is a ratio scale, so this is a compromise with its own task: keep them in ONE exported
  map, so moving them is a one-line change rather than a hunt.
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef } from 'react'

/*
  THE SCALE, IN ONE PLACE. Names rather than numbers is what makes this a standard instead of a
  utility — `wide` is a decision the system has made, `16/10` is a number a caller typed.
*/
export const ASPECT_RATIOS = {
  /** 1/1 — a thumbnail, a swatch, a tile. Already this codebase's most-used ratio */
  square: '1 / 1',
  /** 4/3 — the classic photographic landscape, and the gap between square and wide */
  landscape: '4 / 3',
  /** 16/10 — the site's own media ratio, twice over. Wider than 4/3, calmer than 16/9 */
  wide: '16 / 10',
  /** 21/9 — a banner or a hero strip, where the image is a band rather than a picture */
  ultrawide: '21 / 9',
  /** 4/5 — the site's portrait ratio. Taller than square without becoming a column */
  portrait: '4 / 5',
} as const

export type AspectRatioName = keyof typeof ASPECT_RATIOS

/*
  `cover` IS THE DEFAULT BECAUSE `contain` GIVES THE LAYOUT BACK. A contained image letterboxes
  inside the box — the box keeps its shape, but the picture inside it is whatever shape the asset
  was, which is most of the problem this component exists to solve. `contain` stays available for
  the case where cropping would lose something that matters: a diagram, a screenshot, a logo.
*/
export type AspectFit = 'cover' | 'contain'

export type AspectRatioProps = {
  ratio: AspectRatioName
  fit?: AspectFit
  /*
    THE CHILD FILLS THE BOX AND DOES NOT SIZE ITSELF. Astryx says the same thing in its own docs
    and it is worth repeating: a child that carries its own `width`/`height`/`object-fit` is
    fighting the container for the one job the container has.
  */
  children: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export const AspectRatio = forwardRef<HTMLDivElement, AspectRatioProps>(function AspectRatio(
  { ratio, fit = 'cover', children, style },
  ref
) {
  return (
    <div
      ref={ref}
      className={['nd-aspect', `f-${fit}`].join(' ')}
      /* the media well is its own recessed island — rung 1, as the stylesheet used to name */
      data-level={1}
      /*
        THE RATIO REACHES CSS AS A PROPERTY rather than as a class per name. Five classes would
        work and would put the numbers in two files; one variable keeps the scale in the map above,
        which is the thing that has to move to the foundation later.
      */
      style={{ ['--nd-aspect' as string]: ASPECT_RATIOS[ratio], ...style }}
      data-ratio={ratio}
    >
      {children}
    </div>
  )
})
