/*
  buttons.tsx — mounts the plugin UI's live components into the template's
  <span id="…-mount"> placeholders, and defines the window.Pom* bridges the
  template's vanilla JS drives them through.

  DESIGN SYSTEM: this is the Pomegranate (disarantidis_ReactJS) build. Every
  component below is the vendored Pomegranate kit (src/vendor/pomegranate),
  no other kit anywhere. The window.Pom* bridge names and every rendered
  element `id` are preserved verbatim, so ui.template.html's vanilla script keeps
  working unchanged against the same contract.

  THE ONE ADAPTATION WORTH NAMING: Pomegranate's TextField/TextArea are
  controlled (value/onChange) with an internal useId(), while the template drives
  every git-config field UNCONTROLLED, by getElementById(id).value. So the text
  inputs are rendered by thin adapters (PomTextField/PomTextArea) that paint the
  DS's own field markup/classes (.nd-textfield-wrap / .nd-textfield, from
  node.css) around a plain uncontrolled <input>/<textarea> carrying the caller's
  id. The field still paints from the DS; the template still reads it by id.
*/
import { useState, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { Button } from '../vendor/pomegranate/panel/node/Button';
import { SegmentedControl } from '../vendor/pomegranate/panel/node/SegmentedControl';
import { Checkbox } from '../vendor/pomegranate/panel/node/Checkbox';
import { DropDownSelect } from '../vendor/pomegranate/panel/node/DropDownSelect';
import { Combobox } from '../vendor/pomegranate/panel/node/Combobox';
import { Dialog } from '../vendor/pomegranate/panel/node/Dialog';
import { Toast } from '../vendor/pomegranate/panel/node/Toast';
import { Alert } from '../vendor/pomegranate/panel/node/Alert';
import { Skeleton } from '../vendor/pomegranate/panel/node/Skeleton';
import { Tag } from '../vendor/pomegranate/panel/node/Tag';
import { Table } from '../vendor/pomegranate/panel/node/Table';
import { SelectableCard } from '../vendor/pomegranate/panel/node/SelectableCard';
import { FileUploadItem } from '../vendor/pomegranate/panel/node/FileUploadItem';
import { Spinner } from '../vendor/pomegranate/panel/node/Spinner';
import { fieldLevel, useLevel, LevelContext, type Level } from '../vendor/pomegranate/panel/node/LevelContext';

/* The plugin GROUND is level 2 — bumped from 1 (the ladder's actual
   darkest/base rung) so the plugin's own page background reads one step
   more elevated, on request. <html data-level="2"> (ui.template.html) is
   the DOM half of this same fact — the two values must move together, or
   a control mounted here would compute a fill for a ground it isn't
   actually standing on. Every mounted subtree is wrapped in a LevelContext
   provider at the ground so the kit's components compute their fill ONE
   rung above it (a field on the L2 ground is L3), per the composition
   rule in docs/knowledge-levels.md. */
const GROUND: Level = 2;
/* Historically "one rung above the ground" and the band .provider-card /
   .export-panel stood on directly (data-level="2" in the markup, back
   when GROUND was 1) — both have since moved to data-level="4" (bumped
   for contrast against the page; see their own comments), but the
   fields/buttons mounted INSIDE them (gl-token, push-btn, etc.) still
   pass this unchanged constant, and that's still correct: fieldLevel maps
   grounds 2 AND 4 to the same field rung (3) by design — the ladder's own
   top-rung clamp, see LevelContext.tsx — so nothing inside those cards
   needed to change when either the cards or GROUND moved. Kept under its
   original name/value since every one of those call sites already
   expects it; it means "the rung fields inside a level-2-or-4 card
   compute at" now, not literally "the level those cards paint at". */
const CARD_LEVEL: Level = 2;
/* The ladder's highest/most elevated rung — .json-download-card,
   .export-panel and .provider-card all carry data-level="4" directly in
   the markup now (bumped from 2 for contrast against the page — see
   .json-download-card's own HTML comment). Only needed here for the two
   skeletons that stand in for those cards while loading: recessLevel(2)
   and recessLevel(4) are NOT the same rung (unlike fieldLevel, which maps
   both 2 and 4 to 3 by design — see LevelContext.tsx), so Skeleton's own
   `data-fill={recessLevel(useLevel())}` would compute the wrong rung for
   bars mounted on what's actually a level-4 island if this weren't
   threaded through. Every ORDINARY field/button mounted inside those same
   cards keeps using CARD_LEVEL unchanged and is still correct — Button
   and TextField both compute their own fill via fieldLevel, where the
   2-vs-4 distinction doesn't exist. */
const TOP_CARD_LEVEL: Level = 4;
/* ONE RUNG IN FROM A CARD — the ground of anything mounted inside a subcard:
   .provider-subcard, and .json-download-card.is-sub inside the repo card.

   CARD_LEVEL means "the ground is 2-or-4, so compute at 3", which is right in
   a card and wrong in a card inside one: a control mounted that way on a
   level-3 subcard painted rgb(37,37,37) onto rgb(37,37,37) and vanished — it
   read as bare text, which is what a ghost button looks like. Ground 3 lifts
   to 4 and is visible against the surface it actually stands on. */
const SUBCARD_LEVEL: Level = 3;

import '../vendor/pomegranate/styles/tokens.css';
import '../vendor/pomegranate/styles/fonts.css';
import '../vendor/pomegranate/styles/node.css';

/* ── local inline icons (currentColor, so they take the control's ink) ─────── */
const svg = (d: string, opts?: { fill?: boolean; fillRule?: 'evenodd'; viewBox?: string }) => (size: number) => {
  // `size` is the icon's HEIGHT; the width follows from the viewBox's own
  // aspect ratio rather than being forced square. Every Lucide-shaped glyph
  // here is 24x24, so for them width === size exactly as before — the ratio
  // only does anything for a mark that isn't square, which is why the option
  // exists at all (IconVariables below is the brand's own 448:512 glyph;
  // squaring it would squash it).
  const vb = opts?.viewBox ?? '0 0 24 24';
  const parts = vb.split(/\s+/).map(Number);
  const w = Math.round((size * parts[2]) / parts[3] * 100) / 100;
  return opts?.fill ? (
    <svg width={w} height={size} viewBox={vb} fill="currentColor" aria-hidden="true">
      <path d={d} fillRule={opts.fillRule} clipRule={opts.fillRule} />
    </svg>
  ) : (
    <svg width={w} height={size} viewBox={vb} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
};
const IconArrowLeft = svg('M19 12H5M12 19l-7-7 7-7');
/*
  An arrow travelling RIGHT, INTO a container open on the side it enters.

  It used to be an arrow coming down into a tray, described here as the mirror
  of IconDownload's arrow leaving one. On paper that pairs; on screen it does
  not. Both are a downward arrow of the same weight at the same size, and in
  the header they sit close enough together that the import button simply
  reads as a second download button — which is the one thing it must not do,
  since one sends tokens out of Figma and the other brings them in.

  A different AXIS is what separates them, not a different arrowhead. Down
  means "out of here" everywhere else in this UI; sideways-into-a-box is the
  same glyph a login control uses, and it means arriving.
*/
const IconImport = svg('M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M4 12h11m0 0l-4-4m4 4l-4 4');
const IconDownload = svg('M12 3v11m0 0l-4-4m4 4l4-4M5 20h14');
/* Two arrows, one each way — the ordinary compare/exchange glyph.
   Deliberately NOT IconImport, which this button wore while the action was
   called "read": that arrow-into-a-container means "bring a document in",
   which is what the empty state's Import button does and is exactly the
   wrong promise here. Nothing is brought in by a comparison. */
const IconCompare = svg('M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4');
/* Two sheets, the back one offset — the ordinary copy glyph. IconCheck is
   already declared a few lines below, beside the gear. */
const IconCopy = svg('M9 9h9a2 2 0 012 2v9a2 2 0 01-2 2H9a2 2 0 01-2-2v-9a2 2 0 012-2M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1');
// The exact gear glyph the Settings page's own header uses (ui.template.html,
// the decorative .git-logo icon) — same path, so "Settings" reads as one
// glyph everywhere instead of this button showing sliders and the page it
// opens showing a gear.
const IconSettings = svg(
  'm14 1 .5 2.75a.992.992 0 0 0 1.448.71l.102-.06 2.3-1.6 2.85 2.85-1.6 2.3c-.378.567-.087 1.312.537 1.52l.113.03L23 10v4l-2.75.5a.992.992 0 0 0-.71 1.448l.06.102 1.6 2.3-2.85 2.85-2.3-1.6c-.567-.378-1.312-.087-1.52.537l-.03.113L14 23h-4l-.5-2.75c-.142-.661-.863-1.01-1.448-.71l-.102.06-2.3 1.6-2.85-2.85 1.6-2.3c.378-.567.087-1.312-.537-1.52l-.113-.03L1 14v-4l2.75-.5a.992.992 0 0 0 .71-1.448L4.4 7.95l-1.6-2.3L5.65 2.8l2.3 1.6c.567.378 1.312.087 1.52-.537l.03-.113L10 1zm-1.25 1.5h-1.5l-.3 1.5c-.2 1.2-1.25 2.05-2.45 2.05-.437 0-.875-.115-1.246-.345L5.8 4.7 4.75 5.75l.9 1.3c.464.65.584 1.472.318 2.227L5.9 9.45c-.279.743-.902 1.27-1.67 1.462l-.18.038-1.55.3v1.5l1.55.25c.85.15 1.5.7 1.85 1.5a2.43 2.43 0 0 1-.149 2.247l-.101.153-.9 1.3 1.05 1.05 1.3-.9c.4-.3.9-.45 1.4-.45 1.145 0 2.154.774 2.418 1.889l.332 1.711h1.5l.3-1.55c.2-1.2 1.25-2.05 2.45-2.05.438 0 .875.115 1.245.345L18.2 19.25l1.05-1.05-.9-1.3c-.5-.7-.55-1.6-.25-2.3.279-.743.902-1.27 1.67-1.462l.18-.038 1.55-.3v-1.5l-1.55-.3c-.85-.15-1.5-.7-1.85-1.5a2.43 2.43 0 0 1 .149-2.247l.101-.153.9-1.3-1.05-1.05-1.3.9c-.4.3-.9.45-1.4.45a2.474 2.474 0 0 1-2.418-1.889zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6',
  { fill: true, fillRule: 'evenodd' },
);
const IconCheck = svg('M20 6L9 17l-5-5');
const IconFolder = svg('M3 7a2 2 0 012-2h3.5l2 2H19a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z');
/* Lucide's "file-text", the same document glyph the Json file card's own title
   carries — one shape for "a file" everywhere in this UI. */
const IconFile = svg('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8');
const IconAdd = svg('M12 5v14M5 12h14');
const IconSearch = svg('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4.5-4.5');
/* An arrow out of a tray — "send this up there". Distinct from IconSync's two
   arrows, which mean "go and read it again": one writes, the other does not. */
const IconUpload = svg('M12 16V4 M7 9l5-5 5 5 M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2');
/* Two arrows chasing each other — "go and ask the repo again". Not the plain
   circular arrow, which reads as undo as often as it reads as refresh. */
const IconSync = svg('M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.5-4 M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.5 4 M20 4v5h-5 M4 20v-5h5');
// Every remove/delete action in this file uses this, not the minus or × it
// used to — a trash bin reads as "remove" on sight; a minus/× also reads as
// "collapse" / "dismiss", which is what those glyphs mean everywhere else in
// the kit (SegmentedControl, Dialog's own close). One shape per meaning.
const IconTrash = svg('M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6');
// Theme toggle pair. The icon shown is the mode a click would SWITCH TO
// (sun while dark is active, moon while light is active) so it reads
// together with the button's own "Switch to light/dark mode" label,
// rather than restating the mode already on screen.
const IconSun = svg('M12 2v2 M12 20v2 M4.93 4.93 6.34 6.34 M19.07 19.07 17.66 17.66 M2 12h2 M20 12h2 M4.93 19.07 6.34 17.66 M19.07 4.93 17.66 6.34 M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0');
const IconMoon = svg('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z');
// Same two brand marks as .provider-logo-badge in ui.template.html (the
// GitLab/GitHub headings on the connection cards below) — identical paths,
// so the mark reading "GitLab" here is the same tanuki reading "GitLab"
// two rows down, not a lookalike.
const IconGitLab = svg('M23.955 13.587l-1.342-4.135-2.664-8.189c-.135-.423-.73-.423-.867 0L16.418 9.45H7.582L4.919 1.263C4.783.84 4.185.84 4.05 1.264L1.386 9.45.044 13.587c-.121.375.014.789.331 1.023L12 23.054l11.625-8.443c.318-.235.453-.647.33-1.024', { fill: true });
const IconGitHub = svg('M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z', { fill: true });
// The Closure brand's own variables glyph (Pomegranate Identity, Figma node
// 16:31) — a hexagon ring with a centred dot. Same artwork as the main
// screen's empty state (.empty-state-icon in ui.template.html), so the mark
// that says "variables" when there are none is the same one that labels them
// when there are.
//
// It led the collections card's TITLE until that title turned out to be the
// Figma file's name, which is not a set of variables; it rides the token
// count on the same row now, which is. IconFigma below took the title.
//
// A filled path, not a stroked Lucide glyph, and not square — hence the
// viewBox option on svg() above.
const IconVariables = svg('M224.291 0C228.861 3.11883 238.191 8.06017 243.27 10.9668L281.556 32.8584L392.028 95.9863L428.185 116.635C434.503 120.242 441.916 124.242 448.033 128.062C448.483 148.142 448.103 169.751 448.101 189.924L448.105 306.543L448.103 360.293L448.098 374.702C448.098 377.135 448.205 381.697 447.82 383.935C443.788 386.807 433.849 392.125 429.188 394.787L392.193 415.928L272.538 484.298L239.216 503.332L229.285 509.01C228.22 509.625 225.181 511.308 224.288 512H223.83C222.29 510.83 217.99 508.542 216.113 507.475L201.5 499.152L151.188 470.4L52.6142 414.065C35.5567 404.318 17.3488 393.465 0.17279 384.202C-0.146659 380.552 0.074087 372.922 0.0770869 369.082L0.0966182 339.25V245.088L0.0917353 165.016L0.07904 140.786C0.07729 137.155 -0.113577 130.988 0.271423 127.627C2.4837 126.682 7.26641 123.797 9.47064 122.538L26.4013 112.864L82.288 80.9268L176.742 26.9512L207.661 9.27637C212.712 6.38948 218.963 3.05347 223.806 0H224.291ZM121.38 132.478L84.4013 153.616C78.0818 157.23 70.2297 161.424 64.2382 165.293C63.7863 169.694 64.0934 181.281 64.0966 186.091L64.0986 227.669L64.0976 306.69C64.0973 319.825 63.8929 333.585 64.1054 346.67C72.8009 352.04 82.9489 357.555 91.8798 362.66L142.331 391.513L195.479 421.912C198.771 423.795 222.196 437.655 224.516 438.027C228.588 435.367 234.108 432.405 238.408 429.947L262.876 415.965L342.681 370.327L368.863 355.367C373.798 352.547 379.263 349.577 384.023 346.582C384.308 334.062 384.093 320.717 384.093 308.125L384.098 237.584V190.074C384.098 182.797 384.408 172.467 384.013 165.405C379.773 162.667 374.738 159.937 370.296 157.402L348.313 144.837L279.016 105.205L241.575 83.8037C238.682 82.1443 225.577 74.3711 223.738 73.959L121.38 132.478ZM220.128 192.146C255.353 189.98 285.681 216.747 287.908 251.97C290.136 287.192 263.42 317.565 228.2 319.853C192.897 322.145 162.434 295.35 160.202 260.043C157.97 224.736 184.816 194.318 220.128 192.146Z', { fill: true, viewBox: '0 0 448.253 512' });

/*
  THE FIGMA MARK, outline weight — drawn from the node this was taken from
  (file 0ZdPQU4nErWe4ow95W1mKT, node 22:6).

  It leads the collections card, whose title is the FIGMA FILE'S NAME. The
  variables glyph that used to sit there was naming the wrong thing: the words
  beside it are "Untitled", or "Sarantidis Foundations" — a file, not a set of
  variables. The variables mark moved to the token count tag on the same row,
  where what it labels really is the variables.

  GEOMETRY, NOT TRACING. The mark is five shapes on a 2x3 grid of squares: two
  half-pills making the top row, a half-pill and a circle making the middle,
  and a flat-topped circle at the bottom left. Every corner radius is half a
  cell, so with a cell of 7 the whole mark is 14 by 21 — the 2:3 the logo has
  — centred in a 16x24 box with one unit of margin for the stroke.

  Each piece is CLOSED (Z) on purpose. The closing edge is the vertical stem
  down the middle, and without it the top row has no divider — which is the
  one line that makes the mark read as an F rather than as a stack of pills.
*/
const IconFigma = svg(
  'M8 1.5 H4.5 A3.5 3.5 0 0 0 4.5 8.5 H8 Z' +
  'M8 1.5 H11.5 A3.5 3.5 0 0 1 11.5 8.5 H8 Z' +
  'M8 8.5 H4.5 A3.5 3.5 0 0 0 4.5 15.5 H8 Z' +
  'M15 12 A3.5 3.5 0 1 1 8 12 A3.5 3.5 0 1 1 15 12 Z' +
  'M8 15.5 H4.5 A3.5 3.5 0 1 0 8 19 Z',
  { viewBox: '0 0 16 24' },
);

/*
  THE TWO SERVICES' OWN MARKS, filled, 24-square — the same paths the repo
  card's inline SVGs carry in ui.template.html. Two copies of one shape is a
  thing to avoid in general; here the template's are static markup in a
  non-React header and these are needed inside a React table, and the
  alternative (mounting a React root per table cell) costs more than the
  duplication. If either ever changes, both change.
*/
const IconGithub = svg('M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z', { fill: true });
const IconGitlab = svg('M23.955 13.587l-1.342-4.135-2.664-8.189c-.135-.423-.73-.423-.867 0L16.418 9.45H7.582L4.919 1.263C4.783.84 4.185.84 4.05 1.264L1.386 9.45.044 13.587c-.121.375.014.789.331 1.023L12 23.054l11.625-8.443c.318-.235.453-.647.33-1.024', { fill: true });

/*
  WHAT KIND OF TOKEN A ROW IS, AS A GLYPH.

  WHY THESE ARE DRAWN HERE AND NOT TAKEN FROM THE KIT. Pomegranate binds 32
  icons in icons.generated.ts, and not one of the six variable types has a
  proper entry: the nearest are `colour` (a brush) and `coreRamp` (a swatch
  stack) for colour, and `text` (a document) for string — pictures of adjacent
  ideas, not of these. The right drawings DO exist in icons.inventory.ts, the
  full 5,130-glyph upstream set, but that file says in its own header that
  nothing in the kit may import it: the supported route is to bind a name
  through `npm run icons`, which regenerates the kit's own set. That is a
  change to src/vendor/pomegranate, which is not ours to make.

  So the paths are lifted verbatim from the inventory's own entries — same
  Tabler 24/outline drawings, same stroke weight the kit is drawn at — and
  rendered through this file's own svg(). Each one names the upstream glyph it
  is, so binding them properly later is a rename rather than a redraw.

  THE SIX ARE FIGMA'S OWN VARIABLE TYPES, plus the two composites these files
  actually contain (typography, shadow), because a token whose type has no
  glyph gets no column and the reader has to go and work out why.
*/
/* tabler: alert-triangle — the one mark on this page that means "look at
   this", as opposed to "this is what is there". */
const IconWarning = svg('M12 9v4M12 17h.01M10.24 3.957l-8.422 14.06a1.989 1.989 0 0 0 1.7 2.983h16.845a1.989 1.989 0 0 0 1.7 -2.983l-8.422 -14.06a1.989 1.989 0 0 0 -3.4 0');

const IconTypeColor = svg('M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0');        /* tabler: palette */
const IconTypeNumber = svg('M5 9l14 0M5 15l14 0M11 4l-4 16M17 4l-4 16');          /* tabler: hash */
const IconTypeString = svg('M6 4l12 0M12 4l0 16');      /* tabler: letter-t */
const IconTypeBoolean = svg('M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M2 12a6 6 0 0 1 6 -6h8a6 6 0 0 1 6 6a6 6 0 0 1 -6 6h-8a6 6 0 0 1 -6 -6');  /* tabler: toggle-left */
const IconTypeTiming = svg('M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0M12 7v5l3 3');         /* tabler: clock */
const IconTypeEasing = svg('M17 4a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -2M3 18a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -2M17 5c-6.627 0 -12 5.373 -12 12'); /* tabler: vector-spline */
const IconTypeTypography = svg('M4 20l3 0M14 20l7 0M6.9 15l6.9 0M10.2 6.3l5.8 13.7M5 20l6 -16l2 0l7 16');/* tabler: typography */
const IconTypeShadow = svg('M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M13 12h5M13 15h4M13 18h1M13 9h4M13 6h1');        /* tabler: shadow */

/*
  TYPE NAME -> GLYPH. Both vocabularies, because both arrive: DTCG's own
  ($type: color, dimension, fontFamily, duration, cubicBezier) and Tokens
  Studio's legacy one (type: spacing, sizing, borderRadius, text, boxShadow).
  A name with no entry draws nothing rather than a wrong picture.
*/
const TYPE_ICON: Record<string, (size: number) => ReactNode> = {
  color: IconTypeColor,
  number: IconTypeNumber,
  dimension: IconTypeNumber, spacing: IconTypeNumber, sizing: IconTypeNumber,
  borderRadius: IconTypeNumber, borderWidth: IconTypeNumber, opacity: IconTypeNumber,
  fontSize: IconTypeNumber, lineHeight: IconTypeNumber, letterSpacing: IconTypeNumber,
  paragraphSpacing: IconTypeNumber, paragraphIndent: IconTypeNumber, fontWeight: IconTypeNumber,
  string: IconTypeString, text: IconTypeString, fontFamily: IconTypeString,
  fontFamilies: IconTypeString, textCase: IconTypeString, textDecoration: IconTypeString,
  boolean: IconTypeBoolean,
  duration: IconTypeTiming, timing: IconTypeTiming,
  cubicBezier: IconTypeEasing, easing: IconTypeEasing,
  /* Kept for a document that DECLARES one of these on a token that is not a
     bag — the comparison itself no longer produces them as categories, since
     a style is judged by the types of its parts (see compare()'s composite
     branch). */
  typography: IconTypeTypography,
  shadow: IconTypeShadow, boxShadow: IconTypeShadow,
  /* Parts of more than one kind moved. Deliberately iconless: there is no one
     picture for "a colour and a number", and a wrong one would be worse than
     none. */
};

/* ── size / variant maps (mount prop shape → Pomegranate) ───────────────────── */
function btnVariant(v?: string): 'primary' | 'tonal' | 'ghost' {
  if (v === 'filled') return 'primary';
  if (v === 'ghost') return 'ghost';
  return 'tonal'; // 'tonal' | 'outline'
}
function btnSize(s?: string): 'small' | 'medium' | 'large' {
  return s === 'large' ? 'large' : s === 'medium' ? 'medium' : 'small';
}

/* ── mountOnce: render a component once into an existing node, synchronously ── */
function mountOnce(mountId: string, node: ReactNode, level: Level = GROUND) {
  const container = document.getElementById(mountId);
  if (!container) return;
  flushSync(() => createRoot(container).render(<LevelContext.Provider value={level}>{node}</LevelContext.Provider>));
}

/* ── field adapters: DS-painted, uncontrolled, carry the caller's id ───────── */
function PomTextField(props: any) {
  const {
    id, type = 'text', label, placeholder, size = 'small', readonly = false,
    defaultValue, value, icon, style, tabIndex, title, onInput, onBlur,
  } = props;
  /*
    UNCONTROLLED BY DEFAULT — every field in this app writes through
    setFieldValue()'s native-setter trick, which needs the input to own its
    own value. `value` opts one field out of that: the file name field's
    value lives on window.PomPrimaryFilename (it has to be readable
    synchronously mid-push), and an uncontrolled input would quietly ignore
    every programmatic set.

    onChange, not onInput, on the controlled path: React warns about a
    `value` with no `onChange` and, more to the point, refuses to let the
    input show a keystroke the state never came back with.
  */
  const controlled = value !== undefined;
  const wrapClass = ['nd-textfield-wrap', `s-${size}`, 'is-block', readonly ? 'is-readonly' : '']
    .filter(Boolean).join(' ');
  const fieldClass = ['nd-textfield', `s-${size}`, readonly ? 'is-readonly' : '']
    .filter(Boolean).join(' ');
  return (
    <span className={wrapClass} data-fill={fieldLevel(useLevel())} style={{ width: '100%', ...style }}>
      {icon && <span className="nd-textfield-leadbox" aria-hidden>{icon}</span>}
      {label && <label className="nd-textfield-float" htmlFor={id}>{label}</label>}
      <input
        className={fieldClass}
        id={id}
        type={type}
        {...(controlled ? { value: value } : { defaultValue: defaultValue })}
        placeholder={placeholder}
        readOnly={readonly}
        tabIndex={tabIndex}
        title={title}
        aria-readonly={readonly || undefined}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        {...(controlled
          ? { onChange: (e: any) => onInput?.((e.target as HTMLInputElement).value) }
          : { onInput: onInput ? (e: any) => onInput((e.target as HTMLInputElement).value) : undefined })}
        onBlur={onBlur ? (e) => onBlur((e.target as HTMLInputElement).value) : undefined}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </span>
  );
}

function PomTextArea(props: any) {
  const { id, label, placeholder, size = 'small', rows = 2, disabled = false, style } = props;
  return (
    <span className={['nd-textfield-wrap', `s-${size}`, 'is-multi', 'is-block', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
      data-fill={fieldLevel(useLevel())} style={{ width: '100%', ...style }}>
      {label && <label className="nd-textfield-float" htmlFor={id}>{label}</label>}
      <textarea
        className={['nd-textfield', `s-${size}`, 'is-multi', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
        id={id}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck
        onPointerDown={(e) => e.stopPropagation()}
      />
    </span>
  );
}

/* ── Pomegranate Button, from the prop bag the mounts pass ──────── */
function PomButton(props: any) {
  const {
    id, variant, size, label, destructive, icon, leftIcon, buttonLeftIcon,
    rightIcon, buttonRightIcon,
    disabled, loading, active, style, title, onClick, block, flex,
  } = props;
  const iconOnly = !!icon; // the icon-button bag carries `icon`; text buttons carry `label`
  const leading = iconOnly ? icon : (leftIcon ? buttonLeftIcon : undefined);
  /* Button has had a `trailing` slot all along — this is the same leftIcon /
     buttonLeftIcon pair on the other side, so a caller does not have to reach
     past PomButton to put a mark after a label. */
  const trailing = iconOnly ? undefined : (rightIcon ? buttonRightIcon : undefined);
  const extra: any = {};
  if (destructive) extra['data-scheme'] = 'error';
  extra.size = btnSize(size);
  return (
    <Button
      id={id}
      variant={btnVariant(variant)}
      shape={iconOnly ? 'square' : 'rect'}
      block={!!block}
      disabled={disabled}
      loading={loading}
      active={active}
      leading={leading}
      trailing={trailing}
      glass={iconOnly ? false : undefined}
      label={iconOnly ? (label ?? props['aria-label']) : undefined}
      title={title}
      onClick={onClick}
      style={{ ...(flex ? { flex } : null), ...style }}
      {...extra}
    >
      {iconOnly ? undefined : label}
    </Button>
  );
}

/* ── live button (push): disabled/loading/success/label change at runtime ──── */
type LiveHandle = {
  setDisabled: (v: boolean) => void; setLoading: (v: boolean) => void;
  setSuccess: (v: boolean) => void; setLabel: (v: string | null) => void;
  /* A hover string the LABEL cannot carry. Push needs one for the case where
     what it is about to overwrite is not the file named on screen — see
     pushWouldReplace() in ui.template.html. */
  setTitle: (v: string) => void;
};
function mountLiveButton(mountId: string, base: any, initial: any, level: Level = GROUND): LiveHandle {
  const container = document.getElementById(mountId);
  let set: (u: (s: any) => any) => void = () => {};
  function LiveButton() {
    const [s, setS] = useState(initial); set = setS;
    const extra: any = {};
    if (s.success) extra['data-scheme'] = 'success';
    return (
      <Button
        id={base.id}
        variant={btnVariant(base.variant)}
        size={btnSize(base.size)}
        block
        disabled={s.disabled}
        loading={s.loading}
        onClick={base.onClick}
        style={base.style}
        title={s.title || undefined}
        {...extra}
      >
        {s.label ?? base.label}
      </Button>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={level}><LiveButton /></LevelContext.Provider>));
  return {
    setDisabled: (disabled) => set((s) => ({ ...s, disabled })),
    setTitle: (title) => set((s) => ({ ...s, title })),
    setLoading: (loading) => set((s) => ({ ...s, loading })),
    setSuccess: (success) => set((s) => ({ ...s, success })),
    setLabel: (label) => set((s) => ({ ...s, label })),
  };
}

type LiveIconHandle = { setDisabled: (v: boolean) => void };
function mountLiveIconButton(mountId: string, base: any, initialDisabled: boolean, level: Level = GROUND): LiveIconHandle {
  const container = document.getElementById(mountId);
  let set: (v: boolean) => void = () => {};
  function View() {
    const [disabled, setD] = useState(initialDisabled); set = setD;
    return <PomButton {...base} disabled={disabled} />;
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={level}><View /></LevelContext.Provider>));
  return { setDisabled: (v) => set(v) };
}

// Icon-only button that swaps BOTH its glyph and its accessible name
// between two fixed states — 'add' (plain tonal, plus glyph) and 'remove'
// (tonal + destructive/error scheme, trash glyph) — rather than just a
// label like mountLiveButton's setLabel. Built for the Repository settings
// Add/Remove pills: same control, same position, the icon and its
// title/aria-label change in place instead of the row disappearing.
/* A button whose accessible name is rewritten from outside — everything
   else about it is fixed, the title is not. Kept separate from
   mountLiveToggleIconButton above, which swaps BOTH and between two fixed
   states; this one's title is an arbitrary string that is only known at
   runtime (a file path). title and aria-label move together on purpose: for
   an icon-only button they are the only name it has, and letting them drift
   would leave the tooltip and the screen reader describing different
   buttons. */
type LiveTitleHandle = { setTitle: (t: string) => void };
function mountLiveTitleButton(mountId: string, base: any, initialTitle: string, level: Level = GROUND): LiveTitleHandle {
  const container = document.getElementById(mountId);
  let set: (t: string) => void = () => {};
  function View() {
    const [title, setT] = useState(initialTitle); set = setT;
    /* aria-label deliberately carries MORE than the visible label — "Compare
       this file with the one in the repo" rather than "Compare". WCAG 2.5.3
       asks that the accessible name CONTAIN the visible one, which it does,
       so a voice user saying "click Compare" still matches. */
    return <PomButton {...base} title={title} aria-label={title} />;
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={level}><View /></LevelContext.Provider>));
  return { setTitle: (t) => set(t) };
}

/* A compact labelled button that can say it is busy. mountLiveButton also has
   loading, but it is `block` — full width — which is right for Push at the
   bottom of a card and wrong for a button sitting in a heading row beside a
   title. mountLiveTitleButton is the right shape and carries only a title. */
type LiveBusyHandle = { setLoading: (v: boolean) => void; setLabel: (v: string) => void };
function mountLiveBusyButton(mountId: string, base: any, title: string, level: Level = GROUND): LiveBusyHandle {
  const container = document.getElementById(mountId);
  let set: (u: (s: any) => any) => void = () => {};
  function View() {
    const [s, setS] = useState({ loading: false, label: base.label }); set = setS;
    /* aria-label stays the ACTION while the visible label becomes a time —
       "Synced 4m ago" says when, and a screen reader still needs to be told
       what pressing it does. */
    return <PomButton {...base} label={s.label} loading={s.loading} title={title} aria-label={title} />;
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={level}><View /></LevelContext.Provider>));
  return {
    setLoading: (loading) => set((s) => ({ ...s, loading })),
    setLabel: (label) => set((s) => ({ ...s, label })),
  };
}

type LiveToggleIconHandle = { setMode: (mode: 'add' | 'remove') => void };
function mountLiveToggleIconButton(
  mountId: string,
  base: any,
  addIcon: ReactNode,
  removeIcon: ReactNode,
  addTitle: string,
  removeTitle: string,
  initial: 'add' | 'remove',
  level: Level = GROUND,
): LiveToggleIconHandle {
  const container = document.getElementById(mountId);
  let set: (mode: 'add' | 'remove') => void = () => {};
  function View() {
    const [mode, setMode] = useState<'add' | 'remove'>(initial); set = setMode;
    const isAdd = mode === 'add';
    return (
      <PomButton
        {...base}
        icon={isAdd ? addIcon : removeIcon}
        destructive={!isAdd}
        title={isAdd ? addTitle : removeTitle}
        aria-label={isAdd ? addTitle : removeTitle}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={level}><View /></LevelContext.Provider>));
  return { setMode: (mode) => set(mode) };
}

type DisabledHandle = { setDisabled: (v: boolean) => void };
function mountLiveTextArea(mountId: string, base: any, initialDisabled: boolean, level: Level = GROUND): DisabledHandle {
  const container = document.getElementById(mountId);
  let set: (v: boolean) => void = () => {};
  function View() {
    const [disabled, setD] = useState(initialDisabled); set = setD;
    return <PomTextArea {...base} disabled={disabled} />;
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={level}><View /></LevelContext.Provider>));
  return { setDisabled: (v) => set(v) };
}

/* ── live dropdown (folder pickers) ────────────────────────────────────────── */
type DropdownHandle = { setItems: (items: any[], selectedValue: string) => void };
function mountLiveDropdown(mountId: string, base: any, onSelect: (v: string) => void, level: Level = GROUND): DropdownHandle {
  const container = document.getElementById(mountId);
  let set: (u: (s: any) => any) => void = () => {};
  function View() {
    const [s, setS] = useState<{ items: any[]; value: string }>({ items: [], value: '' });
    set = setS;
    const options = s.items.map((it) => ({
      value: it.value ?? it.label ?? it.primaryText ?? '',
      label: it.label ?? it.primaryText ?? it.value ?? '',
    }));
    return (
      <DropDownSelect
        label={base.label ?? 'Folder path'}
        size="small"
        block
        value={s.value}
        options={options.length ? options : [{ value: '', label: '—' }]}
        onChange={(v: string) => onSelect(v)}
        {...(base.icon ? { icon: base.icon } : null)}
        {...(base.style ? { style: base.style } : null)}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={level}><View /></LevelContext.Provider>));
  return { setItems: (items, value) => set(() => ({ items, value })) };
}

/* ── window.Pom* bridge shapes (types stripped by esbuild; kept for clarity) ─ */
type FolderListBridge = {
  render: (rows: { path: string; canEdit: boolean; inRepo?: boolean }[]) => void;
  onInput: ((idx: number, value: string) => void) | null;
  onBlur: ((idx: number, value: string) => void) | null;
  onRemove: ((idx: number) => void) | null;
  onCreate: ((idx: number) => void) | null;
};
type FolderSelectBridge = { setItems: (items: any[], selectedValue: string) => void; onChange: ((value: string) => void) | null };
// Only ever reaches window.PomOnboardingDialog.onConfirm now — this used to
// also be the Settings page's own Push destination control's value type
// (mountPushTargetControl, removed), where 'none' could never occur since
// that control only showed once both providers were already added. Here it
// still can: the onboarding dialog's "skip both" choice — Download alone is
// a complete, supported workflow, not an unfinished state to route past.
type PushTarget = 'gitlab' | 'github' | 'both' | 'none';
type ImportFileState = { name: string; bytes?: number; busy?: boolean; error?: string };
declare global {
  interface Window {
    PomImportApplyBtn: any;
    /* What the import would do, drawn as headings and tags rather than as a
       column of counts — see mountImportChanges. */
    PomImportChanges: { set: (d: any) => void };
    PomImportLevels: {
      set: (candidates: any[], applied: Record<string, Record<string, string>>, collections?: any[],
            groupCandidates?: any[], groupOrder?: string[]) => void;
      onToggle: ((group: string, depth: number, role: string) => void) | null;
      /* The SETS axis — 'modes' (one collection, a mode each) or 'separate'
         (a collection each). Distinct from onToggle, which moves a depth
         inside a token's path. */
      onGroupToggle: ((group: string, verdict: string) => void) | null;
    };
    PomImportQuestions: {
      set: (questions: any[]) => void;
      onAnswer: ((id: string, value: string) => void) | null;
    };
    PomImportFile: {
      /* null clears the row; bytes is optional because the size is only known
         when a real File was picked, and FileUploadItem draws no subtitle
         rather than making a caller invent a number. */
      set: (name: string | null, bytes?: number, opts?: { busy?: boolean; error?: string }) => void;
      onRemove: (() => void) | null;
    };
    PomButtons: { push: LiveHandle; download: LiveIconHandle };
    PomRepoReadBtn: LiveTitleHandle;
    PomCompareSides: {
      set: (next: { figma?: string; provider?: string; file?: string }) => void;
      setOptions: (names: string[]) => void;
      onPick: ((name: string) => void) | null;
    };
    /* Compare's folder picker — a closed list of the saved paths, fed and
       answered by the same chooseFolder() the push combobox uses. */
    PomCompareFolder: {
      setItems: (items: any[], selectedValue: string) => void;
      onChange: ((value: string) => void) | null;
    };
    PomGithubSyncBtn: LiveBusyHandle;
    PomGitlabSyncBtn: LiveBusyHandle;
    PomAddGitlabBtn: LiveToggleIconHandle;
    PomAddGithubBtn: LiveToggleIconHandle;
    PomExportMode: { onChange: ((index: number) => void) | null };
    PomToast: { show: (message: string, isError?: boolean) => void };
    PomFolderSelect: FolderComboBridge;
    PomGithubFolderSelect: FolderComboBridge;
    /* A dropdown, not a combobox — the import page reads, so there is nothing
       to type. Only the two members that page actually uses. */
    PomImportFolderSelect: {
      setItems: (items: any[], selectedValue: string) => void;
      onChange: ((value: string) => void) | null;
    };
    PomFolderNew: FolderComboBridge;
    PomGithubFolderNew: FolderComboBridge;
    PomFolderList: FolderListBridge;
    PomGithubFolderList: FolderListBridge;
    PomFigmaCardTag: { set: (value: string) => void; setTitle: (value: string) => void };
    PomCollectionsAccordion: {
      setTitle: (title: string) => void;
      setCollections: (collections: { name: string; count: number }[]) => void;
      setSummary: (tokensLabel: string) => void;
      /* Opened from the Figma card's header button, which is its own root. */
      open: () => void;
      close: () => void;
      /* The Delete-all control lives in this dialog now; the page owns what it
         does, the same way the level rows own their own toggles. */
      onClearVariables: (() => void) | null;
    };
    /* "Synced 4m ago" in the repo card's header — see mountRepoSyncTag. */
    PomRepoSyncTag: { set: (label: string) => void };
    PomJsonFileCard: { setSize: (sizeLabel: string) => void };
    /* The file name field, which is a plain TextField until the repo turns
       out to hold JSON files to choose from and a Combobox after that.
       `get` is synchronous and exact — it reads the value this bridge owns,
       not React state, because callers ask for it in the middle of building
       a push. */
    PomCompare: {
      /* One setter per state the page can be in, rather than one setter with
         a mode flag — the page cannot then be busy AND showing a report, which
         is the state three sibling containers taking turns produce. */
      setBusy: (label: string) => void;
      /* `provider` names the service the repo side is, so the table's own
         column header can wear its mark. Optional: a comparison can be shown
         without one, and then the column is just "Repo". */
      setSides: (figma: string, figmaDetail: string, repo: string, repoDetail: string,
                 provider?: 'github' | 'gitlab' | null,
                 /* How many tokens each side holds, as their own tags. Optional:
                    the busy state names the sides before it has counted. */
                 figmaCount?: string, repoCount?: string) => void;
      /* `actionLabel` puts a button in the warning. A refusal that names the
         fix and then makes you go and do it somewhere else is a worse version
         of one that just does it. */
      setProblem: (title: string, message: string, fix?: string, actionLabel?: string) => void;
      setReport: (report: any, copyText: string) => void;
      onAction: (() => void) | null;
    };
    /* The name the plugin writes AND the file it reads back — one combobox over
       whatever the chosen folder holds. It was a plain field beside a separate
       "File in the repo" picker; see mountPrimaryFilename for why that is one
       control now. */
    PomPrimaryFilename: {
      get: () => string;
      set: (value: string) => void;
      setOptions: (names: string[]) => void;
      onChange: ((value: string) => void) | null;
    };
    PomImportRepoWhere: { set: (rows: { provider: string; name: string; branch: string }[]) => void };
    PomImportRepoFile: {
      get: () => string;
      set: (value: string) => void;
      setOptions: (names: string[]) => void;
      onChange: ((value: string) => void) | null;
    };
    PomClosureWarning: {
      show: (title: string, groups: { ref: string; froms: string[] }[], more?: number, note?: string,
             copyText?: string) => void;
      hide: () => void;
    };
    PomCommitMessage: DisabledHandle;
    PomVersionTag: { setLabel: (label: string) => void };
    PomFolderDiscovery: {
      open: (provider: string, where: string, paths: string[], added: string[]) => void;
      onAdd: ((path: string) => void) | null;
    };
    PomFolderRemove: {
      open: (info: { provider: string; where: string; path: string;
                     files: string[]; dirs: string[] }) => void;
      close: () => void;
      fail: (message: string) => void;
      onConfirm: ((mode: string) => void) | null;
    };
    PomRemoveGithubDialog: { open: () => void; onConfirm: (() => void) | null };
    PomRemoveGitlabDialog: { open: () => void; onConfirm: (() => void) | null };
    PomClearTokenDialog: { open: (provider: 'gitlab' | 'github') => void; onConfirm: ((provider: 'gitlab' | 'github') => void) | null };
    PomClearVariablesDialog: {
      open: (summary: { collections: number; variables: number; names: string[]; fileName: string }) => void;
      onConfirm: (() => void) | null;
    };
    PomRepoTab: { onChange: ((value: 'gitlab' | 'github') => void) | null; setValue: (value: 'gitlab' | 'github') => void };
    PomMainProviderTab: { onChange: ((value: 'gitlab' | 'github') => void) | null; setValue: (value: 'gitlab' | 'github') => void };
    PomRepoMode: {
      onChange: ((value: 'push' | 'compare') => void) | null;
      setValue: (value: 'push' | 'compare') => void;
    };
    PomOutputFormat: { onChange: ((shape: string) => void) | null; setValue: (shape: string) => void; setHint: (hint: string) => void; setResolvedHint: (hint: string) => void };
    PomOnboardingDialog: { open: () => void; onConfirm: ((target: PushTarget) => void) | null };
  }
}

/* ── push + download ───────────────────────────────────────────────────────── */
window.PomImportApplyBtn = mountLiveButton(
  'import-apply-btn-mount',
  { id: 'import-apply-btn', variant: 'filled', size: 'large', label: 'Import into this file', block: true },
  { disabled: false, loading: false, success: false, label: null },
  CARD_LEVEL,
);

window.PomButtons = {
  push: mountLiveButton(
    'push-btn-mount',
    { id: 'push-btn', variant: 'filled', size: 'large', label: 'Push to GitLab', style: { width: '100%' } },
    { disabled: true, loading: false, success: false, label: null },
    CARD_LEVEL,
  ),
  /*
    LABELLED AGAIN, BECAUSE THE HEADER HAS THE ROOM THE FIELD ROW DID NOT.

    It was a glyph for as long as it shared a line with two fields in a 420px
    panel — the word cost 112px the fields needed more. It has not shared that
    line since it moved into the card's header, and the panel is 483 now, so
    the header carries a title, a size tag and this with room left: the reason
    for the glyph expired twice over and the label is the clearer control.

    leftIcon/buttonLeftIcon rather than `icon`, which is what tells PomButton
    this is NOT an icon button and stops it collapsing to shape="square" — the
    mark leads and the words follow.

    Still `filled`: it is the one thing this card DOES. `small`, not the
    `medium` that band-matches a small FIELD: it stands in a header beside a
    small Tag, and the rule is to match the band of the row you are in.

    It is in BOTH modes. Hiding it while comparing read the button as belonging
    to the repository; it does not — it saves the JSON just made out of the
    Figma file, which is one of the two things a comparison is about.
  */
  download: mountLiveIconButton(
    'download-btn-mount',
    { id: 'download-btn', variant: 'filled', size: 'small', leftIcon: true, buttonLeftIcon: IconDownload(16), label: 'Download JSON', title: 'Download JSON' },
    true,
    /* CARD_LEVEL: it stood on a level-3 subcard inside the repo card and stands
       on .json-file-card now, a card of its own at level 4. */
    CARD_LEVEL,
  ),
};

/* ── static buttons / icon buttons ─────────────────────────────────────────── */
function mountButton(mountId: string, props: any, level?: Level) { mountOnce(mountId, <PomButton {...props} />, level); }
function mountIconButton(mountId: string, props: any, level?: Level) { mountOnce(mountId, <PomButton {...props} />, level); }

/* These four stand BESIDE a small TextField (band 50: node-kit-test's
   ROW-RULES "medium IS a small field's box"), not beside another button —
   so they take Button's `medium` rung to band-match the field, not `small`
   (band 32), which is the row-mixing-bands defect ROW-RULES.md calls out. */
/* Offered under the saved list, and only while the repository holds paths that
   are not on it — see refreshFolderImportOffer(). It reopens the same dialog
   Sync opens the first time, which is the point: the first sync and the tenth
   answer the same question and should not have two different doors. */
/*
  MOUNTED ON THE SUB-CARD'S OWN RUNG, not the provider card's.

  It passed CARD_LEVEL like everything else in the provider card, which means
  "the ground is 2-or-4, so compute at 3" — and the .provider-subcard these two
  actually sit in is level 3, so they painted rgb(37,37,37) onto a surface that
  is rgb(37,37,37) and the tonal fill disappeared completely. It read as bare
  text, which is what a ghost button looks like. Its ground is 3, so its fill
  computes at 4 and is visible against the subcard it stands on.
*/
/* Declared with the other rungs, up beside CARD_LEVEL — Download reaches for
   it well above the line this used to sit on, and a const read before its own
   declaration is a ReferenceError rather than a fallback. */
mountButton('folder-import-mount', { id: 'folder-import-btn', variant: 'tonal', size: 'medium', block: true, label: 'Add Paths from Repo', leftIcon: true, buttonLeftIcon: IconFolder(16) }, SUBCARD_LEVEL);
mountButton('github-folder-import-mount', { id: 'github-folder-import-btn', variant: 'tonal', size: 'medium', block: true, label: 'Add Paths from Repo', leftIcon: true, buttonLeftIcon: IconFolder(16) }, SUBCARD_LEVEL);

mountIconButton('folder-add-btn-mount', { id: 'folder-add-btn', variant: 'outline', size: 'medium', title: 'Add folder path', 'aria-label': 'Add folder path', icon: IconAdd(16) }, CARD_LEVEL);
mountIconButton('github-folder-add-btn-mount', { id: 'github-folder-add-btn', variant: 'outline', size: 'medium', title: 'Add folder path', 'aria-label': 'Add folder path', icon: IconAdd(16) }, CARD_LEVEL);
mountIconButton('gl-clear-token-btn-mount', { id: 'gl-clear-token-btn', variant: 'tonal', destructive: true, size: 'medium', title: 'Clear GitLab token', 'aria-label': 'Clear GitLab token', icon: IconTrash(16) }, CARD_LEVEL);
mountIconButton('gh-clear-token-btn-mount', { id: 'gh-clear-token-btn', variant: 'tonal', destructive: true, size: 'medium', title: 'Clear GitHub token', 'aria-label': 'Clear GitHub token', icon: IconTrash(16) }, CARD_LEVEL);
/* The two "Add folder path (optional)" pills that used to mount here are
   gone with the row that held them (see the note where .target-row-empty's
   CSS used to live). They only ever jumped to the Settings page, which is
   where folder paths are managed — so the offer was a second door to a room
   that already had one, taking up a line on the card that now says what is
   actually in the repo. */
// Live (not one-shot mountButton) because this pill no longer disappears
// once a provider is added — it now stays put side by side with the other
// provider's, and just swaps its glyph Add(+) -> Remove(trash) in place
// (see updateProviderSectionVisibility() in ui.template.html, which calls
// .setMode() here instead of toggling the row's `hidden`).
window.PomAddGithubBtn = mountLiveToggleIconButton(
  'add-github-btn-mount',
  { id: 'add-github-btn', variant: 'tonal', size: 'small' },
  IconAdd(16), IconTrash(16),
  'Add GitHub', 'Remove GitHub',
  'add',
  CARD_LEVEL,
);
mountButton('remove-github-btn-mount', { id: 'remove-github-btn', variant: 'ghost', destructive: true, size: 'small', label: 'Remove GitHub' }, CARD_LEVEL);
window.PomAddGitlabBtn = mountLiveToggleIconButton(
  'add-gitlab-btn-mount',
  { id: 'add-gitlab-btn', variant: 'tonal', size: 'small' },
  IconAdd(16), IconTrash(16),
  'Add GitLab', 'Remove GitLab',
  'add',
  CARD_LEVEL,
);
mountButton('remove-gitlab-btn-mount', { id: 'remove-gitlab-btn', variant: 'ghost', destructive: true, size: 'small', label: 'Remove GitLab' }, CARD_LEVEL);
// tonal, not ghost — ghost paints `background: none` at rest (node.css's
// .nd-btn.v-ghost), so bumping this button's own data-level to sit above
// the header would have changed nothing visible; a ghost button has no
// fill for any level to apply to. tonal DOES paint one (--nd-field-fill),
// and Button already self-computes that fill one rung above whatever
// LevelContext it's mounted in (data-fill={fieldLevel(useLevel())} in
// Button.tsx) — so switching material alone, with no level change, is
// what actually gives this a fill distinct from the header behind it.
mountIconButton('back-btn-mount', { id: 'back-btn', variant: 'tonal', size: 'large', title: 'Back', 'aria-label': 'Back', icon: IconArrowLeft(24) });
mountIconButton('settings-btn-mount', { id: 'settings-btn', variant: 'ghost', size: 'large', title: 'Git settings', 'aria-label': 'Git settings', icon: IconSettings(24) });
/* Import lives in the header and not in the pipeline below it, because the
   pipeline reads in one direction — variables, to a file, to a repo — and an
   import runs the other way. Putting it in that column would make the arrow
   ambiguous. Ghost like the gear beside it: both are ways OUT of this screen,
   neither is the screen's own action. */
/* The header's import button is gone on purpose — see the note on the empty
   state's mount in ui.template.html. Nothing mounts into 'import-btn-mount'
   because that span no longer exists. */
mountIconButton('import-back-btn-mount', { id: 'import-back-btn', variant: 'tonal', size: 'large', title: 'Back', 'aria-label': 'Back', icon: IconArrowLeft(24) });
mountButton('import-copy-btn-mount', { id: 'import-copy-btn', variant: 'outline', size: 'small', label: 'Copy', block: true }, CARD_LEVEL);
mountButton('import-choose-btn-mount', { id: 'import-choose-btn', variant: 'filled', size: 'large', label: 'Choose a JSON file' });
/* The empty state is where an import is most obviously the right thing to do,
   so it gets its own way in rather than making someone find the header. */
/*
  leftIcon + buttonLeftIcon, NOT `icon`.

  PomButton reads `icon` as "this is an icon-button" (see iconOnly above), and
  from there the label stops being a label — it becomes the aria-label and the
  tooltip. So this button was passing a perfectly good "Import from JSON" and
  rendering a bare glyph with no text, which is what made it look like the
  header's icon-only twin instead of the one obvious action on an empty screen.
  The labelled form puts the icon in the leading slot and keeps the text.
*/
/*
  The repo card's own Compare button, top-right of that card's header on the
  main screen. Icon-only and tonal, matching the back/gear pills rather than
  the filled Download beside it: Download is the Json file card's own action
  and should stay the one filled control in that column, while this is a way
  of looking at the repository, in the corner the Json file card keeps its
  size tag in.

  IconCompare, and the word throughout is COMPARE. It wore IconImport while
  this was called "reading the repo", which was the wrong promise twice over:
  that glyph means "bring a document in" (it is the empty state's Import
  button), and nothing is brought in here. Reading the file is how the action
  works; the difference between the repo and the variables live in this
  document is what it is for.

  Live, for setTitle: the title names the exact path it compares against, and
  that path changes when the folder or the provider tab does (see
  refreshRepoReadRow()).
*/
/*
  LABELLED, NOT ICON-ONLY. Two arrows in a square is a fine reminder of an
  action you already know about and a poor way to find out one exists — and
  this is the only route to the Compare page.

  leftIcon + buttonLeftIcon, NOT `icon`: PomButton reads `icon` as "this is an
  icon button" and from there the label stops being a label, becoming the
  aria-label and the tooltip instead. That is exactly how this button rendered
  as a bare glyph while carrying a perfectly good name — the same trap the
  empty state's Import button fell into. The title still carries the full
  sentence, including which file and which branch.
*/
/*
  SYNC — go and ask this repository what is actually in it.

  The folder discovery has always run on opening this page, and has always
  failed silently: the folder field kept accepting anything typed, so a refused
  token, a misspelt repository and a repo that genuinely has no folders were
  three states with one appearance, which was none. This asks on purpose, says
  what came back, and is the only thing here that tells you the token works
  before a push does.

  A live handle because it is the slowest request the plugin makes — the whole
  tree of the repository — and a button that looks idle for four seconds reads
  as a button that did not take the click.
*/
window.PomGithubSyncBtn = mountLiveBusyButton(
  'gh-sync-btn-mount',
  { id: 'gh-sync-btn', variant: 'tonal', size: 'small',
    label: 'Sync', leftIcon: true, buttonLeftIcon: IconSync(16) },
  'Check the connection and find the folders in this repository',
  CARD_LEVEL,
);
window.PomGitlabSyncBtn = mountLiveBusyButton(
  'gl-sync-btn-mount',
  { id: 'gl-sync-btn', variant: 'tonal', size: 'small',
    label: 'Sync', leftIcon: true, buttonLeftIcon: IconSync(16) },
  'Check the connection and find the folders in this repository',
  CARD_LEVEL,
);

/*
  THE TWO SIDES OF THE COMPARISON, NAMED.

  Compare was a button on a wire between two cards, and it said what it would
  do without saying what to. A comparison has two operands and they are both
  knowable — this Figma file, and the file in the repository — so the card names
  them, each behind its own mark, and the button underneath acts on exactly the
  pair above it.

  Tags rather than text: they are two values of the same kind, read side by
  side, which is the shape a tag is for. Real ones, so they take their fill from
  the level they stand on (Tag.tsx) instead of being a span wearing a border.
*/
/* The caller filters, and an exact match is a choice rather than a filter — so
   the whole list stays open once a name is complete. Same rule as every other
   combo in this file. */
function q(s: { query: string; all: string[] }) {
  const t = s.query.trim().toLowerCase();
  return (t && s.all.indexOf(s.query.trim()) === -1
    ? s.all.filter((n) => n.toLowerCase().indexOf(t) !== -1)
    : s.all);
}

function mountCompareSides() {
  /* #compare-card-icon-mount went with the main screen's compare card. What is
     left of this mount is the Compare-mode file picker below. */
  const container = document.getElementById('compare-sides-mount');
  type S = { figma: string; provider: string; file: string; all: string[]; query: string };
  let state: S = { figma: '', provider: 'github', file: '', all: [], query: '' };
  let apply: ((s: S) => void) | null = null;
  let applyPick: ((s: S) => void) | null = null;
  const put = (next: Partial<S>) => {
    state = { ...state, ...next };
    apply?.(state); applyPick?.(state);
  };
  function View() {
    const [s, setS] = useState<S>(state);
    apply = setS;
    return (
      <span className="compare-card-sides">
        {/* small: they are the card's operands, not its subject — the title
            above them is that. Medium made two names read as loudly as the
            heading they sit under. */}
        <Tag variant="tonal" size="small" leading={IconFigma(12)}>
          {s.figma || 'This Figma file'}
        </Tag>
      </span>
    );
  }

  /*
    THE ONE SIDE THAT IS A CHOICE. The Figma document is whichever file this is
    running in — there is nothing to pick — but the repository holds however many
    JSONs the folder holds, and comparing against one you are not about to push
    to is a real thing to want: last week's export, a colleague's branch file,
    the one you are replacing. It defaults to the pushed name, so the ordinary
    case needs no decision at all.

    A DROPDOWN, NOT A COMBOBOX, and that is the whole difference between the
    two modes. Pushing, a name that is not in the repository is the ordinary
    case — you are about to create it — so the field has to accept typing.
    Comparing, there is nothing to invent: you can only read a file that is
    already up there, and a box that lets you type one that is not is offering
    a choice with no outcome. So this side is a closed list.

    It costs nothing to read, either: a Combobox spends about 90px on a clear
    ×, a rule and a chevron before it shows a character, which is most of what
    the panel has to give two fields.
  */
  function Pick() {
    const [s, setS] = useState<S>(state);
    applyPick = setS;
    return (
      <span className="compare-card-pick">
          <DropDownSelect
            /* THE SAME TWO WORDS AS PUSH. The modes ask for one address in two
               grammars — a combobox you may type into, a list you may only
               pick from — and calling the same half "File in the repo" on one
               side and "JSON name" on the other made them read as two
               different questions. The mode switch above already says which
               direction this is going. */
            label="JSON name"
            icon={IconFile(16)}
            size="small"
            block
            placeholder={s.all.length ? 'pick a file' : 'no JSON files here yet'}
            value={s.file}
            options={s.all.length
              ? s.all.map((o) => ({ value: o, label: o }))
              : [{ value: '', label: 'No JSON files in this folder yet' }]}
            onChange={(v: string) => { if (v) window.PomCompareSides.onPick?.(v); }}
          />
      </span>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  const pickEl = document.getElementById('compare-pick-mount');
  /* Both at CARD_LEVEL: the Figma tag stands on the compare card and the picker
     on .export-panel, and both of those are level 4. */
  if (pickEl) flushSync(() => createRoot(pickEl).render(<LevelContext.Provider value={CARD_LEVEL}><Pick /></LevelContext.Provider>));
  window.PomCompareSides = {
    set: (next) => {
      state = { ...state, ...next };
      /* The box follows the chosen file unless somebody is typing in it — the
         same rule the folder and name combos use, and for the same reason. */
      if (next.file !== undefined && !(container && container.contains(document.activeElement))) {
        state.query = next.file;
      }
      apply?.(state); applyPick?.(state);
    },
    setOptions: (names) => {
      state = { ...state, all: names || [] };
      apply?.(state); applyPick?.(state);
    },
    onPick: null,
  };
}
mountCompareSides();

/*
  THE FOLDER, THE SAME WAY, FOR THE SAME REASON.

  The push side's folder picker is a Combobox because a folder you are about
  to push into may not exist yet — typing one and pressing + is how it gets
  made. Reading, that cannot happen: a folder with nothing in it holds no file
  to compare against, and git has no empty directories anyway. So Compare gets
  the saved paths as a closed list and nothing to type into.

  It is fed and answered by exactly the same code as the combobox it replaces
  — see chooseFolder() in ui.template.html — so the two controls can never
  hold different folders.
*/
window.PomCompareFolder = mountLiveDropdown(
  'compare-folder-mount',
  { label: 'Folder path', icon: IconFolder(16) },
  (v: string) => window.PomCompareFolder?.onChange?.(v),
  CARD_LEVEL,
) as any;
window.PomCompareFolder.onChange = null;

window.PomRepoReadBtn = mountLiveTitleButton(
  'repo-read-btn-mount',
  /*
    ICON ONLY, IN THE TITLE ROW. The card is headed "Compare" now, so a button
    reading "Compare" underneath it said the word twice and took a row to do it.
    `icon` rather than leftIcon + label is what tells PomButton this is an icon
    button.

    AND NO `label`, deliberately. PomButton gives an icon button the accessible
    name `label ?? aria-label`, so a label here WINS over the aria-label
    mountLiveTitleButton writes — which is the live one naming both sides
    ("Compare this file with tokens/x.json in GitHub"). With the label gone the
    fuller sentence is the name, and it is the only name a button with no
    visible text has.
  */
  { id: 'repo-read-btn', variant: 'filled', size: 'large', block: true,
    label: 'Compare', leftIcon: true, buttonLeftIcon: IconCompare(20) },
  'Compare this file with the one in the repo',
  CARD_LEVEL,
);

/*
  One per provider, because an import comes from ONE repo and only the person
  knows which. The page hides whichever is not configured.

  IMPORT, not Compare. These were renamed to match the repo card's button on
  the main screen, on the grounds that they share a fetch — but they do not
  share a purpose: that one opens the Compare page, these hand the document to
  runImport and end at Apply, writing variables into Figma. And the case that
  makes the old label plainly wrong is the common one: a file being imported
  into usually has no variables yet, so there is nothing to compare with.
*/
/* The same button as "Choose a JSON file" above it — filled, large — because
   they are the same act from two sources, and one of them being a small tonal
   afterthought said the repo route was the lesser one. The provider's mark
   trails the label: the label already says which service, and the mark is what
   is recognised before the label is read. */
mountButton('import-pull-gitlab-mount', { id: 'import-pull-gitlab-btn', variant: 'filled', size: 'large', block: true, label: 'Import from GitLab', rightIcon: true, buttonRightIcon: IconGitlab(18) });
mountButton('import-pull-github-mount', { id: 'import-pull-github-btn', variant: 'filled', size: 'large', block: true, label: 'Import from GitHub', rightIcon: true, buttonRightIcon: IconGithub(18) });
/* A full-width "Remove JSON" lived here for a day. It said what the ✕ on the
   row above it already said, at ten times the size, in the place the file's own
   contents now occupy — see applyImportRepoMode. */

/*
  WHICH REPOSITORY, AS COMPONENTS RATHER THAN AS MARKUP.

  This was built by hand in ui.template.html — a cloned <svg> and two spans —
  which was fine while the branch was plain text. It is a Tag now, and a Tag is
  not a span with a border: it computes its own fill from the level it stands
  on (fieldLevel(useLevel()), see Tag.tsx) and writes data-fill for the
  stylesheet to resolve. Hand-writing .nd-tag would be copying a contract
  instead of using it, so the row moves here and the real component does it.
*/
function mountImportRepoWhere() {
  const container = document.getElementById('import-repo-where-mount');
  type Row = { provider: string; name: string; branch: string };
  let set: (rows: Row[]) => void = () => {};
  function View() {
    const [rows, setRows] = useState<Row[]>([]);
    set = setRows;
    if (!rows.length) return null;
    return (
      <span className="import-repo-where">
        {rows.map((r) => (
          <span className="import-repo-where-row" key={r.provider}>
            <span className="import-repo-mark">
              {r.provider === 'gitlab' ? IconGitlab(18) : IconGithub(18)}
            </span>
            <span className="import-repo-name">{r.name}</span>
            {r.branch ? <Tag variant="tonal" size="small">{r.branch}</Tag> : null}
          </span>
        ))}
      </span>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomImportRepoWhere = { set: (rows) => set(rows || []) };
}
mountImportRepoWhere();

mountButton('import-empty-btn-mount', { id: 'import-empty-btn', variant: 'tonal', size: 'medium', label: 'Import from JSON', leftIcon: true, buttonLeftIcon: IconImport(16) });

/* ── Settings header: light/dark theme toggle ────────────────────────────── */
// Flips <html>'s own data-theme attribute directly: every colour in this
// file already resolves through tokens.css's [data-theme='dark'] overrides
// (see the :root comment above .header-panel on why --app-bg/--app-text/etc
// are safe aliases here), so toggling that one attribute recolours the
// whole page live with no separate light-mode styling to maintain. Same
// large/tonal treatment as the back button beside it. Session-only, like
// Output format above it on this same page: nothing in this file persists
// a UI preference across reopens yet, so this doesn't either.
(function mountThemeToggle() {
  const container = document.getElementById('theme-toggle-btn-mount');
  function View() {
    const [dark, setDark] = useState(document.documentElement.getAttribute('data-theme') === 'dark');
    function toggle() {
      const next = !dark;
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
      setDark(next);
    }
    return (
      <PomButton
        id="theme-toggle-btn"
        variant="tonal"
        size="large"
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        icon={dark ? IconSun(24) : IconMoon(24)}
        onClick={toggle}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
})();

/* ── version tag (custom pill) ─────────────────────────────────────────────── */
function mountVersionTag(mountId: string) {
  const container = document.getElementById(mountId);
  let set: (v: string) => void = () => {};
  function View() {
    const [label, setLabel] = useState('');
    set = setLabel;
    if (!label) return null;
    return <span className="version-tag-label" title="Plugin version">{label}</span>;
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
  window.PomVersionTag = { setLabel: (label) => set(label) };
}
mountVersionTag('version-tag-mount');

/* ── text fields (filenames read-only, folder-new, connection fields) ──────── */
function mountTextField(mountId: string, props: any, level?: Level) { mountOnce(mountId, <PomTextField {...props} />, level); }

/*
  THE FILE NAME THIS PLUGIN WRITES. Nothing else.

  It briefly grew a dropdown of the JSON files found in the repo, and that was
  a modelling mistake: this card is about the document the plugin PRODUCES —
  Download saves it, Push writes it — and the repo's existing files are a
  different set of things entirely. Offering them here said "pick which file
  you are generating" about files you are not generating. The repo's side of
  it now lives on the repo card, where the thing being picked actually is (see
  mountRepoFile below), and the two cards name two files, which is the truth:
  a comparison has two sides.

  So this is a plain text field again. It stays CONTROLLED through the bridge
  rather than going back to a DOM lookup, because that refactor was right for
  its own reasons — one accessor instead of five getElementById calls — and
  the value has to be readable synchronously in the middle of composing a
  push, which React state is not.
*/
/*
  ONE NAME, TYPED OR PICKED.

  This was a plain text field, and the repo card carried a second control — "File
  in the repo" — for choosing which file to compare against. Two fields for one
  answer: the name you are about to write, and the name you are reading back.
  They are the same file in every ordinary use, and keeping them apart meant
  naming it twice and then wondering which one a button meant.

  So the field became the list. Type a name that is not there yet and it is the
  name; pick one the repository already has and it is that. The options are
  whatever the folder holds, refreshed by the same listing the push button uses
  to decide whether it is replacing something.

  WHAT IS LOST, SAID PLAINLY: comparing against one file while pushing to
  another is no longer expressible, because there is no longer a second address
  to put it in. That was possible and, as far as anything here knows, never
  wanted; a repo whose export lives under a different name is renamed by
  picking it, which is the same two clicks with none of the ambiguity.
*/
(function mountPrimaryFilename() {
  const container = document.getElementById('primary-filename-mount');
  type S = { query: string; value: string; all: string[] };
  let state: S = { query: 'tokens.json', value: 'tokens.json', all: [] };
  let apply: ((s: S) => void) | null = null;
  const put = (next: Partial<S>, tell?: boolean) => {
    state = { ...state, ...next };
    apply?.(state);
    if (tell) window.PomPrimaryFilename.onChange?.(state.value);
  };
  const focused = () => !!container && container.contains(document.activeElement);
  function View() {
    const [s, setS] = useState<S>(state);
    apply = setS;
    /* Substring, and never collapsing to nothing: an exact match is a name that
       has been finished, not a filter with one hit, so the whole list stays
       open. Same rule as the folder pickers. */
    const q = s.query.trim().toLowerCase();
    const options = (q && s.all.indexOf(s.query.trim()) === -1
      ? s.all.filter((n) => n.toLowerCase().indexOf(q) !== -1)
      : s.all);
    return (
      <Combobox
        label="JSON name"
        icon={IconFile(16)}
        size="small"
        block
        placeholder="tokens.json"
        value={s.query}
        /* TYPING IS CHOOSING HERE, unlike the folder and repo-file combos where
           it only filters. The commonest thing anybody does with this field is
           write a name the repository has never seen, so a keystroke has to
           reach the value and not just the list. */
        onChange={(v: string) => put({ query: v, value: v }, true)}
        options={options}
        getKey={(o: string) => o}
        onPick={(o: string) => put({ query: o, value: o }, true)}
        renderOption={(o: string, st: { active: boolean }) => (
          <span style={{ fontWeight: st.active ? 600 : 400 }}>{o}</span>
        )}
        emptyMessage={s.all.length
          ? 'No file in this folder matches — this one will be created'
          : 'Nothing in this folder yet — this one will be created'}
      />
    );
  }
  /* CARD_LEVEL — the address row is back on .export-panel; see the note above
     PomFolderSelect for where it has been. */
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomPrimaryFilename = {
    get: () => state.value,
    /* A set from outside is the app choosing, not the person — it moves the
       value silently, and leaves the text alone while somebody is typing in it.
       Same rule, same reason, as the combos it replaced. */
    set: (next: string) => put({ value: next, ...(focused() ? null : { query: next }) }),
    setOptions: (names: string[]) => put({ all: names || [] }),
    onChange: null,
  };
})();

/*
  WHICH FILE IN THE REPO THE COMPARISON IS AGAINST.

  On the repo card, because that is what it is about. A Combobox and not a
  plain dropdown: these are file names, a repo can hold a lot of them, and
  typing three characters to narrow the list is faster than scrolling it. It
  shows even when the repo holds exactly one — a list of one still answers
  "what is up there", which is the question this control exists for, and a
  field that appears and disappears with the count is harder to learn than one
  that is always in the same place.

  It is the READ side, and only the read side. Push writes the name from the
  Json file card above; this names the file Compare goes and fetches. Those
  were one value until they were separated here, which is why the card could
  say "Compare" while pointing at a file the repo did not have.
*/
/*
  MOUNTED TWICE, DRIVING ONE SELECTION. The repo card picks the file to compare
  against; the import page picks the file to import — and it is the same file in
  the same folder, so choosing on either screen has to move both. They are kept
  in step by chooseRepoFile() in ui.template.html rather than by sharing state
  here, because one React root cannot span two places in the document.
*/
/*
  IMPORTING IS READING, SO THE FILE IS A LIST AND NOT A BOX.

  This was a Combobox, and it carried the whole apparatus of one: a query kept
  apart from the selection so that typing could filter without choosing, a
  substring match, an empty-message for a filter that hit nothing, and a clear
  × beside it. All of that is machinery for naming something that is not on the
  list yet — and there is no such thing here. You cannot import a file the
  repository does not have; the only names that mean anything are the ones the
  listing returned.

  So it is a DropDownSelect, the same as Compare's own file picker, which
  answers the same question about the same folder. A box you may type a dead
  name into is offering a choice with no outcome at the end of it.
*/
function mountRepoFileCombo(mountId: string, bridgeKey: 'PomImportRepoFile') {
  const container = document.getElementById(mountId);
  type S = { selected: string; all: string[] };
  let state: S = { selected: '', all: [] };
  let apply: ((s: S) => void) | null = null;
  const put = (next: Partial<S>, tell?: boolean) => {
    state = { ...state, ...next };
    apply?.(state);
    if (tell) window[bridgeKey].onChange?.(state.selected);
  };
  function View() {
    const [s, setS] = useState<S>(state);
    apply = setS;
    return (
      <DropDownSelect
        label="File in the repo"
        icon={IconFile(16)}
        size="small"
        block
        placeholder={s.all.length ? 'pick a file' : 'nothing pushed yet'}
        value={s.selected}
        options={s.all.length
          ? s.all.map((o) => ({ value: o, label: o }))
          : [{ value: '', label: 'No JSON files in this folder yet' }]}
        onChange={(v: string) => { if (v) put({ selected: v }, true); }}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window[bridgeKey] = {
    get: () => state.selected,
    /* A set from outside is the app choosing, not the user. There is no typed
       text to protect any more — that was the combobox's problem, and it left
       with it — so this is simply the selection moving. */
    set: (next: string) => put({ selected: next }),
    setOptions: (names: string[]) => put({ all: names || [] }),
    onChange: null,
  };
}

mountRepoFileCombo('import-repo-file-mount', 'PomImportRepoFile');

window.PomCommitMessage = mountLiveTextArea('commit-message-mount', { id: 'commit-message', placeholder: 'Enter commit message...', rows: 2 }, false, CARD_LEVEL);

// filled/primary — was outline. This replaces the Push button in the exact
// same slot whenever nothing is configured yet (updateActionUI()), so it's
// the main screen's one obvious next step at that point, same weight as
// Push itself gets once something IS configured — an outline button read
// as a secondary/optional action for what is actually the only path
// forward.
mountButton('add-repo-settings-btn-mount', { id: 'add-repo-settings-btn', variant: 'filled', size: 'large', label: 'Add Repo Settings', block: true }, CARD_LEVEL);


mountTextField('gl-token-mount', { id: 'gl-token', type: 'password', label: 'GitLab Token', placeholder: 'glpat-… (stored only on this machine)' }, CARD_LEVEL);
mountTextField('gl-host-mount', { id: 'gl-host', label: 'GitLab Host', placeholder: 'https://gitlab.com' }, CARD_LEVEL);
mountTextField('gl-project-mount', { id: 'gl-project', label: 'Project (path or ID)', placeholder: 'group/subgroup/project or 1234' }, CARD_LEVEL);
mountTextField('gl-branch-mount', { id: 'gl-branch', label: 'Branch', placeholder: 'main' }, CARD_LEVEL);
mountTextField('gh-token-mount', { id: 'gh-token', type: 'password', label: 'GitHub Token', placeholder: 'ghp-… (stored only on this machine)' }, CARD_LEVEL);
mountTextField('gh-repo-mount', { id: 'gh-repo', label: 'Repository (owner/repo)', placeholder: 'my-org/my-repo' }, CARD_LEVEL);
mountTextField('gh-branch-mount', { id: 'gh-branch', label: 'Branch', placeholder: 'main' }, CARD_LEVEL);

/* ── hidden export-mode segmented control (Native / Legacy) ─────────────────── */
window.PomExportMode = { onChange: null };
(function mountExportMode() {
  const container = document.getElementById('export-mode-control-mount');
  if (!container) return;
  function View() {
    const [value, setValue] = useState('1');
    return (
      <SegmentedControl
        label="Output format"
        size="small"
        value={value}
        options={[{ value: '0', label: 'Native' }, { value: '1', label: 'Legacy' }]}
        onChange={(v: string) => { setValue(v); window.PomExportMode.onChange?.(Number(v)); }}
      />
    );
  }
  flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
})();

/* ── onboarding provider pick (GitLab / GitHub checkboxes) ──────────────────
   Used only by the onboarding dialog below now — there used to be a second,
   permanent Settings-page control built on the same PushCheckboxState shape
   (mountPushTargetControl, a "which provider(s) get pushed to" picker with
   GitLab/GitHub/Both checkboxes of its own). Removed: the main screen's own
   provider tab (mountMainProviderTabControl below) is the real push
   destination now, so a second, separate picker that could disagree with it
   was redundant — see mainProviderTab's own comment in ui.template.html. */
type PushCheckboxState = { gitlab: boolean; github: boolean };
function targetFromCheckboxes(s: PushCheckboxState): PushTarget {
  if (s.gitlab && s.github) return 'both';
  if (s.github) return 'github';
  return 'gitlab';
}

/*
  THE CARD IS THE FORMAT; THE CHECKBOX QUALIFIES IT, AND SITS OUTSIDE.

  Resolved is not a third format — it IS DTCG, in a different document shape,
  and it cannot be chosen while the export is Legacy JSON. So it appears only
  once the card is on, and disappears with it.

  IT IS A SIBLING OF THE CARD, NOT A CHILD, and that is structural rather than
  cosmetic. A SelectableCard IS a `<button>`: a checkbox inside one is a control
  inside a control, "one press fires BOTH" (SelectableCard.tsx), which the kit
  refuses. Its `action` slot exists for that case but is absolutely positioned
  in the mark's corner and documented for a card that "carries no mark of its
  own to collide with" — no use while a switch occupies that corner. Below the
  card, the checkbox is an ordinary control: its own tab stop, its own label,
  no press of the card's to escape.
*/
(function mountOutputFormatControl() {
  const container = document.getElementById('output-format-control-mount');
  let set: (shape: string) => void = () => {};
  let setHint: (hint: string) => void = () => {};
  let setResolvedHint: (hint: string) => void = () => {};
  function View() {
    // 'legacy' | 'themes' | 'resolved' — one value, so the card and the
    // checkbox cannot disagree. Each is derived from it, not kept beside it.
    const [shape, setShape] = useState('legacy');
    const [hint, setHintState] = useState('');
    const [resolvedHint, setResolvedHintState] = useState('');
    set = setShape;
    setHint = (h) => setHintState(h);
    setResolvedHint = (h) => setResolvedHintState(h);

    const on = shape !== 'legacy';
    const resolved = shape === 'resolved';
    const choose = (next: string) => { setShape(next); window.PomOutputFormat.onChange?.(next); };

    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-component-2)' }}>
        <SelectableCard
          label="W3C DTCG"
          selected={on}
          // unticking Resolved is the checkbox's job; turning the card off
          // drops the whole format, so it returns to Legacy JSON either way
          onSelect={() => choose(on ? 'legacy' : 'themes')}
          mark="switch"
          level={GROUND}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, color: 'var(--app-text)' }}>W3C DTCG</span>
            {hint && <span style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>{hint}</span>}
          </span>
        </SelectableCard>
        {on && (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Checkbox
              label="Resolved"
              checked={resolved}
              onChange={(v: boolean) => choose(v ? 'resolved' : 'themes')}
            />
            {resolvedHint && (
              <span style={{ fontSize: 12, color: 'var(--app-text-muted)', lineHeight: 1.4, paddingLeft: 24 }}>
                {resolvedHint}
              </span>
            )}
          </span>
        )}
      </span>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
  window.PomOutputFormat = {
    onChange: null,
    setValue: (v) => set(v),
    setHint: (h) => setHint(h),
    setResolvedHint: (h) => setResolvedHint(h),
  };
})();

/* ── GitHub / GitLab repo-settings tab switcher ────────────────────────────── */
// Lives INSIDE each provider's own .provider-card now (see the markup's
// own comment) rather than as one separate row above both — so it's
// mounted TWICE, once per card (#repo-settings-tab-mount inside GitLab's,
// #repo-settings-tab-mount-github inside GitHub's), each its own React
// root. Only one is ever visible at a time (whichever card is showing —
// updateProviderSectionVisibility()), but both need to report the same
// value, so window.PomRepoTab.setValue fans out to both instead of one.
(function mountRepoTabControl() {
  const mountIds = ['repo-settings-tab-mount', 'repo-settings-tab-mount-github'];
  const setters: Array<(v: 'gitlab' | 'github') => void> = [];
  mountIds.forEach((mountId) => {
    const container = document.getElementById(mountId);
    if (!container) return;
    let set: (v: 'gitlab' | 'github') => void = () => {};
    function View() {
      const [value, setValue] = useState<'gitlab' | 'github'>('gitlab');
      set = setValue;
      return (
        // medium, not small: this sits at the top of each provider's own
        // card, level with the fields it switches between, not with a
        // caption-sized chip — the field-box rung Button/SegmentedControl
        // share. block: this is a two-option dial governing the whole
        // card's fields below it, so it should read as wide as that card
        // (like the fields inside it), not hug its own two labels — see
        // SegmentedControl's own `block` doc, written for exactly this
        // "governs everything under it" case.
        <SegmentedControl
          label="Repository provider"
          size="medium"
          block
          value={value}
          options={[
            { value: 'github', label: 'GitHub', leading: IconGitHub(16) },
            { value: 'gitlab', label: 'GitLab', leading: IconGitLab(16) },
          ]}
          onChange={(v: string) => window.PomRepoTab.onChange?.(v as 'gitlab' | 'github')}
        />
      );
    }
    // CARD_LEVEL — SegmentedControl doesn't read this React context for its
    // own fill at all (only the plain data-level="3" HTML attribute on the
    // wrapping div does that now); kept only so this mount's own context
    // stays consistent with every other mount in this file.
    flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
    setters.push((v) => set(v));
  });
  window.PomRepoTab = { onChange: null, setValue: (v) => setters.forEach((s) => s(v)) };
})();

/* ── main screen: GitLab / GitHub push destination + folder-path tab ───────
   Same shape as mountRepoTabControl above, one screen over: when both
   providers are added, this replaces showing both provider blocks stacked
   with a single switcher, so only one folder-path picker shows at a time
   (see updatePushTargetUI()'s tabMode). This IS the real push destination
   now too — there used to be a separate Settings-page picker
   (window.PomPushTarget, removed) that could disagree with whichever tab
   was selected here; now there's exactly one control for both "which
   folder path am I looking at" and "where does Push actually send tokens". */
/*
  WHAT THIS CARD IS FOR RIGHT NOW: pushing, or comparing.

  They were two cards, and they asked for the same two things — a folder and a
  file in the repository — with one of them additionally wanting a commit
  message. A mode is the honest shape of that: the address controls are shared
  because they ARE shared, and only the half that differs appears or disappears.

  Push is the default because it is the destructive one and the one this plugin
  is for; a mode switch that opens on the reading action would make the writing
  action something you have to find.
*/
(function mountRepoModeControl() {
  const container = document.getElementById('repo-mode-mount');
  let set: (v: 'push' | 'compare') => void = () => {};
  function View() {
    const [value, setValue] = useState<'push' | 'compare'>('push');
    set = setValue;
    return (
      <SegmentedControl
        label="What to do with this repository"
        /* `small`, and not block: it shares a title row now rather than owning
           a card, and it takes the width its two words need instead of every
           pixel the header has. The title beside it is the other claim on that
           row, and a switch that crowds the name of the service it switches is
           the reason this was moved out in the first place. */
        size="small"
        value={value}
        options={[
          { value: 'push', label: 'Push', leading: IconUpload(16) },
          { value: 'compare', label: 'Compare', leading: IconCompare(16) },
        ]}
        onChange={(v: string) => {
          setValue(v as 'push' | 'compare');
          window.PomRepoMode.onChange?.(v as 'push' | 'compare');
        }}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomRepoMode = { onChange: null, setValue: (v) => set(v) };
})();

(function mountMainProviderTabControl() {
  const container = document.getElementById('main-provider-tab-mount');
  let set: (v: 'gitlab' | 'github') => void = () => {};
  function View() {
    const [value, setValue] = useState<'gitlab' | 'github'>('gitlab');
    set = setValue;
    return (
      <SegmentedControl
        label="Push destination"
        size="medium"
        block
        value={value}
        options={[
          { value: 'gitlab', label: 'GitLab', leading: IconGitLab(16) },
          { value: 'github', label: 'GitHub', leading: IconGitHub(16) },
        ]}
        onChange={(v: string) => window.PomMainProviderTab.onChange?.(v as 'gitlab' | 'github')}
      />
    );
  }
  // CARD_LEVEL, matching the real data-level="2" .export-panel already sets
  // on the markup this mounts inside.
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomMainProviderTab = { onChange: null, setValue: (v) => set(v) };
})();

/* ── loading skeletons ─────────────────────────────────────────────────────── */
// Mirrors the real card above it: icon + title on the left, the token-count
// tag flush right. (It said "one solid InteractiveCard" — that card is gone,
// see mountCollectionsAccordion; the SHAPE it stands in for is the Figma
// card's header, which is still icon-title-tag.) — same .skeleton-foundation-card shape ui.template.html defines
// right beside .export-panel's own skeleton below, so both read as one
// family of "the container that's coming, in outline" rather than two
// unrelated placeholder styles.
// data-level={TOP_CARD_LEVEL}, matching the real card this stands in for
// (.json-download-card carries the same level in the markup) — without it
// --background resolves at whatever level this mounts on (GROUND, same as
// the page itself), painting the "card" the exact same colour as the page
// behind it: a loading card shape that's there but invisible. Same
// frozen-alias reasoning as everywhere else in this file that reads
// --background directly instead of --app-surface. The mountOnce level arg
// is threaded through too (see TOP_CARD_LEVEL's own comment on why it
// can't stay CARD_LEVEL here specifically).
mountOnce('skeleton-list',
  <div className="skeleton-foundation-card" data-level={TOP_CARD_LEVEL}>
    <div className="skeleton-foundation-card-title-group">
      <Skeleton shape="circle" size={18} label="Loading" />
      <Skeleton shape="block" width={160} height={16} label="" />
    </div>
    <Skeleton shape="block" width={64} height={22} label="" />
  </div>,
  TOP_CARD_LEVEL,
);
// The Json file card's own skeleton pieces used to mount here, into a twin
// of the card in ui.template.html. The card moved inside the repo card, where
// #actions-skeleton already stands in for the whole block, so the twin went
// and these went with it.
// Mirrors the real push-settings card's current shape: a small icon+title
// row (whichever provider ends up shown — GitLab or GitHub, not known
// yet), one full-width folder-path field (the filename field that used to
// sit beside it moved out into its own card — see .filename-row's own
// comment — so there's only ever one field here now), the commit textarea,
// and the (now full-width, Download having moved out too) push button.
// data-level={TOP_CARD_LEVEL} for the same reason as skeleton-list's own
// card above — the real #actions .export-panel carries it directly in the
// markup, and the mountOnce level arg needs to match for the same
// recessLevel reason (see TOP_CARD_LEVEL's own comment).
mountOnce('actions-skeleton',
  <div className="export-panel" data-level={TOP_CARD_LEVEL}>
    <div className="sk-row">
      <Skeleton shape="circle" size={14} label="Loading" />
      <Skeleton shape="block" width={70} height={16} label="" />
    </div>
    <Skeleton shape="block" height={44} width={'100%'} label="" />
    <Skeleton shape="block" height={68} width={'100%'} label="" />
    <Skeleton shape="block" height={44} width={'100%'} label="" />
  </div>,
  TOP_CARD_LEVEL,
);

/* ── toast ─────────────────────────────────────────────────────────────────── */
(function mountToast() {
  const container = document.getElementById('toast-mount');
  let set: (u: (s: any) => any) => void = () => {};
  function View() {
    const [s, setS] = useState<{ open: boolean; tone: 'success' | 'error'; message: string }>({ open: false, tone: 'success', message: '' });
    set = setS;
    return (
      <Toast
        open={s.open}
        onClose={() => setS((p) => ({ ...p, open: false }))}
        tone={s.tone}
        title={s.message}
        duration={2500}
        placement="bottom"
      />
    );
  }
  if (container) createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>);
  window.PomToast = { show: (message, isError) => set(() => ({ open: true, tone: isError ? 'error' : 'success', message })) };
})();

/* ── folder-path pickers ───────────────────────────────────────────────────────
  A COMBOBOX, NOT A DROPDOWN, AND THE SAME ONE IN BOTH PLACES.

  A plain dropdown can only offer what is already saved, which left the one
  case people actually hit with nowhere to go: the folder you want does not
  exist in the repo yet, or does exist and has never been added here. Typing
  is how you say a folder that is not on the list — and a folder typed here is
  created in the repo by the push that writes into it, because git has no
  empty directories to create in advance.

  The Settings one is fed the repo's real directory listing (thousands, on a
  large repo — see listRepoFolders) and exists to FIND the two or three that
  matter. The main-screen one is fed only what Settings kept, and exists to
  CHOOSE among them, or to name a new one on the spot.

  Same control either way, because it is the same act: say which folder.
*/
type FolderComboBridge = {
  setItems: (items: any[], selectedValue: string) => void;
  getQuery: () => string;
  commit: (value: string) => void;
  /* Options only — leaves the selection alone. The Settings picker is a
     search box, not a field holding a value. */
  setOptions: (paths: string[]) => void;
  get: () => string;
  set: (value: string) => void;
  onChange: ((value: string) => void) | null;
};
function mountFolderCombo(mountId: string, bridgeKey: string, placeholder: string, level: Level = CARD_LEVEL): FolderComboBridge {
  const container = document.getElementById(mountId);
  type S = { query: string; selected: string; all: string[] };
  let state: S = { query: '', selected: '', all: [] };
  let apply: ((s: S) => void) | null = null;
  const bridge = () => (window as any)[bridgeKey] as FolderComboBridge;
  const put = (next: Partial<S>, tell?: boolean) => {
    state = { ...state, ...next };
    apply?.(state);
    if (tell) bridge().onChange?.(state.selected);
  };
  const commit = (name: string) => put({ selected: name, query: name }, true);
  function View() {
    const [s, setS] = useState<S>(state);
    apply = setS;
    const q = s.query.trim().toLowerCase();
    /* "/" is one character and matches almost nothing anyone would type, so
       the root is searched by the words it MEANS as well — "root" and "repo"
       both find it, which is what someone looking for it would reach for. */
    const hay = (n: string) => (n === '/' ? '/ repo root repository' : n.toLowerCase());
    const matches = (!q || s.query === s.selected)
      ? s.all
      : s.all.filter((n) => hay(n).indexOf(q) !== -1);
    /* A CAP, because a real repo has thousands of directories and a listbox
       is not a scrollbar. The footer says how many were left out, which is
       also the nudge to type another character. */
    const LIMIT = 50;
    const options = matches.slice(0, LIMIT);
    const hidden = matches.length - options.length;
    /*
      A FOLDER THAT DOES NOT EXIST YET NEEDS A BUTTON, and the footer tells you
      which one.

      Typing alone cannot commit a new path: it matches no option, so the
      "typed text IS an option" rule never fires for exactly the case this
      control exists for. Two other mechanisms were built and dropped —
      committing on blur, which silently turns an abandoned half-typed filter
      into a folder, and a button inside this footer, whose onClick could not
      be made to fire from the harness this was verified in while option
      clicks in the same list fired fine. The create action lives beside the
      field instead, on a control of this app's own (see #folder-create-mount
      in ui.template.html), which is also where Settings has always put it.

      The footer says the path back to you, because "+" over a filter you have
      half-typed is how a folder called `tok` gets created.
    */
    const typed = s.query.trim().replace(/^\/+|\/+$/g, '');
    const isNew = !!typed && s.all.indexOf(typed) === -1;
    return (
      <Combobox
        label="Folder path"
        size="small"
        block
        icon={IconFolder(16)}
        placeholder={placeholder}
        value={s.query}
        onChange={(v: string) => {
          if (s.all.indexOf(v) !== -1) commit(v);
          else put({ query: v });
        }}
        options={options}
        getKey={(o: string) => o}
        onPick={(o: string) => commit(o)}
        renderOption={(o: string, st: { active: boolean }) => (
          <span style={{ fontWeight: st.active ? 600 : 400 }}>
            {o}
            {/* The list can afford to say what "/" means; the field cannot,
                and does not need to — there it is a value in a path field. */}
            {o === '/' && <span style={{ opacity: 0.6 }}>{'  repository root'}</span>}
          </span>
        )}
        footer={isNew
          ? <span>{`Press + to use “${typed}” — created on the first push`}</span>
          : hidden > 0 ? <span>{`+${hidden.toLocaleString()} more — type to narrow`}</span> : undefined}
        emptyMessage={s.all.length
          ? 'No folder here by that name'
          : 'No folders in this repo yet'}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={level}><View /></LevelContext.Provider>));
  /*
    AN UPDATE FROM OUTSIDE MUST NOT TAKE THE FIELD AWAY FROM WHOEVER IS TYPING
    IN IT.

    setItems is called by every render of the screen around this control, and
    it carried the selection into the query — so typing "brand/new/place" and
    having anything at all re-render (a settings save, a repo check, a tab
    switch) silently replaced it with the folder already chosen. It was not
    that the new path failed to commit; it never survived long enough to be
    committed.

    So the query follows the selection only while nobody is in the field. The
    options and the selection always update, because those are facts about the
    world rather than about what someone is halfway through saying.
  */
  const focused = () => !!container && container.contains(document.activeElement);
  return {
    setItems: (items, selectedValue) => put({
      all: items.map((it: any) => (it && it.value !== undefined ? it.value : it)),
      selected: selectedValue || '',
      ...(focused() ? null : { query: selectedValue || '' }),
    }),
    setOptions: (paths) => put({ all: paths || [] }),
    get: () => state.selected,
    /* What is in the box right now, which is not the same as what is chosen —
       the create button acts on this, because a path that does not exist yet
       can only ever be the typed half. */
    getQuery: () => state.query.trim(),
    set: (value) => put({ selected: value, ...(focused() ? null : { query: value }) }),
    commit: (value: string) => commit(value),
    onChange: null,
  };
}

mountIconButton('folder-create-mount', { id: 'folder-create-btn', variant: 'outline', size: 'medium', title: 'Use this folder path — created on the first push', 'aria-label': 'Use this folder path', icon: IconAdd(16) }, CARD_LEVEL);
/*
  THE GROUND MOVED UNDER THESE FOUR, and a field that does not follow it
  disappears.

  Everything in the repo card's address row — both folder pickers, the name
  combobox, Compare's own file dropdown — used to stand on a level-4 card and
  mounted at CARD_LEVEL, which means "the ground is 2-or-4, so compute at 3".
  They live in .json-download-card.is-sub now, which is level 3, so rung 3 IS
  the surface behind them: measured, Compare's file dropdown painted
  rgb(37,37,37) onto rgb(37,37,37) and the field vanished into the card.

  Ground 3 lifts to 4. Same mistake, same fix, as the Add-Paths button in
  Settings — see SUBCARD_LEVEL's own note.
*/
/*
  THE GROUND HAS MOVED UNDER THE ADDRESS ROW TWICE, so it is worth saying where
  it is rather than which way it went. The row is a direct child of
  .export-panel, which is level 4, and CARD_LEVEL is the name for "the ground
  is 2-or-4, so compute at 3" — a visible field against a level-4 card.

  It spent a while inside a level-3 subcard, where that same CARD_LEVEL
  computed rung 3 standing ON rung 3 and Compare's file dropdown painted
  rgb(37,37,37) onto rgb(37,37,37): measured, invisible. That subcard is gone —
  its header became .json-file-card and its fields came back out here.
*/
window.PomFolderSelect = { ...mountFolderCombo('folder-select-mount', 'PomFolderSelect', 'choose a folder', CARD_LEVEL), onChange: null };
window.PomGithubFolderSelect = { ...mountFolderCombo('github-folder-select-mount', 'PomGithubFolderSelect', 'choose a folder', CARD_LEVEL), onChange: null };
/*
  THE IMPORT PAGE'S FOLDER IS A LIST TOO, for the reason the file beside it is.

  Everywhere else a folder picker is a Combobox because a folder you are about
  to push into may not exist yet — you type it, press +, and the push creates
  it. Importing writes nothing. A folder that is not in the repository holds no
  file to read, so typing one could only ever produce an empty file list, and
  the clear × next to it offered to unset an address that has to be set.

  One control rather than one per provider, like the file picker beside it: the
  page shows whichever provider the repo card is on, and a second hidden copy
  for the other would be state that can disagree.
*/
window.PomImportFolderSelect = {
  ...mountLiveDropdown(
    'import-folder-select-mount',
    { label: 'Folder path', icon: IconFolder(16) },
    (v: string) => window.PomImportFolderSelect?.onChange?.(v),
    CARD_LEVEL,
  ),
  onChange: null,
};
/* The Settings pair — fed the repo's real directories, and read by the Add
   button beside each. `get()` rather than a DOM lookup, same reason as the
   file name field: a Combobox owns its own input id. */
window.PomFolderNew = { ...mountFolderCombo('folder-new-mount', 'PomFolderNew', 'find or type a folder'), onChange: null };
window.PomGithubFolderNew = { ...mountFolderCombo('github-folder-new-mount', 'PomGithubFolderNew', 'find or type a folder'), onChange: null };

/* ── folder-path lists (Settings) — rebuilt often, every row remounts ──────── */
function mountFolderList(mountId: string, bridgeKey: 'PomFolderList' | 'PomGithubFolderList', idPrefix: string, level: Level = GROUND) {
  const container = document.getElementById(mountId);
  const root = container ? createRoot(container) : null;
  let generation = 0;
  /* `inRepo` decides whether the row offers to create the folder or not: a
     path that is already there has nothing to create, and a button that does
     nothing beside one that deletes is a bad neighbour to have. */
  function render(rows: { path: string; canEdit: boolean; inRepo?: boolean }[]) {
    if (!root) return;
    generation += 1;
    const gen = generation;
    root.render(
      <LevelContext.Provider value={level}><>
        {rows.map((row, idx) => (
          <div className="folder-row" key={`${gen}-${idx}`}>
            <PomTextField
              id={`${idPrefix}-${idx}`}
              label="Folder path"
              readonly={!row.canEdit}
              icon={IconFolder(16)}
              defaultValue={row.path}
              onInput={(v: string) => (window as any)[bridgeKey].onInput?.(idx, v)}
              onBlur={(v: string) => (window as any)[bridgeKey].onBlur?.(idx, v)}
            />
            {/* Per row, because the answer is per row: one path can be in the
                repository while the one under it is not, and a single button
                for all of them cannot say which it is about. Shown only where
                there is something to create. */}
            {row.canEdit && row.inRepo === false && (
              <PomButton
                variant="outline" size="medium"
                title="Create this folder in the repository"
                aria-label="Create this folder in the repository"
                icon={IconUpload(16)}
                onClick={() => (window as any)[bridgeKey].onCreate?.(idx)}
              />
            )}
            {row.canEdit && (
              // medium, not small: beside a field (band 50), same reasoning
              // as folder-add-btn-mount / gl-clear-token-btn-mount above.
              <PomButton
                variant="tonal" destructive size="medium"
                title="Remove this path" aria-label="Remove this path"
                icon={IconTrash(16)}
                onClick={() => (window as any)[bridgeKey].onRemove?.(idx)}
              />
            )}
          </div>
        ))}
      </></LevelContext.Provider>,
    );
  }
  (window as any)[bridgeKey] = { render, onInput: null, onBlur: null, onRemove: null, onCreate: null };
}
mountFolderList('folder-list', 'PomFolderList', 'folder-row-input', CARD_LEVEL);
mountFolderList('github-folder-list', 'PomGithubFolderList', 'github-folder-row-input', CARD_LEVEL);

/* ── collections card → modal (read-only breakdown) ─────────────────────────── */
// Was an Accordion that expanded in place, then a card that opened a modal,
// and now only the modal: the card became the Figma card, whose header holds
// the count as a real button. See the note inside on why a card that was
// itself a button could not survive holding another card. A plain Dialog is
// all that is left here.
// window.PomCollectionsAccordion's own name/shape is kept exactly as-is:
// the vanilla script's 'extracted'/'transformed' handlers call
// setTitle/setCollections/setSummary and don't know or care how this
// renders internally.
/*
  THE PARENT CARD'S TITLE ROW — a mark, the word Figma, and the one number that
  describes everything under it.

  It is the same shape the Json file subcard beneath it already had, which is
  the point: two cards side by side in a stack, each saying what it is and how
  big it is. The count used to ride the collections card, where it read as a
  fact about that card rather than about the file.
*/
(function mountFigmaCardTag() {
  const icon = document.getElementById('figma-card-icon-mount');
  if (icon) flushSync(() => createRoot(icon).render(<>{IconFigma(16)}</>));

  /* The file's name, which is what this card is about. */
  const titleEl = document.getElementById('figma-card-title-mount');
  let applyTitle: ((v: string) => void) | null = null;
  let title = '';
  function Title() {
    const [v, setV] = useState(title);
    applyTitle = setV;
    return <p className="json-download-title">{v || 'This Figma file'}</p>;
  }
  if (titleEl) flushSync(() => createRoot(titleEl).render(<Title />));

  /*
    A BUTTON, BECAUSE IT WAS ALWAYS A CONTROL. The count opened the collections
    dialog back when the whole card was clickable, so it was already the way in
    — it just looked like a label. Saying so costs nothing and buys the card
    back: a card that IS a button cannot contain the Json file card, and a
    button inside a plain card can.
  */
  const container = document.getElementById('figma-card-tag-mount');
  let apply: ((v: string) => void) | null = null;
  let value = '';
  function View() {
    const [v, setV] = useState(value);
    apply = setV;
    if (!v) return null;
    return (
      <PomButton
        id="collections-open-btn"
        variant="tonal"
        size="small"
        label={v}
        leftIcon
        buttonLeftIcon={IconVariables(14)}
        title="View the collections this file holds"
        onClick={() => window.PomCollectionsAccordion.open?.()}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomFigmaCardTag = {
    set: (next: string) => { value = next; apply?.(next); },
    setTitle: (next: string) => { title = next; applyTitle?.(next); },
  };
})();

(function mountCollectionsAccordion() {
  const container = document.getElementById('collections-dialog-mount');
  let set: (u: (s: any) => any) => void = () => {};
  /* Reached from the header button, which lives in its own React root. */
  let openDialog: (v: boolean) => void = () => {};
  function View() {
    const [state, setState] = useState<any>({ title: 'Scanned collections', collections: [], summary: { tokens: '' } });
    const [open, setOpen] = useState(false);
    set = setState;
    openDialog = setOpen;
    return (
      <>
        {/*
          NO CARD HERE ANY MORE — only the dialog.

          This rendered an InteractiveCard: the whole collections card was one
          big button that opened this dialog. The card is the FIGMA card now,
          the name is its title and the count is a real button in its header,
          and a card that is a button could never have held the Json file card
          inside it anyway. What survives is the thing that was always the
          point: the list of what was scanned.
        */}
        {/* large, not small — a real file's collection list (long names —
            ".magenta-light", "_restricted" — and four-digit counts) read
            cramped at 380px (--surface-width-small, tokens.css), reported
            from the real plugin. large is 760px, but max-inline-size:
            min(92vw, ...) (node.css's .nd-dialog) clamps it to the plugin
            panel's own width regardless — so this is "as wide as the panel
            allows," not a fixed 760px, and scales with however wide the
            user's own resizable panel (the drag-handle in this file) is. */}
        <Dialog open={open} onClose={() => setOpen(false)} title={state.title} size="large"
          /*
            DELETING IS ABOUT THESE COLLECTIONS, SO IT BELONGS WITH THEM.

            The control used to sit on the main screen under the card. It is
            the most destructive thing this plugin does and it was one click
            from the surface, with nothing between it and a mis-click but the
            confirmation. Here it is behind a deliberate open, directly under
            the list of exactly what it will remove — which is the only honest
            preview of what "all" means.
          */
          actions={
            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <PomButton
                id="clear-variables-btn"
                variant="ghost"
                destructive
                size="small"
                label="Delete all variables"
                leftIcon
                buttonLeftIcon={IconTrash(16)}
                onClick={() => window.PomCollectionsAccordion.onClearVariables?.()}
              />
            </div>
          }
        >
          <div className="collections-readonly-list">
            {state.collections.map((c: any) => (
              <div key={c.name} className="collection-item">
                <span className="collection-item-check">{IconCheck(14)}</span>
                <span className="name">{c.name}</span>
                {/* tonal, not ghost — matched the header's own token/size
                    tags at first, but ghost paints no fill (background:
                    none, node.css's .nd-tag.v-ghost), so it rendered
                    pixel-identical to the plain <span> it replaced: a
                    number in muted text, no visible tag. tonal actually
                    paints a pill (--nd-field-fill), which is the whole
                    point of asking for "the tags" here. */}
                <Tag variant="tonal" size="small">{c.count}</Tag>
              </div>
            ))}
          </div>
        </Dialog>
      </>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
  window.PomCollectionsAccordion = {
    setTitle: (title) => {
      window.PomFigmaCardTag?.setTitle(title);
      set((s) => ({ ...s, title }));
    },
    setCollections: (collections) => set((s) => ({ ...s, collections })),
    /* Kept on this card's own state as well as pushed to the parent's title
       row, so the one caller in ui.template.html does not have to know the
       count is drawn somewhere else now. */
    setSummary: (tokens) => {
      window.PomFigmaCardTag?.set(tokens);
      set((s) => ({ ...s, summary: { tokens } }));
    },
    /* The header button opens it; the dialog owns whether it is open. */
    open: () => openDialog(true),
    /* And clearing the variables closes it, because the list it is showing is
       the thing being deleted — see the call in ui.template.html. */
    close: () => openDialog(false),
    onClearVariables: null,
  };
})();

/* ── when the repo card last read the repository ─────────────────────────────
   The same shape as the Json file card's size tag next door: a fact about the
   card, in the card's own header, fed by the vanilla script. Renders nothing
   until there is something to say — see refreshSyncLabels, which is also what
   keeps it honest as the minutes pass. */
(function mountRepoSyncTag() {
  const container = document.getElementById('repo-sync-tag-mount');
  let set: (v: string) => void = () => {};
  function View() {
    const [label, setLabel] = useState('');
    set = setLabel;
    if (!label) return null;
    return <Tag variant="tonal" size="small">{label}</Tag>;
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomRepoSyncTag = { set: (v) => set(v) };
})();

/* ── "Json file" card title's own file-size tag ──────────────────────────────
   Same reactive-mount shape as mountVersionTag above: the vanilla script
   computes the export's byte size (see the 'transformed' handler) and pushes
   it in here, independent of PomCollectionsAccordion.setSummary's own tokens
   count next door — this tag used to sit beside that one, but reads as a
   property of the JSON file itself, so it moved to this card's title row. */
(function mountJsonFileCard() {
  const container = document.getElementById('json-file-size-mount');
  let set: (v: string) => void = () => {};
  function View() {
    const [size, setSize] = useState('');
    set = setSize;
    if (!size) return null;
    return <Tag variant="tonal" size="small">{size}</Tag>;
  }
  /*
    THE LEVEL OF THE SURFACE IT ACTUALLY STANDS ON, which stopped being the
    same thing when this card became a subcard.

    A Tag lifts one rung off its ground (fieldLevel, Tag.tsx), so it has
    followed this card everywhere it has been: rung 3 as a top-level card, rung
    4 as a subcard inside another, and back to 3 now that it is
    .json-file-card — a card of its own at level 4 again.
  */
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomJsonFileCard = { setSize: (size) => set(size) };
})();

/* ── reference-closure warning (inline alert) ────────────────────────────────
   Was one long paragraph explaining broken references in the abstract, with
   no way to tell which token was actually broken — the user had to go
   search the whole export by hand. Then briefly a flat "from → ref" row per
   broken reference — an improvement, but still framed around the SYMPTOM
   (this token's reference is broken) rather than the CAUSE: a chain where
   several tokens all ultimately depend on the same one missing/renamed
   variable read as that many unrelated-looking problems, when there's
   really only one thing to go fix in Figma. Regrouped here (see
   ui.template.html's 'transformed' handler) around the MISSING target
   instead — one heading per actual missing token, with everyone who
   references it listed underneath — so the list answers "what's missing"
   first, "what does it break" second, matching how it'd actually get
   fixed: rename/restore the one variable, not chase N separate reports. */
/*
  COPY THE WHOLE THING, not the rows on screen.

  A plugin UI is a sandboxed iframe with no allow-same-origin, where
  navigator.clipboard is commonly absent and throws where it is not, and
  execCommand — deprecated everywhere — is often the only one that works.
  Neither can be relied on and neither can be tested from outside Figma, so
  the LAST resort is built to be a real answer rather than an apology: a
  selected, read-only box holding the whole report, which Cmd-C copies.

  The box is part of the component that uses this, not a detached node
  appended to the body. The first version did the latter and left one behind
  on every failed click — two clicks, two textareas, growing for as long as
  someone kept trying.

  EXTRACTED because there are two of these now (the broken-reference alert and
  the Compare page) and the subtle half is the fallback, which is exactly the
  half that would have been copied wrong the second time.
*/
function useClipboard() {
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const copy = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text || '');
        setCopied('ok'); setTimeout(() => setCopied(''), 2000);
        return;
      }
    } catch { /* fall through to the box */ }
    setCopied('fail');
    /* After the render that creates it: select, then try execCommand while
       the selection is live. If that works the box has done its job
       invisibly; if not it stays, selected, for the person to copy. */
    setTimeout(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus(); ta.select();
      let worked = false;
      try { worked = document.execCommand('copy'); } catch { worked = false; }
      if (worked) { setCopied('ok'); setTimeout(() => setCopied(''), 2000); }
    }, 0);
  };
  const label = copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Select and copy below' : 'Copy all';
  const icon = copied === 'ok' ? IconCheck(16) : IconCopy(16);
  return { copied, taRef, copy, label, icon };
}

(function mountClosureWarning() {
  const container = document.getElementById('closure-warning-mount');
  let set: (u: (s: any) => any) => void = () => {};
  function View() {
    const [s, setS] = useState<{ open: boolean; title: string; groups: { ref: string; froms: string[] }[]; more: number; note: string; copyText: string }>({ open: false, title: '', groups: [], more: 0, note: '', copyText: '' });
    /* ABOVE the early return: this component renders null until something is
       wrong, and a hook after that return runs on some renders and not others
       — which is not a style point, it throws and the whole Alert stops
       mounting. */
    const clip = useClipboard();
    set = setS;
    if (!s.open) return null;

    return (
      <Alert tone="error" title={s.title}>
        {/*
          WHICH DIRECTION THIS IS ABOUT. The check runs on what an EXPORT of
          this file would contain, and it also runs after an IMPORT, because
          the document has just changed and gets re-read. Landing straight
          after a successful import with no such framing, it read as a verdict
          on the import — which had in fact resolved every one of its
          references. So it says which thing it is talking about.
        */}
        <p className="closure-warning-subtitle">
          {s.note || 'Not present in this export, but referenced by:'}
        </p>
        <ul className="closure-warning-list">
          {s.groups.map((g) => (
            <li key={g.ref}>
              <div className="closure-warning-missing">{g.ref}</div>
              <div className="closure-warning-froms">used by {g.froms.join(', ')}</div>
            </li>
          ))}
        </ul>
        {s.more > 0 && <p className="closure-warning-more">+{s.more} more affected</p>}
        {clip.copied === 'fail' && (
          <textarea
            ref={clip.taRef}
            className="closure-warning-copybox"
            readOnly
            value={s.copyText}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="The full list of broken references, ready to copy"
          />
        )}
        {s.copyText ? (
          <div className="closure-warning-actions">
            <PomButton
              id="closure-copy-btn"
              variant="tonal"
              size="small"
              label={clip.label}
              leftIcon
              buttonLeftIcon={clip.icon}
              onClick={() => clip.copy(s.copyText)}
            />
          </div>
        ) : null}
      </Alert>
    );
  }
  if (container) createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>);
  window.PomClosureWarning = {
    show: (title, groups, more, note, copyText) =>
      set(() => ({ open: true, title, groups, more: more || 0, note: note || '', copyText: copyText || '' })),
    hide: () => set((s) => ({ ...s, open: false })),
  };
})();

/*
  A WARNING ABOUT TWO SPELLINGS OF ONE NAME LIVED HERE, on the export screen
  and on the import page. It is on the Compare page now and nowhere else.

  It was a true thing said in a place nothing could be done about it: you
  cannot rename a Figma variable from the export screen, and the export is
  correct whichever spelling a token went through. It becomes worth acting on
  at exactly one moment — two files side by side, a hundred tokens reading as
  changed, and this the reason why — so that is where it is said. See the
  `spellings` card in the Compare page's own view.
*/

/*
  THE SIX KINDS OF DIFFERENCE, IN THE ORDER THE PAGE ALREADY USES.

  One list, read by the legend at the top of the per-collection block and by
  every row under it — so a mark cannot come to mean one thing in the key and
  another in the column, which is how the old key ended up naming four of six.

  `~` is the only one that is a DECISION. The other five are things that moved
  without anybody choosing: a token that exists on one side only, a reference
  that still points but somewhere else, a value one file aliases and the other
  spells out, a token at a new path. Hence the order, and hence `~` being the
  one tag drawn in the loud variant.
*/
const COUNT_KEYS: { sym: string; field: string; label: string }[] = [
  { sym: '~', field: 'changed', label: 'value changed' },
  { sym: '+', field: 'onlyInFigma', label: 'only here' },
  { sym: '\u2212', field: 'onlyInRepo', label: 'only in the repo' },
  { sym: '\u2192', field: 'repointed', label: 'points somewhere new' },
  { sym: '=', field: 'aliased', label: 'aliased one side' },
  { sym: '\u21b4', field: 'moved', label: 'moved here' },
];

/* ── the Compare page ──────────────────────────────────────────────────────── */
/*
  WHAT DIFFERS BETWEEN THIS FILE'S EXPORT AND THE REPO'S JSON.

  The engine is src/json-diff.js and it is deliberately not in here: the
  comparison is testable without a browser and this is only its rendering.
  What this file decides is what a person can actually read.

  THREE NUMBERS FIRST, then groups, then leaves. A real comparison of a real
  design system is tens of thousands of leaves, and a list that long is not a
  report — so the shape is a summary you read in a second, a per-group roll-up
  you scan, and a capped sample you drill into. The whole thing, uncapped, is
  one button away on the clipboard, which is the only place a list that long
  is any use.

  THE SIDES ARE NAMED AT THE TOP AND NEVER IMPLIED. "Only here" and "only in
  the repo" are opposites, and a reader who has to work out which way round
  the page is has already been failed by it.
*/
const COMPARE_SAMPLE = 40;
/* How many of a duplicate pair's disagreeing tokens are named under each
   spelling. Three is what a 139px column holds without the evidence becoming
   the row; past that the count says how much is not shown. */
const SPELLING_KEYS = 3;
/* And how many of a spelling's own tokens are named where the two share none.
   The count alone says the two scales are different sizes; the names say what
   they are, which is the question a reader has next. */
const SPELLING_NAMES = 6;

(function mountCompare() {
  const container = document.getElementById('compare-mount');
  type Sides = { figma: string; figmaDetail: string; repo: string; repoDetail: string;
                 provider?: 'github' | 'gitlab' | null;
                 figmaCount?: string; repoCount?: string };
  type S = {
    busy: string;
    sides: Sides;
    problem: { title: string; message: string; fix?: string; actionLabel?: string } | null;
    report: any | null;
    copyText: string;
  };
  let set: (u: (s: S) => S) => void = () => {};
  function View() {
    const [s, setS] = useState<S>({
      busy: '', sides: { figma: 'This Figma file', figmaDetail: '', repo: 'The repo', repoDetail: '' },
      problem: null, report: null, copyText: '',
    });
    const clip = useClipboard();
    set = setS;
    const r = s.report;

    const sides = (
      /*
        NO CARD AROUND THEM, AND NO HEADING OVER THEM.

        The wrapper held a title that named the Figma document, which the two
        cards inside it already said — the left one IS that document's export —
        and a card whose only content is two cards is a box drawn round a box.
        What is left is the comparison itself: two objects and the relation
        between them, standing on the page.
      */
      <span className="compare-card-sides">
        <span className="compare-card-side" data-level={TOP_CARD_LEVEL}>
          {/* The tag inside lifts off THIS card. These stand on the page now
              rather than inside another card, so their ground is 4 and
              CARD_LEVEL is the name for "2-or-4, so compute at 3". */}
          <LevelContext.Provider value={CARD_LEVEL}>
            <span className="compare-side-title" title={s.sides.figmaDetail}>
              <span className="compare-side-mark" aria-hidden>{IconFigma(13)}</span>
              {s.sides.figmaDetail}
            </span>
            {s.sides.figmaCount && (
              <Tag variant="tonal" size="small">{s.sides.figmaCount}</Tag>
            )}
          </LevelContext.Provider>
        </span>
        {/* Between the two, because that is what it is between: the relation,
            drawn, where "compared with" used to be written. */}
        <span className="compare-card-vs" aria-hidden>{IconCompare(14)}</span>
        <span className="compare-card-side" data-level={TOP_CARD_LEVEL}>
          <LevelContext.Provider value={CARD_LEVEL}>
            <span className="compare-side-title" title={s.sides.repoDetail}>
              <span className="compare-side-mark" aria-hidden>
                {s.sides.provider === 'gitlab' ? IconGitlab(13) : IconGithub(13)}
              </span>
              {s.sides.repoDetail}
            </span>
            {s.sides.repoCount && (
              <Tag variant="tonal" size="small">{s.sides.repoCount}</Tag>
            )}
          </LevelContext.Provider>
        </span>
      </span>
    );

    if (s.busy) {
      return (
        <>
          {sides}
          <div className="json-download-card" data-level={4}>
            <div className="compare-busy">
              <Spinner size={20} />
              <span className="compare-busy-label">{s.busy}</span>
            </div>
          </div>
        </>
      );
    }

    if (s.problem) {
      return (
        <>
          {sides}
          <Alert tone="warning" title={s.problem.title}>
            <p className="closure-warning-subtitle">{s.problem.message}</p>
            {s.problem.fix ? <p className="closure-warning-more">{s.problem.fix}</p> : null}
            {s.problem.actionLabel ? (
              <div className="closure-warning-actions">
                <PomButton
                  id="compare-fix-btn"
                  variant="tonal"
                  size="small"
                  label={s.problem.actionLabel}
                  onClick={() => window.PomCompare.onAction?.()}
                />
              </div>
            ) : null}
          </Alert>
        </>
      );
    }

    if (!r) return sides;

    if (r.identical) {
      return (
        <>
          {sides}
          <Alert tone="success" title="Identical">
            <p className="closure-warning-subtitle">
              {`All ${r.sameCount.toLocaleString()} token${r.sameCount === 1 ? '' : 's'} ` +
               `match${r.sameCount === 1 ? 'es' : ''}. Pushing right now would change nothing.`}
            </p>
          </Alert>
        </>
      );
    }

    /*
      TWO VALUES ARE COMPARED SIDE BY SIDE, NOT STACKED.

      They were one above the other, which makes the eye travel down and back
      to answer "what changed" — and with a colour written as
      {alpha:1,colorSpace:srgb,components:[0.81569,0.98431,0.87451],hex:#d0fbdf}
      the two lines are long enough that the difference is genuinely hard to
      find. Beside each other the answer is where the question is.

      THE HEX LEADS, AND THE REST IS NOT LOST. A DTCG colour carries its own
      hex alongside the components; that is the part a person reads, so it is
      what the cell shows, with a swatch beside it. The full value stays on
      the cell's title, so nothing is hidden — it is ranked, not truncated.
    */
    const swatchOf = (v: string) => {
      const m = /hex:(#[0-9a-f]{3,8})/i.exec(v) || /^(#[0-9a-f]{3,8})$/i.exec(v);
      return m ? m[1] : null;
    };
    /*
      A VALUE IN A CELL — a tag when it is short enough to be one, plain text
      when it is not.

      A hex fits a pill and reads better as one; a reference like
      {restrictions.neutral.basic.background} does not, and forcing it into a
      tag gets a pill that is wider than its column and clipped. So the shape
      follows the content: colours and short scalars are tagged, anything
      longer wraps as text. The full value is on the title either way.
    */
    /*
      A TOKEN PATH BREAKS AT ITS OWN JOINTS.

      A browser has no break opportunity inside foundation.core-colours.brand
      — a dot is not one — so the choice was between overflowing the column
      and `anywhere`, which breaks mid-segment and produced
      "foundation.core-c / olours.brand.dark / .50": three lines, none of them
      a thing. <wbr> before each dot offers the breaks the path actually has,
      so it wraps as "foundation / .core-colours / .brand.dark.50" and every
      line is a piece of the name. The anywhere fallback stays in CSS for the
      one segment long enough to need it.
    */
    /*
      WHICH SEGMENTS OF THIS PATH ARE NOT IN THE OTHER ONE.

      Every table that puts two paths side by side is asking the reader to
      find the difference by eye, and the difference is nearly always a
      segment or two in the middle of forty characters that are otherwise the
      same: {core-colours.neutral.light.300} against
      {core-colours.grey.300}. So the shared head and the shared tail are
      matched off by segment and whatever is left is what moved.

      By SEGMENT, not by character. letter-spacing against letterSpacing share
      the six characters "letter" and then diverge, and a character diff draws
      that as "letter[-s/S]pacing" — true, and unreadable. The unit a reader
      recognises here is the name, so the whole segment lights up.

      Head first, then tail out of what the head left, so a path can never
      claim the same segment twice ({a.b} against {a.b.b}). Identical paths
      mark nothing: the table has a column for values that changed while the
      reference did not.
    */
    const changedSegments = (path: string, other?: string) => {
      if (!other || other === path) return null;
      const a = path.split('.');
      const b = other.split('.');
      let head = 0;
      while (head < a.length && head < b.length && a[head] === b[head]) head++;
      let tail = 0;
      while (tail < a.length - head && tail < b.length - head
             && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
      /*
        NOTHING IN COMMON IS NOT A DIFFERENCE WORTH DRAWING. If the two share
        no head and no tail then every segment is new, and a band over the
        whole cell says only what the two columns already said. #FFFFFF
        against #000000 is that case, and so is a shadow rewritten end to end.
      */
      if (!head && !tail) return null;
      const marked: { [i: number]: true } = {};
      for (let i = head; i < a.length - tail; i++) marked[i] = true;
      return marked;
    };

    const pathRuns = (path: string, other?: string) => {
      const parts = path.split('.');
      const changed = changedSegments(path, other);
      /*
        The dots belong to the run they join. One between two changed
        segments is part of the change (neutral.light moved as a piece, and a
        gap in the highlight would read as two); one on the boundary of the
        change is not, because it is the joint that both names still share.

        Runs are coalesced before they are drawn: a <mark> per segment would
        put its padding between two halves of one word.
      */
      const runs: { text: string; changed: boolean }[] = [];
      const push = (text: string, isChanged: boolean) => {
        const last = runs[runs.length - 1];
        if (last && last.changed === isChanged) last.text += text;
        else runs.push({ text: text, changed: isChanged });
      };
      parts.forEach((seg, i) => {
        const c = !!(changed && changed[i]);
        if (i) push('.', c && !!(changed && changed[i - 1]));
        push(seg, c);
      });
      const nodes: ReactNode[] = runs.map((run, i) => {
        const kids: ReactNode[] = [];
        run.text.split('.').forEach((seg, j) => {
          if (j) { kids.push(<wbr key={'w' + j} />); kids.push('.'); }
          kids.push(seg);
        });
        return run.changed
          ? <mark className="compare-diff" key={'m' + i}>{kids}</mark>
          : <span key={'s' + i}>{kids}</span>;
      });
      return { nodes: nodes, diffed: !!changed };
    };

    const pathCell = (path: string, type?: string, other?: string) => {
      const run = pathRuns(path, other);
      const icon = type ? TYPE_ICON[type] : undefined;
      return (
        <span className="compare-token" title={type ? path + '  (' + type + ')' : path}>
          {/* Decorative: the type is already the table's own heading, so a
              screen reader that announced it per row would say it 40 times. */}
          {icon && <span className="compare-token-icon" aria-hidden="true">{icon(13)}</span>}
          <span className={'compare-cell-path' + (run.diffed ? ' is-diffed' : '')}>{run.nodes}</span>
        </span>
      );
    };

    /* A column header that carries a mark. The icon is decorative — the word
       beside it is the accessible name, and a header read out twice is worse
       than one read out once. */
    const headWith = (icon: ReactNode, label: string) => (
      <span className="compare-col-head">
        {icon && <span className="compare-col-icon" aria-hidden="true">{icon}</span>}
        {label}
      </span>
    );

    /*
      THE COLUMNS ARE THE TWO SIDES, NAMED.

      They used to be Was and Now, which is a claim about order: that the
      Figma file came first and the repo is the edit. Half the tables on this
      page make the opposite claim — a moved token was in the repo and is now
      here — so the same two words pointed in two directions three cards
      apart, and neither was ever a thing the comparison knows. It has two
      files. It does not know which one anybody changed.

      So each column is its own side, by name and by mark. The repo's name is
      the service it actually is, because "Repo" is what we call it and
      GitHub is what the reader opened; "Repo" survives only for a provider
      we cannot name.

      And in one order everywhere, Figma first, the order the two cards at the
      top of the page already put them in. Direction words could sit in two
      orders and still read; side names cannot — two cards apart with GitHub
      on opposite sides is a misreading waiting to happen.
    */
    const repoName = s.sides.provider === 'gitlab' ? 'GitLab'
                   : s.sides.provider === 'github' ? 'GitHub' : 'Repo';
    /* The same name in running text, where the unnamed case needs an article
       a column header does not: "only in Repo" is not a sentence. */
    const repoWhere = s.sides.provider === 'gitlab' || s.sides.provider === 'github'
                    ? repoName : 'the repo';
    const repoHead = () => headWith(
      s.sides.provider === 'gitlab' ? IconGitlab(12)
      : s.sides.provider === 'github' ? IconGithub(12) : null, repoName);
    const figmaHead = () => headWith(IconFigma(12), 'Figma');

    /*
      HOW MANY ROWS, SAID AS A COUNT RATHER THAN AS A NUMBER.

      The figure in a card's corner is how many rows the card has. On most of
      them nothing else competes with it, but the collapsed-change card has a
      column headed Tokens holding 100, and a bare 46 beside it reads as a
      smaller number of the same thing when it is a count of something else
      — forty-six distinct changes, one of which happened a hundred times.
      The times sign says which of the two it is without spending a word, and
      it is on every card because a marker that appears on one is a bug.
    */
    const rowCount = (n: number) => (
      <span className="compare-side-detail">{'\u00d7' + n.toLocaleString()}</span>
    );

    /*
      A COMPOSITE IS A BAG OF SUB-VALUES, AND ONLY SOME OF THEM MOVED.

      A typography token renders as {fontFamily:...,fontSize:...,fontWeight:
      ...,letterSpacing:...,lineHeight:...}. Put two of those side by side and
      the page has asked somebody to diff two 200-character strings by eye —
      which is the exact job this page exists to do for them.

      So the two are taken apart and only the keys that DIFFER are shown. The
      form being parsed is renderValue's own output, so this is reading a
      format this file controls rather than guessing at someone else's: keys
      at depth zero, nested braces and brackets skipped. A reference like
      {core.blue.500} has no colon at depth zero and comes back null, which is
      correct — it is one value, not a bag.
    */
    const compositePairs = (v: string): [string, string][] | null => {
      if (v.charAt(0) !== '{' || v.charAt(v.length - 1) !== '}') return null;
      const body = v.slice(1, -1);
      const out: [string, string][] = [];
      let depth = 0, start = 0;
      for (let i = 0; i <= body.length; i++) {
        const ch = body[i];
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') depth--;
        else if ((ch === ',' && depth === 0) || i === body.length) {
          const part = body.slice(start, i);
          const c = part.indexOf(':');
          if (c > 0) out.push([part.slice(0, c), part.slice(c + 1)]);
          start = i + 1;
        }
      }
      return out.length ? out : null;
    };

    /* The sub-keys whose values are not the same on both sides — plus the
       ones only one side has at all, which are a difference too. */
    const changedKeys = (a: [string, string][], b: [string, string][]) => {
      const ma = new Map(a), mb = new Map(b);
      const keys: string[] = [];
      ma.forEach((v, k) => { if (mb.get(k) !== v) keys.push(k); });
      mb.forEach((v, k) => { if (!ma.has(k)) keys.push(k); });
      return keys;
    };

    const TAGGABLE = 22;

    /*
      THE FIRST COLUMN NAMES THE TOKEN; THESE TWO SAY WHAT MOVED.

      A repointed row read
        tokens.c0 | {core-colours.grey.300} | {core-colours.neutral.light.300}
      where the only news is grey against neutral.light. Everything else is
      the same on both sides, printed twice, wrapped over three lines each,
      and taking the width away from the column that actually identifies the
      row. So the shared head and tail are elided and only the part that
      differs is printed.

      THE ELLIPSES ARE NOT DECORATION. Without them the cell claims the value
      IS {grey}, which is false — it is a fragment, and the braces plus the
      dots that survive are what say so. The whole value stays on the title
      for anyone who wants it, and Copy all has every one in full.

      Only for two references that share something. A literal, a composite
      (handled above, by sub-value), or two paths with nothing in common all
      fall through to the full value, because there is no shared part to drop
      and eliding would leave nothing.
    */
    const compactRef = (v: string, other?: string) => {
      if (!other) return null;
      if (v.charAt(0) !== '{' || v.charAt(v.length - 1) !== '}') return null;
      if (other.charAt(0) !== '{' || other.charAt(other.length - 1) !== '}') return null;
      const a = v.slice(1, -1);
      const b = other.slice(1, -1);
      if (a.indexOf(':') >= 0 || b.indexOf(':') >= 0) return null;
      const changed = changedSegments(a, b);
      if (!changed) return null;
      const idx = Object.keys(changed).map(Number);
      /* One side simply gained a segment the other never had: nothing of this
         side's own changed, so there is nothing to show in isolation. */
      if (!idx.length) return null;
      const parts = a.split('.');
      const first = Math.min.apply(null, idx);
      const last = Math.max.apply(null, idx);
      const mid = parts.slice(first, last + 1);
      const open = '{' + (first > 0 ? '\u2026' : '');
      const close = (last < parts.length - 1 ? '\u2026' : '') + '}';
      /* The joints of what is left, offered as breaks — the same reason
         pathCell does it. Without them {…neutral.light…} in a 92px column
         came out as "{… / neutral.lig / ht…}": three lines, one of them a
         word cut in half, for seventeen characters. With them it is
         "{…neutral / .light…}". */
      const kids: ReactNode[] = [];
      mid.forEach((seg, i) => {
        if (i) { kids.push(<wbr key={'w' + i} />); kids.push('.'); }
        kids.push(seg);
      });
      return {
        text: open + mid.join('.') + close,
        nodes: (
          <>
            <span className="compare-elide">{open}</span>
            {kids}
            <span className="compare-elide">{close}</span>
          </>
        ),
      };
    };

    const valueCell = (v: string, other?: string) => {
      const sw = swatchOf(v);
      const short = sw || v;
      /*
        A COLOUR IS A COMPOSITE TOO, AND MUST NOT BE TREATED AS ONE.

        A DTCG colour is {alpha, colorSpace, components, hex} — structurally
        the same bag as a typography token, so the sub-value diff below
        matched it and drew "COMPONENTS [0.05,0.6,0.25] / HEX #0d9b41 / +2
        unchanged" where a swatch and a hex had been. Correct, and three lines
        of arithmetic for a thing the eye reads instantly. The hex wins: if a
        value names a colour, it is shown as one.
      */
      if (sw && short.length <= TAGGABLE) {
        return (
          <span title={v}>
            <Tag variant="tonal" size="small" leading={<span className="compare-swatch" style={{ background: sw }} />}>
              {short}
            </Tag>
          </span>
        );
      }
      /* Both sides composite: show only the sub-values that moved, and say how
         many did not, so "the rest is the same" is stated rather than implied
         by absence. */
      if (other !== undefined) {
        const mine = compositePairs(v), theirs = compositePairs(other);
        if (mine && theirs) {
          const keys = changedKeys(mine, theirs);
          const map = new Map(mine);
          const same = mine.length - keys.filter((k) => map.has(k)).length;
          return (
            <span className="compare-sub" title={v}>
              {keys.map((k) => (
                <span className="compare-sub-row" key={k}>
                  <span className="compare-sub-key">{k}</span>
                  <span className="compare-sub-val">{map.has(k) ? map.get(k) : '—'}</span>
                </span>
              ))}
              {same > 0 && <span className="compare-sub-same">{`+${same} unchanged`}</span>}
            </span>
          );
        }
      }
      /*
        A REFERENCE IS A PATH, wherever it turns up. This is the cell the
        repointed table is made of — 231 rows of
        {restrictions.section.background} against
        {restrictions.white.background} — and the reader's question there is
        the same one the pattern table answers: which part of it moved. Same
        marking, same reason.
      */
      const brief = compactRef(v, other);
      if (brief) {
        return (
          <span className="compare-cell-text is-diffed is-brief" title={v}>{brief.nodes}</span>
        );
      }
      if (short.length > TAGGABLE) {
        const run = pathRuns(v, other);
        return (
          <span className={'compare-cell-text' + (run.diffed ? ' is-diffed' : '')} title={v}>
            {run.nodes}
          </span>
        );
      }
      return (
        <span title={v}>
          <Tag
            variant="tonal"
            size="small"
            leading={sw ? <span className="compare-swatch" style={{ background: sw }} /> : undefined}
          >
            {short}
          </Tag>
        </span>
      );
    };

    /* A leaf list, capped. The count in the heading is the REAL one, not the
       length of what is shown — a heading that said 40 when there were 13,137
       would be the page quietly lying about the size of the difference. */
    /*
      ONE TABLE PER KIND: the token in the first column, and what each side
      holds in the second and third.

      Stacked rows made the eye travel to compare two values; side-by-side
      cells fixed that, and a real table finishes it — the "repo" and "here"
      labels stop repeating on every row and become column headers, said once
      where they belong. Pomegranate's own Table, so the column owns its
      alignment and width rather than every cell restating them.

      The one-sided lists get two columns instead of three. A column headed
      "here" with nothing under it would be a table drawn around an absence.
    */
    /*
      THE FINDING, ON THE LINE THAT DEMONSTRATES IT.

      This was a summary Alert above the tables, which is the right shape for
      a count and the wrong one for acting on: a reader looking at one row had
      to carry "252 tokens are unbound, and font-family and fontFamilies are
      the same thing" in their head and work out whether THIS row was one of
      them. The row knows. It names the variable it should have pointed at,
      and the other spelling of that variable when there is one.

      A warning rather than an error: inlining can be deliberate and two names
      can be a migration half-done. What earns the mark is that the
      alternative is sitting right there, unused.
    */
    const rowFlag = (x: any) => {
      if (!x || !x.bindable) return null;
      return (
        <span className="compare-flag">
          <span className="compare-flag-mark" aria-hidden="true">{IconWarning(11)}</span>
          <span>
            {'not bound — '}
            <span className="compare-flag-name">{x.bindable}</span>
            {' exists'}
            {x.alsoSpelled && x.alsoSpelled.length ? (
              <>
                {', also spelled '}
                <span className="compare-flag-name">{x.alsoSpelled.join(', ')}</span>
              </>
            ) : null}
          </span>
        </span>
      );
    };

    /*
      A MOVE IS A PAIR OF PATHS, so its table is from/to rather than
      token/value: the value is the same on both sides — that is what makes it
      a move — and printing it twice would spend the width on the one thing
      that did not change.
    */
    const movedTable = (rows: any[]) => {
      if (!rows.length) return null;
      const title = 'Architecture \u2014 the same token, somewhere else';
      return (
        <div className="json-download-card" data-level={4} key={title}>
          <div className="json-download-header">
            <div className="json-download-title-group">
              <p className="json-download-title">{title}</p>
            </div>
            {rowCount(rows.length)}
          </div>
          <div className="compare-table">
            <Table
              caption={title}
              captionHidden
              size="small"
              rules
              columns={[
                { key: 'path', header: figmaHead(),
                  cell: (x: any) => pathCell(x.path, x.type, x.from) },
                { key: 'from', header: repoHead(),
                  cell: (x: any) => pathCell(x.from, x.type, x.path) },
              ]}
              rows={rows.slice(0, COMPARE_SAMPLE)}
              rowKey={(x: any) => x.path}
            />
          </div>
          {rows.length > COMPARE_SAMPLE && (
            <p className="compare-more">
              {`… and ${(rows.length - COMPARE_SAMPLE).toLocaleString()} more — Copy all has every one`}
            </p>
          )}
        </div>
      );
    };

    /*
      ONE EDIT, AND HOW MANY TOKENS FOLLOWED IT.

      Every table below this is keyed by token, which is right for reading what
      happened to a token and wrong for reading what happened. A variable
      swapped for another one puts a row in those tables for every token that
      pointed at it: measured on a real pair of exports, 500 changed rows came
      from 99 distinct (from, to) pairs, and a hundred of the rows were one
      letter-spacing group.

      So the same rows are offered here first, collapsed by the change itself,
      biggest first. Nothing is inferred to build it — two rows are the same
      change when both of their sides are identical strings.
    */
    const patterns = (rows: any[]) => {
      if (!rows.length) return null;
      const title = 'What changed \u2014 by the change, not the token';
      return (
        <div className="json-download-card" data-level={4} key={title}>
          <div className="json-download-header">
            <div className="json-download-title-group">
              <p className="json-download-title">{title}</p>
            </div>
            {rowCount(rows.length)}
          </div>
          <div className="compare-table">
            <Table
              caption={title}
              captionHidden
              size="small"
              rules
              columns={[
                /*
                  THE COUNT TAKES WHAT A COUNT NEEDS, and the two value columns
                  split the rest.

                  With no width on any column the kit leaves the table in `auto`
                  layout, where the browser sizes by content — and the content
                  here is two alias paths of forty characters against a
                  three-digit number, which it resolved by giving the number a
                  fifth of the table and breaking `{letterSpacing.0}` across
                  four lines. Declaring one width puts the table in `fixed`
                  (see Table's own note), and the columns that declare none
                  share what is left, evenly, which is exactly right for two
                  columns holding the same kind of thing.
                */
                { key: 'count', header: 'Tokens', width: '58px',
                  cell: (x: any) => <span className="compare-pattern-count">{x.count.toLocaleString()}</span> },
                { key: 'figma', header: figmaHead(),
                  cell: (x: any) => pathCell(String(x.figma), x.type, String(x.repo)) },
                { key: 'repo', header: repoHead(),
                  cell: (x: any) => (
                    <span className="compare-pattern-to">
                      {pathCell(String(x.repo), x.type, String(x.figma))}
                      {/*
                        THE CAUSE, ON THE LINE THAT SHOWS IT. Both ends point at
                        names that are one word spelled two ways, which is not a
                        decision anybody made — it is two groups that were meant
                        to be one. See sameWordDifferentSpelling.
                      */}
                      {x.sameNameDifferentSpelling && (
                        <span className="compare-pattern-why">one name, spelled two ways</span>
                      )}
                    </span>
                  ) },
              ]}
              rows={rows.slice(0, COMPARE_SAMPLE)}
              rowKey={(x: any) => String(x.figma) + '\u241f' + String(x.repo)}
            />
          </div>
          {rows.length > COMPARE_SAMPLE && (
            <p className="compare-more">+{(rows.length - COMPARE_SAMPLE).toLocaleString()} more</p>
          )}
        </div>
      );
    };

    /*
      NOT A DIFFERENCE BETWEEN THE TWO — a shape inside each, and the reason a
      good many of the differences above exist at all.

      It is reported on export and on import too, but only as a headline: those
      screens interrupt to say it is there, and this is where it is read,
      beside the rows it explains.
    */
    /*
      A SPELLING, AND WHAT POINTS AT IT.

      Two names for one thing is a tidiness problem until something consumes
      them. The count is what turns the row into a finding: `×128` beside one
      spelling and nothing beside the other says the pair is live and which
      half is the live half, and the count landing on opposite lines in the
      two columns IS the defect — the tokens above are identical and read as
      changed because the thing under them was renamed.

      NOTHING is the word for nothing. A spelling with no consumers used to
      carry the label `unused`, which spent the widest thing in the cell on
      the row's least interesting fact and made the two lines look like two
      findings. The count is there when there is one to state; the dimming
      says the rest.

      The unused spelling is dimmed rather than marked. A band would mean
      "this changed" here, which it already means twice on this page, and a
      dead group is not a change — it is the half of the row that matters
      less.

      Under each spelling, how many tokens it holds and — where the two hold
      the SAME tokens — which of them they disagree about. "different values"
      is the flag and this is the evidence: it sits under the name it belongs
      to, so no key has to say which of the two it came from.

      The count carries the other case on its own. font-sizes with 36 steps
      against fontSize with 33 and none of the names shared is two scales, not
      a value dispute, and listing keys for it printed three arbitrary names
      and three dashes. Two numbers say it.

      Nothing is drawn where the two spellings are copies of each other. The
      evidence is there to explain a flag, and a row with no flag has nothing
      to explain.
    */
    const spellingSide = (side: string) => (x: any) => {
      const held: string[] = (x.has && x.has[side]) || [];
      if (!held.length) return <span className="compare-spelling-none">{'\u2014'}</span>;
      const used = (x.used && x.used[side]) || {};
      const vals = (x.values && x.values[side]) || {};
      const shape = (x.shape && x.shape[side]) || null;
      const keys: string[] = shape ? shape.differing : [];
      const noneShared = !!shape && shape.shared === 0;
      const otherTokens = !!shape && !shape.sameKeys && !noneShared;
      const evidence = !!shape && (noneShared || otherTokens || keys.length > 0);
      /*
        THE NAME IS THE FINDING, SO THE NAME CARRIES THE MARK.

        Three amber lines under a cell — no tokens in common, one holds tokens
        the other does not, each file points at a different spelling — said in
        sentences what the two columns were already showing, and stacked into
        a paragraph under every row of a card that is meant to be scanned.

        What is left is the mark this page already uses for a change, on the
        spelling each file actually points at, and only where the two files
        point at different ones. That is the change: the tokens above are
        identical and read as changed because the name under them moved. The
        counts and the token lists stay — they are the evidence, and they were
        never the noise.
      */
      const consumed = x.consumed && x.consumed[side];
      return (
        <span className="compare-spelling-names">
          {held.map((n) => (
            <span className={'compare-spelling-name' + (used[n] ? '' : ' is-dead')} key={n}>
              <span className="compare-spelling-head">
                <span className="compare-cell-path">
                  {x.consumedDiffers && n === consumed
                    ? <mark className="compare-diff">{n}</mark>
                    : n}
                </span>
                {!!used[n] && (
                  <span className="compare-spelling-uses">
                    {'\u00d7' + used[n].toLocaleString()}
                  </span>
                )}
              </span>
              {evidence && (() => {
                const mine = Object.keys(vals[n] || {});
                /*
                  WHAT IS ACTUALLY IN IT, where the two share nothing.

                  "24 tokens against 12" says the two scales are different
                  sizes and leaves the reader to open the file to find out
                  what either one is. The names answer it, and they are this
                  spelling's OWN — no dashes, because there is nothing here to
                  line up against.
                */
                const show = noneShared ? mine.slice(0, SPELLING_NAMES) : [];
                return (
                  <span className="compare-spelling-vals"
                        title={x.root + '.' + n + '  —  ' + mine.join(', ')}>
                    <span className="compare-spelling-key">
                      {(shape as any).counts[n].toLocaleString() +
                       ((shape as any).counts[n] === 1 ? ' token' : ' tokens')}
                    </span>
                    {show.map((k) => (
                      <span className="compare-spelling-val" key={k}>{k}</span>
                    ))}
                    {show.length > 0 && mine.length > show.length && (
                      <span className="compare-spelling-key">
                        {'+' + (mine.length - show.length)}
                      </span>
                    )}
                    {keys.slice(0, SPELLING_KEYS).map((k) => (
                      <span className="compare-spelling-val" key={k}>
                        <span className="compare-spelling-key">{k}</span>
                        {(vals[n] || {})[k]}
                      </span>
                    ))}
                    {keys.length > SPELLING_KEYS && (
                      <span className="compare-spelling-key">
                        {'+' + (keys.length - SPELLING_KEYS)}
                      </span>
                    )}
                  </span>
                );
              })()}
            </span>
          ))}
          {/* The one thing the columns cannot show by themselves: this file
              points at BOTH spellings, so there is no single name to mark. */}
          {(x.splitIn || []).indexOf(side) !== -1 && (
            <span className="compare-pattern-why">both spellings in use here</span>
          )}
        </span>
      );
    };

    const spellings = (all: any[]) => {
      /*
        ONLY THE ONES SOMETHING POINTS AT.

        A pair nothing references is two groups to delete, not a finding about
        this comparison: nothing above it can read as changed, because nothing
        above it exists. They were listed and ranked last, which spent most of
        a card on the rows that could not matter — and they were the majority,
        because until landedGroup a reference was resolved by string prefix
        and NOTHING was ever counted as live.

        They are still on report.duplicateNames for the clipboard; what goes
        is their claim on the page.
      */
      const rows = all.filter((x: any) => x.live);
      if (!rows.length) return null;
      const title = 'Names \u2014 one word, spelled two ways';
      return (
        <div className="json-download-card" data-level={4} key={title}>
          <div className="json-download-header">
            <div className="json-download-title-group">
              <p className="json-download-title">{title}</p>
            </div>
            {rowCount(rows.length)}
          </div>
          <div className="compare-table">
            <Table
              caption={title}
              captionHidden
              size="small"
              rules
              columns={[
                /*
                  THE COLLECTION, WHICH NOTHING HERE USED TO SAY.

                  Column one held the two spellings joined by a dot, and once
                  each side lists what it holds that is the same text a third
                  time. What it could not answer was WHERE — a split in
                  Typography and a split in Spacing read identically. The root
                  is the one fact about a finding that was on the report and
                  never on the table.
                */
                /* 24%: the narrowest that still fits a collection name on one
                   line, because the width it gives up goes to the two columns
                   being compared — where a wrap falls inside the name the
                   reader is checking character by character. */
                { key: 'root', header: 'Collection', width: '24%',
                  cell: (x: any) => (
                    <span className="compare-token">
                      <span className="compare-cell-path">{x.root}</span>
                    </span>
                  ) },
                /*
                  WHICH FILE SPELLS IT WHICH WAY — a column each, the same two
                  sides in the same order as every other table on this page.

                  It said "both files", which answers where the split is and not
                  what the reader asked — which name is in which document. The
                  row that matters most proves the difference: `letter-spacing`
                  and `letterSpacing` are both in the Figma file and only
                  `letterSpacing` is in the repo, and "this Figma file" left the
                  repo unmentioned as though it had nothing to do with it. That
                  asymmetry IS the hundred-token change on this page, and
                  stacked in one cell it was two lines a reader had to diff;
                  side by side it is the shape of the row.

                  A file holding both names is the defect; a file holding one is
                  the other end of it, so a column is drawn either way — and a
                  dash where a file holds neither, because an empty cell would
                  read as a rendering fault rather than as an answer.
                */
                { key: 'figma', header: figmaHead(), cell: spellingSide('figma') },
                { key: 'repo', header: repoHead(), cell: spellingSide('repo') },
              ]}
              rows={rows}
              rowKey={(x: any) => x.names.join('/')}
            />
          </div>
        </div>
      );
    };

    /* Two paths and an optional note, for the findings whose whole point is
       that they have two ends. */
    const pairs = (title: string, rows: { was: string; now: string; note?: string }[]) => {
      if (!rows.length) return null;
      return (
        <div className="json-download-card" data-level={4} key={title}>
          <div className="json-download-header">
            <div className="json-download-title-group">
              <p className="json-download-title">{title}</p>
            </div>
            {rowCount(rows.length)}
          </div>
          <div className="compare-table">
            <Table
              caption={title}
              captionHidden
              size="small"
              rules
              columns={[
                { key: 'was', header: figmaHead(),
                  cell: (x: any) => pathCell(x.was, undefined, x.now) },
                { key: 'now', header: repoHead(),
                  cell: (x: any) => (
                    <span className="compare-pattern-to">
                      {pathCell(x.now, undefined, x.was)}
                      {x.note && <span className="compare-pattern-why">{x.note}</span>}
                    </span>
                  ) },
              ]}
              rows={rows}
              rowKey={(x: any) => x.was + '\u241f' + x.now}
            />
          </div>
        </div>
      );
    };

    const leaves = (title: string, rows: any[], twoSided: boolean,
                    flagOf?: (row: any) => ReactNode) => {
      if (!rows.length) return null;
      const columns: any[] = [
        {
          key: 'path',
          header: 'Token',
          cell: (x: any) => pathCell(x.path, x.type),
        },
      ];
      /*
        FIXED WIDTHS FOR THE VALUE COLUMNS, not a share of the table.

        A hex in a tag is about 80px whatever the panel is doing, so a
        percentage overpays for it on a wide pane and starves it on a narrow
        one — and every pixel it overpays comes out of the token column, which
        is the one that needs them: at 30% each, `brand.light.100` broke
        across three lines with the `0` stranded on the last. The tags get what
        they need and the path gets the rest.
      */
      /*
        THE COLUMNS SAY WHICH SIDE THEY ARE, IN THAT SIDE'S OWN MARK.

        "Here" was the Figma side, and "here" only means anything to someone
        who already knows which page they are on — while the other column had
        a name. So it is Figma, beside the Figma mark, against Repo beside the
        mark of whichever service the repo actually is. Two named sides, each
        recognisable before it is read.
      */
      if (twoSided) {
        /*
          THE COLUMN WIDTH FOLLOWS WHAT IS IN IT. 92px is right for a tagged
          hex and absurd for a composite: the typography table drew its values
          as two twenty-line towers beside a token that had room to spare. A
          table of pills gets pills' width; a table of structures gets a share.
        */
        const sample = rows.slice(0, COMPARE_SAMPLE);
        /* What the cell will DRAW, not what the row holds: a repointed value
           is forty characters of reference that compactRef prints as ten, and
           measuring the raw string handed the column 36% for a fragment that
           fits in 92px — width taken straight out of the token path beside
           it, which is the one that needed it. */
        const shownLen = (mine: string, theirs: string) => {
          const brief = compactRef(mine, theirs);
          return brief ? brief.text.length : (swatchOf(mine) || mine).length;
        };
        const wide = sample.some((x: any) =>
          shownLen(x.repo, x.figma) > TAGGABLE ||
          shownLen(x.figma, x.repo) > TAGGABLE);
        /*
          AND THE EXACT WIDTH FOLLOWS THE LONGEST OF THEM.

          92px was sized for a tagged hex and holds eleven monospace
          characters, which is under half of {…neutral.dark.200} — the column
          drew it over three lines with a word cut in half. The cell is 12px
          ui-monospace at 7.23px a character over 8px of cell padding
          (measured, not assumed), so this is what the longest value in the
          sample actually needs.

          Capped at 116 because the width comes out of the token column beside
          it, and a path that wraps at its own dots is a smaller loss than a
          value that cannot show itself at all. Floored at 92 so a table of
          hexes is not narrower than the pills in it.
        */
        const longest = sample.reduce((n: number, x: any) =>
          Math.max(n, shownLen(x.repo, x.figma), shownLen(x.figma, x.repo)), 0);
        const w = wide ? '36%'
                : Math.min(116, Math.max(92, Math.round(longest * 7.23 + 12))) + 'px';
        columns.push({
          key: 'figma',
          header: figmaHead(),
          width: w,
          /* The flag goes under whichever side holds the literal — that is the
             side that could have pointed and did not. */
          cell: (x: any) => (
            <>
              {valueCell(x.figma, x.repo)}
              {flagOf && x.unboundSide === 'figma' ? flagOf(x) : null}
            </>
          ),
        });
        columns.push({
          key: 'repo',
          header: repoHead(),
          width: w,
          cell: (x: any) => (
            <>
              {valueCell(x.repo, x.figma)}
              {flagOf && x.unboundSide === 'repo' ? flagOf(x) : null}
            </>
          ),
        });
      } else {
        columns.push({ key: 'value', header: 'Value', width: '120px', cell: (x: any) => valueCell(x.value) });
      }
      return (
        <div className="json-download-card" data-level={4} key={title}>
          <div className="json-download-header">
            <div className="json-download-title-group">
              <p className="json-download-title">{title}</p>
            </div>
            {rowCount(rows.length)}
          </div>
          <div className="compare-table">
            <Table
              caption={title}
              captionHidden
              size="small"
              rules
              columns={columns}
              rows={rows.slice(0, COMPARE_SAMPLE)}
              rowKey={(x: any) => x.path}
            />
          </div>
          {rows.length > COMPARE_SAMPLE && (
            <p className="compare-more">
              {`… and ${(rows.length - COMPARE_SAMPLE).toLocaleString()} more — Copy all has every one`}
            </p>
          )}
        </div>
      );
    };

    return (
      <>
        {sides}

        <div className="json-download-card" data-level={4}>
          {/*
            TWO KINDS OF DIFFERENCE, AND THEY ARE NOT PEERS.

            A VALUE change is a decision somebody made: this colour is now that
            colour. An ARCHITECTURE change is the shape of the system moving —
            a token appearing, disappearing, or pointing somewhere new — and it
            happens in thousands at a time, because renaming one collection
            re-roots every reference through it.

            Shown as four equal numbers they read as four comparable things,
            and the small one drowns. Measured on two real exports of one
            system: 1,060 values against 57,584 architectural differences. The
            1,060 are the ones a person has to look at and agree with; the
            57,584 are what a rename did. Values go first and stand alone.
          */}
          {/* No head. "Values" over a card that reads "500 — a different
              colour, number or string" is the card's own sentence said twice,
              and "someone chose differently" is what that sentence already
              means. The Architecture head below stays: it carries a count that
              is nowhere else. */}
          <div className="compare-section">
            {/* Nothing at zero here either: a comparison where no value moved
                says so with the "identical" line below, not with a 0. */}
            {r.changed.length > 0 && (
            <div className="compare-stats">
              <div className="compare-stat is-wide" data-level={SUBCARD_LEVEL}>
                <div className="compare-stat-n">{r.changed.length.toLocaleString()}</div>
                <div className="compare-stat-label">a different colour, number or string</div>
                {/*
                  THE BREAKDOWN IS INSIDE THE TOTAL IT BREAKS DOWN. It sat
                  under the card as a separate row, which made it read as a
                  second finding rather than as the same one counted by kind —
                  and 290 + 109 + 100 + 1 IS the 500 above it.

                  Tags, each with the mark the tables below already use for that
                  type: a colour decision and a font-family decision are
                  different acts, and the mix is the story. On two real exports
                  760 colours against 6 numbers says "re-tinted", which a single
                  total of 1,060 does not. The mark says which kind before the
                  word is read, the same way it does in every row underneath.
                */}
                {(r.changedByType || []).length > 1 && (
                  /*
                    THE TAGS LIFT OFF THE CARD THEY ARE IN, NOT THE ONE OUTSIDE
                    IT. Mounted against the outer card they computed rung 3 —
                    and this stat card IS rung 3, so measured they painted
                    rgb(37,37,37) onto rgb(37,37,37): four chips with no chip,
                    only text. Their ground is 3, so they lift to 4.
                  */
                  <LevelContext.Provider value={SUBCARD_LEVEL}>
                    <div className="compare-types">
                      {r.changedByType.map((t: any) => {
                        const icon = TYPE_ICON[t.type];
                        return (
                          <Tag key={t.type} variant="tonal" size="small"
                               leading={icon ? icon(12) : undefined}
                               label={t.count.toLocaleString() + ' ' + t.type}>
                            <span className="compare-type-n">{t.count.toLocaleString()}</span>
                            <span className="compare-type-name">{t.type}</span>
                          </Tag>
                        );
                      })}
                    </div>
                  </LevelContext.Provider>
                )}
              </div>
            </div>
            )}
          </div>

          <div className="compare-section">
            <div className="compare-section-head">
              <span className="compare-section-title">Architecture</span>
              <span className="compare-section-note">
                {(r.onlyInFigma.length + r.onlyInRepo.length + (r.repointed || []).length +
                  (r.aliased || []).length + (r.moved || []).length).toLocaleString()}
                {' in total'}
              </span>
            </div>
            {(() => {
              /*
                ONE SIDE ONLY IS ONE FACT, NOT TWO.

                "only here" and "only in the repo" stood as two stats, which
                said that a token missing from one side and a token missing
                from the other were separate findings. They are one finding:
                these two files do not agree about which tokens exist, and the
                number that answers it is the sum. The direction still matters
                — one lot would be written by a push and the other would not —
                so it is kept in the label, where it explains the figure
                instead of splitting it in half.

                AND NOTHING AT ZERO IS DRAWN. A card reading 0 is a card whose
                whole content is that it has nothing to say. On a real
                comparison two of these four were zero, so the eye crossed two
                empty boxes to reach the two that were not.
              */
              const oneSide = r.onlyInFigma.length + r.onlyInRepo.length;
              /* None of these takes the full row any more: the grid is three
                 across and these are the three-across kind. Only the values
                 total and "identical" span, and both are elsewhere. */
              const stats = [
                { n: oneSide,
                  label: 'on one side only \u2014 ' + r.onlyInFigma.length.toLocaleString() +
                         ' here, ' + r.onlyInRepo.length.toLocaleString() + ' in the repo' },
                { n: (r.repointed || []).length, label: 'pointing somewhere new' },
                { n: (r.aliased || []).length, label: 'aliased one side, inlined the other' },
                { n: (r.moved || []).length, label: 'the same token, somewhere else' },
                { n: (r.renamed || []).length,
                  label: (r.renamed || []).length === 1
                    ? 'group renamed \u2014 its tokens are not gone'
                    : 'groups renamed \u2014 their tokens are not gone' },
                { n: (r.swapped || []).length,
                  label: (r.swapped || []).length === 1
                    ? 'group swapped what it holds'
                    : 'groups swapped what they hold' },
              ].filter((x) => x.n > 0);
              if (!stats.length) return null;
              return (
                <div className="compare-stats">
                  {stats.map((x) => (
                    <div className="compare-stat" key={x.label}>
                      <div className="compare-stat-n">{x.n.toLocaleString()}</div>
                      <div className="compare-stat-label">{x.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* "34,529 identical" is the answer to a question this page is not
              asked. Everything here is what DIFFERS; the count of what does
              not is the remainder, and a card holding a remainder is a card
              nobody reads twice. It is still in the clipboard report, where a
              total is worth having. */}

          {(() => {
            /*
              ONLY THE COLLECTIONS THAT MOVED, AND A COUNT OF THE REST.

              The list is every collection either side holds — on a real file
              forty-five of them, twelve of which differ. The other thirty-three
              were a row each saying "identical", with a name to read past
              first: not a list of what happened, but the table of contents of
              the document with the answer hidden inside it.

              Collections that did nothing are worth one sentence — that they
              exist and that they are fine — so they get one. The names go,
              because nobody scans a list of unchanged things for a name: the
              question a specific collection raises is whether it moved, and
              its absence from a list of what moved answers that.
            */
            const rows = r.groups
              .map((g: any) => ({ g, shown: COUNT_KEYS.filter((k) => (g[k.field] || 0) > 0) }))
              .filter((x: any) => x.shown.length);
            const quiet = r.groups.length - rows.length;
            return (
              <>
                {rows.length > 0 && (
                  <>
                    {/*
                      EVERY SYMBOL NAMED, AND ONLY ONCE. The key read "~ values
                      + - → architecture": four of the six marks, two of them
                      labelled by the group they belong to rather than by what
                      they count, and `=` and `↳` never mentioned.

                      Tags, because a legend is not a row of numbers and should
                      not line up under the counts as though it were one more
                      collection with six figures of its own.
                    */}
                    <div className="compare-group-name compare-key-title">per collection</div>
                    <div className="compare-key">
                      {COUNT_KEYS.map((k) => (
                        /* `label` as well as children: Tag takes the accessible
                           name separately once the visible content is markup,
                           and the mark is drawn in a face a screen reader
                           should not try to pronounce. */
                        <Tag key={k.sym} variant="primary" size="small" label={k.sym + ' means ' + k.label}>
                          <span className="compare-key-sym" aria-hidden>{k.sym}</span>{k.label}
                        </Tag>
                      ))}
                    </div>
                    <div className="compare-groups">
                      {rows.map(({ g, shown }: any) => (
                        <div className="compare-group" key={g.name}>
                          <span className="compare-group-name">{g.name}</span>
                          <span className="compare-group-counts">
                            {/*
                              TAGS, THE SAME SHAPE AS THE KEY ABOVE. Bare
                              figures in a row read as one number broken into
                              parts — `~40 +15 −25` looked like an equation. A
                              tag each makes them countable at a glance.

                              ALL TONAL, and the loud variant belongs upstairs.
                              The values mark took `primary` on the argument
                              that it is the only one of the six that is a
                              decision — but it appears in nearly every row, so
                              what it actually produced was a column of white
                              chips down the list reading as a status rather
                              than as one of six equal counts, with the marks
                              that make a row unusual drawn quieter than the one
                              that makes it ordinary. The legend is the thing
                              read once, to learn the alphabet; it is the one
                              worth the ink.
                            */}
                            {shown.map((k: any) => (
                              <Tag key={k.sym}
                                   variant="tonal"
                                   size="small"
                                   label={(g[k.field] || 0) + ' ' + k.label}>
                                <span className="compare-key-sym" aria-hidden>{k.sym}</span>
                                {(g[k.field] || 0).toLocaleString()}
                              </Tag>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {quiet > 0 && (
                  <p className="compare-groups-rest">
                    {rows.length === 0
                      ? 'All ' + quiet.toLocaleString() + ' collections are identical.'
                      : 'The other ' + quiet.toLocaleString() + ' collection' +
                        (quiet === 1 ? ' is' : 's are') + ' identical.'}
                  </p>
                )}
              </>
            );
          })()}
        </div>

        {/*
          ONE TABLE PER KIND, not one table with a type column. The column
          would spend width the token path needs on a word that repeats down
          the whole run, and a reader looking for "what happened to the
          colours" would still be scanning for the rows that say colour. The
          heading answers it instead, and each table is capped on its own so
          a small kind is not pushed off the bottom of a large one.

          The single-kind case keeps the plain heading: "Values — changed
          (color)" reads as a filter applied to something, when it is simply
          everything there is.
        */}
        {/* Before the per-token tables, because it is the shorter answer to
            the same question and usually the whole of it. */}
        {patterns(r.changedPatterns || [])}
        {/* Straight after the patterns, because for several of them this IS
            the explanation. */}
        {spellings(r.duplicateNames || [])}
        {/*
          BOTH ENDS OF ONE EDIT, ON ONE LINE. A group renamed is a from and a
          to; a group that swapped its contents is what went and what came. Two
          lists of paths make a reader pair them up by eye, which is the work
          this is for.
        */}
        {pairs('Architecture \u2014 a group under a new name',
               (r.renamed || []).map((x: any) => ({
                 was: x.from, now: x.to, note: x.tokens.toLocaleString() + ' tokens' })))}
        {pairs('Architecture \u2014 a group that swapped what it holds',
               (r.swapped || []).map((x: any) => ({
                 was: x.group + ' \u00b7 ' + x.gone.join(', '),
                 now: x.group + ' \u00b7 ' + x.arrived.join(', ') })))}
        {(r.changedByType || []).length > 1
          ? r.changedByType.map((t: any) =>
              leaves('Values \u2014 ' + t.type, r.changed.filter((c: any) => c.type === t.type), true))
          : leaves('Values \u2014 changed', r.changed, true)}
        {/* Last of the three lists on purpose: it is usually the longest and
            almost always the least interesting, because a re-rooting moves
            thousands of references without anyone having decided anything. */}
        {leaves('Architecture \u2014 pointing somewhere new', r.repointed || [], true)}
        {/* The value is the SAME on both sides — one file points at it, the
            other spells it out. Worth seeing (it says the two exports were
            made differently) and emphatically not a value change. */}
        {leaves('Architecture \u2014 same value, aliased one side', r.aliased || [], true, rowFlag)}
        {/* Both ends, because the rename is the finding — one column would be
            a list of paths with no way to see what became what. */}
        {movedTable(r.moved || [])}
        {/* Named sides here too: these two have no column to name them, and
            "only here" beside a table headed Figma is the same word the
            headers were changed to stop using. */}
        {leaves('Architecture \u2014 only in Figma', r.onlyInFigma, false)}
        {leaves('Architecture \u2014 only in ' + repoWhere, r.onlyInRepo, false)}

        <div className="json-download-card" data-level={4}>
          <PomButton
            id="compare-copy-btn"
            variant="tonal"
            size="medium"
            block
            label={clip.label}
            leftIcon
            buttonLeftIcon={clip.icon}
            onClick={() => clip.copy(s.copyText)}
          />
          {clip.copied === 'fail' && (
            <textarea
              ref={clip.taRef}
              className="compare-copybox"
              readOnly
              value={s.copyText}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="The full comparison, ready to copy"
            />
          )}
        </div>
      </>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomCompare = {
    setBusy: (label) => set((s) => ({ ...s, busy: label, problem: null, report: null })),
    setSides: (figma, figmaDetail, repo, repoDetail, provider, figmaCount, repoCount) =>
      set((s) => ({ ...s, sides: { figma, figmaDetail, repo, repoDetail, provider, figmaCount, repoCount } })),
    setProblem: (title, message, fix, actionLabel) =>
      set((s) => ({ ...s, busy: '', report: null, problem: { title, message, fix, actionLabel } })),
    setReport: (report, copyText) =>
      set((s) => ({ ...s, busy: '', problem: null, report, copyText })),
    onAction: null,
  };
})();

mountIconButton('compare-back-btn-mount', { id: 'compare-back-btn', variant: 'tonal', size: 'large', title: 'Back', 'aria-label': 'Back', icon: IconArrowLeft(24) });

/* ── confirm / onboarding dialogs ──────────────────────────────────────────── */
function confirmDialog(mountId: string, cfg: { title: string; text: string; confirmLabel: string; onConfirm: () => void }, register: (open: () => void) => void) {
  const container = document.getElementById(mountId);
  let setOpen: (v: boolean) => void = () => {};
  function View() {
    const [open, setO] = useState(false);
    setOpen = setO;
    return (
      <Dialog
        open={open}
        onClose={() => setO(false)}
        size="small"
        title={cfg.title}
        description={cfg.text}
        actions={
          <div style={{ display: 'flex', flexDirection: 'row', gap: 12, width: '100%' }}>
            <Button variant="tonal" size="large" style={{ flex: 1 }} onClick={() => setO(false)}>Cancel</Button>
            <Button variant="primary" size="large" style={{ flex: 1 }} data-scheme="error" onClick={() => { setO(false); cfg.onConfirm(); }}>{cfg.confirmLabel}</Button>
          </div>
        }
      >{null}</Dialog>
    );
  }
  if (container) createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>);
  register(() => setOpen(true));
}

/* ── which depth of a path is an axis ───────────────────────────────────────

  The validation step: a JSON has N nesting depths, Figma has one mode axis per
  collection, and derive() has already MEASURED which depths behave like axes.
  This is where that measurement gets confirmed or overridden — not a blank
  question, a proposal with its evidence attached.

  A DROPDOWN PER DEPTH, not a switch per depth. This described a
  ListControlItem with a trailing Switch for as long as the choice was binary —
  axis or not — and it stopped being binary when a depth gained a third
  reading: it stays in the name, it becomes modes, or it becomes collections.
  Three states is a list, and DropDownSelect is the kit's list.

  ONE AXIS PER COLLECTION is still refused downstream, but it is no longer
  enforced by disabling siblings: the mode option carries "— axis taken" and is
  disabled on its own row, which says the same thing where the choice is made.
*/
(function mountImportLevels() {
  const container = document.getElementById('import-levels-mount');
  let set: (c: any[], a: any, cols: any[], gc: any[], ord: string[]) => void = () => {};

  const ROLE_LABEL: Record<string, string> = {
    name: 'group', mode: 'modes', collection: 'collections',
  };

  /*
    A MINIATURE OF FIGMA'S OWN VARIABLES TABLE.

    "modes" and "collections" are the same word-count apart and completely
    different outcomes: one gives a collection extra COLUMNS, the other gives
    you extra TABLES. Describing that in a sentence asks someone to picture it;
    drawing it does not. So each resulting collection is rendered the way the
    panel will show it — its name, a column per mode, and real variable names
    down the side.
  */
  /*
    FIGMA'S OWN VARIABLES PANEL, IN MINIATURE.

    "modes" and "collections" are one word apart and completely different
    outcomes — one gives a collection extra COLUMNS, the other gives you extra
    ROWS IN THE RAIL — and no sentence makes that as plain as the shape does.
    So this is drawn the way the panel is: the collections list on the left
    with its variable counts, the selected one's table on the right with a
    column per mode.

    Names are shown as Figma groups them — the last segment in the Name column,
    the path above it as a heading — because a reading left as `group` is
    exactly one that pushes another segment into that path.
  */
  function Preview({ collections }: { collections: any[] }) {
    const [picked, setPicked] = useState(0);
    if (!collections.length) return null;
    const c = collections[Math.min(picked, collections.length - 1)];
    const rows = (c.sample || []).slice(0, 4).map((full: string) => {
      const i = full.lastIndexOf('/');
      return { group: i === -1 ? '' : full.slice(0, i), leaf: i === -1 ? full : full.slice(i + 1) };
    });
    return (
      <span className="import-fig" data-level={TOP_CARD_LEVEL}>
        <span className="import-fig-rail">
          <span className="import-fig-rail-head">Collections</span>
          {collections.map((x, i) => (
            <button
              key={x.name}
              type="button"
              className={'import-fig-rail-item' + (x === c ? ' is-on' : '')}
              onClick={() => setPicked(i)}
            >
              <span className="import-fig-rail-name" title={x.name}>{x.name}</span>
              <span className="import-fig-rail-count">{x.variables.toLocaleString()}</span>
            </button>
          ))}
          {/*
            AND THE GROUPS UNDER THEM, which is the other half of what Figma's
            rail shows and the half these three readings actually move. Read as
            a group a segment stays in the names and becomes a folder here;
            read as modes or collections it leaves this list entirely. A
            preview that showed only the collection count could not show that.

            "All" first, like the panel, because the tree is a filter of the
            whole and the whole is the thing it filters.
          */}
          {(c.groups || []).length > 0 && (
            <>
              <span className="import-fig-rail-head is-sub">Groups</span>
              <span className="import-fig-rail-group" style={{ paddingLeft: 8 }}>
                <span className="import-fig-rail-name">All</span>
                <span className="import-fig-rail-count">{c.variables.toLocaleString()}</span>
              </span>
              {c.groups.slice(0, 5).map((g: any) => (
                <span key={g.path} className="import-fig-rail-group"
                      /* Indented by its own depth, which is how a tree says
                         which folder something is in without drawing lines. */
                      style={{ paddingLeft: 8 + g.depth * 10 }}>
                  <span className="import-fig-rail-name" title={g.path}>{g.name}</span>
                  <span className="import-fig-rail-count">{g.count.toLocaleString()}</span>
                </span>
              ))}
              {c.groups.length > 5 && (
                <span className="import-fig-rail-group is-more" style={{ paddingLeft: 8 }}>
                  +{c.groups.length - 5} more
                </span>
              )}
            </>
          )}
        </span>
        <span className="import-fig-table">
          <span className="import-fig-title">{c.name}</span>
          <span className="import-fig-head">
            <span className="import-fig-cell is-name">Name</span>
            {c.modes.slice(0, 3).map((m: string) => (
              <span key={m} className="import-fig-cell" title={m}>{m}</span>
            ))}
            {c.modes.length > 3 && <span className="import-fig-cell">+{c.modes.length - 3}</span>}
          </span>
          {rows.map((r: any, i: number) => (
            <span key={i}>
              {(i === 0 || rows[i - 1].group !== r.group) && r.group && (
                <span className="import-fig-group" title={r.group}>{r.group}</span>
              )}
              <span className="import-fig-row">
                <span className="import-fig-cell is-name">{r.leaf}</span>
                {c.modes.slice(0, 3).map((m: string) => (
                  <span key={m} className="import-fig-cell"><i className="import-fig-chip" /></span>
                ))}
                {c.modes.length > 3 && <span className="import-fig-cell" />}
              </span>
            </span>
          ))}
          {c.variables > rows.length && (
            <span className="import-fig-more">+{(c.variables - rows.length).toLocaleString()} more</span>
          )}
        </span>
      </span>
    );
  }

  function View() {
    const [candidates, setCandidates] = useState<any[]>([]);
    const [collections, setCollections] = useState<any[]>([]);
    const [groupCands, setGroupCands] = useState<any[]>([]);
    const [order, setOrder] = useState<string[]>([]);
    set = (c, _a, cols, gc, ord) => {
      setCandidates(c || []); setCollections(cols || []);
      setGroupCands(gc || []); setOrder(ord || []);
    };
    if (!candidates.length && !groupCands.length) return null;

    /*
      GROUPED BY THE GROUP, because that is the thing being described. A flat
      list repeats "restrictions" once per depth and buries the fact that the
      depths belong to one tree — the first is the outer level and the rest sit
      inside it.
    */
    const byGroup: Record<string, any[]> = {};
    candidates.forEach((c) => { (byGroup[c.group] = byGroup[c.group] || []).push(c); });
    /*
      THE SETS ARE AN AXIS TOO, and for a group whose token paths are only two
      segments deep they are the ONLY one. "tense" and "interaction" have no
      depth inside their paths to offer, so they produced no rows and the
      sections simply did not exist — two real collections, invisible in the
      panel that decides how collections are read.
    */
    const gcOf: Record<string, any> = {};
    groupCands.forEach((c) => { gcOf[c.group] = c; });

    /* Document order, so a section lands where the file put it rather than
       wherever the longer of the two lists happens to place it. */
    const seen = new Set<string>();
    const groupsInOrder = (order.length ? order : Object.keys(byGroup))
      .filter((g) => (byGroup[g] || gcOf[g]) && !seen.has(g) && seen.add(g) !== undefined);
    Object.keys(byGroup).forEach((g) => { if (!seen.has(g)) { seen.add(g); groupsInOrder.push(g); } });

    return (
      /* The card edges do the separating now, so the gap between them is the
         .import-card's own rhythm rather than the 22px that was standing in
         for a boundary that was not drawn. */
      <span style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groupsInOrder.map((group) => {
          /* Only the collections THIS group produced. The preview belongs
             beside the choice that determines it, not in one pile at the
             bottom where it answers for everything at once. */
          const mine = collections.filter((x) => x.fromGroup === group);
          return (
            <span key={group} className="import-level-section" data-level={SUBCARD_LEVEL}>
              <span className="import-level-title">{group}</span>

              {gcOf[group] && (() => {
                const gc = gcOf[group];
                const shown = gc.variants.slice(0, 5);
                return (
                  <span className="import-level-row">
                    {/* Not a path — these are the file's own sets. Said in
                        words because there is no segment to mark: the axis is
                        WHICH SET a token came from, which no single token
                        name shows. */}
                    <span className="import-level-path is-sets" aria-hidden="true">
                      <span className="seg is-axis">{gc.variants.length} sets</span>
                      <span className="sep">/</span>
                      <span className="seg is-leaf">{gc.measured ? 'read from the file' : 'not certain from the file'}</span>
                    </span>
                    <ul className="import-level-values">
                      {shown.map((v: string) => <li key={v} title={v}>{v}</li>)}
                      {gc.variants.length > shown.length && (
                        <li className="is-more">+{gc.variants.length - shown.length} more</li>
                      )}
                    </ul>
                    <span className="import-level-control">
                      <DropDownSelect
                        label="read as"
                        size="small"
                        block
                        value={gc.verdict}
                        options={[
                          { value: 'modes', label: 'modes' },
                          { value: 'separate', label: 'collections' },
                        ]}
                        onChange={(v: string) => window.PomImportLevels.onGroupToggle?.(group, v)}
                      />
                    </span>
                  </span>
                );
              })()}

              {(byGroup[group] || []).map((c) => {
                const role = c.role || 'name';
                const modeTaken = !!c.modeTakenBySibling;
                const shown = c.values.slice(0, 5);
                const segs: string[] = c.segments || [];
                return (
                  <span key={c.depth} className="import-level-row">
                    {/* WHICH PART OF THE NAME THIS ROW MOVES. Two depths of one
                        group render two lists that look alike and are not —
                        marking the segment each one owns is what makes the
                        second dropdown read as a second axis rather than a
                        repeat of the first. See .import-level-path. */}
                    {segs.length > 0 && (
                      <span className="import-level-path" aria-hidden="true">
                        {segs.map((seg, i) => (
                          <span key={i} style={{ display: 'contents' }}>
                            {i > 0 && <span className="sep">/</span>}
                            <span className={'seg' + (i === c.depth ? ' is-axis' : '') +
                                             (i === segs.length - 1 && i !== c.depth ? ' is-leaf' : '')}
                                  title={seg}>{seg}</span>
                          </span>
                        ))}
                      </span>
                    )}
                    {/* The values, one per line. Run together on a single line
                        they read as prose and nobody counts them; as a list the
                        shape of the axis is visible at a glance. */}
                    <ul className="import-level-values">
                      {shown.map((v: string) => <li key={v} title={v}>{v}</li>)}
                      {c.values.length > shown.length && (
                        <li className="is-more">+{c.values.length - shown.length} more</li>
                      )}
                    </ul>
                    <span className="import-level-control">
                      <DropDownSelect
                        /* DropDownSelect RENDERS its label — there is no
                           labelHidden, and hiding it in CSS would leave the
                           control unnamed, since the component drops aria-label
                           when a visible <label> owns the name. Kept to two
                           words because it repeats down the column. */
                        label="read as"
                        size="small"
                        block
                        value={role}
                        options={[
                          { value: 'name', label: ROLE_LABEL.name },
                          { value: 'mode', label: ROLE_LABEL.mode + (modeTaken ? ' \u2014 axis taken' : ''), disabled: modeTaken },
                          { value: 'collection', label: ROLE_LABEL.collection },
                        ]}
                        onChange={(v: string) => window.PomImportLevels.onToggle?.(c.group, c.depth, v)}
                      />
                    </span>
                  </span>
                );
              })}

              {mine.length > 0 && (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span className="import-fig-label">How this lands in Figma</span>
                  <Preview collections={mine} />
                </span>
              )}
            </span>
          );
        })}
      </span>
    );
  }

  /* SUBCARD_LEVEL: every "read as" dropdown stands on .import-level-section,
     which is rung 3 now. At CARD_LEVEL they would compute rung 3 as well and
     paint the colour of the card behind them — the same disappearance Compare's
     file picker was measured doing on the main screen. */
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={SUBCARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomImportLevels = {
    set: (c, a, cols, gc, ord) => set(c, a, cols || [], gc || [], ord || []),
    onToggle: null,
    onGroupToggle: null,
  };
})();

/* ── what the import will do ─────────────────────────────────────────────────

  A COUNT AND A SENTENCE IS NOT A REPORT OF WHAT IS BEING ADDED.

  This was a column of fact rows — a right-aligned number, then a line of prose
  — and the collections one ran their fourteen names together in that prose, in
  the muted colour of an aside, wrapping to three lines. The single most useful
  thing on the panel, and the panel's own layout was working against it: you
  could not see at a glance how many there were, and you had to read a comma
  list to find out whether the one you cared about was in it.

  So the number leads its own heading, and the names are tags underneath it.
  Fourteen tags read as fourteen things without being counted, and one of them
  can be found by looking rather than by reading.
*/
(function mountImportChanges() {
  const container = document.getElementById('import-changes-mount');
  let set: (d: any) => void = () => {};
  function View() {
    const [d, setD] = useState<any>(null);
    set = setD;
    if (!d) return null;
    const s = d.summary || {};
    if (s.noop) {
      return <p className="import-change-note is-lead">This file already matches the document — nothing would change.</p>;
    }
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
    return (
      <span className="import-changes">
        {s.willCreateCollections > 0 && (
          <span className="import-change-group">
            <span className="import-change-heading">
              {s.willCreateCollections.toLocaleString()} new {plural(s.willCreateCollections, 'collection', 'collections')}
            </span>
            {/* The names, as things rather than as a sentence. */}
            <span className="import-change-tags">
              {(d.collections?.added || []).map((name: string) => (
                <Tag key={name} variant="tonal" size="small">{name}</Tag>
              ))}
            </span>
          </span>
        )}

        {s.willAddModes > 0 && (
          <span className="import-change-group">
            <span className="import-change-heading">
              {s.willAddModes.toLocaleString()} new {plural(s.willAddModes, 'mode', 'modes')}
            </span>
            <span className="import-change-note">
              on {plural(s.willAddModes, 'a collection', 'collections')} that already exists here
            </span>
          </span>
        )}

        {s.willCreateVariables > 0 && (
          <span className="import-change-group">
            <span className="import-change-heading">
              {s.willCreateVariables.toLocaleString()} {plural(s.willCreateVariables, 'variable', 'variables')} created
            </span>
            {/*
              THE PROMISE, STATED EVEN AT ZERO. "Never deletes" is what this
              panel is really for, and a promise only shown when the number
              happens to be interesting is not one.
            */}
            <span className="import-change-note">
              {s.valuesLeftAlone.toLocaleString()} {plural(s.valuesLeftAlone, 'value', 'values')} this file
              does not mention — left alone, never deleted
            </span>
          </span>
        )}

        {s.willChangeVariables > 0 && (
          <span className="import-change-group">
            {/* The one heading that is not an addition, so it is marked as
                such rather than sitting in the same voice as the rest. */}
            <span className="import-change-heading is-warn">
              {s.willChangeVariables.toLocaleString()} existing {plural(s.willChangeVariables, 'variable', 'variables')} overwritten
            </span>
            {s.valuesUnchanged > 0 && (
              <span className="import-change-note">
                {s.valuesUnchanged.toLocaleString()} more already hold the same value
              </span>
            )}
            {(d.changed || []).length > 0 && (
              <span className="import-detail">
                {d.changed.slice(0, 6).map((c: any, i: number) => {
                  const p = c.key.split('|');
                  return <span key={i}>{p[0] + ' / ' + p[1] + ' [' + p[2] + ']  ' + c.from + ' \u2192 ' + c.to}<br /></span>;
                })}
                {d.changed.length > 6 && <>… and {(d.changed.length - 6).toLocaleString()} more</>}
              </span>
            )}
          </span>
        )}
      </span>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomImportChanges = { set: (d) => set(d) };
})();

/* ── the file that was chosen ───────────────────────────────────────────────

  THE KIT ALREADY HAD THIS. FileUploadItem is the uploaded-file row: the name,
  the size, a glyph chosen from the type, and a ✕ that appears only when it is
  given something to do. Writing a third file header by hand — the import page
  already had one, the Json download card has another — would have been a
  fourth spelling of a row this design system has settled.

  ONE FILE, so this is a single row rather than a FileUploadList. An import
  reads exactly one document; a list would imply otherwise before anyone had
  tried it, and the remove here is what makes "one" workable rather than a
  dead end.

  The ✕ is the ONLY way back to the drop zone, which is why it is wired to a
  real reset in ui.template.html rather than just hiding the row: a card that
  disappears while the parsed document is still in importState would leave the
  Apply button acting on a file nobody can see.
*/
(function mountImportFile() {
  const container = document.getElementById('import-file-item-mount');
  let set: (f: ImportFileState | null) => void = () => {};

  function View() {
    const [file, setFile] = useState<ImportFileState | null>(null);
    set = setFile;
    if (!file) return null;
    /*
      THE GLYPH CARRIES THE STATE, because it is the only part of the row that
      is not already text. The name and the size are written out; a second
      written "done" beside them would be noise, and an animation where the
      file type used to be is read without being read.

        reading  Spinner  — the kit's own suggestion for this slot, in its own
                            words: "a Spinner while the row is still
                            resolving". label='' because the row above it is
                            already named, and two announcements of one thing
                            is worse than none.
        done     THE KIT'S OWN, DERIVED FROM THE TYPE — `leading` left off, so
                 `application/json` takes FileIcon, the blank sheet. It was a
                 ConfirmIcon, which answered a question nobody had: the row is
                 on screen because the file arrived, the size beside it is
                 proof, and what is underneath it now is a count of everything
                 that was in it. A tick over all of that is the row agreeing
                 with itself.
        failed   the file glyph, with `error` taking the subtitle's place —
                 the component displaces the size with the reason, which is
                 the one place a failure belongs on this row.

      A DETERMINATE RING around the glyph is what was actually asked for and
      the kit has no such component: Spinner is circular but indeterminate,
      ProgressBar is determinate but a bar. Raised as disarantidis/pomegranate#93
      rather than hand-drawn here — an arc with its own dash keyframes would be
      a second, unowned spinner living in this file, with none of Spinner's
      pathLength normalisation and none of its reasoning about --accent. So
      the swap below is a cut rather than a motion, on purpose, until the kit
      has the mark.
    */
    const leading = file.busy ? <Spinner size={18} strokeWidth={2.5} label="" /> : undefined;
    return (
      <FileUploadItem
        name={file.name}
        bytes={file.bytes}
        type="application/json"
        size="medium"
        error={file.error}
        leading={leading}
        /*
          HANDING IT A REMOVER IS WHAT GIVES IT A BUTTON — see the prop's own
          note. The row names it after the file, so it announces as "Remove
          sarantidis-foundations.json" rather than a bare dismiss.

          ONE REMOVER, AND IT IS THIS ONE. A full-width "Remove JSON" under the
          row said the same thing at ten times the size, and took the place
          where what the file CONTAINS now goes. Removing something is a small
          act on a row that names what is being removed; reading what arrived
          is the reason the card exists.

          ITS VARIANT IS A PROP NOW. `ghost` was pinned into FileUploadItem's
          own render with nothing that reached it, which is half of
          disarantidis/pomegranate#92 and is answered upstream by
          `removeVariant`. `tonal` is the case that prop was added for, in its
          own words: a row that is the only content of a raised card, where a
          ghost control has no ground of its own and sits at the same value as
          the surface behind it.

          Its GLYPH is still the kit's ✕ and still has no prop, so the trash is
          painted over it from this app's stylesheet — see the
          #import-file-item-mount block in ui.template.html. A dismiss means
          "put this away"; this throws the document out. The other half of #92.
        */
        removeVariant="tonal"
        onRemove={() => window.PomImportFile.onRemove?.()}
      />
    );
  }

  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomImportFile = {
    set: (name, bytes, opts) => set(name ? { name, bytes, busy: !!(opts && opts.busy), error: opts && opts.error } : null),
    onRemove: null,
  };
})();

/* ── the questions an import cannot answer for itself ───────────────────────

  derive() refuses rather than guessing, and every refusal it raises carries an
  id, the question in words, and the answers that would settle it. This renders
  them and hands the answer back; nothing here decides anything.

  Each question is a CHOICE BETWEEN NAMED OPTIONS, never free text — the set of
  valid answers is always known (modes vs separate, the four Figma types, which
  collection a path meant), so offering a text field would only invite an
  answer that cannot be used.

  SegmentedControl while the options fit on one line, a stacked list once they
  do not: a reference collision can name a dozen collections, and squeezing
  twelve segments into a plugin panel makes every one of them unreadable.
*/
(function mountImportQuestions() {
  const container = document.getElementById('import-questions-mount');
  let set: (qs: any[]) => void = () => {};
  function View() {
    const [questions, setQuestions] = useState<any[]>([]);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    set = (qs) => { setQuestions(qs || []); setAnswers({}); };
    if (!questions.length) return null;
    const answer = (id: string, value: string) => {
      setAnswers((a) => ({ ...a, [id]: value }));
      window.PomImportQuestions.onAnswer?.(id, value);
    };
    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-component-5)' }}>
        {questions.map((q) => (
          <span key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--app-text)', lineHeight: 1.5 }}>{q.question}</span>
            {q.evidence && (
              <span style={{ fontSize: 11, color: 'var(--app-text-muted)', lineHeight: 1.5 }}>{q.evidence}</span>
            )}
            {q.options && q.options.length <= 3 ? (
              <SegmentedControl
                /* Not rendered — SegmentedControl uses `label` as the
                   radiogroup's aria-label. The question is already on screen
                   above it, and passing it here is what names the group for a
                   screen reader too. */
                label={q.question}
                size="small"
                value={answers[q.id] ?? ''}
                options={q.options.map((o: string) => ({ value: o, label: o }))}
                onChange={(v: string) => answer(q.id, v)}
              />
            ) : (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(q.options || []).map((o: string) => (
                  <PomButton
                    key={o}
                    variant={answers[q.id] === o ? 'primary' : 'tonal'}
                    size="small"
                    label={o}
                    block
                    onClick={() => answer(q.id, o)}
                  />
                ))}
              </span>
            )}
          </span>
        ))}
      </span>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomImportQuestions = { set: (qs) => set(qs), onAnswer: null };
})();

/*
  WHAT THE REPOSITORY ACTUALLY HAS, offered one row at a time.

  Sync used to answer in a line of text under the heading — "3 folder paths
  found" — which tells you a number and leaves you to type the paths back in
  from memory. The paths are the answer, so the paths are what it shows, each
  one on the same [field][+] row the Settings card already uses to add one by
  hand. Adding is per path and not all-or-nothing: a repo has folders that have
  nothing to do with tokens, and "found" is not "wanted".

  A row that has been added stays on the list, marked, rather than vanishing.
  A list that shrinks as it is used cannot be checked against, and the question
  this dialog answers — which of these am I tracking? — needs both halves of
  the answer visible at once.
*/
/*
  A SEARCH ONLY WHEN THERE IS SOMETHING TO SEARCH. Eight rows fit on screen and
  are read faster than they are typed at; a field above them would be a control
  that costs a look and saves nothing. Past that the list scrolls, and scrolling
  to find a name you already know is the thing a search exists to stop.
*/
const FOLDER_SEARCH_MIN = 8;
function mountFolderDiscovery() {
  const container = document.getElementById('folder-discovery-dialog-mount');
  type S = { open: boolean; provider: string; where: string; paths: string[]; added: string[]; query: string };
  let state: S = { open: false, provider: 'github', where: '', paths: [], added: [], query: '' };
  let apply: ((s: S) => void) | null = null;
  const put = (next: Partial<S>) => { state = { ...state, ...next }; apply?.(state); };
  function View() {
    const [s, setS] = useState<S>(state);
    apply = setS;
    const isAdded = (p: string) => s.added.indexOf(p) !== -1;
    const label = (p: string) => (p === '' ? '/' : p);
    /* Substring and case-insensitive, matching the folder combo's own rule:
       the part of a path somebody remembers is as often the middle of it
       ("design") as the start. */
    const q = s.query.trim().toLowerCase();
    const shown = q ? s.paths.filter((p) => label(p).toLowerCase().indexOf(q) !== -1) : s.paths;
    return (
      <Dialog
        open={s.open}
        onClose={() => put({ open: false })}
        /* The title names the THING; the repository goes under it, beside its
           own mark. As one sentence it wrapped to two lines of heading — a
           repository name is long and nobody reads it as prose — and pushed
           the rows it was introducing off the top of a small panel. */
        title="Folder paths"
        size="large"
        actions={
          /*
            ONE BUTTON, FULL WIDTH. There were two — Close and Complete — on the
            theory that leaving and finishing are different intentions. They are
            not, here: every + saves as it is pressed, so by the time either
            button is reachable the work is already done and both of them do the
            identical nothing. Two controls that cannot differ in effect only
            ask the reader to look for a difference.
          */
          <PomButton id="folder-discovery-close" variant="primary" size="medium" block
            label="Close" onClick={() => put({ open: false })} />
        }
      >
        <p className="folder-discovery-where">
          {s.provider === 'gitlab' ? IconGitlab(14) : IconGithub(14)}
          <span>{s.where || 'this repository'}</span>
        </p>
        {s.paths.length > FOLDER_SEARCH_MIN && (
          <div className="folder-discovery-search">
            <PomTextField
              id="folder-discovery-search"
              label="Search paths"
              icon={IconSearch(16)}
              defaultValue=""
              onInput={(v: string) => put({ query: v })}
            />
          </div>
        )}
        <div className="folder-discovery-list">
          {!s.paths.length ? (
            <p className="folder-discovery-empty">
              Nothing but the repository root, which is already where a push goes
              when no folder is chosen.
            </p>
          ) : !shown.length ? (
            <p className="folder-discovery-none">No path here matches “{s.query.trim()}”.</p>
          ) : shown.map((p) => (
            <div className="folder-discovery-row" key={p}>
              <span className="folder-discovery-path" title={label(p)}>
                {IconFolder(14)}<span>{label(p)}</span>
              </span>
              {isAdded(p) ? (
                /* Not a disabled +. Disabled says "you may not", and the answer
                   here is "you already have", which is a different sentence. */
                <span className="folder-discovery-added">{IconCheck(14)} Added</span>
              ) : (
                <PomButton
                  /* medium, to stand as tall as the row it belongs to — small
                     left it floating against a taller field, which reads as two
                     controls that happen to be near each other rather than one
                     row. Same pairing as the folder list's own [path][+]. */
                  variant="outline" size="medium" iconOnly icon={IconAdd(16)}
                  title={'Track ' + label(p)} aria-label={'Track ' + label(p)}
                  onClick={() => {
                    /* `state`, not the render's `s`. Two rows added in quick
                       succession both read the same pre-update snapshot, so the
                       second overwrote the first and only one of the two ever
                       showed as added — while both had in fact been saved,
                       which is the worst version of the bug: the list and the
                       thing it describes disagreeing. */
                    if (state.added.indexOf(p) !== -1) return;
                    put({ added: state.added.concat([p]) });
                    window.PomFolderDiscovery.onAdd?.(p);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </Dialog>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
  window.PomFolderDiscovery = {
    /* query cleared on every open: a filter left over from the last time hides
       rows that are on the list, which reads as a list that lost them. */
    open: (provider, where, paths, added) =>
      put({ open: true, provider, where, paths: paths || [], added: added || [], query: '' }),
    onAdd: null,
  };
}
mountFolderDiscovery();

/*
  REMOVING A FOLDER PATH — and what that means for the repository.

  The trash on a saved row used to remove it from this plugin's list, which is
  a local bookkeeping change and instant. It can now also delete the folder from
  the repository, and those two are so far apart in consequence that they cannot
  share one unannounced click.

  So: the choice is the dialog, and the harmless one is the default. What it
  offers depends on what is actually in the folder, which is read before this
  opens rather than assumed — a folder holding a 20 MB token file and an empty
  one deserve different sentences, and only one of them can be written in
  advance.

  THE FILES ARE LISTED BY NAME. "3 files" asks somebody to authorise deleting
  things they cannot see; the names are what make consent mean anything.
*/
function mountFolderRemove() {
  const container = document.getElementById('folder-remove-dialog-mount');
  type S = {
    open: boolean; provider: string; where: string; path: string;
    files: string[]; dirs: string[]; busy: boolean; error: string; mode: string;
  };
  const FRESH: S = { open: false, provider: 'github', where: '', path: '', files: [],
                     dirs: [], busy: false, error: '', mode: 'list' };
  let state: S = FRESH;
  let apply: ((s: S) => void) | null = null;
  const put = (next: Partial<S>) => { state = { ...state, ...next }; apply?.(state); };
  function View() {
    const [s, setS] = useState<S>(state);
    apply = setS;
    const n = s.files.length;
    /*
      'list' is first and pre-selected. The other two write to somebody's
      repository, and a dialog that opens with a destructive option already
      chosen is a dialog that deletes on a reflex Enter.
    */
    const options: { value: string; label: string; note: string }[] = [
      { value: 'list', label: 'Remove from this list only',
        note: 'The folder and everything in it stay in the repository.' },
    ];
    if (n) {
      options.push({ value: 'move', label: 'Move the files to the repository root, then delete the folder',
        note: n + ' file' + (n === 1 ? '' : 's') + ' kept, at the top level instead of inside ' + s.path + '.' });
      options.push({ value: 'delete', label: 'Delete the folder and everything in it',
        note: n + ' file' + (n === 1 ? '' : 's') + ' removed from the repository. Recoverable only from git history.' });
    } else {
      options.push({ value: 'delete', label: 'Delete the folder from the repository',
        note: 'It holds no files, so nothing is lost with it.' });
    }
    return (
      <Dialog
        open={s.open}
        onClose={() => put({ open: false })}
        title="Remove folder path"
        size="large"
        actions={
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <PomButton id="folder-remove-cancel" variant="ghost" size="medium" block
              label="Cancel" disabled={s.busy} onClick={() => put({ open: false })} />
            <PomButton id="folder-remove-confirm" variant="primary" size="medium" block
              destructive={s.mode !== 'list'}
              loading={s.busy}
              label={s.mode === 'list' ? 'Remove from the list'
                   : s.mode === 'move' ? 'Move and delete'
                   : 'Delete from the repository'}
              onClick={() => { put({ busy: true, error: '' });
                               window.PomFolderRemove.onConfirm?.(s.mode); }} />
          </div>
        }
      >
        <p className="folder-discovery-where">
          {s.provider === 'gitlab' ? IconGitlab(14) : IconGithub(14)}
          <span>{s.where}</span>
        </p>
        {/* The folder and what is in it as ONE thing, because that is what is
            being removed. A separate list under a heading reads as two facts
            that happen to be near each other; nested under the folder it reads
            as its contents, which is the whole point of showing them. */}
        <div className="folder-remove-tree">
          <p className="folder-remove-path">{IconFolder(14)}<span>{s.path}</span></p>
          {s.dirs.slice(0, 4).map((d) => (
            <p className="folder-remove-child" key={'d-' + d}>{IconFolder(14)}<span>{d}/</span></p>
          ))}
          {s.files.slice(0, 12).map((f) => (
            <p className="folder-remove-child" key={'f-' + f}>{IconFile(14)}<span>{f}</span></p>
          ))}
          {n > 12 && <p className="folder-remove-more">…and {n - 12} more files</p>}
        </div>
        {/*
          A RADIOGROUP, WRITTEN HERE BECAUSE THE CARD CANNOT. SelectableCard's
          own header says it: a card holds `selected` rather than a real input,
          so it can write aria-checked and cannot write the SET — without this
          wrapper a reader hears "radio" with no set to be one of.
        */}
        <div className="folder-remove-choices" role="radiogroup" aria-label="What to do with this folder">
          {options.map((o) => (
            <SelectableCard
              key={o.value}
              label={o.label}
              group="folder-remove-mode"
              selected={s.mode === o.value}
              disabled={s.busy}
              size="small"
              level={CARD_LEVEL}
              onSelect={() => put({ mode: o.value })}
            >
              <span className="folder-remove-choice-body">
                <b>{o.label}</b>
                <em>{o.note}</em>
              </span>
            </SelectableCard>
          ))}
        </div>
        {s.error ? <p className="folder-remove-error">{s.error}</p> : null}
      </Dialog>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
  window.PomFolderRemove = {
    open: (info) => put({ ...FRESH, ...info, open: true }),
    close: () => put({ open: false, busy: false }),
    fail: (message) => put({ busy: false, error: message }),
    onConfirm: null,
  };
}
mountFolderRemove();

window.PomRemoveGithubDialog = { open: () => {}, onConfirm: null };
confirmDialog('remove-github-dialog-mount',
  { title: 'Remove GitHub?', text: 'This clears the saved GitHub token, repository, and folder paths from this plugin.', confirmLabel: 'Remove', onConfirm: () => window.PomRemoveGithubDialog.onConfirm?.() },
  (open) => { window.PomRemoveGithubDialog.open = open; });

window.PomRemoveGitlabDialog = { open: () => {}, onConfirm: null };
confirmDialog('remove-gitlab-dialog-mount',
  { title: 'Remove GitLab?', text: 'This clears the saved GitLab token, project, and folder paths from this plugin.', confirmLabel: 'Remove', onConfirm: () => window.PomRemoveGitlabDialog.onConfirm?.() },
  (open) => { window.PomRemoveGitlabDialog.open = open; });

/* clear-token: one dialog, both providers */
(function mountClearTokenDialog() {
  const container = document.getElementById('clear-token-dialog-mount');
  let setOpen: (v: boolean) => void = () => {};
  let setProvider: (p: 'gitlab' | 'github') => void = () => {};
  function View() {
    const [open, setO] = useState(false);
    const [provider, setP] = useState<'gitlab' | 'github'>('gitlab');
    setOpen = setO; setProvider = setP;
    const label = provider === 'github' ? 'GitHub' : 'GitLab';
    return (
      <Dialog
        open={open}
        onClose={() => setO(false)}
        size="small"
        title={`Clear ${label} token?`}
        description={`The saved ${label} token is removed from this plugin. Everything else — repository, branch and saved folder paths — stays as it is, and pushing is paused until you enter a new token.`}
        actions={
          <div style={{ display: 'flex', flexDirection: 'row', gap: 12, width: '100%' }}>
            <Button variant="tonal" size="large" style={{ flex: 1 }} onClick={() => setO(false)}>Cancel</Button>
            <Button variant="primary" size="large" style={{ flex: 1 }} data-scheme="error" onClick={() => { setO(false); window.PomClearTokenDialog.onConfirm?.(provider); }}>Clear</Button>
          </div>
        }
      >{null}</Dialog>
    );
  }
  if (container) createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>);
  window.PomClearTokenDialog = {
    open: (provider) => { flushSync(() => setProvider(provider)); setOpen(true); },
    onConfirm: null,
  };
})();

/*
  CLEAR EVERY VARIABLE IN THE FILE — the confirmation.

  Its own dialog rather than confirmDialog() because the only thing that makes
  this safe to offer is the COUNTS, and those are different every time it
  opens. A fixed sentence would have to say "all your variables", which is the
  wording someone clicks past; "11 collections and 2,765 variables" is the
  wording that stops them.

  IT NAMES THE FILE. This plugin runs in whatever document is open, and the
  one mistake worth designing against is not misreading the button — it is
  being in the wrong file. So the file's name is in the dialog, in the
  sentence, where it has to be read to get to the confirm.

  IT SAYS WHAT ELSE BREAKS. A variable is not only a row in a panel: every
  node bound to one loses that binding when it goes. Someone picturing only
  the panel is agreeing to something smaller than what happens.

  NO PROMISE OF UNDO. Figma keeps plugin edits on its own undo stack and
  Cmd-Z often does bring them back, but that is Figma's behaviour, not
  something this code controls — so the dialog does not offer it.
*/
(function mountClearVariablesDialog() {
  const container = document.getElementById('clear-variables-dialog-mount');
  let setOpen: (v: boolean) => void = () => {};
  let setSummary: (s: any) => void = () => {};
  function View() {
    const [open, setO] = useState(false);
    const [s, setS] = useState<{ collections: number; variables: number; names: string[]; fileName: string }>(
      { collections: 0, variables: 0, names: [], fileName: '' });
    setOpen = setO; setSummary = setS;
    const n = (x: number) => x.toLocaleString();
    const plural = (x: number, word: string) => x + ' ' + word + (x === 1 ? '' : 's');
    /* Every name while they fit, then a count — a list that scrolls is not
       read, and the number is the part that has to land. */
    const names = s.names.length <= 8
      ? s.names.join(', ')
      : s.names.slice(0, 8).join(', ') + ' and ' + (s.names.length - 8) + ' more';
    return (
      <Dialog
        open={open}
        onClose={() => setO(false)}
        size="small"
        title={'Delete all variables in ' + (s.fileName || 'this file') + '?'}
        description={
          'This removes ' + plural(s.collections, 'collection') + ' and ' + n(s.variables) +
          ' variable' + (s.variables === 1 ? '' : 's') + ' from the Figma file — ' + names + '. ' +
          'Any layer, style or component using one of them loses that binding and keeps ' +
          'the raw value it was showing. Nothing is exported or saved first.'
        }
        actions={
          <div style={{ display: 'flex', flexDirection: 'row', gap: 12, width: '100%' }}>
            <Button variant="tonal" size="large" style={{ flex: 1 }} onClick={() => setO(false)}>Cancel</Button>
            <Button variant="primary" size="large" style={{ flex: 1 }} data-scheme="error"
                    onClick={() => { setO(false); window.PomClearVariablesDialog.onConfirm?.(); }}>
              {'Delete ' + n(s.variables)}
            </Button>
          </div>
        }
      >{null}</Dialog>
    );
  }
  if (container) createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>);
  window.PomClearVariablesDialog = {
    open: (summary) => { flushSync(() => setSummary(summary)); setOpen(true); },
    onConfirm: null,
  };
})();

/* provider choice card for onboarding step 1 */
const PROVIDER_LOGO_PATH: Record<'gitlab' | 'github', string> = {
  gitlab: 'M23.955 13.587l-1.342-4.135-2.664-8.189c-.135-.423-.73-.423-.867 0L16.418 9.45H7.582L4.919 1.263C4.783.84 4.185.84 4.05 1.264L1.386 9.45.044 13.587c-.121.375.014.789.331 1.023L12 23.054l11.625-8.443c.318-.235.453-.647.33-1.024',
  github: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z',
};
/* This used to be a hand-rolled <div role="checkbox">, styling itself off
   var(--app-accent) — a token that is never actually declared anywhere in
   tokens.css/node.css, only mentioned in prose comments there. Its checked
   state (border: 1px solid var(--app-accent)) was therefore an INVALID
   declaration, so the whole shorthand dropped (computed border: 0px none)
   while the unchecked state's `1px solid transparent` stayed valid at 1px —
   a 2px height jump on every select/deselect, reported from the real
   plugin. The vendored kit already has a component built for exactly this
   ("a card that is a choice rather than a destination", SelectableCard.tsx)
   — real <button> semantics (Enter/Space for free, no hand-rolled
   onKeyDown), a selection ring painted from --mark (a real, always-defined
   token, unlike --app-accent), and the same 1px border at rest and
   selected (node.css's .nd-selcard: border always present; .is-selected
   only recolors it via border-color + box-shadow, never adds/removes it —
   the whole class of "shorthand silently invalidates" bug this hit isn't
   reachable through it). Swapped to it instead of just patching the color,
   since the hand-rolled div is *why* this broke in the first place. */
function ProviderChoiceCard({ which, label, checked, onToggle }: { which: 'gitlab' | 'github'; label: string; checked: boolean; onToggle: (c: boolean) => void }) {
  return (
    // level={1}: same reasoning the old div's data-level={1} comment gave —
    // this card sits inside the onboarding Dialog (hardcoded data-level={4},
    // Dialog.tsx), and the composition rule's ascending order above L4 is
    // 1 → 2 → 3, so a selectable row (one of L1's own named uses) gets L1
    // and its logo badge one rung up at L2, so all three read apart.
    <SelectableCard label={label} selected={checked} onSelect={() => onToggle(!checked)} mark="checkbox" level={1}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden="true" data-level={2} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: 'var(--background)', color: 'var(--app-text-muted)', flexShrink: 0 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d={PROVIDER_LOGO_PATH[which]} /></svg>
        </span>
        <span style={{ fontWeight: 600, color: 'var(--app-text)' }}>{label}</span>
      </span>
    </SelectableCard>
  );
}

(function mountOnboardingDialog() {
  const container = document.getElementById('onboarding-dialog-mount');
  let setOpen: (v: boolean) => void = () => {};
  function whatsNeeded(s: PushCheckboxState): string {
    const gl = 'GitLab needs a personal access token — its host, project and branch are already filled in for you.';
    const gh = 'GitHub needs a personal access token and the owner/repo to push to.';
    if (s.gitlab && s.github) return gl + ' ' + gh;
    return s.github ? gh : gl;
  }
  function View() {
    const [open, setO] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);
    const [state, setState] = useState<PushCheckboxState>({ gitlab: true, github: false });
    setOpen = (next: boolean) => { if (next) setStep(1); setO(next); };
    // No more "at least one stays checked" guard — declining both is a
    // real, valid choice (Download alone works fine), not a state to
    // prevent. See the Next/Skip button below for what neither-checked
    // actually does.
    function toggle(which: keyof PushCheckboxState, checked: boolean) {
      setState((s) => ({ ...s, [which]: checked }));
    }
    const neitherChecked = !state.gitlab && !state.github;
    return (
      <Dialog
        open={open}
        onClose={() => setO(false)}
        size="small"
        title={step === 1 ? 'Push destination' : 'Repository settings'}
        description={step === 1 ? 'Where do you want to push your tokens? Pick one or both, or skip and just download the JSON — you can add this anytime in Settings.' : whatsNeeded(state)}
        actions={
          step === 1 ? (
            // Neither checked has nothing for step 2 to ask about (no
            // token to collect for a provider that wasn't picked), so it
            // confirms straight from here instead of advancing —
            // targetFromCheckboxes() can't express "neither" (it's built
            // for a picker where at least one is always checked), so
            // 'none' is passed explicitly.
            <Button variant="primary" size="large" block onClick={() => {
              if (neitherChecked) {
                setO(false);
                window.PomOnboardingDialog.onConfirm?.('none');
              } else {
                setStep(2);
              }
            }}>{neitherChecked ? 'Skip — just download' : 'Next'}</Button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'row', gap: 12, width: '100%' }}>
              <Button variant="tonal" size="large" style={{ flex: 1 }} onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" size="large" style={{ flex: 1 }} onClick={() => { setO(false); window.PomOnboardingDialog.onConfirm?.(targetFromCheckboxes(state)); }}>Add Settings</Button>
            </div>
          )
        }
      >
        {step === 1 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <ProviderChoiceCard which="gitlab" label="GitLab" checked={state.gitlab} onToggle={(c) => toggle('gitlab', c)} />
            <ProviderChoiceCard which="github" label="GitHub" checked={state.github} onToggle={(c) => toggle('github', c)} />
          </div>
        ) : null}
      </Dialog>
    );
  }
  if (container) createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>);
  window.PomOnboardingDialog = { open: () => setOpen(true), onConfirm: null };
})();
