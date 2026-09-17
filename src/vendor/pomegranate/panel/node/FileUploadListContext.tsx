/*
  FileUploadListContext — the one value the set and its members both need, given a home of
  its own rather than a winner.

  `FileUploadList` owns focus after a removal (ACCESS-RULES: "focus after a removal is the
  set's job, decided before the child unmounts — by then `document.activeElement` is
  `<body>`"), and `FileUploadItem` owns the ✕ that starts one. Neither can hold the value:
  the list cannot see the button, and the item cannot know what comes after it.

  It is a separate module for the reason COMPOSITION-RULES C.2 gives and `ChipGroupContext`
  already demonstrated — a context declared inside the set means every member imports the
  set, and the set imports every member. Circular by construction.

  THE MEMBER IS USABLE WITHOUT THE SET. `willRemove` defaults to a no-op, so a
  `FileUploadItem` rendered on its own — in a story, in a caller's own layout — removes
  itself and simply does not restore focus, rather than throwing. What it loses is exactly
  what the set was there to provide, which is the honest failure mode.
*/
import { createContext, useContext } from 'react'

export type FileUploadListValue = {
  /** called by a member on its way into its own `onRemove`, while it is still in the DOM */
  willRemove: () => void
}

export const FileUploadListContext = createContext<FileUploadListValue>({ willRemove: () => {} })

export const useFileUploadList = () => useContext(FileUploadListContext)
