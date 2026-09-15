import { useState } from 'react';
import type { CSSProperties, ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { RADDButton } from '@desquared/radd-reactjs/components/Button';
import { RADDIconButton } from '@desquared/radd-reactjs/components/IconButton';
import { RADDSegmentedControl } from '@desquared/radd-reactjs/components/SegmentedControl';
import { RADDTextField } from '@desquared/radd-reactjs/components/TextField';
import { RADDTextArea } from '@desquared/radd-reactjs/components/TextArea';
import { RADDSkeleton } from '@desquared/radd-reactjs/components/Skeleton';
import { RADDToast } from '@desquared/radd-reactjs/components/Toast';
import { RADDNotificationsLeadingSlotPreferredContent } from '@desquared/radd-reactjs/components/NotificationsLeadingSlotPreferredContent';
import { RADDNotificationsContentSlot } from '@desquared/radd-reactjs/components/NotificationsContentSlot';
import { RADDDropdownSelect } from '@desquared/radd-reactjs/components/DropdownSelect';
import { RADDInlineNotification } from '@desquared/radd-reactjs/components/InlineNotification';
import { RADDAccordion } from '@desquared/radd-reactjs/components/Accordion';
import { RADDTagStatic } from '@desquared/radd-reactjs/components/TagStatic';
import { RADDDialog, RADDDialogContent } from '@desquared/radd-reactjs/components/Dialog';
import { RADDCheckbox } from '@desquared/radd-reactjs/components/Checkbox';
import { RADDSwitch } from '@desquared/radd-reactjs/components/Switch';
import type { RADDDropdownSelectProps } from '@desquared/radd-reactjs/components/DropdownSelect';
import type { RADDMenuListItemProps } from '@desquared/radd-reactjs/components/MenuListItem';
import ArrowLeftStandard from '@desquared/web-icons/icons/ArrowLeftStandard';
import CloseStandard from '@desquared/web-icons/icons/CloseStandard';
import DownloadStandard from '@desquared/web-icons/icons/DownloadStandard';
import SettingsStandard from '@desquared/web-icons/icons/SettingsStandard';
import CheckmarkStandard from '@desquared/web-icons/icons/CheckmarkStandard';
import FolderStandard from '@desquared/web-icons/icons/FolderStandard';
import AddStandard from '@desquared/web-icons/icons/AddStandard';
import RemoveStandard from '@desquared/web-icons/icons/RemoveStandard';
import '@desquared/radd-design-tokens-radd/design-tokens.css';
import type { RADDButtonProps } from '@desquared/radd-reactjs/components/Button';
import type { RADDIconButtonProps } from '@desquared/radd-reactjs/components/IconButton';
import type { RADDSegmentedControlProps } from '@desquared/radd-reactjs/components/SegmentedControl';
import type { RADDTextFieldProps } from '@desquared/radd-reactjs/components/TextField';
import type { RADDTextAreaProps } from '@desquared/radd-reactjs/components/TextArea';

// Mounts one RADD component, once, into an existing DOM node. The id goes on
// the rendered <button> itself, so the plugin's existing vanilla script
// (which looks buttons up via getElementById and toggles .hidden/.title/
// click listeners directly) keeps working unchanged against a real element.
//
// Only safe for buttons whose `disabled` state never changes after mount:
// RADD renders `disabled` as a `*--disabled` class (see Button.css /
// IconButton.css), not the native `:disabled` pseudo-class, so flipping the
// DOM `.disabled` property from outside React would change interactivity
// without ever restyling the button. Anything that toggles disabled at
// runtime (push-btn, download-btn) needs a live bridge instead — see
// mountLiveButton below.
//
// flushSync is required here: root.render() alone doesn't guarantee the DOM
// is updated before the *next* <script> tag runs, and that next script reads
// document.getElementById(...) into vars once, synchronously, at load time.
function mountOnce<P extends object>(mountId: string, Component: ComponentType<P>, props: P) {
  const container = document.getElementById(mountId);
  if (!container) return;
  flushSync(() => createRoot(container).render(<Component {...props} />));
}

type LiveState = { disabled: boolean; loading: boolean; success: boolean; label: string | null };
type LiveHandle = {
  setDisabled: (disabled: boolean) => void;
  setLoading: (loading: boolean) => void;
  setSuccess: (success: boolean) => void;
  // Overrides baseProps.label — e.g. swapping "Push to GitLab" for the
  // reason it's disabled ("Enter a commit message"), right on the button
  // itself rather than a separate hint element. Pass null to go back to
  // baseProps.label.
  setLabel: (label: string | null) => void;
};

const SUCCESS_STYLE: CSSProperties = {
  '--RADDButton-ButtonBg--variant-filled': 'var(--colours-functional-success-standard)',
  '--RADDButton-ButtonBg--variant-filled--hover': 'var(--colours-functional-success-hovered)',
  '--RADDButton-ButtonBg--variant-filled--pressed': 'var(--colours-functional-success-pressed)',
} as CSSProperties;

// A button whose disabled/loading/success state changes at runtime (driven
// by the vanilla script), so `disabled` has to be a controlled React prop
// rather than a DOM attribute flipped from outside.
function mountLiveButton(
  mountId: string,
  baseProps: RADDButtonProps,
  initial: LiveState,
): LiveHandle {
  const container = document.getElementById(mountId);
  let setState: (updater: (s: LiveState) => LiveState) => void = () => {};

  function LiveButton() {
    const [state, setLocalState] = useState<LiveState>(initial);
    setState = setLocalState;
    return (
      <RADDButton
        {...baseProps}
        disabled={state.disabled}
        loading={state.loading}
        label={state.label ?? baseProps.label}
        style={{
          ...baseProps.style,
          ...(state.success ? SUCCESS_STYLE : null),
        }}
      />
    );
  }

  if (container) {
    flushSync(() => createRoot(container).render(<LiveButton />));
  }

  return {
    setDisabled: (disabled) => setState((s) => ({ ...s, disabled })),
    setLoading: (loading) => setState((s) => ({ ...s, loading })),
    setSuccess: (success) => setState((s) => ({ ...s, success })),
    setLabel: (label) => setState((s) => ({ ...s, label })),
  };
}

type LiveIconHandle = { setDisabled: (disabled: boolean) => void };

// Same reasoning as mountLiveButton, for the download icon button — only
// `disabled` ever changes at runtime for it (see RaddButtons.download.setDisabled
// call sites), so that's the only state this needs to carry.
function mountLiveIconButton(mountId: string, baseProps: RADDIconButtonProps, initialDisabled: boolean): LiveIconHandle {
  const container = document.getElementById(mountId);
  let setDisabledState: (disabled: boolean) => void = () => {};

  function LiveIconButton() {
    const [disabled, setLocalDisabled] = useState(initialDisabled);
    setDisabledState = setLocalDisabled;
    return <RADDIconButton {...baseProps} disabled={disabled} />;
  }

  if (container) {
    flushSync(() => createRoot(container).render(<LiveIconButton />));
  }

  return { setDisabled: (disabled) => setDisabledState(disabled) };
}

// gl-token/host/project/branch toggle read-only when entering/leaving Edit
// mode. Same reasoning as mountLiveButton: TextField.js only updates its
// internal readonly-driven classes via a useEffect watching the `readonly`
// *prop* (see TextField.CCyUJv-j.js), so flipping the real input's native
// `.readOnly` from outside React would change behavior without restyling.
// A live handle for the commit-message textarea's
// `disabled` prop instead of `readonly` — needed once the commit box can be
// disabled at runtime (no configured provider to push to yet), not just at
// mount time.
type DisabledHandle = { setDisabled: (disabled: boolean) => void };

function mountLiveTextArea(mountId: string, baseProps: RADDTextAreaProps, initialDisabled: boolean): DisabledHandle {
  const container = document.getElementById(mountId);
  let setDisabled: (disabled: boolean) => void = () => {};

  function LiveTextArea() {
    const [disabled, setLocalDisabled] = useState(initialDisabled);
    setDisabled = setLocalDisabled;
    return <RADDTextArea {...baseProps} disabled={disabled} />;
  }

  if (container) {
    flushSync(() => createRoot(container).render(<LiveTextArea />));
  }

  return { setDisabled: (disabled) => setDisabled(disabled) };
}

// RADDDropdownSelect has no native <select>/<option> DOM at all (it's a
// floating-ui combobox — see DropdownSelect.C0DB4heu.js). Its `items` and
// `selectedValue` are read fresh on every render, and a useEffect re-syncs
// its internal selected-item mirror from `selectedValue` whenever it OR
// `items` changes — so plain setState-driven
// re-renders (no flushSync) are enough; nothing needs the DOM synchronously
// right after `setItems` runs.
type DropdownState = { items: RADDMenuListItemProps[]; selectedValue: string };
type DropdownHandle = { setItems: (items: RADDMenuListItemProps[], selectedValue: string) => void };

function mountLiveDropdown(
  mountId: string,
  baseProps: Omit<RADDDropdownSelectProps, 'items' | 'selectedValue' | 'onChange'>,
  onSelect: (value: string) => void,
): DropdownHandle {
  const container = document.getElementById(mountId);
  let setState: (updater: (s: DropdownState) => DropdownState) => void = () => {};

  function LiveDropdown() {
    const [state, setLocalState] = useState<DropdownState>({ items: [], selectedValue: '' });
    setState = setLocalState;
    return (
      <RADDDropdownSelect
        {...baseProps}
        items={state.items}
        selectedValue={state.selectedValue}
        onChange={(selected) => {
          if (selected) onSelect(selected.value ?? selected.label);
        }}
      />
    );
  }

  if (container) {
    flushSync(() => createRoot(container).render(<LiveDropdown />));
  }

  return {
    setItems: (items, selectedValue) => setState(() => ({ items, selectedValue })),
  };
}

// Shared shapes reused for both GitLab's and GitHub's folder-path list /
// active-target dropdown — same bridge contract, two independent instances
// (one per provider), not one shared piece of state.
type FolderListBridge = {
  render: (rows: { path: string; canEdit: boolean }[]) => void;
  onInput: ((idx: number, value: string) => void) | null;
  onBlur: ((idx: number, value: string) => void) | null;
  onRemove: ((idx: number) => void) | null;
};
type FolderSelectBridge = {
  setItems: (items: RADDMenuListItemProps[], selectedValue: string) => void;
  onChange: ((value: string) => void) | null;
};
type PushTarget = 'gitlab' | 'github' | 'both';

declare global {
  interface Window {
    RaddButtons: {
      push: LiveHandle;
      download: LiveIconHandle;
    };
    // RADDSegmentedControl manages its own selected-segment state internally
    // (see SegmentedControl.js — it seeds from items[].selected once, on
    // mount, then owns re-rendering itself). It only ever reports the index
    // the user picked, so the vanilla script assigns its own handler here
    // rather than us needing a two-way bridge like RaddButtons above.
    RaddExportMode: { onChange: ((index: number) => void) | null };
    RaddToast: { show: (message: string, isError?: boolean) => void };
    RaddFolderSelect: FolderSelectBridge;
    RaddGithubFolderSelect: FolderSelectBridge;
    RaddFolderList: FolderListBridge;
    RaddGithubFolderList: FolderListBridge;
    RaddCollectionsAccordion: {
      setTitle: (title: string) => void;
      setCollections: (collections: { name: string; count: number }[]) => void;
      setSummary: (tokensLabel: string, sizeLabel: string) => void;
    };
    RaddClosureWarning: { show: (title: string, detail: string) => void; hide: () => void };
    RaddCommitMessage: DisabledHandle;
    RaddVersionTag: { setLabel: (label: string) => void };
    // Confirming clears the whole GitHub connection (token/repo/branch/
    // folders) — a real, destructive loss of a configured token unlike the
    // Settings page's own Cancel action, so (unlike the reset-to-defaults
    // dialog removed earlier) this one is deliberately kept.
    RaddRemoveGithubDialog: { open: () => void; onConfirm: (() => void) | null };
    // Same as above, mirrored for GitLab now that it's equally removable.
    RaddRemoveGitlabDialog: { open: () => void; onConfirm: (() => void) | null };
    // One dialog for both providers — open() takes the label to name in the
    // copy, and onConfirm is handed back the same key so the caller knows
    // which token to clear.
    RaddClearTokenDialog: {
      open: (provider: 'gitlab' | 'github') => void;
      onConfirm: ((provider: 'gitlab' | 'github') => void) | null;
    };
    // The GitLab/GitHub tab switcher under "Repository settings" — a plain
    // 2-item RADDSegmentedControl, so it inherits the same "seeds selected
    // once on mount" limitation as RaddExportMode/the old push-target
    // control (see mountRepoTabControl): setValue forces a remount (bumping
    // a key) with the right segment pre-selected, same technique
    // mountFolderList/the old segmented push-target control already used.
    RaddRepoTab: { onChange: ((value: 'gitlab' | 'github') => void) | null; setValue: (value: 'gitlab' | 'github') => void };
    // Rendered as two independent GitLab/GitHub checkboxes (not a 3-way
    // picker) but the external contract still speaks in terms of the single
    // persisted PushTarget string — setValue derives each checkbox's
    // checked state from it, onChange re-derives the resulting PushTarget
    // from whichever checkbox just changed. Unlike RADDSegmentedControl,
    // RADDCheckbox properly reflects a controlled `checked` prop on every
    // render, so no remount-on-change hack is needed here.
    RaddPushTarget: { onChange: ((value: PushTarget) => void) | null; setValue: (value: PushTarget) => void };
    // Settings → Output format. Off ships the Token Studio JSON this plugin has
    // always produced; on ships Tokens Studio DTCG (the 'partial' shape, which
    // build-dtcg.js consumes downstream). A persisted preference like
    // RaddPushTarget, and controlled the same way — RADDSwitch reflects its
    // `selected` prop on every render, so no remount-on-change hack is needed.
    RaddDtcgFormat: { onChange: ((on: boolean) => void) | null; setValue: (on: boolean) => void };
    // First-run nudge: asks which provider(s) to push to, then routes
    // straight to that provider's Settings fields. Only ever triggered
    // when computePushReadiness().needsBigSetup is true (see the
    // GIT_SETTINGS_LOADED handler in ui.template.html) — never reachable
    // once at least one provider is actually usable, and never reappears
    // on its own afterward (no persisted "seen it" flag — it's simply
    // unreachable once something works).
    RaddOnboardingDialog: { open: () => void; onConfirm: ((target: PushTarget) => void) | null };
  }
}

window.RaddButtons = {
  push: mountLiveButton(
    'push-btn-mount',
    { id: 'push-btn', variant: 'filled', size: 'large', label: 'Push to GitLab', style: { width: '100%' } },
    { disabled: true, loading: false, success: false, label: null },
  ),
  download: mountLiveIconButton(
    'download-btn-mount',
    {
      id: 'download-btn',
      variant: 'tonal',
      size: 'large',
      icon: <DownloadStandard width={24} height={24} />,
      title: 'Download',
      'aria-label': 'Download',
    },
    true,
  ),
};

function mountButton(mountId: string, props: RADDButtonProps) {
  mountOnce(mountId, RADDButton, props);
}
function mountIconButton(mountId: string, props: RADDIconButtonProps) {
  mountOnce(mountId, RADDIconButton, props);
}

mountIconButton('folder-add-btn-mount', { id: 'folder-add-btn', variant: 'outline', size: 'small', title: 'Add folder path', 'aria-label': 'Add folder path', icon: <AddStandard width={16} height={16} /> });
mountIconButton('github-folder-add-btn-mount', { id: 'github-folder-add-btn', variant: 'outline', size: 'small', title: 'Add folder path', 'aria-label': 'Add folder path', icon: <AddStandard width={16} height={16} /> });
// Clear this provider's saved token. Sits beside the token field in the same
// [field][icon button] row idiom as the folder-add rows, and is hidden while
// the field is empty (nothing to clear) — see updateClearTokenButtons() in
// ui.template.html.
mountIconButton('gl-clear-token-btn-mount', { id: 'gl-clear-token-btn', variant: 'tonal', destructive: true, size: 'small', title: 'Clear GitLab token', 'aria-label': 'Clear GitLab token', icon: <CloseStandard width={16} height={16} /> });
mountIconButton('gh-clear-token-btn-mount', { id: 'gh-clear-token-btn', variant: 'tonal', destructive: true, size: 'small', title: 'Clear GitHub token', 'aria-label': 'Clear GitHub token', icon: <CloseStandard width={16} height={16} /> });
// Main-screen empty-state row (a provider with zero saved folder paths) —
// jumps to that provider's Settings tab in edit mode, ready at the same
// folder-add row the two buttons above belong to.
mountIconButton('gitlab-empty-add-btn-mount', { id: 'gitlab-empty-add-btn', variant: 'tonal', size: 'small', title: 'Add folder path', 'aria-label': 'Add folder path', icon: <AddStandard width={16} height={16} /> });
mountIconButton('github-empty-add-btn-mount', { id: 'github-empty-add-btn', variant: 'tonal', size: 'small', title: 'Add folder path', 'aria-label': 'Add folder path', icon: <AddStandard width={16} height={16} /> });
// Label is just "Add" (was "Add GitHub"/"Add GitLab") now that the row
// shows the provider's own logo + name to its left (see the HTML) — same
// redundant-label trim as the main screen's per-row settings buttons.
mountButton('add-github-btn-mount', { id: 'add-github-btn', variant: 'tonal', size: 'small', label: 'Add' });
mountButton('remove-github-btn-mount', { id: 'remove-github-btn', variant: 'ghost', destructive: true, size: 'small', label: 'Remove GitHub' });
mountButton('add-gitlab-btn-mount', { id: 'add-gitlab-btn', variant: 'tonal', size: 'small', label: 'Add' });
mountButton('remove-gitlab-btn-mount', { id: 'remove-gitlab-btn', variant: 'ghost', destructive: true, size: 'small', label: 'Remove GitLab' });
// Settings has no Edit/Save/Cancel any more — the fields are always
// editable and save themselves (see ui.template.html). Back is all that is
// left, and it sits at the top-right of the Settings header, mirroring the
// main screen's own settings button in the same spot.
mountIconButton('back-btn-mount', { id: 'back-btn', variant: 'ghost', size: 'small', title: 'Back', 'aria-label': 'Back', icon: <ArrowLeftStandard width={16} height={16} /> });

mountIconButton('settings-btn-mount', { id: 'settings-btn', variant: 'ghost', size: 'small', title: 'Git settings', 'aria-label': 'Git settings', icon: <SettingsStandard width={16} height={16} /> });

// Custom pill (outline, small) rather than a RADD component — the same
// visual language the old .app-version span had.
function mountVersionTag(mountId: string) {
  const container = document.getElementById(mountId);
  let setState: (label: string) => void = () => {};

  function View() {
    const [label, setLabel] = useState('');
    setState = setLabel;
    if (!label) return null;
    return <span className="version-tag-label" title="Plugin version">{label}</span>;
  }

  if (container) {
    flushSync(() => createRoot(container).render(<View />));
  }

  window.RaddVersionTag = {
    setLabel: (label) => setState(label),
  };
}
mountVersionTag('version-tag-mount');
// token-modal-add/later/close are no longer separate mounts — see
// mountTokenModal below, which consolidates the whole first-run prompt
// (including these) into one RADDDialog/RADDDialogContent tree. They can't
// stay separate: DialogContent renders null until opened, so any mount
// point placed inside its contentSlot/actionSlot wouldn't exist in the DOM
// for these to mount into at page load.

function mountTextField(mountId: string, props: RADDTextFieldProps) {
  mountOnce(mountId, RADDTextField, props);
}
function mountTextArea(mountId: string, props: RADDTextAreaProps) {
  mountOnce(mountId, RADDTextArea, props);
}

// Each provider's own JSON file name, shown read-only on the main screen
// (edited in Settings, mirroring how the folder path is picked here but
// added-to in Settings). The displayed value gets reassigned after mount
// via setFieldValue() (see syncMainScreenFilenames() in ui.template.html),
// which works on uncontrolled inputs too.
mountTextField('export-filename-mount', {
  size: 'small',
  readonly: true,
  defaultValue: 'tokens.json',
  style: { width: '100%' },
  inputProps: { id: 'export-filename', tabIndex: -1, 'aria-readonly': true, title: 'GitLab JSON file name (set in Settings)' },
});
mountTextField('github-filename-mount', {
  size: 'small',
  readonly: true,
  defaultValue: 'tokens.json',
  style: { width: '100%' },
  inputProps: { id: 'github-filename', tabIndex: -1, 'aria-readonly': true, title: 'GitHub JSON file name (set in Settings)' },
});

// Its VALUE is never programmatically reassigned (only typed into
// directly) — but it does need to be disabled at runtime once none of the
// active push target(s) are configured yet, so it's a live mount (for the
// `disabled` prop only) rather than the plain static mountTextArea used
// elsewhere.
window.RaddCommitMessage = mountLiveTextArea(
  'commit-message-mount',
  {
    size: 'small',
    placeholder: 'Enter commit message...',
    style: { width: '100%' },
    textAreaProps: { id: 'commit-message', rows: 2 },
  },
  false,
);

// Replaces the Push button itself (same slot, left of Download) whenever
// no active push destination is workable yet (see updateActionUI()) —
// single-provider mode with that provider not ready, or 'both' mode with
// NEITHER ready. Always this one generic label regardless of which/how
// many providers are involved (see the per-provider small buttons below
// for the one case that DOES name a specific provider).
mountButton('add-repo-settings-btn-mount', { id: 'add-repo-settings-btn', variant: 'outline', size: 'large', label: 'Add Repo Settings', style: { width: '100%' } });

// Replaces one provider's field row (title/logo stay visible) with just
// this small button when — 'both' mode only — that provider isn't ready
// but the OTHER one is; the ready one keeps working normally and the push
// proceeds against it alone (see updateActionUI()'s effective-target
// narrowing), so this is a secondary "finish setting up the other one too"
// affordance, not a blocker.
// Label is deliberately provider-agnostic ("Add Settings", not "Add
// GitHub/GitLab Settings") — the row's own title+logo (kept visible to its
// left, see updateTargetRow()) already says which provider this is; the
// longer per-provider label used to wrap onto two lines once the trash
// button below started sharing this same row.
mountButton('gitlab-small-settings-btn-mount', { id: 'gitlab-small-settings-btn', variant: 'tonal', size: 'small', label: 'Add Settings', leftIcon: true, buttonLeftIcon: <SettingsStandard width={16} height={16} /> });
mountButton('github-small-settings-btn-mount', { id: 'github-small-settings-btn', variant: 'tonal', size: 'small', label: 'Add Settings', leftIcon: true, buttonLeftIcon: <SettingsStandard width={16} height={16} /> });
// Sits right next to the small settings button above — drops this
// provider from the push destination entirely (see the click handler in
// ui.template.html), leaving the other, already-ready provider as the
// sole target.
mountIconButton('gitlab-remove-push-btn-mount', { id: 'gitlab-remove-push-btn', variant: 'tonal', destructive: true, size: 'small', title: 'Remove GitLab from push destination', 'aria-label': 'Remove GitLab from push destination', icon: <RemoveStandard width={16} height={16} /> });
mountIconButton('github-remove-push-btn-mount', { id: 'github-remove-push-btn', variant: 'tonal', destructive: true, size: 'small', title: 'Remove GitHub from push destination', 'aria-label': 'Remove GitHub from push destination', icon: <RemoveStandard width={16} height={16} /> });
// Same trash action, offered again next to the empty-folder-path "+"
// button (a ready-but-pathless provider) — only shown in 'both' mode, see
// updateTargetRow().
mountIconButton('gitlab-empty-remove-push-btn-mount', { id: 'gitlab-empty-remove-push-btn', variant: 'tonal', destructive: true, size: 'small', title: 'Remove GitLab from push destination', 'aria-label': 'Remove GitLab from push destination', icon: <RemoveStandard width={16} height={16} /> });
mountIconButton('github-empty-remove-push-btn-mount', { id: 'github-empty-remove-push-btn', variant: 'tonal', destructive: true, size: 'small', title: 'Remove GitHub from push destination', 'aria-label': 'Remove GitHub from push destination', icon: <RemoveStandard width={16} height={16} /> });

mountTextField('folder-new-mount', {
  size: 'small',
  // Same leading icon as the existing saved-path rows, for consistency.
  showLeftIcon: true,
  leftIcon: <FolderStandard width={16} height={16} />,
  // A generic placeholder, not a real default folder like "src/oneID" —
  // that would look like an actual value rather than a fill-in-the-blank
  // example.
  placeholder: 'e.g. src/something',
  style: { width: '100%' },
  inputProps: { id: 'folder-new' },
});

mountTextField('github-folder-new-mount', {
  size: 'small',
  showLeftIcon: true,
  leftIcon: <FolderStandard width={16} height={16} />,
  placeholder: 'e.g. src/something',
  style: { width: '100%' },
  inputProps: { id: 'github-folder-new' },
});


// GitLab connection fields. Always editable: Settings has no view/edit
// mode, so there is no readonly state to toggle and no handle to keep.

mountTextField('gl-token-mount', { size: 'small', label: 'GitLab Token', placeholder: 'glpat-… (stored only on this machine)', style: { width: '100%' }, inputProps: { id: 'gl-token', type: 'password' } });
mountTextField('gl-host-mount', { size: 'small', label: 'GitLab Host', placeholder: 'https://gitlab.com', style: { width: '100%' }, inputProps: { id: 'gl-host' } });
mountTextField('gl-project-mount', { size: 'small', label: 'Project (path or ID)', placeholder: 'group/subgroup/project or 1234', style: { width: '100%' }, inputProps: { id: 'gl-project' } });
mountTextField('gl-branch-mount', { size: 'small', label: 'Branch', placeholder: 'main', style: { width: '100%' }, inputProps: { id: 'gl-branch' } });
mountTextField('gl-filename-mount', { size: 'small', label: 'JSON file name', placeholder: 'tokens.json', style: { width: '100%' }, inputProps: { id: 'gl-filename' } });

// GitHub connection fields — same, always editable.

mountTextField('gh-token-mount', { size: 'small', label: 'GitHub Token', placeholder: 'ghp-… (stored only on this machine)', style: { width: '100%' }, inputProps: { id: 'gh-token', type: 'password' } });
mountTextField('gh-repo-mount', { size: 'small', label: 'Repository (owner/repo)', placeholder: 'my-org/my-repo', style: { width: '100%' }, inputProps: { id: 'gh-repo' } });
mountTextField('gh-branch-mount', { size: 'small', label: 'Branch', placeholder: 'main', style: { width: '100%' }, inputProps: { id: 'gh-branch' } });
mountTextField('gh-filename-mount', { size: 'small', label: 'JSON file name', placeholder: 'tokens.json', style: { width: '100%' }, inputProps: { id: 'gh-filename' } });

window.RaddExportMode = { onChange: null };
mountOnce<RADDSegmentedControlProps>('export-mode-control-mount', RADDSegmentedControl, {
  size: 'small',
  variant: 'fill',
  items: [
    { label: 'Native' },
    { label: 'Token Studio', selected: true },
  ],
  // RADDSegmentedControlProps intersects native div props, so its `onChange`
  // type gets merged with React's div ChangeEventHandler — TS then infers a
  // union param even though the compiled component only ever calls this
  // with a plain index (see SegmentedControl.js: `m?.(e)` with `e` a number).
  onChange: ((index: number) => window.RaddExportMode.onChange?.(index)) as RADDSegmentedControlProps['onChange'],
});

// Push destination (GitLab / GitHub / Both) — only relevant, and only shown
// in the template, once GitHub has been added. Rendered as two independent
// checkboxes rather than a GitLab/GitHub/Both picker — ticking either or
// both is more direct than a 3-way exclusive control for what's really an
// independent pair of yes/no destinations.
type PushCheckboxState = { gitlab: boolean; github: boolean };

function targetFromCheckboxes(state: PushCheckboxState): PushTarget {
  if (state.gitlab && state.github) return 'both';
  if (state.github) return 'github';
  return 'gitlab';
}

function checkboxesFromTarget(target: PushTarget): PushCheckboxState {
  return { gitlab: target !== 'github', github: target === 'github' || target === 'both' };
}

function mountPushTargetControl(mountId: string) {
  const container = document.getElementById(mountId);
  let setState: (state: PushCheckboxState) => void = () => {};

  function View() {
    const [state, setLocalState] = useState<PushCheckboxState>({ gitlab: true, github: false });
    setState = setLocalState;

    // A push needs somewhere to go — unchecking the only checked box snaps
    // it back on instead of leaving both off.
    function toggle(which: keyof PushCheckboxState, checked: boolean) {
      const next = { ...state, [which]: checked };
      if (!next.gitlab && !next.github) next[which] = true;
      setLocalState(next);
      window.RaddPushTarget.onChange?.(targetFromCheckboxes(next));
    }

    return (
      <>
        <RADDCheckbox
          size="small"
          label="GitLab"
          checked={state.gitlab}
          inputProps={{ id: 'push-target-gitlab', onChange: (e) => toggle('gitlab', e.target.checked) }}
        />
        <RADDCheckbox
          size="small"
          label="GitHub"
          checked={state.github}
          inputProps={{ id: 'push-target-github', onChange: (e) => toggle('github', e.target.checked) }}
        />
      </>
    );
  }

  if (container) {
    flushSync(() => createRoot(container).render(<View />));
  }

  window.RaddPushTarget = {
    onChange: null,
    setValue: (value) => setState(checkboxesFromTarget(value)),
  };
}

mountPushTargetControl('push-target-control-mount');

// Settings → Output format. A single switch rather than a format picker: the
// question is just "Token Studio or DTCG", and the other shapes
// (native, per-theme resolved) stay CLI-only — see scripts/dtcg-preview.js.
function mountDtcgFormatSwitch(mountId: string) {
  const container = document.getElementById(mountId);
  let setState: (on: boolean) => void = () => {};

  function View() {
    const [on, setOn] = useState(false);
    setState = setOn;
    return (
      <RADDSwitch
        size="small"
        alignment="left"
        label="Tokens Studio DTCG"
        selected={on}
        inputProps={{
          id: 'dtcg-format-switch',
          onChange: (e) => {
            setOn(e.target.checked);
            window.RaddDtcgFormat.onChange?.(e.target.checked);
          },
        }}
      />
    );
  }

  if (container) {
    flushSync(() => createRoot(container).render(<View />));
  }

  window.RaddDtcgFormat = {
    onChange: null,
    setValue: (value) => setState(value),
  };
}

mountDtcgFormatSwitch('dtcg-format-control-mount');

// GitLab/GitHub tab switcher under "Repository settings" — a genuine
// mutually-exclusive pick (unlike the push-destination checkboxes above),
// so a segmented control is the right widget here. Listed GitHub-then-
// GitLab, matching how this was asked for. Same "seeds selected once on
// mount" limitation as RaddExportMode (RADDSegmentedControl doesn't react
// to prop changes after mount) — setValue forces a remount via a bumped
// key, the same technique mountFolderList/the old push-target segmented
// control already used.
const REPO_TABS: Array<'github' | 'gitlab'> = ['github', 'gitlab'];

function mountRepoTabControl(mountId: string) {
  const container = document.getElementById(mountId);
  let setState: (updater: (s: { value: 'gitlab' | 'github'; generation: number }) => { value: 'gitlab' | 'github'; generation: number }) => void = () => {};

  function View() {
    const [state, setLocalState] = useState({ value: 'gitlab' as 'gitlab' | 'github', generation: 0 });
    setState = setLocalState;
    return (
      <RADDSegmentedControl
        key={state.generation}
        size="small"
        variant="fill"
        items={REPO_TABS.map((tab) => ({
          label: tab === 'github' ? 'GitHub' : 'GitLab',
          selected: state.value === tab,
        }))}
        onChange={((index: number) => {
          window.RaddRepoTab.onChange?.(REPO_TABS[index]);
        }) as RADDSegmentedControlProps['onChange']}
      />
    );
  }

  if (container) {
    flushSync(() => createRoot(container).render(<View />));
  }

  window.RaddRepoTab = {
    onChange: null,
    setValue: (value) => setState((s) => ({ value, generation: s.generation + 1 })),
  };
}

mountRepoTabControl('repo-settings-tab-mount');

// Both skeleton blocks are static, fixed-shape placeholders (never rebuilt
// or data-driven) — safe as one-time mounts. RADDSkeleton's `variant` only
// sets a default width/height/radius; every instance below overrides those
// via inline `style` anyway (an inline style attribute always beats a class
// rule regardless of layers), matching the exact shapes the old hand-rolled
// `.sk-*` placeholders had.
// The real, loaded content is a single collapsed accordion bar (see
// mountCollectionsAccordion below) — a compact header line, not the tall
// per-row list this used to mirror — so the skeleton is now just one bar
// shaped like that header (~48px, RADD's small-size min-height token) plus
// a chevron-shaped placeholder, instead of 8 checkbox-row placeholders.
function CollectionsListSkeleton() {
  return (
    <div className="skeleton-item" style={{ minHeight: 48 }}>
      <RADDSkeleton variant="small" style={{ width: 180, height: 14 }} />
      <RADDSkeleton variant="small" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginLeft: 'auto' }} />
    </div>
  );
}

