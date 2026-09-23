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
import { Switch } from '../vendor/pomegranate/panel/node/Switch';
import { ListControlItem } from '../vendor/pomegranate/panel/node/ListControlItem';
import { SegmentedControl } from '../vendor/pomegranate/panel/node/SegmentedControl';
import { Checkbox } from '../vendor/pomegranate/panel/node/Checkbox';
import { DropDownSelect } from '../vendor/pomegranate/panel/node/DropDownSelect';
import { Combobox } from '../vendor/pomegranate/panel/node/Combobox';
import { Dialog } from '../vendor/pomegranate/panel/node/Dialog';
import { InteractiveCard } from '../vendor/pomegranate/panel/node/InteractiveCard';
import { Toast } from '../vendor/pomegranate/panel/node/Toast';
import { Alert } from '../vendor/pomegranate/panel/node/Alert';
import { Skeleton } from '../vendor/pomegranate/panel/node/Skeleton';
import { Tag } from '../vendor/pomegranate/panel/node/Tag';
import { Table } from '../vendor/pomegranate/panel/node/Table';
import { SelectableCard } from '../vendor/pomegranate/panel/node/SelectableCard';
import { FileUploadItem } from '../vendor/pomegranate/panel/node/FileUploadItem';
import { Spinner } from '../vendor/pomegranate/panel/node/Spinner';
import { ConfirmIcon } from '../vendor/pomegranate/panel/node/Icon';
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
const IconAdd = svg('M12 5v14M5 12h14');
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
    disabled, loading, active, style, title, onClick, block, flex,
  } = props;
  const iconOnly = !!icon; // the icon-button bag carries `icon`; text buttons carry `label`
  const leading = iconOnly ? icon : (leftIcon ? buttonLeftIcon : undefined);
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
        label="Folder path"
        size="small"
        block
        value={s.value}
        options={options.length ? options : [{ value: '', label: '—' }]}
        onChange={(v: string) => onSelect(v)}
        {...(base.style ? { style: base.style } : null)}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={level}><View /></LevelContext.Provider>));
  return { setItems: (items, value) => set(() => ({ items, value })) };
}

