/*
  buttons.tsx — mounts the plugin UI's live components into the template's
  <span id="…-mount"> placeholders, and defines the window.Pom* bridges the
  template's vanilla JS drives them through.

  DESIGN SYSTEM: this is the Pomegranate (disarantidis_ReactJS) build. Every
  component below is the vendored Pomegranate kit (src/vendor/pomegranate) —
  no @desquared kit anywhere. The window.Pom* bridge names and every rendered
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
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { Button } from '../vendor/pomegranate/panel/node/Button';
import { Checkbox } from '../vendor/pomegranate/panel/node/Checkbox';
import { Switch } from '../vendor/pomegranate/panel/node/Switch';
import { SegmentedControl } from '../vendor/pomegranate/panel/node/SegmentedControl';
import { DropDownSelect } from '../vendor/pomegranate/panel/node/DropDownSelect';
import { Dialog } from '../vendor/pomegranate/panel/node/Dialog';
import { InteractiveCard } from '../vendor/pomegranate/panel/node/InteractiveCard';
import { Toast } from '../vendor/pomegranate/panel/node/Toast';
import { Alert } from '../vendor/pomegranate/panel/node/Alert';
import { Skeleton } from '../vendor/pomegranate/panel/node/Skeleton';
import { Tag } from '../vendor/pomegranate/panel/node/Tag';
import { SelectableCard } from '../vendor/pomegranate/panel/node/SelectableCard';
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
const svg = (d: string, opts?: { fill?: boolean; fillRule?: 'evenodd' }) => (size: number) =>
  opts?.fill ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} fillRule={opts.fillRule} clipRule={opts.fillRule} />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
const IconArrowLeft = svg('M19 12H5M12 19l-7-7 7-7');
const IconDownload = svg('M12 3v11m0 0l-4-4m4 4l4-4M5 20h14');
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
// Leads the collections card's own title — was a braces glyph (the common
// "variable/token" mark in developer tooling), replaced with Figma's own
// Variables icon (a hexagon/nut outline — the mark Figma itself uses for
// its Variables feature, confirmed against Figma's own help-center
// material) since this card specifically represents Figma *variables*
// collections, not variables/tokens in the generic developer-tooling
// sense. Same Lucide-shaped stroke icon as every other icon in this file
// (svg() below, not a filled brand mark like GitLab/GitHub above — this
// isn't a third-party logo, just Figma's own in-product iconography).
const IconVariables = svg('M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z');

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
    defaultValue, icon, style, tabIndex, title, onInput, onBlur,
  } = props;
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
        defaultValue={defaultValue}
        placeholder={placeholder}
        readOnly={readonly}
        tabIndex={tabIndex}
        title={title}
        aria-readonly={readonly || undefined}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        onInput={onInput ? (e) => onInput((e.target as HTMLInputElement).value) : undefined}
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
        {...extra}
      >
        {s.label ?? base.label}
      </Button>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={level}><LiveButton /></LevelContext.Provider>));
  return {
    setDisabled: (disabled) => set((s) => ({ ...s, disabled })),
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
// 'none' is the onboarding dialog's "skip both" choice — Download alone is
// a complete, supported workflow, not an unfinished state to route past.
// Only ever reaches window.PomOnboardingDialog.onConfirm; the Settings
// page's own Push destination control (mountPushTargetControl below) never
// produces it — that control only shows once BOTH providers are already
// added, so "neither" isn't a real choice there.
type PushTarget = 'gitlab' | 'github' | 'both' | 'none';
declare global {
  interface Window {
    PomButtons: { push: LiveHandle; download: LiveIconHandle };
    PomAddGitlabBtn: LiveHandle;
    PomAddGithubBtn: LiveHandle;
    PomExportMode: { onChange: ((index: number) => void) | null };
    PomToast: { show: (message: string, isError?: boolean) => void };
    PomFolderSelect: FolderSelectBridge;
    PomGithubFolderSelect: FolderSelectBridge;
    PomFolderList: FolderListBridge;
    PomGithubFolderList: FolderListBridge;
    PomCollectionsAccordion: {
      setTitle: (title: string) => void;
      setCollections: (collections: { name: string; count: number }[]) => void;
      setSummary: (tokensLabel: string) => void;
    };
    PomJsonFileCard: { setSize: (sizeLabel: string) => void };
    PomClosureWarning: { show: (title: string, groups: { ref: string; froms: string[] }[], more?: number) => void; hide: () => void };
    PomCommitMessage: DisabledHandle;
    PomVersionTag: { setLabel: (label: string) => void };
    PomRemoveGithubDialog: { open: () => void; onConfirm: (() => void) | null };
    PomRemoveGitlabDialog: { open: () => void; onConfirm: (() => void) | null };
    PomClearTokenDialog: { open: (provider: 'gitlab' | 'github') => void; onConfirm: ((provider: 'gitlab' | 'github') => void) | null };
    PomRepoTab: { onChange: ((value: 'gitlab' | 'github') => void) | null; setValue: (value: 'gitlab' | 'github') => void };
    PomMainProviderTab: { onChange: ((value: 'gitlab' | 'github') => void) | null; setValue: (value: 'gitlab' | 'github') => void };
    PomPushTarget: { onChange: ((value: PushTarget) => void) | null; setValue: (value: PushTarget) => void };
    PomDtcgFormat: { onChange: ((on: boolean) => void) | null; setValue: (on: boolean) => void };
    PomOnboardingDialog: { open: () => void; onConfirm: ((target: PushTarget) => void) | null };
  }
}

/* ── push + download ───────────────────────────────────────────────────────── */
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
mountIconButton('gitlab-empty-add-btn-mount', { id: 'gitlab-empty-add-btn', variant: 'tonal', size: 'small', title: 'Add folder path', 'aria-label': 'Add folder path', icon: IconAdd(16) }, CARD_LEVEL);
mountIconButton('github-empty-add-btn-mount', { id: 'github-empty-add-btn', variant: 'tonal', size: 'small', title: 'Add folder path', 'aria-label': 'Add folder path', icon: IconAdd(16) }, CARD_LEVEL);
// Live (not one-shot mountButton) because this pill no longer disappears
// once a provider is added — it now stays put side by side with the other
// provider's, and just relabels itself Add -> Remove in place (see
// updateProviderSectionVisibility() in ui.template.html, which calls
// .setLabel() here instead of toggling the row's `hidden`).
window.PomAddGithubBtn = mountLiveButton(
  'add-github-btn-mount',
  { id: 'add-github-btn', variant: 'tonal', size: 'small', label: 'Add' },
  { disabled: false, loading: false, success: false, label: null },
  CARD_LEVEL,
);
mountButton('remove-github-btn-mount', { id: 'remove-github-btn', variant: 'ghost', destructive: true, size: 'small', label: 'Remove GitHub' }, CARD_LEVEL);
window.PomAddGitlabBtn = mountLiveButton(
  'add-gitlab-btn-mount',
  { id: 'add-gitlab-btn', variant: 'tonal', size: 'small', label: 'Add' },
  { disabled: false, loading: false, success: false, label: null },
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

mountTextField('primary-filename-mount', { id: 'primary-filename', label: 'File name', defaultValue: 'tokens.json', placeholder: 'tokens.json', title: 'JSON file name — used for both Download and every push destination. ".json" is added automatically if you leave it out.' }, CARD_LEVEL);

window.PomCommitMessage = mountLiveTextArea('commit-message-mount', { id: 'commit-message', placeholder: 'Enter commit message...', rows: 2 }, false, CARD_LEVEL);

// filled/primary — was outline. This replaces the Push button in the exact
// same slot whenever nothing is configured yet (updateActionUI()), so it's
// the main screen's one obvious next step at that point, same weight as
// Push itself gets once something IS configured — an outline button read
// as a secondary/optional action for what is actually the only path
// forward.
mountButton('add-repo-settings-btn-mount', { id: 'add-repo-settings-btn', variant: 'filled', size: 'large', label: 'Add Repo Settings', block: true }, CARD_LEVEL);
mountButton('gitlab-small-settings-btn-mount', { id: 'gitlab-small-settings-btn', variant: 'tonal', size: 'small', label: 'Add Settings', leftIcon: true, buttonLeftIcon: IconSettings(16) }, CARD_LEVEL);
mountButton('github-small-settings-btn-mount', { id: 'github-small-settings-btn', variant: 'tonal', size: 'small', label: 'Add Settings', leftIcon: true, buttonLeftIcon: IconSettings(16) }, CARD_LEVEL);
mountIconButton('gitlab-remove-push-btn-mount', { id: 'gitlab-remove-push-btn', variant: 'tonal', destructive: true, size: 'small', title: 'Remove GitLab from push destination', 'aria-label': 'Remove GitLab from push destination', icon: IconTrash(16) }, CARD_LEVEL);
mountIconButton('github-remove-push-btn-mount', { id: 'github-remove-push-btn', variant: 'tonal', destructive: true, size: 'small', title: 'Remove GitHub from push destination', 'aria-label': 'Remove GitHub from push destination', icon: IconTrash(16) }, CARD_LEVEL);
mountIconButton('gitlab-empty-remove-push-btn-mount', { id: 'gitlab-empty-remove-push-btn', variant: 'tonal', destructive: true, size: 'small', title: 'Remove GitLab from push destination', 'aria-label': 'Remove GitLab from push destination', icon: IconTrash(16) }, CARD_LEVEL);
mountIconButton('github-empty-remove-push-btn-mount', { id: 'github-empty-remove-push-btn', variant: 'tonal', destructive: true, size: 'small', title: 'Remove GitHub from push destination', 'aria-label': 'Remove GitHub from push destination', icon: IconTrash(16) }, CARD_LEVEL);

mountTextField('folder-new-mount', { id: 'folder-new', label: 'Folder path', icon: IconFolder(16), placeholder: 'e.g. src/something' }, CARD_LEVEL);
mountTextField('github-folder-new-mount', { id: 'github-folder-new', label: 'Folder path', icon: IconFolder(16), placeholder: 'e.g. src/something' }, CARD_LEVEL);

mountTextField('gl-token-mount', { id: 'gl-token', type: 'password', label: 'GitLab Token', placeholder: 'glpat-… (stored only on this machine)' }, CARD_LEVEL);
mountTextField('gl-host-mount', { id: 'gl-host', label: 'GitLab Host', placeholder: 'https://gitlab.com' }, CARD_LEVEL);
mountTextField('gl-project-mount', { id: 'gl-project', label: 'Project (path or ID)', placeholder: 'group/subgroup/project or 1234' }, CARD_LEVEL);
mountTextField('gl-branch-mount', { id: 'gl-branch', label: 'Branch', placeholder: 'main' }, CARD_LEVEL);
mountTextField('gh-token-mount', { id: 'gh-token', type: 'password', label: 'GitHub Token', placeholder: 'ghp-… (stored only on this machine)' }, CARD_LEVEL);
mountTextField('gh-repo-mount', { id: 'gh-repo', label: 'Repository (owner/repo)', placeholder: 'my-org/my-repo' }, CARD_LEVEL);
mountTextField('gh-branch-mount', { id: 'gh-branch', label: 'Branch', placeholder: 'main' }, CARD_LEVEL);

/* ── hidden export-mode segmented control (Native / Token Studio) ───────────── */
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
        options={[{ value: '0', label: 'Native' }, { value: '1', label: 'Token Studio' }]}
        onChange={(v: string) => { setValue(v); window.PomExportMode.onChange?.(Number(v)); }}
      />
    );
  }
  flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
})();