function ActionsSkeleton() {
  return (
    <div className="export-panel">
      <div className="sk-row">
        <RADDSkeleton variant="small" style={{ width: 90, height: 44, borderRadius: 12, flexShrink: 0 }} />
        <RADDSkeleton variant="small" style={{ height: 44, borderRadius: 12, flex: 1 }} />
      </div>
      <RADDSkeleton variant="small" style={{ height: 68, borderRadius: 12, width: '100%' }} />
      <div className="sk-row">
        <RADDSkeleton variant="small" style={{ height: 64, borderRadius: 12, flex: 1 }} />
        <RADDSkeleton variant="small" style={{ width: 64, height: 64, borderRadius: 12, flexShrink: 0 }} />
      </div>
    </div>
  );
}

mountOnce('skeleton-list', CollectionsListSkeleton, {});
mountOnce('actions-skeleton', ActionsSkeleton, {});

// The old showToast() replaced any existing .toast node with a fresh one on
// every call. RADDNotification (which RADDToast wraps) instead re-syncs an
// internal "opened" mirror state from the `opened` prop via its own
// useEffect on every prop change (confirmed in Notification.js) — so a
// single persistent instance, driven by local state, tracks `opened` the
// same way; no flushSync needed here since nothing else reads this
// synchronously right after — every showToast() call comes from a later
// event handler, not the next script tag.
type ToastState = { opened: boolean; type: 'success' | 'error'; message: string; bottom: number };