/* ── window.Pom* bridge shapes (types stripped by esbuild; kept for clarity) ─ */
type FolderListBridge = {
  render: (rows: { path: string; canEdit: boolean }[]) => void;
  onInput: ((idx: number, value: string) => void) | null;
  onBlur: ((idx: number, value: string) => void) | null;
  onRemove: ((idx: number) => void) | null;
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
    PomAddGitlabBtn: LiveToggleIconHandle;
    PomAddGithubBtn: LiveToggleIconHandle;
    PomExportMode: { onChange: ((index: number) => void) | null };
    PomToast: { show: (message: string, isError?: boolean) => void };
    PomFolderSelect: FolderComboBridge;
    PomGithubFolderSelect: FolderComboBridge;
    PomImportFolderSelect: FolderComboBridge;
    PomFolderNew: FolderComboBridge;
    PomGithubFolderNew: FolderComboBridge;
    PomFolderList: FolderListBridge;
    PomGithubFolderList: FolderListBridge;
    PomCollectionsAccordion: {
      setTitle: (title: string) => void;
      setCollections: (collections: { name: string; count: number }[]) => void;
      setSummary: (tokensLabel: string) => void;
      /* The Delete-all control lives in this dialog now; the page owns what it
         does, the same way the level rows own their own toggles. */
      onClearVariables: (() => void) | null;
    };
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
                 provider?: 'github' | 'gitlab' | null) => void;
      /* `actionLabel` puts a button in the warning. A refusal that names the
         fix and then makes you go and do it somewhere else is a worse version
         of one that just does it. */
      setProblem: (title: string, message: string, fix?: string, actionLabel?: string) => void;
      setReport: (report: any, copyText: string) => void;
      onAction: (() => void) | null;
    };
    /* The name the plugin WRITES — Download and every push. A plain field;
       the repo's own files are PomRepoFile below, deliberately not here. */
    PomPrimaryFilename: {
      get: () => string;
      set: (value: string) => void;
      onChange: ((value: string) => void) | null;
    };
    /* The file in the repo the comparison READS — and, on the import page under
       the same name, the file the import PULLS. Two mounts, one selection. */
    PomRepoFile: {
      get: () => string;
      set: (value: string) => void;
      setOptions: (names: string[]) => void;
      onChange: ((value: string) => void) | null;
    };
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
    PomRemoveGithubDialog: { open: () => void; onConfirm: (() => void) | null };
    PomRemoveGitlabDialog: { open: () => void; onConfirm: (() => void) | null };
    PomClearTokenDialog: { open: (provider: 'gitlab' | 'github') => void; onConfirm: ((provider: 'gitlab' | 'github') => void) | null };
    PomClearVariablesDialog: {
      open: (summary: { collections: number; variables: number; names: string[]; fileName: string }) => void;
      onConfirm: (() => void) | null;
    };
    PomRepoTab: { onChange: ((value: 'gitlab' | 'github') => void) | null; setValue: (value: 'gitlab' | 'github') => void };
    PomMainProviderTab: { onChange: ((value: 'gitlab' | 'github') => void) | null; setValue: (value: 'gitlab' | 'github') => void };
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
  // Standard button now, matching Push/"Add Repo Settings" — was icon-only
  // (icon: IconDownload(...), no visible text) and tonal, the odd one out
  // beside those two filled, labeled buttons. leftIcon/buttonLeftIcon (not
  // icon) is what tells PomButton's iconOnly check to render label text
  // instead of collapsing to shape="square" — see PomButton's own comment
  // on that prop bag split. size: 'medium' (not 'large') band-matches this
  // button to #primary-filename-mount's own field size ('small',
  // PomTextField's default) — same "medium IS a small field's box" alias
  // the folder-add/settings icon buttons below already use, not fieldRung:
  // that axis also borrows the field's label lift/drop as button padding,
  // which reads right on a field's own value but drops a button's centred
  // label off-centre for no reason — see the note below folder-add-btn-mount.
  download: mountLiveIconButton(
    'download-btn-mount',
    { id: 'download-btn', variant: 'filled', size: 'medium', leftIcon: true, buttonLeftIcon: IconDownload(24), label: 'Download', title: 'Download' },
    true,
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
window.PomRepoReadBtn = mountLiveTitleButton(
  'repo-read-btn-mount',
  { id: 'repo-read-btn', variant: 'tonal', size: 'small',
    label: 'Compare', leftIcon: true, buttonLeftIcon: IconCompare(16) },
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
mountButton('import-pull-gitlab-mount', { id: 'import-pull-gitlab-btn', variant: 'tonal', size: 'small', label: 'Import from GitLab' });
mountButton('import-pull-github-mount', { id: 'import-pull-github-btn', variant: 'tonal', size: 'small', label: 'Import from GitHub' });

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
(function mountPrimaryFilename() {
  const container = document.getElementById('primary-filename-mount');
  let value = 'tokens.json';
  let apply: ((v: string) => void) | null = null;
  const push = (next: string, tell?: boolean) => {
    value = next;
    apply?.(next);
    if (tell) window.PomPrimaryFilename.onChange?.(value);
  };
  function View() {
    const [v, setV] = useState(value);
    apply = setV;
    return (
      <PomTextField
        id="primary-filename"
        label="File name"
        size="small"
        block
        placeholder="tokens.json"
        value={v}
        onInput={(next: string) => push(next, true)}
        title={'JSON file name — used for both Download and every push destination. ' +
               '".json" is added automatically if you leave it out.'}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomPrimaryFilename = {
    get: () => value,
    set: (next: string) => push(next),
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
function mountRepoFileCombo(mountId: string, bridgeKey: 'PomRepoFile' | 'PomImportRepoFile') {
  const container = document.getElementById(mountId);
  /*
    THE TYPED TEXT AND THE CHOSEN FILE ARE TWO DIFFERENT THINGS.

    They were one, and the control ate its own input: typing "brand" reported
    a new selection, which moved the read address, which re-listed the repo,
    which found no file called "brand" and helpfully picked a default —
    overwriting the three characters that had just been typed. You could not
    filter, because filtering looked exactly like choosing.

    `query` is what is in the box and only ever filters. `selected` is the
    file the comparison is against, and only a PICK changes it — or typing a
    name that exactly matches one, which is the same act done by keyboard.
  */
  type S = { query: string; selected: string; all: string[] };
  let state: S = { query: '', selected: '', all: [] };
  let apply: ((s: S) => void) | null = null;
  const put = (next: Partial<S>, tell?: boolean) => {
    state = { ...state, ...next };
    apply?.(state);
    if (tell) window[bridgeKey].onChange?.(state.selected);
  };
  const commit = (name: string) => put({ selected: name, query: name }, true);
  function View() {
    const [s, setS] = useState<S>(state);
    apply = setS;
    /* THE CALLER FILTERS — Combobox's decision 4. Substring, not prefix: the
       name you half-remember is as often the middle of it ("dtcg") as the
       start. While the box still holds the selection, the whole list shows —
       a list that collapses to the one thing already chosen is a list with
       nothing to choose from. */
    const q = s.query.trim().toLowerCase();
    const options = (!q || s.query === s.selected)
      ? s.all
      : s.all.filter((n) => n.toLowerCase().indexOf(q) !== -1);
    return (
      <Combobox
        label="File in the repo"
        size="small"
        block
        placeholder="nothing pushed yet"
        value={s.query}
        onChange={(v: string) => {
          /* Typing filters. It commits only when what was typed IS one of the
             options — the keyboard way of picking. */
          if (s.all.indexOf(v) !== -1) commit(v);
          else put({ query: v });
        }}
        options={options}
        getKey={(o: string) => o}
        onPick={(o: string) => commit(o)}
        renderOption={(o: string, st: { active: boolean }) => (
          <span style={{ fontWeight: st.active ? 600 : 400 }}>{o}</span>
        )}
        emptyMessage={s.all.length
          ? 'No JSON in this folder matches that'
          : 'No JSON files in this folder yet'}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window[bridgeKey] = {
    get: () => state.selected,
    /* A set from outside is the app choosing, not the user — it moves both,
       silently, because the caller is already acting on the new value. The
       one exception is while somebody is typing in the box: the selection
       still moves, the text they are composing does not. Same rule, and the
       same reason, as the folder combo's. */
    set: (next: string) => put({
      selected: next,
      ...(container && container.contains(document.activeElement) ? null : { query: next }),
    }),
    setOptions: (names: string[]) => put({ all: names || [] }),
    onChange: null,
  };
}
mountRepoFileCombo('repo-file-mount', 'PomRepoFile');
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
// Mirrors the real "ODS Test Foundation" card (mountCollectionsAccordion
// above) now that it's one solid InteractiveCard rather than a variable-
// length row list: icon + title on the left, the token-count tag flush
// right — same .skeleton-foundation-card shape ui.template.html defines
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
// The Json file card's own skeleton pieces — mounted individually into
// #json-download-skeleton's existing markup (ui.template.html), which
// already carries the real card's own classes/data-level, rather than one
// div here the way skeleton-list/actions-skeleton are: this skeleton and
// the real card share the exact same outer structure, just swapping which
// one is hidden (see the 'extracted'/'error' handlers), so there's no
// separate wrapper shape to define. Reads as this card's icon/title/tag/
// field/button, in outline, same shapes at roughly the real sizes.
mountOnce('json-download-icon-skeleton-mount', <Skeleton shape="circle" size={16} label="Loading" />, TOP_CARD_LEVEL);
mountOnce('json-download-title-skeleton-mount', <Skeleton shape="block" width={80} height={16} label="" />, TOP_CARD_LEVEL);
mountOnce('json-download-tag-skeleton-mount', <Skeleton shape="block" width={60} height={22} label="" />, TOP_CARD_LEVEL);
// 50px, not 44 — matches the field/button band Download shares with the
// real field itself, confirmed via computed style: field/Download both
// render at exactly 50px tall today. Same number in both skeleton pieces
// below for that reason, not independently chosen.
mountOnce('json-download-field-skeleton-mount', <Skeleton shape="block" height={50} width={'100%'} label="" />, TOP_CARD_LEVEL);
// 125x50 — the real Download button is a labeled button now (icon +
// "Download" text, ~127px wide), not the old icon-only 44x44 square.
mountOnce('json-download-btn-skeleton-mount', <Skeleton shape="block" width={125} height={50} label="" />, TOP_CARD_LEVEL);
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
function mountFolderCombo(mountId: string, bridgeKey: string, placeholder: string): FolderComboBridge {
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
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
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
window.PomFolderSelect = { ...mountFolderCombo('folder-select-mount', 'PomFolderSelect', 'choose a folder'), onChange: null };
window.PomGithubFolderSelect = { ...mountFolderCombo('github-folder-select-mount', 'PomGithubFolderSelect', 'choose a folder'), onChange: null };
/* The import page's own pair. One combo rather than one per provider, like the
   file picker beside it: the page shows whichever provider the repo card is on,
   and a second hidden copy for the other one would be state that can disagree. */
window.PomImportFolderSelect = { ...mountFolderCombo('import-folder-select-mount', 'PomImportFolderSelect', 'choose a folder'), onChange: null };
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
  function render(rows: { path: string; canEdit: boolean }[]) {
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
  (window as any)[bridgeKey] = { render, onInput: null, onBlur: null, onRemove: null };
}
mountFolderList('folder-list', 'PomFolderList', 'folder-row-input', CARD_LEVEL);
mountFolderList('github-folder-list', 'PomGithubFolderList', 'github-folder-row-input', CARD_LEVEL);

/* ── collections card → modal (read-only breakdown) ─────────────────────────── */
// Was an Accordion that expanded in place; requested instead as "a card
// that opens a modal that showcases the collections" — InteractiveCard
// (a real DS component: "a card whose whole box is a target", not the
// hand-rolled div ProviderChoiceCard used to be — see 33ed673/ddc4da9 for
// why that matters) for the card itself, a plain Dialog for the modal.
// window.PomCollectionsAccordion's own name/shape is kept exactly as-is:
// the vanilla script's 'extracted'/'transformed' handlers call
// setTitle/setCollections/setSummary and don't know or care how this
// renders internally.
(function mountCollectionsAccordion() {
  const container = document.getElementById('collections-list');
  let set: (u: (s: any) => any) => void = () => {};
  function View() {
    const [state, setState] = useState<any>({ title: 'Scanned collections', collections: [], summary: { tokens: '' } });
    const [open, setOpen] = useState(false);
    set = setState;
    return (
      <>
        {/* data-tense="inverted", not InteractiveCard's own `tense` prop —
            that prop is typed 'tonal' | 'strong' only (Card.tsx and
            InteractiveCard.tsx both), so the kit's cards never expose
            "inverted" through their public API — it's wired for chip-like
            elements instead (Tag, Button, SegmentedControl's chosen
            segment, node.css's [data-tense='inverted'] block), not full
            card surfaces. The underlying CSS still supports it generically
            via [data-tense='inverted'] [data-level] though (tokens.css's
            "pole axis"), and InteractiveCard's own root sets data-level on
            itself regardless of who's asking for it — so a plain wrapper
            reaches the exact same cascade without fighting the type
            system or editing the vendored component. */}
        <div data-tense="inverted">
        <InteractiveCard label={`${state.title} — view scanned collections`} level={2} size="large" onClick={() => setOpen(true)}>
          <div className="collections-header">
            {/* One row now, not title-then-tags stacked: icon leads the
                title, the tags sit at the row's own end. .collections-
                summary keeps flex:1 (below), which is what pushes the
                tags there — no separate alignment rule needed for them. */}
            <div className="collections-header-top">
              <span className="collections-header-icon" aria-hidden="true">{IconFigma(18)}</span>
              <span className="collections-summary">{state.title}</span>
              <div className="collections-summary-tags">
                {/* tonal, not ghost — same fix as the per-row counts below
                    (.collections-readonly-list): ghost paints no fill
                    (node.css's .nd-tag.v-ghost, background: none), so these
                    rendered as plain muted text with no visible pill —
                    reported from the real plugin as the tags being
                    "missing" even though the text itself was there.
                    The file-size tag that used to sit beside this one moved
                    to the "Json file" card's own title row instead (see
                    mountJsonFileCard below) — size describes the JSON file,
                    which now has a title of its own to sit under. */}
                {/* The variables glyph rides the COUNT now, not the title —
                    it is the one thing on this row that is actually about
                    variables. `leading`, the slot Tag keeps for exactly this. */}
                {state.summary.tokens
                  ? <Tag variant="tonal" size="small" leading={IconVariables(11)}>{state.summary.tokens}</Tag>
                  : null}
              </div>
            </div>
          </div>
        </InteractiveCard>
        </div>
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
    setTitle: (title) => set((s) => ({ ...s, title })),
    setCollections: (collections) => set((s) => ({ ...s, collections })),
    setSummary: (tokens) => set((s) => ({ ...s, summary: { tokens } })),
    onClearVariables: null,
  };
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

(function mountCompare() {
  const container = document.getElementById('compare-mount');
  type Sides = { figma: string; figmaDetail: string; repo: string; repoDetail: string;
                 provider?: 'github' | 'gitlab' | null };
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
      <div className="json-download-card" data-level={4}>
        <div className="compare-sides">
          <div className="compare-side">
            <span className="compare-side-name">{s.sides.figma}</span>
            <span className="compare-side-detail">{s.sides.figmaDetail}</span>
          </div>
          <div className="compare-side-arrow">compared with</div>
          <div className="compare-side">
            <span className="compare-side-name">{s.sides.repo}</span>
            <span className="compare-side-detail">{s.sides.repoDetail}</span>
          </div>
        </div>
      </div>
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
    const pathCell = (path: string, type?: string) => {
      const parts = path.split('.');
      const nodes: ReactNode[] = [];
      parts.forEach((seg, i) => {
        if (i) { nodes.push(<wbr key={'w' + i} />); nodes.push('.'); }
        nodes.push(seg);
      });
      const icon = type ? TYPE_ICON[type] : undefined;
      return (
        <span className="compare-token" title={type ? path + '  (' + type + ')' : path}>
          {/* Decorative: the type is already the table's own heading, so a
              screen reader that announced it per row would say it 40 times. */}
          {icon && <span className="compare-token-icon" aria-hidden="true">{icon(13)}</span>}
          <span className="compare-cell-path">{nodes}</span>
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
      if (short.length > TAGGABLE) return <span className="compare-cell-text" title={v}>{v}</span>;
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
            <span className="compare-side-detail">{rows.length.toLocaleString()}</span>
          </div>
          <div className="compare-table">
            <Table
              caption={title}
              captionHidden
              size="small"
              rules
              columns={[
                { key: 'from',
                  header: headWith(s.sides.provider === 'gitlab' ? IconGitlab(12)
                                 : s.sides.provider === 'github' ? IconGithub(12) : null, 'Was'),
                  cell: (x: any) => pathCell(x.from, x.type) },
                { key: 'path', header: headWith(IconFigma(12), 'Now'),
                  cell: (x: any) => pathCell(x.path, x.type) },
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
        const wide = sample.some((x: any) =>
          (swatchOf(x.repo) || x.repo).length > TAGGABLE ||
          (swatchOf(x.figma) || x.figma).length > TAGGABLE);
        const w = wide ? '36%' : '92px';
        columns.push({
          key: 'repo',
          header: headWith(s.sides.provider === 'gitlab' ? IconGitlab(12)
                         : s.sides.provider === 'github' ? IconGithub(12) : null, 'Repo'),
          width: w,
          cell: (x: any) => (
            <>
              {valueCell(x.repo, x.figma)}
              {flagOf && x.unboundSide === 'repo' ? flagOf(x) : null}
            </>
          ),
        });
        columns.push({
          key: 'figma',
          header: headWith(IconFigma(12), 'Figma'),
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
      } else {
        columns.push({ key: 'value', header: 'Value', width: '120px', cell: (x: any) => valueCell(x.value) });
      }
      return (
        <div className="json-download-card" data-level={4} key={title}>
          <div className="json-download-header">
            <div className="json-download-title-group">
              <p className="json-download-title">{title}</p>
            </div>
            <span className="compare-side-detail">{rows.length.toLocaleString()}</span>
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
          <div className="compare-section">
            <div className="compare-section-head">
              <span className="compare-section-title">Values</span>
              <span className="compare-section-note">someone chose differently</span>
            </div>
            <div className="compare-stats">
              <div className="compare-stat is-wide">
                <div className="compare-stat-n">{r.changed.length.toLocaleString()}</div>
                <div className="compare-stat-label">a different colour, number or string</div>
              </div>
            </div>
            {/*
              BROKEN DOWN BY WHAT KIND OF TOKEN CHANGED. A colour decision and
              a font-family decision are different acts, and on a real pair of
              exports the mix is the story: 760 colours against 6 numbers says
              "re-tinted", which a single total of 1,060 does not.
            */}
            {(r.changedByType || []).length > 1 && (
              <div className="compare-types">
                {r.changedByType.map((t: any) => (
                  <span className="compare-type" key={t.type}>
                    <span className="compare-type-n">{t.count.toLocaleString()}</span>
                    <span className="compare-type-name">{t.type}</span>
                  </span>
                ))}
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
            <div className="compare-stats">
              <div className="compare-stat">
                <div className="compare-stat-n">{r.onlyInFigma.length.toLocaleString()}</div>
                <div className="compare-stat-label">only here</div>
              </div>
              <div className="compare-stat">
                <div className="compare-stat-n">{r.onlyInRepo.length.toLocaleString()}</div>
                <div className="compare-stat-label">only in the repo</div>
              </div>
              <div className="compare-stat">
                <div className="compare-stat-n">{(r.repointed || []).length.toLocaleString()}</div>
                <div className="compare-stat-label">pointing somewhere new</div>
              </div>
              <div className="compare-stat">
                <div className="compare-stat-n">{(r.aliased || []).length.toLocaleString()}</div>
                <div className="compare-stat-label">aliased one side, inlined the other</div>
              </div>
              <div className="compare-stat is-wide">
                <div className="compare-stat-n">{(r.moved || []).length.toLocaleString()}</div>
                <div className="compare-stat-label">the same token, somewhere else</div>
              </div>
            </div>
          </div>

          <div className="compare-stats">
            <div className="compare-stat is-quiet is-wide">
              <div className="compare-stat-n">{r.sameCount.toLocaleString()}</div>
              <div className="compare-stat-label">identical</div>
            </div>
          </div>

          {/* ~ is the values column; +, - and the arrow are architecture.
              Same order as the sections above, so the eye learns it once. */}
          <div className="compare-group compare-group-key">
            <span className="compare-group-name">per collection</span>
            <span className="compare-group-counts">
              <span className="compare-count" title="value changed">~ values</span>
              <span className="compare-count" title="only here">+</span>
              <span className="compare-count" title="only in the repo">-</span>
              <span className="compare-count" title="reference repointed">{'\u2192 architecture'}</span>
            </span>
          </div>
          <div className="compare-groups">
            {r.groups.map((g: any) => (
              <div className="compare-group" key={g.name}>
                <span className="compare-group-name">{g.name}</span>
                <span className="compare-group-counts">
                  <span className={'compare-count is-value' + (g.changed ? '' : ' is-zero')} title="value changed">
                    {'~' + g.changed}
                  </span>
                  <span className={'compare-count' + (g.onlyInFigma ? '' : ' is-zero')} title="only here">
                    {'+' + g.onlyInFigma}
                  </span>
                  <span className={'compare-count' + (g.onlyInRepo ? '' : ' is-zero')} title="only in the repo">
                    {'-' + g.onlyInRepo}
                  </span>
                  {/* An arrow, because that is what a reference that moved
                      did — it still points, just somewhere else. */}
                  <span className={'compare-count' + (g.repointed ? '' : ' is-zero')} title="reference repointed">
                    {'\u2192' + (g.repointed || 0)}
                  </span>
                  <span className={'compare-count' + (g.aliased ? '' : ' is-zero')} title="same value, aliased one side">
                    {'=' + (g.aliased || 0)}
                  </span>
                  <span className={'compare-count' + (g.moved ? '' : ' is-zero')} title="moved here from elsewhere">
                    {'\u21b4' + (g.moved || 0)}
                  </span>
                </span>
              </div>
            ))}
          </div>
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
        {leaves('Architecture \u2014 only here', r.onlyInFigma, false)}
        {leaves('Architecture \u2014 only in the repo', r.onlyInRepo, false)}

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
    setSides: (figma, figmaDetail, repo, repoDetail, provider) =>
      set((s) => ({ ...s, sides: { figma, figmaDetail, repo, repoDetail, provider } })),
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

  ListControlItem with a trailing Switch, which is the kit's own pairing for
  this: the row carries the name and the explanation, the control carries only
  the state, and Switch's `labelHidden` exists precisely so the name is not
  said twice. (Checkbox cannot carry a description of its own — see
  disarantidis/pomegranate#87 — and this is the row that would have needed it.)

  ONE AXIS PER COLLECTION is enforced here as well as refused downstream: once
  a depth in a group is on, its siblings go disabled and say why. Letting
  someone turn on a second one and only then be told it is impossible would be
  offering a choice that was never available.
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
      <span className="import-fig">
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
      <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-component-6)' }}>
        {groupsInOrder.map((group) => {
          /* Only the collections THIS group produced. The preview belongs
             beside the choice that determines it, not in one pile at the
             bottom where it answers for everything at once. */
          const mine = collections.filter((x) => x.fromGroup === group);
          return (
            <span key={group} className="import-level-section">
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

  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomImportLevels = {
    set: (c, a, cols, gc, ord) => set(c, a, cols || [], gc || [], ord || []),
    onToggle: null,
    onGroupToggle: null,
  };
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
        done     ConfirmIcon
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
    const leading = file.error ? undefined
      : file.busy ? <Spinner size={18} strokeWidth={2.5} label="" />
      : <ConfirmIcon />;
    return (
      <FileUploadItem
        name={file.name}
        bytes={file.bytes}
        type="application/json"
        size="medium"
        error={file.error}
        leading={leading}
        /* Handing it a remover is what gives it a ✕ — see the prop's own note.
           The row names the button after the file, so it announces as
           "Remove sarantidis-foundations.json" rather than a bare dismiss.

           Its variant is ghost and cannot be anything else: FileUploadItem
           writes variant="ghost" into its own render and exposes no prop that
           reaches it. Right for a row in a list on the page background, loud
           enough to be wrong for a row alone on a raised card — which is what
           this is. Raised as disarantidis/pomegranate#92; overriding it from
           here would mean selecting into Button's internals. */
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
