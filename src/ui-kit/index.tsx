/*
  ui-kit — the plugin's own small component set. Plain React, plain CSS
  (tokens.css + kit.css beside this file), no external design system.

  It only has what this plugin draws: Button, Tag, Alert, Spinner, Skeleton,
  Checkbox, SegmentedControl, SelectableCard, DropDownSelect, Combobox, Dialog,
  Toast, Table, FileUploadItem, and the two text-field adapters. Each takes the
  prop bag buttons.tsx already passes, so a mount reads the same as it always
  did.

  No component here knows its ground. Fills come from CSS custom properties
  that the nearest [data-level] element declares (see tokens.css).
*/
import { useState, useRef, useEffect, useLayoutEffect, useId, useCallback } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import './tokens.css';
import './kit.css';

/** The surface rung a mount stands on. Informational: CSS reads data-level. */
export type Level = 1 | 2 | 3 | 4;

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ');

/* ── Spinner ─────────────────────────────────────────────────────────────── */
export function Spinner({ size = 20, strokeWidth = 2, label = 'Loading' }:
  { size?: number; strokeWidth?: number; label?: string }) {
  const r = 10 - strokeWidth / 2;
  return (
    <svg className="ui-spinner" width={size} height={size} viewBox="0 0 24 24"
      role={label ? 'status' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      <circle cx="12" cy="12" r={r + 2} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
        strokeLinecap="round" strokeDasharray="40 100" />
    </svg>
  );
}

/* ── Button ──────────────────────────────────────────────────────────────── */
export type ButtonProps = {
  id?: string;
  variant?: 'primary' | 'tonal' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  shape?: 'rect' | 'square';
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Accessible name for an icon-only button. */
  label?: string;
  title?: string;
  style?: CSSProperties;
  onClick?: (e: any) => void;
  'data-scheme'?: string;
  children?: ReactNode;
};
export function Button(p: ButtonProps) {
  const { id, variant = 'tonal', size = 'small', shape = 'rect', block, disabled, loading, active,
    leading, trailing, label, title, style, onClick, children } = p;
  return (
    <button
      id={id}
      type="button"
      className={cx('ui-btn', `v-${variant}`, `s-${size}`, shape === 'square' && 'is-square',
        block && 'is-block', loading && 'is-loading', active && 'is-active')}
      data-scheme={p['data-scheme']}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={label}
      title={title}
      style={style}
      onClick={onClick}
    >
      {loading
        ? <span className="ui-btn-slot"><Spinner size={16} label="" /></span>
        : leading ? <span className="ui-btn-slot">{leading}</span> : null}
      {children != null && children !== false ? <span className="ui-btn-label">{children}</span> : null}
      {trailing ? <span className="ui-btn-slot">{trailing}</span> : null}
    </button>
  );
}

/* ── Tag ─────────────────────────────────────────────────────────────────── */
export function Tag({ variant = 'tonal', size = 'small', leading, label, children }:
  { variant?: 'tonal' | 'primary'; size?: 'small' | 'medium'; leading?: ReactNode; label?: string; children?: ReactNode }) {
  return (
    <span className={cx('ui-tag', `v-${variant}`, `s-${size}`)} aria-label={label}>
      {leading ? <span className="ui-tag-leading">{leading}</span> : null}
      <span className="ui-tag-label">{children}</span>
    </span>
  );
}

/* ── Alert ───────────────────────────────────────────────────────────────── */
const ALERT_GLYPH: Record<string, string> = {
  error: 'M12 8v5m0 3h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  warning: 'M12 8v5m0 3h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  success: 'M20 6 9 17l-5-5',
  info: 'M12 8h.01M11 12h1v5h1M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0',
};
export function Alert({ tone = 'info', title, children }:
  { tone?: 'error' | 'warning' | 'success' | 'info'; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx('ui-alert', `tone-${tone}`)} role={tone === 'error' ? 'alert' : 'status'}>
      <svg className="ui-alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={ALERT_GLYPH[tone] || ALERT_GLYPH.info} />
      </svg>
      <div className="ui-alert-body">
        {title ? <div className="ui-alert-title">{title}</div> : null}
        {children ? <div className="ui-alert-text">{children}</div> : null}
      </div>
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */
export function Skeleton({ shape = 'block', size, width, height, label = 'Loading' }:
  { shape?: 'block' | 'circle'; size?: number; width?: number | string; height?: number | string; label?: string }) {
  const w = shape === 'circle' ? size : width;
  const h = shape === 'circle' ? size : height;
  return (
    <span className={cx('ui-skeleton', shape === 'circle' && 'is-circle')}
      style={{ width: w, height: h }}
      role={label ? 'status' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} />
  );
}

/* ── Checkbox / marks ────────────────────────────────────────────────────── */
function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span className={cx('ui-checkmark', checked && 'is-checked')} aria-hidden>
      <svg className="ui-checkmark-tick" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
    </span>
  );
}
function SwitchMark({ checked }: { checked: boolean }) {
  return <span className={cx('ui-switchmark', checked && 'is-checked')} aria-hidden><span className="ui-switchmark-thumb" /></span>;
}
export function Checkbox({ label, checked, onChange, disabled }:
  { label: ReactNode; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx('ui-check', disabled && 'is-disabled')}>
      <input type="checkbox" className="ui-visually-hidden" checked={checked} disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)} />
      <CheckMark checked={checked} />
      <span className="ui-check-label">{label}</span>
    </label>
  );
}