const TOAST_DEFAULT_BOTTOM = 20;

// Nothing shares the toast's fixed-bottom region any more: the Settings
// page's sticky action bar went away with its view/edit mode (Back moved
// into the header), so this is a plain constant rather than a measured
// clearance.

function mountToast(mountId: string) {
  const container = document.getElementById(mountId);
  let setState: (updater: (s: ToastState) => ToastState) => void = () => {};

  function ToastMount() {
    const [state, setLocalState] = useState<ToastState>({ opened: false, type: 'success', message: '', bottom: TOAST_DEFAULT_BOTTOM });
    setState = setLocalState;
    return (
      <RADDToast
        className="toast-enter"
        opened={state.opened}
        type={state.type}
        leadingSlot={<RADDNotificationsLeadingSlotPreferredContent type={state.type} />}
        contentSlot={<RADDNotificationsContentSlot title={state.message} showActions={false} />}
        timeout={2500}
        showProgressBar
        onClose={() => setState((s) => ({ ...s, opened: false }))}
        style={{
          position: 'fixed',
          bottom: state.bottom,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: 'calc(100% - 32px)',
          zIndex: 100,
        }}
      />
    );
  }

  if (container) {
    createRoot(container).render(<ToastMount />);
  }

  window.RaddToast = {
    show: (message, isError) =>
      setState(() => ({ opened: true, type: isError ? 'error' : 'success', message, bottom: TOAST_DEFAULT_BOTTOM })),
  };
}