/* ── push destination (GitLab / GitHub checkboxes) ─────────────────────────── */
type PushCheckboxState = { gitlab: boolean; github: boolean };
function targetFromCheckboxes(s: PushCheckboxState): PushTarget {
  if (s.gitlab && s.github) return 'both';
  if (s.github) return 'github';
  return 'gitlab';
}
function checkboxesFromTarget(t: PushTarget): PushCheckboxState {
  return { gitlab: t !== 'github', github: t === 'github' || t === 'both' };
}
(function mountPushTargetControl() {
  const container = document.getElementById('push-target-control-mount');
  let set: (s: PushCheckboxState) => void = () => {};
  function View() {
    const [state, setState] = useState<PushCheckboxState>({ gitlab: true, github: false });
    set = setState;
    function toggle(which: keyof PushCheckboxState, checked: boolean) {
      const next = { ...state, [which]: checked } as PushCheckboxState;
      if (!next.gitlab && !next.github) next[which] = true;
      setState(next);
      window.PomPushTarget.onChange?.(targetFromCheckboxes(next));
    }
    return (
      // medium, not large: .nd-check's size prop scales the ROW's min-height
      // (24/32/56) far more than the visible mark itself (16/18/22px) — it's
      // built for a checkbox sitting in a taller row whose caption may wrap
      // to a second line, so the mark pins to the first line rather than
      // centering. A standalone checkbox with a one-line caption gets none
      // of that benefit, only the padding: at 'large' the clickable <label>
      // ran 34px below the visible mark, into what looked like dead space
      // next to the next row. 'medium' still grows the mark (16→18px) with
      // only a 14px gap — most of the "bigger" ask, none of the defect.
      <>
        <Checkbox size="medium" label="GitLab" checked={state.gitlab} onChange={(c: boolean) => toggle('gitlab', c)} />
        <Checkbox size="medium" label="GitHub" checked={state.github} onChange={(c: boolean) => toggle('github', c)} />
      </>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
  window.PomPushTarget = { onChange: null, setValue: (v) => set(checkboxesFromTarget(v)) };
})();

/* ── Settings → Output format switch (Token Studio / DTCG) ──────────────────── */
(function mountDtcgFormatSwitch() {
  const container = document.getElementById('dtcg-format-control-mount');
  let set: (on: boolean) => void = () => {};
  function View() {
    const [on, setOn] = useState(false);
    set = setOn;
    return (
      // medium, not large — see the comment on the push-target checkboxes
      // above: .nd-check's size mostly grows the clickable row (24/32/56),
      // not the visible mark (16/18/22px), for a checkbox/switch meant to
      // sit in a taller wrapping-caption row. Standalone, 'large' left a
      // 34px dead-but-clickable gap under the track, reading as an
      // oversized hit area and a "delayed" toggle (the flip is instant;
      // the eye/cursor just isn't over the part that visibly moves).
      <Switch
        size="medium"
        label="DTCG (W3C)"
        checked={on}
        onChange={(c: boolean) => { setOn(c); window.PomDtcgFormat.onChange?.(c); }}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
  window.PomDtcgFormat = { onChange: null, setValue: (v) => set(v) };
})();

/* ── GitHub / GitLab repo-settings tab switcher ────────────────────────────── */
(function mountRepoTabControl() {
  const container = document.getElementById('repo-settings-tab-mount');
  let set: (v: 'gitlab' | 'github') => void = () => {};
  function View() {
    const [value, setValue] = useState<'gitlab' | 'github'>('gitlab');
    set = setValue;
    return (
      // medium, not small: this sits at the top of Repository settings, level
      // with the row of GitLab/GitHub fields it switches between, not with a
      // caption-sized chip — the field-box rung Button/SegmentedControl share.
      // block: this is a two-option dial governing the whole card stack below
      // it, so it should read as wide as that stack (like the fields inside
      // it), not hug its own two labels — see SegmentedControl's own `block`
      // doc, written for exactly this "governs everything under it" case.
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
  // CARD_LEVEL, matching the real data-level="2" now set on #repo-settings-tabs-row
  // in the markup (SegmentedControl doesn't read this context itself yet, but every
  // other mount here keeps this value truthful to its actual DOM level).
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={CARD_LEVEL}><View /></LevelContext.Provider>));
  window.PomRepoTab = { onChange: null, setValue: (v) => set(v) };
})();

/* ── main screen: GitLab / GitHub folder-path tab switcher ─────────────────
   Same shape as mountRepoTabControl above, one screen over: when both
   providers are added, this replaces showing both provider blocks stacked
   with a single switcher, so only one folder-path picker shows at a time
   (see updatePushTargetUI()'s tabMode). Independent of the Push destination
   control (window.PomPushTarget) — that decides where a push actually goes;
   this is only about which provider's folder path is being looked at. */
(function mountMainProviderTabControl() {
  const container = document.getElementById('main-provider-tab-mount');
  let set: (v: 'gitlab' | 'github') => void = () => {};
  function View() {
    const [value, setValue] = useState<'gitlab' | 'github'>('gitlab');
    set = setValue;
    return (
      <SegmentedControl
        label="Folder path provider"
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

/* ── folder-path dropdowns (main screen) ───────────────────────────────────── */
window.PomFolderSelect = {
  ...mountLiveDropdown('folder-select-mount', { id: 'folder-select' }, (v) => window.PomFolderSelect.onChange?.(v), CARD_LEVEL),
  onChange: null,
};
window.PomGithubFolderSelect = {
  ...mountLiveDropdown('github-folder-select-mount', { id: 'github-folder-select' }, (v) => window.PomGithubFolderSelect.onChange?.(v), CARD_LEVEL),
  onChange: null,
};

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
              <span className="collections-header-icon" aria-hidden="true">{IconVariables(18)}</span>
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
                {state.summary.tokens ? <Tag variant="tonal" size="small">{state.summary.tokens}</Tag> : null}
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
        <Dialog open={open} onClose={() => setOpen(false)} title={state.title} size="large">
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
(function mountClosureWarning() {
  const container = document.getElementById('closure-warning-mount');
  let set: (u: (s: any) => any) => void = () => {};
  function View() {
    const [s, setS] = useState<{ open: boolean; title: string; groups: { ref: string; froms: string[] }[]; more: number }>({ open: false, title: '', groups: [], more: 0 });
    set = setS;
    if (!s.open) return null;
    return (
      <Alert tone="error" title={s.title}>
        <p className="closure-warning-subtitle">Not present in this export, but referenced by:</p>
        <ul className="closure-warning-list">
          {s.groups.map((g) => (
            <li key={g.ref}>
              <div className="closure-warning-missing">{g.ref}</div>
              <div className="closure-warning-froms">used by {g.froms.join(', ')}</div>
            </li>
          ))}
        </ul>
        {s.more > 0 && <p className="closure-warning-more">+{s.more} more affected</p>}
      </Alert>
    );
  }
  if (container) createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>);
  window.PomClosureWarning = {
    show: (title, groups, more) => set(() => ({ open: true, title, groups, more: more || 0 })),
    hide: () => set((s) => ({ ...s, open: false })),
  };
})();

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
            // targetFromCheckboxes() can't express "neither" (it's shared
            // with mountPushTargetControl, where that's never a valid
            // state), so 'none' is passed explicitly.
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