/* ── SelectableCard ──────────────────────────────────────────────────────── */
function RadioMark({ checked }: { checked: boolean }) {
  return <span className={cx('ui-radiomark', checked && 'is-checked')} aria-hidden><span className="ui-radiomark-dot" /></span>;
}
export function SelectableCard({ label, selected, onSelect, mark, group, disabled, size = 'medium', style, children }:
  { label: string; selected: boolean; onSelect: () => void; mark?: 'checkbox' | 'switch' | 'radio';
    /** Names a radio set; the caller wraps the cards in role="radiogroup". */
    group?: string; disabled?: boolean; size?: 'small' | 'medium' | string; level?: Level; style?: CSSProperties;
    children?: ReactNode }) {
  const kind = mark ?? (group ? 'radio' : 'checkbox');
  const key = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onSelect(); }
  };
  return (
    <div className={cx('ui-selcard', `s-${size}`, selected && 'is-selected', disabled && 'is-disabled')}
      role={kind === 'switch' ? 'switch' : kind === 'radio' ? 'radio' : 'checkbox'}
      aria-checked={selected} aria-disabled={disabled || undefined} aria-label={label}
      tabIndex={disabled ? -1 : 0} style={style}
      onClick={disabled ? undefined : onSelect} onKeyDown={key}>
      <div className="ui-selcard-content">{children}</div>
      <span className="ui-selcard-mark">
        {kind === 'switch' ? <SwitchMark checked={selected} />
          : kind === 'radio' ? <RadioMark checked={selected} /> : <CheckMark checked={selected} />}
      </span>
    </div>
  );
}

/* ── SegmentedControl ────────────────────────────────────────────────────── */
export function SegmentedControl({ label, size = 'small', value, options, onChange, block, disabled, style }:
  { label?: string; size?: 'small' | 'medium'; value: string; options: Array<{ value: string; label: ReactNode; leading?: ReactNode }>;
    onChange?: (v: string) => void; block?: boolean; disabled?: boolean; style?: CSSProperties }) {
  const move = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = options[(i + d + options.length) % options.length];
    onChange?.(n.value);
    const group = (e.currentTarget as HTMLElement).parentElement;
    requestAnimationFrame(() => (group?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
  };
  return (
    <span className={cx('ui-seg', `s-${size}`, block && 'is-block')} role="radiogroup" aria-label={label} style={style}>
      {options.map((o, i) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} disabled={disabled}
          tabIndex={o.value === value ? 0 : -1}
          className={cx('ui-seg-item', o.value === value && 'is-selected')}
          onClick={() => onChange?.(o.value)} onKeyDown={(e) => move(e, i)}>
          {o.leading ? <span className="ui-btn-slot">{o.leading}</span> : null}
          <span className="ui-seg-label">{o.label}</span>
        </button>
      ))}
    </span>
  );
}