mountToast('toast-mount');

window.RaddFolderSelect = {
  ...mountLiveDropdown(
    'folder-select-mount',
    { id: 'folder-select', size: 'small' },
    (value) => window.RaddFolderSelect.onChange?.(value),
  ),
  onChange: null,
};

window.RaddGithubFolderSelect = {
  ...mountLiveDropdown(
    'github-folder-select-mount',
    { id: 'github-folder-select', size: 'small' },
    (value) => window.RaddGithubFolderSelect.onChange?.(value),
  ),
  onChange: null,
};

// Folder path rows (Settings). Unlike every other list-shaped mount above,
// this one is rebuilt often (add/remove/edit-mode toggle) — see the "why
// every row remounts" comment on renderFolderList() in the template: each
// call bumps `generation`, changing every row's key, so React fully
// discards and recreates each RADDTextField/RADDIconButton rather than
// reusing one by index. That's required here specifically because a row's
// value is uncontrolled (defaultValue only applies on first mount) and
// removing a middle row shifts every later row to a new index — without a
// fresh key, those rows would keep showing their pre-shift stale value.
// bridgeKey parameterizes this over GitLab's vs. GitHub's independent
// folder-path list — two separate call sites below, not shared state.
// idPrefix keeps GitLab's row-input ids exactly as they were
// ('folder-row-input-N', already read elsewhere via setFieldValue) while
// giving GitHub's rows their own, non-colliding ids.
function mountFolderList(mountId: string, bridgeKey: 'RaddFolderList' | 'RaddGithubFolderList', idPrefix: string) {
  const container = document.getElementById(mountId);
  const root = container ? createRoot(container) : null;
  let generation = 0;

  function render(rows: { path: string; canEdit: boolean }[]) {
    if (!root) return;
    generation += 1;
    const gen = generation;
    root.render(
      <>
        {rows.map((row, idx) => (
          <div className="folder-row" key={`${gen}-${idx}`}>
            <RADDTextField
              size="small"
              readonly={!row.canEdit}
              showLeftIcon
              leftIcon={<FolderStandard width={16} height={16} />}
              style={{ width: '100%' }}
              defaultValue={row.path}
              onChange={(e) => window[bridgeKey].onInput?.(idx, e.target.value)}
              inputProps={{
                id: `${idPrefix}-${idx}`,
                onBlur: (e) => window[bridgeKey].onBlur?.(idx, e.target.value),
              }}
            />
            {row.canEdit && (
              <RADDIconButton
                variant="tonal"
                destructive
                size="small"
                title="Remove this path"
                aria-label="Remove this path"
                icon={<CloseStandard width={16} height={16} />}
                onClick={() => window[bridgeKey].onRemove?.(idx)}
              />
            )}
          </div>
        ))}
      </>,
    );
  }

  window[bridgeKey] = { render, onInput: null, onBlur: null, onRemove: null };
}

