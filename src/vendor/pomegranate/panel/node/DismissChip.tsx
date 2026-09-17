/*
  DismissChip — a chip you remove by pressing it. The WHOLE chip is the target.

  The ✕ is not a control: it is the affordance, drawn in an icon button's clothes and
  `aria-hidden`, exactly what the kit's law says a slot must be. Nothing here nests a control in
  a control, so nothing can double-fire — the edge Tag's two-target dismiss lives with and this
  component was split out to avoid. One button, one action: `onDismiss`.
*/
import { forwardRef, useContext } from 'react'
import { fieldLevel, useLevel } from './LevelContext'
import { ChipGroupContext } from './ChipGroupContext'
import { ChipFace, chipClass, chipShared, useResolvedChipSize, type ChipBaseProps } from './chipShell'

export type DismissChipProps = ChipBaseProps & {
  /** remove me — the press acts on the whole chip, and the ✕ only draws the affordance */
  onDismiss: () => void
}

export const DismissChip = forwardRef<HTMLButtonElement, DismissChipProps>(function DismissChip(
  { children, label, size, variant = 'tonal', leading, trailing, disabled = false, loading = false, style, title, onDismiss },
  ref,
) {
  const group = useContext(ChipGroupContext)
  const resolved = useResolvedChipSize(size)
  const dead = disabled || loading
  return (
    <button
      ref={ref}
      {...chipShared({
        className: chipClass({ variant, size: resolved, disabled, loading, dismiss: true }),
        style,
        title: title ?? label,
        loading,
      })}
      /* a chip lifts one rung off its ground, like every other control — LevelContext.tsx */
      data-fill={fieldLevel(useLevel())}
      type="button"
      disabled={dead}
      aria-label={label}
      onClick={() => {
        // let the group record focus before this chip unmounts, then remove
        group?.willDismiss?.()
        onDismiss()
      }}
    >
      <ChipFace loading={loading} leading={leading} trailing={trailing} dismiss>
        {children}
      </ChipFace>
    </button>
  )
})