/* ── Anchored popup (menus for DropDownSelect / Combobox) ────────────────── */
function useAnchor(open: boolean, anchor: React.RefObject<HTMLElement>) {
  const [box, setBox] = useState<{ left: number; width: number; top?: number; bottom?: number; max: number } | null>(null);
  const measure = useCallback(() => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 180 && above > below;
    setBox(up
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, max: Math.min(260, above) }
      : { left: r.left, width: r.width, top: r.bottom + 4, max: Math.min(260, below) });
  }, [anchor]);
  useLayoutEffect(() => { if (open) measure(); }, [open, measure]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, measure]);
  return box;
}
function Menu({ box, id, children, dataLevel }:
  { box: ReturnType<typeof useAnchor>; id: string; children: ReactNode; dataLevel?: string }) {
  if (!box) return null;
  return createPortal(
    <div className="ui-menu" id={id} role="listbox" data-level={dataLevel}
      style={{ left: box.left, width: box.width, top: box.top, bottom: box.bottom, maxHeight: box.max }}
      onMouseDown={(e) => e.preventDefault()}>
      {children}
    </div>,
    document.body,
  );
}
/** The data-level of the nearest ancestor, so a portalled menu paints like its host. */
function useHostLevel(ref: React.RefObject<HTMLElement>, open: boolean) {
  const [lvl, setLvl] = useState<string | undefined>();
  useLayoutEffect(() => {
    if (!open) return;
    const host = ref.current?.closest('[data-level]') as HTMLElement | null;
    setLvl(host?.getAttribute('data-level') || undefined);
  }, [open, ref]);
  return lvl;
}

/* ── Field shell (floating label + leading icon) ─────────────────────────── */
function FieldShell({ size = 'small', block, label, icon, htmlFor, className, wrapRef, style, children, onClick }:
  { size?: string; block?: boolean; label?: string; icon?: ReactNode; htmlFor?: string; className?: string;
    wrapRef?: React.Ref<HTMLSpanElement>; style?: CSSProperties; children: ReactNode; onClick?: () => void }) {
  return (
    <span ref={wrapRef} className={cx('ui-textfield-wrap', `s-${size}`, block && 'is-block', className)}
      style={style} onClick={onClick}>
      {icon ? <span className="ui-textfield-leadbox" aria-hidden>{icon}</span> : null}
      {label ? <label className="ui-textfield-float" htmlFor={htmlFor}>{label}</label> : null}
      {children}
    </span>
  );
}
const CHECK_ICON = (
  <svg className="ui-option-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
const CHEVRON_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
);
const CHEVRON = (
  <svg className="ui-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
);

/* ── DropDownSelect ──────────────────────────────────────────────────────── */
export type Option = { value: string; label: string; disabled?: boolean };
export function DropDownSelect({ label, icon, size = 'small', block, placeholder, value, options, onChange, style, disabled }:
  { label?: string; icon?: ReactNode; size?: string; block?: boolean; placeholder?: string; value: string;
    options: Option[]; onChange?: (v: string) => void; style?: CSSProperties; disabled?: boolean }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useAnchor(open, wrap);
  const lvl = useHostLevel(wrap, open);
  const cur = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrap.current?.contains(t) || document.getElementById(uid + 'm')?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, uid]);

  const pick = (o: Option) => { if (o.disabled) return; setOpen(false); btn.current?.focus(); onChange?.(o.value); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); return; }
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault();
      if (options[active]) pick(options[active]);
    } else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  };
  return (
    <FieldShell size={size} block={block} label={label} icon={icon} wrapRef={wrap} style={style}
      className={cx('is-select', disabled && 'is-disabled', open && 'is-open')}>
      <button ref={btn} type="button" className="ui-textfield ui-select-btn" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={uid + 'm'} aria-label={label}
        onClick={() => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen((o) => !o); }}
        onKeyDown={key}>
        <span className={cx('ui-select-value', !cur && 'is-placeholder')}>{cur ? cur.label : (placeholder || '')}</span>
      </button>
      {CHEVRON}
      {open && (
        <Menu box={box} id={uid + 'm'} dataLevel={lvl}>
          {options.map((o, i) => (
            <div key={o.value + i} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined}
              className={cx('ui-option', i === active && 'is-active', o.value === value && 'is-selected', o.disabled && 'is-disabled')}
              onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
              <span className="ui-option-label">{o.label}</span>
              {o.value === value ? CHECK_ICON : null}
            </div>
          ))}
        </Menu>
      )}
    </FieldShell>
  );
}