mountFolderList('folder-list', 'RaddFolderList', 'folder-row-input');
mountFolderList('github-folder-list', 'RaddGithubFolderList', 'github-folder-row-input');

// Read-only: every collection is always exported, so this is a plain
// breakdown, not an input — no checkboxes, no "select all", nothing the
// user can toggle (the checkmark on each row is decorative — "this one's
// included" — not a control). Lives in a RADDAccordion (headerSlot is a
// plain ReactNode, so it isn't limited to a single line of text): the
// title is the actual Figma file name (figma.root.name, sent as
// msg.fileName on the 'fileInfo'/'extracted' messages — set via setTitle,
// see ui.template.html) rather than a fixed label, plus three subtle
// RADDTagStatic chips with the aggregate totals — both sit in the header
// itself, always visible whether expanded or not. The tags are filled in
// separately via setSummary once the real totals are known, since only
// the 'transformed' message (not 'extracted') carries them. contentSlot
// is just the per-collection rows, revealed on expand.
type CollectionInfo = { name: string; count: number };
type CollectionsSummary = { tokens: string; size: string };
type CollectionsAccordionState = { title: string; collections: CollectionInfo[]; summary: CollectionsSummary };

function mountCollectionsAccordion(mountId: string) {
  const container = document.getElementById(mountId);
  let setState: (updater: (s: CollectionsAccordionState) => CollectionsAccordionState) => void = () => {};

  function View() {
    const [state, setLocalState] = useState<CollectionsAccordionState>({
      title: 'Scanned collections',
      collections: [],
      summary: { tokens: '', size: '' },
    });
    setState = setLocalState;

    return (
      <RADDAccordion
        size="large"
        defaultExpanded={true}
        headerSlot={
          <div className="collections-header">
            <span className="collections-summary">{state.title}</span>
            <div className="collections-summary-tags">
              <RADDTagStatic type="subtle" label={state.summary.tokens} />
              <RADDTagStatic type="subtle" label={state.summary.size} />
            </div>
          </div>
        }
        contentSlot={
          <div className="collections-readonly-list">
            {state.collections.map((c) => (
              <div key={c.name} className="collection-item">
                <CheckmarkStandard width={14} height={14} className="collection-item-check" />
                <span className="name">{c.name}</span>
                <span className="count">{c.count}</span>
              </div>
            ))}
          </div>
        }
      />
    );
  }

  if (container) {
    flushSync(() => createRoot(container).render(<View />));
  }

  window.RaddCollectionsAccordion = {
    setTitle: (title) => setState((s) => ({ ...s, title })),
    setCollections: (collections) => setState((s) => ({ ...s, collections })),
    setSummary: (tokensLabel, sizeLabel) => setState((s) => ({ ...s, summary: { tokens: tokensLabel, size: sizeLabel } })),
  };
}

