/*
  FilterChip — a chip that opens a flyout of choices and holds the ones you pick.

  This is the mode the old `Chip` could only half-build: its disclosure "rendered the trigger half
  only" because the kit had no floating surface to hang the choices on. `Popover` is that surface
  now (top-layer, anchored to a ref), so the whole control lives here — a trigger that reads as the
  filter, and a `role="listbox"` of options that IS the filter's value.

  ONE FLAG, TWO SHAPES. `multiple` switches the listbox between a single-select picker (pick one,
  it closes, the chip shows the chosen label) and a multi-select checklist (tick several, it stays
  open, the chip shows the count). The value is controlled; the OPEN state is the chip's own,
  because "opens a flyout" is the whole reason this component exists.

  THE CHOICES ARE THE VALUE, NOT ACTIONS. That is why it is a listbox and not a `Menu`: a menu item
  DOES a thing and the menu closes; an option HOLDS a state you can see and change. `aria-selected`
  carries it, and the flyout announces "2 of 5, selected".
*/
import type { CSSProperties, ReactNode } from 'react'
import { fieldLevel, useLevel } from './LevelContext'
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { Popover } from './Popover'
import { ConfirmIcon } from './Icon'
import {
  ChipFace,
  chipClass,
  chipShared,
  useResolvedChipSize,
  type ChipSize,
  type ChipVariant,
} from './chipShell'

export type FilterChoice = {
  value: string
  label: ReactNode
  disabled?: boolean
}

type FilterChipCommon = {
  /** the filter's name — the resting label, e.g. "Status". One line, truncates. */
  children: ReactNode
  /** the flyout's accessible name; falls back to `label`, then to the chip's text */
  label?: string
  /** the options the flyout offers */
  choices: FilterChoice[]
  size?: ChipSize
  variant?: ChipVariant
  leading?: ReactNode
  disabled?: boolean
  loading?: boolean
  style?: CSSProperties
  title?: string
}

type FilterChipSingle = FilterChipCommon & {
  multiple?: false
  value: string | null
  onValueChange: (next: string | null) => void
}

type FilterChipMultiple = FilterChipCommon & {
  multiple: true
  value: string[]
  onValueChange: (next: string[]) => void
}

export type FilterChipProps = FilterChipSingle | FilterChipMultiple

export const FilterChip = forwardRef<HTMLButtonElement, FilterChipProps>(function FilterChip(props, ref) {
  const { children, label, choices, size, variant = 'tonal', leading, disabled = false, loading = false, style, title } = props
  const multiple = props.multiple === true

  const resolved = useResolvedChipSize(size)
  const dead = disabled || loading

  const btnRef = useRef<HTMLButtonElement>(null)
  useImperativeHandle(ref, () => btnRef.current as HTMLButtonElement, [])
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0) // the option arrow keys land on

  // which choices are selected — a Set for either shape, read from the controlled value
  const selectedValues = multiple ? new Set(props.value) : new Set(props.value != null ? [props.value] : [])
  const selectedCount = selectedValues.size

  // the resting indicator: the chosen label (single) or the count (multiple, when any)
  const chosen = !multiple && props.value != null ? choices.find((c) => c.value === props.value)?.label : undefined
  const indicator: ReactNode = multiple
    ? selectedCount > 0
      ? <span className="nd-chip-count">{selectedCount}</span>
      : undefined
    : chosen

  const enabledIdx = choices.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0)

  // when it opens, land the active option on the first selected one, else the first enabled one
  useEffect(() => {
    if (!open) return
    const firstSel = choices.findIndex((c) => selectedValues.has(c.value) && !c.disabled)
    setActive(firstSel >= 0 ? firstSel : enabledIdx[0] ?? 0)
    // focus the list so arrow keys work immediately
    const t = requestAnimationFrame(() => listRef.current?.focus())
    return () => cancelAnimationFrame(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const commit = (c: FilterChoice) => {
    if (c.disabled) return
    if (multiple) {
      const next = new Set(props.value)
      next.has(c.value) ? next.delete(c.value) : next.add(c.value)
      ;(props as FilterChipMultiple).onValueChange([...next])
      // a checklist stays open — you are picking a set
    } else {
      const single = props as FilterChipSingle
      const next = single.value === c.value ? null : c.value // click the chosen one to clear
      single.onValueChange(next)
      setOpen(false)
      btnRef.current?.focus()
    }
  }

  const moveActive = (dir: 1 | -1 | 'home' | 'end') => {
    if (!enabledIdx.length) return
    if (dir === 'home') return setActive(enabledIdx[0])
    if (dir === 'end') return setActive(enabledIdx[enabledIdx.length - 1])
    const pos = enabledIdx.indexOf(active)
    const nextPos = pos < 0 ? 0 : (pos + dir + enabledIdx.length) % enabledIdx.length
    setActive(enabledIdx[nextPos])
  }

  const onListKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); return moveActive(1)
      case 'ArrowUp': e.preventDefault(); return moveActive(-1)
      case 'Home': e.preventDefault(); return moveActive('home')
      case 'End': e.preventDefault(); return moveActive('end')
      case 'Enter':
      case ' ': e.preventDefault(); return choices[active] && commit(choices[active])
      // Escape and outside-press are Popover's
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        {...chipShared({
          className: chipClass({ variant, size: resolved, on: selectedCount > 0, disabled, loading }),
          style,
          title: title ?? label,
          loading,
        })}
        /* a chip lifts one rung off its ground, like every other control — LevelContext.tsx */
        data-fill={fieldLevel(useLevel())}
        type="button"
        disabled={dead}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <ChipFace loading={loading} leading={leading} trailing={indicator} caret>
          {children}
        </ChipFace>
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btnRef} side="bottom" align="start" size="small" id={listId}>
        <div
          ref={listRef}
          className="nd-chip-menu" data-level={4}
          role="listbox"
          aria-label={label ?? (typeof children === 'string' ? children : undefined)}
          aria-multiselectable={multiple || undefined}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
        >
          {choices.map((c, i) => {
            const sel = selectedValues.has(c.value)
            return (
              <div
                key={c.value}
                role="option"
                aria-selected={sel}
                aria-disabled={c.disabled || undefined}
                className={['nd-chip-menu-option', i === active ? 'is-active' : '', sel ? 'is-selected' : ''].filter(Boolean).join(' ')}
                onClick={() => commit(c)}
                onMouseEnter={() => !c.disabled && setActive(i)}
              >
                <span className="nd-chip-menu-check" aria-hidden>{sel && <ConfirmIcon />}</span>
                <span className="nd-chip-menu-label">{c.label}</span>
              </div>
            )
          })}
        </div>
      </Popover>
    </>
  )
})
