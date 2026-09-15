/*
  ChipGroupContext — the two facts a Chip cannot know about itself.

  IT IS ITS OWN FILE ON PURPOSE. `Chip` reads this and `ChipGroup` provides it, so putting it
  in either one makes the pair import each other in a circle. The kit has split a file for
  this reason before (Swatch left TextField; CheckboxMark left Checkbox) and the rule that
  came out of it holds here: when two components need one value, the value gets a home of its
  own rather than a winner.

  WHAT TRAVELS, AND WHY IT CANNOT BE A PROP INSTEAD:

    name · single   whether a chip is a CHECKBOX or a RADIO is a property of the SET, not of
                    the member — the same argument `Radio` makes about its own group. A
                    caller who had to pass `type="radio"` to each chip could pass it to only
                    some of them, and a half-radio group enforces nothing.
    size            so one row cannot come out ragged when a member forgets the rung.
    willDismiss     the group has to know a removal is coming BEFORE the child unmounts,
                    because afterwards there is nothing left to ask where focus was.

  A chip outside a group reads `null` and is complete on its own — the context adds a set, it
  is never required to make a member work.
*/
import { createContext } from 'react'
import type { ButtonSize } from './Button'

export type ChipGroupCtx = {
  /** the shared radio name — present only when the group is single-select */
  name?: string
  /** single-select: members render as radios and the platform enforces exactly-one */
  single?: boolean
  /** the rung the whole set stands on */
  size?: ButtonSize
  /** called by a dismissible member BEFORE its handler runs, so the group can note where
      focus was standing while the element still exists */
  willDismiss?: () => void
}

export const ChipGroupContext = createContext<ChipGroupCtx | null>(null)