mountCollectionsAccordion('collections-list');

// Reference-closure warning banner. Static single instance whose
// visibility/text change at runtime — same opened-prop re-sync as Toast
// (RADDInlineNotification is also a thin Notification wrapper), so no
// flushSync needed: nothing reads its DOM synchronously right after show()
// or hide() is called, both always fire from a later message-handler event.
type ClosureWarningState = { opened: boolean; title: string; detail: string };

function mountClosureWarning(mountId: string) {
  const container = document.getElementById(mountId);
  let setState: (updater: (s: ClosureWarningState) => ClosureWarningState) => void = () => {};

  function View() {
    const [state, setLocalState] = useState<ClosureWarningState>({ opened: false, title: '', detail: '' });
    setState = setLocalState;
    return (
      <RADDInlineNotification
        opened={state.opened}
        type="error"
        showCloseButton={false}
        leadingSlot={<span aria-hidden="true">⚠</span>}
        contentSlot={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <strong style={{ color: 'var(--app-danger)' }}>{state.title}</strong>
            <span style={{ color: 'var(--app-text-muted)' }}>{state.detail}</span>
          </div>
        }
      />
    );
  }

  if (container) {
    createRoot(container).render(<View />);
  }

  window.RaddClosureWarning = {
    show: (title, detail) => setState(() => ({ opened: true, title, detail })),
    hide: () => setState((s) => ({ ...s, opened: false })),
  };
}

