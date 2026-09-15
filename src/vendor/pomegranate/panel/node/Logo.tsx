/*
  Logo — the personal brand mark, as a real interactive control.

  TWO VARIANTS, ONE COLOUR CHAIN. `logo` draws the full lockup (flower +
  "dsarantidis"); `favicon` draws the flower alone, at logoPaths.ts's own
  MARK_VIEWBOX/MARK_PATHS — the SAME canonical glyph the browser tab and the
  Storybook favicon already use, never a second copy. Neither variant carries
  a fill of its own: the svg is `currentColor`, and `color` is what states.

  STATES ARE NOT PAINTED HERE, THEY ARE READ. `--accent`, `--accent-hover`,
  `--accent-pressed` and `--accent-disabled` already exist — generate-css.mjs
  emits all four for every scheme and mode from the `interaction/*` token
  collection (see design-tokens/docs/knowledge-theming.md). So a brand mark
  answering hover, pressed and disabled costs nothing to add: it is the same
  four CSS custom properties Button.tsx's v-primary already draws from, not a
  new decision about what "pressed" means for a logo.

  A BUTTON, BECAUSE IT IS ONE. This mark is clickable (home, a modal, whatever
  the caller wires it to) and needs :hover/:active/:disabled for free — an
  anchor or a bare span would mean hand-rolling all three. `aria-label` sits on
  the button, the one thing announced; the svg is `aria-hidden`, exactly the
  Icon.tsx split between an interactive control and the glyph inside it.
*/
import type { ButtonHTMLAttributes } from 'react'
import { MARK_VIEWBOX, MARK_PATHS } from '../../brand/logoPaths'
import { DSARANTIDIS_WORDMARK_VIEWBOX, DSARANTIDIS_WORDMARK_PATHS, DSARANTIDIS_MARK_PATHS } from '../../brand/dsarantidisWordmark'

export type LogoVariant = 'logo' | 'favicon'

const ART: Record<LogoVariant, { viewBox: string; paths: readonly string[] }> = {
  logo: { viewBox: DSARANTIDIS_WORDMARK_VIEWBOX, paths: [...DSARANTIDIS_MARK_PATHS, ...DSARANTIDIS_WORDMARK_PATHS] },
  favicon: { viewBox: MARK_VIEWBOX, paths: MARK_PATHS },
}

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'type'> & {
  variant?: LogoVariant
  /** the drawn height in px; width follows the artwork's own aspect ratio */
  size?: number
  /** the accessible name — the button announces this, the svg stays decorative */
  label?: string
  type?: 'button' | 'submit' | 'reset'
}

export function Logo({ variant = 'logo', size = 22, label = 'dsarantidis', disabled, type = 'button', ...rest }: Props) {
  const { viewBox, paths } = ART[variant]
  const [, , vbW, vbH] = viewBox.split(' ').map(Number)
  const height = size
  const width = Math.round((size * vbW) / vbH)

  return (
    <button type={type} className={['nd-logo', `v-${variant}`].join(' ')} aria-label={label} title={label} disabled={disabled} {...rest}>
      <svg width={width} height={height} viewBox={viewBox} fill="currentColor" aria-hidden focusable="false">
        {paths.map((d) => (
          <path key={d.slice(0, 24)} d={d} />
        ))}
      </svg>
    </button>
  )
}
