/*
  ToggleChip — a two-state chip, chosen or not, and the state is the chip's own.

  A REAL checkbox (or a radio, inside a single-select ChipGroup) sits transparent on top of the
  drawing, exactly as Checkbox and SegmentedControl do it: the keyboard, the focus ring and the
  announcement are the platform's, and only the paint is ours. Inside a `select="single"` group
  the inputs are radios sharing a name, so the platform enforces exactly-one and gives the set one
  tab stop and arrow keys.

  `primary` IS FORBIDDEN. `selected` fills with the accent, which is what "chosen" means
  everywhere in this kit; a `primary` chip is ALREADY that fill at rest, so a primary toggle would
  look chosen while unchosen and identical once chosen — state carried in nothing at all. The type
  refuses the pairing rather than the CSS patching around it.

  `readOnly` LIVES HERE ALONE. A read-only value is a real one — a sentence about a VALUE — where a
  dismissal is an act, and an act you may not perform is `disabled`. So the family offers `readOnly`
  on the toggle and nowhere else.
*/
import { forwardRef, useContext } from 'react'
import { fieldLevel, useLevel } from './LevelContext'
import { ChipGroupContext } from './ChipGroupContext'
import {
  ChipFace,
  chipClass,
  chipShared,
  useResolvedChipSize,
  type ChipBaseProps,
  type ChipVariant,
} from './chipShell'

export type ToggleChipProps = Omit<ChipBaseProps, 'variant'> & {
  /** the resting material — `primary` is refused, see the file header */
  variant?: Exclude<ChipVariant, 'primary'>
  selected: boolean
  onChange: (next: boolean) => void
  /** SETTLED, NOT UNAVAILABLE — keeps focus and announcement, refuses only the change */
  readOnly?: boolean
}

export const ToggleChip = forwardRef<HTMLLabelElement, ToggleChipProps>(function ToggleChip(
  {
    children,
    label,
    size,
    variant = 'tonal',
    leading,
    trailing,
    disabled = false,
    loading = false,
    style,
    title,
    selected,
    onChange,
    readOnly = false,
  },
  ref,
) {
  const group = useContext(ChipGroupContext)
  const resolved = useResolvedChipSize(size)
  const dead = disabled || loading
  return (
    <label
      ref={ref}
      {...chipShared({
        className: chipClass({ variant, size: resolved, on: selected, disabled, readOnly, loading }),
        style,
        title: title ?? label,
        loading,
      })}
      /* a chip lifts one rung off its ground, like every other control — LevelContext.tsx */
      data-fill={fieldLevel(useLevel())}
      aria-disabled={disabled || loading || undefined}
    >
      <input
        className="nd-chip-input"
        /* inside a single-select group these are RADIOS, so the platform enforces exactly-one
           and gives the set one tab stop and arrow keys */
        type={group?.single ? 'radio' : 'checkbox'}
        name={group?.name}
        checked={selected}
        disabled={dead}
        aria-label={label}
        aria-readonly={readOnly && !disabled ? true : undefined}
        /* read-only keeps the focus and the announcement and refuses only the change */
        onClick={readOnly ? (e) => e.preventDefault() : undefined}
        onChange={(e) => !readOnly && onChange(e.target.checked)}
      />
      <ChipFace loading={loading} leading={leading} trailing={trailing}>
        {children}
      </ChipFace>
    </label>
  )
})