mountClosureWarning('closure-warning-mount');


// Confirms before clearing a configured GitHub connection (token/repo/
// branch/folders) — a real, destructive loss of a saved token, unlike the
// Settings page's own Cancel (which turned out to be non-destructive and
// had its confirmation removed earlier). Deliberately purpose-built rather
// than reviving a generic confirm-dialog helper: there's exactly one caller.
function mountRemoveGithubDialog(mountId: string) {
  const container = document.getElementById(mountId);
  let setOpenExternal: (open: boolean) => void = () => {};

  function View() {
    const [open, setOpen] = useState(false);
    setOpenExternal = setOpen;
    return (
      <RADDDialog open={open} onOpenChange={setOpen}>
        <RADDDialogContent
          className="remove-confirm-dialog"
          title="Remove GitHub?"
          text="This clears the saved GitHub token, repository, and folder paths from this plugin."
          actionSlot={
            <div style={{ display: 'flex', flexDirection: 'row', gap: 12, width: '100%' }}>
              <RADDButton variant="outline" size="large" label="Cancel" style={{ flex: 1 }} onClick={() => setOpen(false)} />
              <RADDButton
                variant="filled"
                destructive
                size="large"
                label="Remove"
                style={{ flex: 1 }}
                onClick={() => {
                  setOpen(false);
                  window.RaddRemoveGithubDialog.onConfirm?.();
                }}
              />
            </div>
          }
        />
      </RADDDialog>
    );
  }

  if (container) {
    createRoot(container).render(<View />);
  }

  window.RaddRemoveGithubDialog = { open: () => setOpenExternal(true), onConfirm: null };
}

mountRemoveGithubDialog('remove-github-dialog-mount');

// Mirrors mountRemoveGithubDialog above, now that GitLab is equally
// removable — kept as its own purpose-built dialog rather than a shared
// generic one, same reasoning (exactly one caller each).
function mountRemoveGitlabDialog(mountId: string) {
  const container = document.getElementById(mountId);
  let setOpenExternal: (open: boolean) => void = () => {};

  function View() {
    const [open, setOpen] = useState(false);
    setOpenExternal = setOpen;
    return (
      <RADDDialog open={open} onOpenChange={setOpen}>
        <RADDDialogContent
          className="remove-confirm-dialog"
          title="Remove GitLab?"
          text="This clears the saved GitLab token, project, and folder paths from this plugin."
          actionSlot={
            <div style={{ display: 'flex', flexDirection: 'row', gap: 12, width: '100%' }}>
              <RADDButton variant="outline" size="large" label="Cancel" style={{ flex: 1 }} onClick={() => setOpen(false)} />
              <RADDButton
                variant="filled"
                destructive
                size="large"
                label="Remove"
                style={{ flex: 1 }}
                onClick={() => {
                  setOpen(false);
                  window.RaddRemoveGitlabDialog.onConfirm?.();
                }}
              />
            </div>
          }
        />
      </RADDDialog>
    );
  }

  if (container) {
    createRoot(container).render(<View />);
  }

  window.RaddRemoveGitlabDialog = { open: () => setOpenExternal(true), onConfirm: null };
}

mountRemoveGitlabDialog('remove-gitlab-dialog-mount');

// Clearing a token is its own confirm rather than a bare button: the field is
// type=password, so what is in there cannot be eyeballed before it is wiped,
// and a GitLab PAT is not always something the user can re-fetch quickly.
// Same shape as the two Remove dialogs above, but one instance serving both
// providers — the only thing that differs is which name appears in the copy.
function mountClearTokenDialog(mountId: string) {
  const container = document.getElementById(mountId);
  let setOpenExternal: (open: boolean) => void = () => {};
  let setProviderExternal: (provider: 'gitlab' | 'github') => void = () => {};

  function View() {
    const [open, setOpen] = useState(false);
    const [provider, setProvider] = useState<'gitlab' | 'github'>('gitlab');
    setOpenExternal = setOpen;
    setProviderExternal = setProvider;
    const label = provider === 'github' ? 'GitHub' : 'GitLab';
    return (
      <RADDDialog open={open} onOpenChange={setOpen}>
        <RADDDialogContent
          className="remove-confirm-dialog"
          title={`Clear ${label} token?`}
          text={`The saved ${label} token is removed from this plugin. Everything else — repository, branch and saved folder paths — stays as it is, and pushing is paused until you enter a new token.`}
          actionSlot={
            <div style={{ display: 'flex', flexDirection: 'row', gap: 12, width: '100%' }}>
              <RADDButton variant="outline" size="large" label="Cancel" style={{ flex: 1 }} onClick={() => setOpen(false)} />
              <RADDButton
                variant="filled"
                destructive
                size="large"
                label="Clear"
                style={{ flex: 1 }}
                onClick={() => {
                  setOpen(false);
                  window.RaddClearTokenDialog.onConfirm?.(provider);
                }}
              />
            </div>
          }
        />
      </RADDDialog>
    );
  }

  if (container) {
    createRoot(container).render(<View />);
  }

  window.RaddClearTokenDialog = {
    open: (provider) => {
      // flushSync so the copy names the right provider in the same frame the
      // dialog becomes visible, rather than flashing the previous one.
      flushSync(() => setProviderExternal(provider));
      setOpenExternal(true);
    },
    onConfirm: null,
  };
}

