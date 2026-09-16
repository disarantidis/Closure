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
import { Accordion, AccordionItem } from '../vendor/pomegranate/panel/node/Accordion';
import { Toast } from '../vendor/pomegranate/panel/node/Toast';
import { Alert } from '../vendor/pomegranate/panel/node/Alert';
import { Skeleton } from '../vendor/pomegranate/panel/node/Skeleton';
import { Tag } from '../vendor/pomegranate/panel/node/Tag';
import { fieldLevel, useLevel, LevelContext, type Level } from '../vendor/pomegranate/panel/node/LevelContext';

/* The plugin GROUND is level 1 — the darkest rung. Every mounted subtree is
   wrapped in a LevelContext provider at the ground so the kit's components
   compute their fill ONE rung above it (a field on the L1 ground is L2), per
   the composition rule in docs/knowledge-levels.md. */
const GROUND: Level = 1;
/* One rung above the ground — the band every provider-card / export-panel
   island stands on (data-level="2" set on those elements in the template).
   Every mount mechanically nested inside one of those DOM islands passes
   this so its own computed fill (data-fill via fieldLevel, a Button's
   --nd-field-fill / --background-hover) agrees with the DOM's CSS cascade
   instead of silently assuming it still sits on GROUND. */
const CARD_LEVEL: Level = 2;

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
  return (
    <Button
      id={id}
      variant={btnVariant(variant)}
      size={btnSize(size)}
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
type PushTarget = 'gitlab' | 'github' | 'both';
declare global {
  interface Window {
    PomButtons: { push: LiveHandle; download: LiveIconHandle };
    PomExportMode: { onChange: ((index: number) => void) | null };
    PomToast: { show: (message: string, isError?: boolean) => void };
    PomFolderSelect: FolderSelectBridge;
    PomGithubFolderSelect: FolderSelectBridge;
    PomFolderList: FolderListBridge;
    PomGithubFolderList: FolderListBridge;
    PomCollectionsAccordion: {
      setTitle: (title: string) => void;
      setCollections: (collections: { name: string; count: number }[]) => void;
      setSummary: (tokensLabel: string, sizeLabel: string) => void;
    };
    PomClosureWarning: { show: (title: string, detail: string) => void; hide: () => void };
    PomCommitMessage: DisabledHandle;
    PomVersionTag: { setLabel: (label: string) => void };
    PomRemoveGithubDialog: { open: () => void; onConfirm: (() => void) | null };
    PomRemoveGitlabDialog: { open: () => void; onConfirm: (() => void) | null };
    PomClearTokenDialog: { open: (provider: 'gitlab' | 'github') => void; onConfirm: ((provider: 'gitlab' | 'github') => void) | null };
    PomRepoTab: { onChange: ((value: 'gitlab' | 'github') => void) | null; setValue: (value: 'gitlab' | 'github') => void };
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
  download: mountLiveIconButton(
    'download-btn-mount',
    { id: 'download-btn', variant: 'tonal', size: 'large', icon: IconDownload(24), label: 'Download', title: 'Download' },
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
mountButton('add-github-btn-mount', { id: 'add-github-btn', variant: 'tonal', size: 'small', label: 'Add' }, CARD_LEVEL);
mountButton('remove-github-btn-mount', { id: 'remove-github-btn', variant: 'ghost', destructive: true, size: 'small', label: 'Remove GitHub' }, CARD_LEVEL);
mountButton('add-gitlab-btn-mount', { id: 'add-gitlab-btn', variant: 'tonal', size: 'small', label: 'Add' }, CARD_LEVEL);
mountButton('remove-gitlab-btn-mount', { id: 'remove-gitlab-btn', variant: 'ghost', destructive: true, size: 'small', label: 'Remove GitLab' }, CARD_LEVEL);
mountIconButton('back-btn-mount', { id: 'back-btn', variant: 'ghost', size: 'large', title: 'Back', 'aria-label': 'Back', icon: IconArrowLeft(24) });
mountIconButton('settings-btn-mount', { id: 'settings-btn', variant: 'ghost', size: 'large', title: 'Git settings', 'aria-label': 'Git settings', icon: IconSettings(24) });

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

mountTextField('export-filename-mount', { id: 'export-filename', label: 'File name', readonly: true, defaultValue: 'tokens.json', tabIndex: -1, title: 'GitLab JSON file name (set in Settings)' }, CARD_LEVEL);
mountTextField('github-filename-mount', { id: 'github-filename', label: 'File name', readonly: true, defaultValue: 'tokens.json', tabIndex: -1, title: 'GitHub JSON file name (set in Settings)' }, CARD_LEVEL);

window.PomCommitMessage = mountLiveTextArea('commit-message-mount', { id: 'commit-message', placeholder: 'Enter commit message...', rows: 2 }, false, CARD_LEVEL);

mountButton('add-repo-settings-btn-mount', { id: 'add-repo-settings-btn', variant: 'outline', size: 'large', label: 'Add Repo Settings', block: true }, CARD_LEVEL);
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
mountTextField('gl-filename-mount', { id: 'gl-filename', label: 'JSON file name', placeholder: 'tokens.json' }, CARD_LEVEL);
mountTextField('gh-token-mount', { id: 'gh-token', type: 'password', label: 'GitHub Token', placeholder: 'ghp-… (stored only on this machine)' }, CARD_LEVEL);
mountTextField('gh-repo-mount', { id: 'gh-repo', label: 'Repository (owner/repo)', placeholder: 'my-org/my-repo' }, CARD_LEVEL);
mountTextField('gh-branch-mount', { id: 'gh-branch', label: 'Branch', placeholder: 'main' }, CARD_LEVEL);
mountTextField('gh-filename-mount', { id: 'gh-filename', label: 'JSON file name', placeholder: 'tokens.json' }, CARD_LEVEL);

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
      <SegmentedControl
        label="Repository provider"
        size="small"
        value={value}
        options={[{ value: 'github', label: 'GitHub' }, { value: 'gitlab', label: 'GitLab' }]}
        onChange={(v: string) => window.PomRepoTab.onChange?.(v as 'gitlab' | 'github')}
      />
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
  window.PomRepoTab = { onChange: null, setValue: (v) => set(v) };
})();

/* ── loading skeletons ─────────────────────────────────────────────────────── */
mountOnce('skeleton-list',
  <div className="skeleton-item" style={{ minHeight: 48 }}>
    <Skeleton shape="block" width={180} height={14} />
    <Skeleton shape="block" width={20} height={20} label="" />
  </div>,
);
mountOnce('actions-skeleton',
  <div className="export-panel">
    <div className="sk-row">
      <Skeleton shape="block" width={90} height={44} />
      <Skeleton shape="block" height={44} width={'100%'} label="" />
    </div>
    <Skeleton shape="block" height={68} width={'100%'} label="" />
    <div className="sk-row">
      <Skeleton shape="block" height={64} width={'100%'} />
      <Skeleton shape="block" width={64} height={64} label="" />
    </div>
  </div>,
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

/* ── collections accordion (read-only breakdown) ───────────────────────────── */
(function mountCollectionsAccordion() {
  const container = document.getElementById('collections-list');
  let set: (u: (s: any) => any) => void = () => {};
  function View() {
    const [state, setState] = useState<any>({ title: 'Scanned collections', collections: [], summary: { tokens: '', size: '' } });
    set = setState;
    return (
      <Accordion label="Scanned collections" size="large" level={2} defaultOpen={['collections']}>
        <AccordionItem
          id="collections"
          header={
            <div className="collections-header">
              <span className="collections-summary">{state.title}</span>
              <div className="collections-summary-tags">
                {state.summary.tokens ? <Tag variant="ghost" size="small">{state.summary.tokens}</Tag> : null}
                {state.summary.size ? <Tag variant="ghost" size="small">{state.summary.size}</Tag> : null}
              </div>
            </div>
          }
        >
          <div className="collections-readonly-list">
            {state.collections.map((c: any) => (
              <div key={c.name} className="collection-item">
                <span className="collection-item-check">{IconCheck(14)}</span>
                <span className="name">{c.name}</span>
                <span className="count">{c.count}</span>
              </div>
            ))}
          </div>
        </AccordionItem>
      </Accordion>
    );
  }
  if (container) flushSync(() => createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>));
  window.PomCollectionsAccordion = {
    setTitle: (title) => set((s) => ({ ...s, title })),
    setCollections: (collections) => set((s) => ({ ...s, collections })),
    setSummary: (tokens, size) => set((s) => ({ ...s, summary: { tokens, size } })),
  };
})();

/* ── reference-closure warning (inline alert) ──────────────────────────────── */
(function mountClosureWarning() {
  const container = document.getElementById('closure-warning-mount');
  let set: (u: (s: any) => any) => void = () => {};
  function View() {
    const [s, setS] = useState<{ open: boolean; title: string; detail: string }>({ open: false, title: '', detail: '' });
    set = setS;
    if (!s.open) return null;
    return <Alert tone="error" title={s.title}>{s.detail}</Alert>;
  }
  if (container) createRoot(container).render(<LevelContext.Provider value={GROUND}><View /></LevelContext.Provider>);
  window.PomClosureWarning = {
    show: (title, detail) => set(() => ({ open: true, title, detail })),
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
function ProviderChoiceCard({ which, label, checked, onToggle }: { which: 'gitlab' | 'github'; label: string; checked: boolean; onToggle: (c: boolean) => void }) {
  return (
    <div
      role="checkbox" aria-checked={checked} tabIndex={0}
      onClick={() => onToggle(!checked)}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(!checked); } }}
      /* This card sits inside the onboarding Dialog, which is hardcoded to
         data-level={4} (Dialog.tsx). --app-surface/--app-bg both alias
         var(--background), which is set by the nearest [data-level]
         ancestor via the DOM/CSS cascade — with none set here it silently
         inherited the dialog's own L4 fill and read as flat/invisible.
         base=4 → the composition rule's ascending order for what's above
         it is 1 → 2 → 3 (docs/knowledge-levels.md), so this well gets L1
         (a selectable row, one of L1's own named uses) and its badge one
         rung up at L2, so all three (dialog, card, badge) read apart. */
      data-level={1}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
        background: 'var(--background)', border: '1px solid ' + (checked ? 'var(--app-accent)' : 'transparent'),
        borderRadius: 16, padding: '10px 14px', cursor: 'pointer',
      }}
    >
      <span aria-hidden="true" data-level={2} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: 'var(--background)', color: 'var(--app-text-muted)', flexShrink: 0 }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d={PROVIDER_LOGO_PATH[which]} /></svg>
      </span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: 'var(--app-text)' }}>{label}</span>
      <span style={{ display: 'flex', flexShrink: 0, pointerEvents: 'none' }}>
        <Checkbox size="medium" labelHidden label={label} checked={checked} onChange={() => {}} />
      </span>
    </div>
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
    function toggle(which: keyof PushCheckboxState, checked: boolean) {
      const next = { ...state, [which]: checked } as PushCheckboxState;
      if (!next.gitlab && !next.github) next[which] = true;
      setState(next);
    }
    return (
      <Dialog
        open={open}
        onClose={() => setO(false)}
        size="small"
        title={step === 1 ? 'Push destination' : 'Repository settings'}
        description={step === 1 ? 'Where do you want to push your tokens? Pick one or both — you can change this anytime in Settings.' : whatsNeeded(state)}
        actions={
          step === 1 ? (
            <Button variant="primary" size="large" block onClick={() => setStep(2)}>Next</Button>
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