/* ── Combobox ────────────────────────────────────────────────────────────── */
export function Combobox<T = string>({ label, icon, size = 'small', block, placeholder, value, onChange, options,
  getKey, onPick, renderOption, emptyMessage, footer, action, selected, style }:
  { label?: string; icon?: ReactNode; size?: string; block?: boolean; placeholder?: string; value: string;
    onChange?: (v: string) => void; options: T[]; getKey: (o: T) => string; onPick?: (o: T) => void;
    renderOption?: (o: T, st: { active: boolean }) => ReactNode; emptyMessage?: ReactNode; footer?: ReactNode;
    /* A last row that is not a value but a way to make one — "Add new JSON". It keeps the list worth
       opening when the only entry is the one already chosen. */
    action?: { label: string; onClick: () => void };
    /* The key of the chosen row, when it is not what is typed in the box (a folder filter, say). */
    selected?: string;
    style?: CSSProperties }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useAnchor(open, wrap);
  const lvl = useHostLevel(wrap, open);

  const pick = (o: T) => { setOpen(false); onPick?.(o); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (!options.length) return;
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && options[active] !== undefined) { e.preventDefault(); pick(options[active]); }
    } else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  };
  return (
    <FieldShell size={size} block={block} label={label} icon={icon} htmlFor={uid} wrapRef={wrap} style={style}
      className={cx('is-combobox', open && 'is-open')}>
      <input ref={input} id={uid} className="ui-textfield" type="text" role="combobox" aria-expanded={open}
        aria-controls={uid + 'm'} aria-autocomplete="list" value={value} placeholder={placeholder}
        spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="none"
        onFocus={() => { setActive(-1); setOpen(true); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setActive(-1); setOpen(true); onChange?.(e.target.value); }}
        onKeyDown={key} onPointerDown={(e) => e.stopPropagation()} />
      {/* THE ARROW IS WHAT SAYS THIS FIELD HAS A LIST. A combobox looks like a text field until
          you focus it, so nothing told anybody the options were there. It keeps focus in the
          input (mousedown is cancelled, or the blur would close the menu the click is opening)
          and is out of the tab order — the keyboard already has ArrowDown. */}
      <button type="button" className="ui-combo-toggle" tabIndex={-1} aria-label="Show options"
        onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()}
        onClick={() => { if (open) setOpen(false); else { input.current?.focus(); setActive(-1); setOpen(true); } }}>
        {CHEVRON_ICON}
      </button>
      {/* A menu with nothing in it is not drawn: a box with no rows is a gap that opens under the
          field for no reason. */}
      {open && (options.length > 0 || !!emptyMessage || !!footer || !!action) && (
        <Menu box={box} id={uid + 'm'} dataLevel={lvl}>
          {options.length === 0 && emptyMessage ? <div className="ui-menu-note">{emptyMessage}</div> : null}
          {options.map((o, i) => (
            <div key={getKey(o)} role="option" aria-selected={i === active}
              className={cx('ui-option', i === active && 'is-active', getKey(o) === (selected ?? value) && 'is-selected')}
              onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
              <span className="ui-option-label">{renderOption ? renderOption(o, { active: i === active }) : getKey(o)}</span>
              {getKey(o) === (selected ?? value) ? CHECK_ICON : null}
            </div>
          ))}
          {action ? (
            <div role="option" aria-selected={false} className="ui-option is-action"
              onClick={() => { setOpen(false); action.onClick(); input.current?.focus(); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
              <span>{action.label}</span>
            </div>
          ) : null}
          {footer ? <div className="ui-menu-note is-footer">{footer}</div> : null}
        </Menu>
      )}
    </FieldShell>
  );
}

/* ── Text field adapters (uncontrolled-friendly, carry the caller's id) ──── */
export function TextField(props: any) {
  const { id, type = 'text', label, placeholder, size = 'small', readonly = false,
    defaultValue, value, icon, style, tabIndex, title, onInput, onBlur } = props;
  /* UNCONTROLLED BY DEFAULT — the template writes most fields through
     setFieldValue() on the element itself. `value` opts a field out of that:
     the file-name field's value lives in script and must be readable
     synchronously mid-push. */
  const controlled = value !== undefined;
  return (
    <FieldShell size={size} block label={label} icon={icon} htmlFor={id}
      className={readonly ? 'is-readonly' : undefined} style={{ width: '100%', ...style }}>
      <input
        className={cx('ui-textfield', `s-${size}`, readonly && 'is-readonly')}
        id={id}
        type={type}
        {...(controlled ? { value } : { defaultValue })}
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
    </FieldShell>
  );
}
export function TextArea(props: any) {
  const { id, label, placeholder, size = 'small', rows = 2, disabled = false, style } = props;
  return (
    <FieldShell size={size} block label={label} htmlFor={id}
      className={cx('is-multi', disabled && 'is-disabled')} style={{ width: '100%', ...style }}>
      <textarea className={cx('ui-textfield', `s-${size}`, 'is-multi', !label && 'is-bare')} id={id} rows={rows}
        placeholder={placeholder} disabled={disabled} spellCheck onPointerDown={(e) => e.stopPropagation()} />
    </FieldShell>
  );
}