mountClearTokenDialog('clear-token-dialog-mount');

// Each provider's brand mark in the same round chip the Settings page uses
// for its own provider rows (.provider-logo-badge there) — the onboarding
// cards below deliberately mirror that logo-left / control-right shape, so
// picking a provider here looks like the row it becomes over there.
const PROVIDER_LOGO_PATH = {
  gitlab: 'M23.955 13.587l-1.342-4.135-2.664-8.189c-.135-.423-.73-.423-.867 0L16.418 9.45H7.582L4.919 1.263C4.783.84 4.185.84 4.05 1.264L1.386 9.45.044 13.587c-.121.375.014.789.331 1.023L12 23.054l11.625-8.443c.318-.235.453-.647.33-1.024',
  github: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z',
} as const;

function ProviderChoiceCard({ which, label, checked, onToggle }: {
  which: keyof typeof PROVIDER_LOGO_PATH;
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  // The whole card is the hit target, and the checkbox inside is purely
  // presentational (pointer-events:none below, driven only by `checked`).
  // That is load-bearing: RADDCheckbox wraps its input in a <label>, so
  // letting the box take clicks itself meant the click bubbled up here AND
  // the label re-dispatched to the input — two toggles that cancelled out,
  // leaving the box dead to a direct click. One element owns the
  // interaction; keyboard support lives on this div too.
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onToggle(!checked)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onToggle(!checked);
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        // RADDDialog's slot container is itself a flex ROW, so without an
        // explicit full width these cards shrink to their content instead
        // of filling the dialog — which also crushed the label under the
        // checkbox at this panel width.
        width: '100%',
        boxSizing: 'border-box',
        background: 'var(--app-surface)',
        // Transparent rather than absent, so selecting a card never shifts
        // the layout by a pixel.
        border: '1px solid ' + (checked ? 'var(--app-accent)' : 'transparent'),
        borderRadius: 16,
        padding: '10px 14px',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--app-bg)',
          color: 'var(--app-text-muted)',
          flexShrink: 0,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
          <path d={PROVIDER_LOGO_PATH[which]} />
        </svg>
      </span>
      <span style={{ flex: 1, minWidth: 0, font: 'var(--body-m-bold)', letterSpacing: 'var(--body-m-bold-letter-spacing)', color: 'var(--app-text)' }}>
        {label}
      </span>
      <span style={{ display: 'flex', flexShrink: 0, pointerEvents: 'none' }}>
        <RADDCheckbox
          size="small"
          checked={checked}
          inputProps={{ id: 'onboarding-' + which, tabIndex: -1, onChange: () => {} }}
        />
      </span>
    </div>
  );
}

// First-run nudge, shown only when nothing is configured yet (see
// computePushReadiness().needsBigSetup in ui.template.html). Two steps:
// pick the provider(s), then a summary of exactly what each one still
// needs before the "Add Settings" hand-off into the Settings page.
// Reuses the exact same GitLab/GitHub checkbox pair + PushTarget
// derivation as the Settings-page push-destination control
// (targetFromCheckboxes/PushCheckboxState) so both stay in sync by
// construction, but keeps its own local pending selection — nothing
// touches the real pushTarget/githubAdded state until "Add Settings" is
// actually clicked on step 2 (the × , backdrop-click and Escape all just
// close it with zero side effects, same as every other dialog here, and
// are the only way out: there is no Skip button on either step).
function mountOnboardingDialog(mountId: string) {
  const container = document.getElementById(mountId);
  let setOpenExternal: (open: boolean) => void = () => {};

  // What step 2 tells the user they are about to fill in. GitLab's host /
  // project / branch come pre-filled from GITLAB_DEFAULTS, so a token is
  // genuinely all it needs; GitHub has no standard repo to assume.
  function whatsNeeded(state: PushCheckboxState): string {
    const gl = 'GitLab needs a personal access token — its host, project and branch are already filled in for you.';
    const gh = 'GitHub needs a personal access token and the owner/repo to push to.';
    if (state.gitlab && state.github) return gl + ' ' + gh;
    return state.github ? gh : gl;
  }

  function View() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);
    const [state, setState] = useState<PushCheckboxState>({ gitlab: true, github: false });
    // Always reopen on step 1 — a dialog dismissed on step 2 should not
    // come back mid-flow next time it is shown.
    setOpenExternal = (next: boolean) => {
      if (next) setStep(1);
      setOpen(next);
    };

    // Same "a push needs somewhere to go" guard as mountPushTargetControl.
    function toggle(which: keyof PushCheckboxState, checked: boolean) {
      const next = { ...state, [which]: checked };
      if (!next.gitlab && !next.github) next[which] = true;
      setState(next);
    }

    return (
      <RADDDialog open={open} onOpenChange={setOpen}>
        <RADDDialogContent
          className="onboarding-dialog"
          // RADDDialogContent's title is hard single-line (nowrap +
          // ellipsis), so both steps' titles stay short enough to never
          // truncate. The longer copy lives in `text`, which wraps.
          title={step === 1 ? 'Push destination' : 'Repository settings'}
          text={
            step === 1
              ? 'Where do you want to push your tokens? Pick one or both — you can change this anytime in Settings.'
              : whatsNeeded(state)
          }
          contentSlot={
            step === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                <ProviderChoiceCard which="gitlab" label="GitLab" checked={state.gitlab} onToggle={(c) => toggle('gitlab', c)} />
                <ProviderChoiceCard which="github" label="GitHub" checked={state.github} onToggle={(c) => toggle('github', c)} />
              </div>
            ) : undefined
          }
          actionSlot={
            step === 1 ? (
              <RADDButton
                variant="filled"
                size="large"
                label="Next"
                style={{ width: '100%' }}
                onClick={() => setStep(2)}
              />
            ) : (
              // Back, not Skip — step 2 is a summary of the step-1 pick, so
              // the only thing to go "back" to is changing that pick.
              <div style={{ display: 'flex', flexDirection: 'row', gap: 12, width: '100%' }}>
                <RADDButton variant="outline" size="large" label="Back" style={{ flex: 1 }} onClick={() => setStep(1)} />
                <RADDButton
                  variant="filled"
                  size="large"
                  label="Add Settings"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setOpen(false);
                    window.RaddOnboardingDialog.onConfirm?.(targetFromCheckboxes(state));
                  }}
                />
              </div>
            )
          }
        />
      </RADDDialog>
    );
  }

  if (container) {
    createRoot(container).render(<View />);
  }

  window.RaddOnboardingDialog = { open: () => setOpenExternal(true), onConfirm: null };
}

mountOnboardingDialog('onboarding-dialog-mount');