/* ── Dialog ──────────────────────────────────────────────────────────────── */
export function Dialog({ open, onClose, title, description, size = 'medium', actions, children }:
  { open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode;
    size?: 'small' | 'medium' | 'large'; actions?: ReactNode; children?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={cx('ui-dialog', `s-${size}`)} data-level="4" aria-labelledby={title ? uid + 't' : undefined}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onMouseDown={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="ui-dialog-body">
        {(title || description) && (
          <div className="ui-dialog-head">
            {title ? <h2 className="ui-dialog-title" id={uid + 't'}>{title}</h2> : null}
            {description ? <p className="ui-dialog-desc">{description}</p> : null}
            <button type="button" className="ui-dialog-close" aria-label="Close" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        {children != null ? <div className="ui-dialog-content">{children}</div> : <div className="ui-dialog-content is-empty" />}
        {actions ? <div className="ui-dialog-actions">{actions}</div> : null}
      </div>
    </dialog>
  );
}

/* ── Toast ───────────────────────────────────────────────────────────────── */
export function Toast({ open, onClose, tone = 'success', title, duration = 2500, placement = 'bottom' }:
  { open: boolean; onClose: () => void; tone?: 'success' | 'error' | 'info'; title: ReactNode; duration?: number;
    placement?: 'top' | 'bottom' }) {
  useEffect(() => {
    if (!open || !duration) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [open, duration, onClose, title]);
  if (!open) return null;
  return createPortal(
    <div className={cx('ui-toast', `tone-${tone}`, `at-${placement}`)} role={tone === 'error' ? 'alert' : 'status'}>
      {title}
    </div>,
    document.body,
  );
}

/* ── Table ───────────────────────────────────────────────────────────────── */
export type Column<R> = { key: string; header: ReactNode; cell: (row: R) => ReactNode; width?: number | string; align?: 'start' | 'end' };
export function Table<R>({ caption, captionHidden, size = 'medium', rules, columns, rows, rowKey }:
  { caption?: string; captionHidden?: boolean; size?: 'small' | 'medium'; rules?: boolean; columns: Array<Column<R>>;
    rows: R[]; rowKey: (r: R) => string }) {
  return (
    <table className={cx('ui-table', `s-${size}`, rules && 'has-rules')}>
      {caption ? <caption className={captionHidden ? 'ui-visually-hidden' : undefined}>{caption}</caption> : null}
      <thead>
        <tr>{columns.map((c) => <th key={c.key} scope="col" style={{ width: c.width, textAlign: c.align === 'end' ? 'end' : undefined }}>{c.header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={rowKey(r)}>
            {columns.map((c) => <td key={c.key} style={{ textAlign: c.align === 'end' ? 'end' : undefined }}>{c.cell(r)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── FileUploadItem ──────────────────────────────────────────────────────── */
function formatBytes(n?: number) {
  if (n == null) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
export function FileUploadItem({ name, bytes, error, leading, onRemove, removeVariant = 'ghost' }:
  { name: string; bytes?: number; type?: string; size?: string; error?: string | null; leading?: ReactNode;
    onRemove?: () => void; removeVariant?: 'ghost' | 'tonal' }) {
  return (
    <div className={cx('ui-fileitem', error && 'has-error')}>
      <span className="ui-fileitem-lead" aria-hidden={!leading}>
        {leading || (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />
          </svg>
        )}
      </span>
      <span className="ui-fileitem-text">
        <span className="ui-fileitem-name">{name}</span>
        <span className="ui-fileitem-meta">{error ? error : formatBytes(bytes)}</span>
      </span>
      {onRemove ? (
        <button type="button" className={cx('ui-fileitem-remove', `v-${removeVariant}`)}
          aria-label={'Remove ' + name} onClick={onRemove}>
          <span className="ui-btn-slot">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" aria-hidden><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" /></svg>
          </span>
        </button>
      ) : null}
    </div>
  );
}
