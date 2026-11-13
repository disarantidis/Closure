#!/usr/bin/env node
/*
  resolved-selftest.js — the Resolved (house) layout against a small synthetic
  variable graph shaped like a real design system:

    core         primitives (one mode)
    foundation   the consumption layer: nothing aliases into it
    .scheme      neutral / inverted — routes into .mode
    .mode        light / dark       — holds the colour and elevation values
    .breakpoint  S Mobile / M Tablet — values aliasing core, plus tokens of its
                 own that nothing else aliases (stretch-grid)

  What it pins, and why each one was once wrong:
    1. tokens that vary with NO axis (radii, strokes, component sizes) were
       skipped by the house layout without a word;
    2. the semantic `foundation` layer — each token aliasing its default
       context, with { layer, path } to re-target it — was not emitted at all;
    3. the consumption layer's `colours` group and the breakpoint collection's
       own `breakpoint/` prefix showed up as extra path levels nobody reads;
    4. the document did not say which modes, schemes and defaults it holds.
*/
const assert = require('assert');
const E = require('../src/emit-resolved.js');
const D = require('../src/dtcg-format.js');

let n = 0;
const id = () => 'V' + (++n);
const col = (name, modes, vars) => ({
  id: 'C:' + name, name,
  modes: modes.map((m, i) => ({ modeId: name + ':' + i, name: m })),
  defaultModeId: name + ':0', variables: vars,
});
const mk = (name, type, byMode, extra) => Object.assign(
  { id: id(), name, type, valuesByMode: byMode, resolvedValuesByMode: {}, aliasInfo: {}, scopes: [], description: '' }, extra);
const al = (v) => ({ type: 'VARIABLE_ALIAS', id: v.id });
const white = { r: 1, g: 1, b: 1, a: 1 }, black = { r: 0, g: 0, b: 0, a: 1 };

// core
const d0 = mk('dimension/0', 'FLOAT', { 'core:0': 0 });
const d2 = mk('dimension/2', 'FLOAT', { 'core:0': 4 });
const d4 = mk('dimension/4', 'FLOAT', { 'core:0': 8 });
const cWhite = mk('core-colours/base/white', 'COLOR', { 'core:0': white });
const cBlack = mk('core-colours/base/black', 'COLOR', { 'core:0': black });
const sh4 = mk('shadows/4', 'FLOAT', { 'core:0': 4 });
const cFam = mk('fontFamilies/inter', 'STRING', { 'core:0': 'Inter' });
const cWt = mk('fontWeights/inter-0', 'STRING', { 'core:0': 'Bold' });
const cFs = mk('fontSize/0', 'FLOAT', { 'core:0': 12 });
const core = col('core', ['core'], [d0, d2, d4, cWhite, cBlack, sh4, cFam, cWt, cFs]);

// .mode — light / dark
const mBg = mk('mode/basic/bg', 'COLOR', {});
const miBg = mk('mode-inverted/basic/bg', 'COLOR', {});
const mEl = mk('mode/elevation/level-1/x', 'FLOAT', {});
const miEl = mk('mode-inverted/elevation/level-1/x', 'FLOAT', {});
const modes = col('.mode', ['light', 'dark'], [mBg, miBg, mEl, miEl]);
mBg.valuesByMode = { '.mode:0': al(cWhite), '.mode:1': al(cBlack) };
miBg.valuesByMode = { '.mode:0': al(cBlack), '.mode:1': al(cWhite) };
mEl.valuesByMode = { '.mode:0': al(sh4), '.mode:1': al(d2) };
miEl.valuesByMode = { '.mode:0': al(d2), '.mode:1': al(d0) };

// .scheme — neutral / inverted
const sBg = mk('scheme/basic/bg', 'COLOR', {});
const sEl = mk('scheme/elevation/level-1/x', 'FLOAT', {});
const scheme = col('.scheme', ['neutral', 'inverted', 'white'], [sBg, sEl]);
sBg.valuesByMode = { '.scheme:0': al(mBg), '.scheme:1': al(miBg), '.scheme:2': al(cWhite) };
sEl.valuesByMode = { '.scheme:0': al(mEl), '.scheme:1': al(miEl), '.scheme:2': al(d0) };

// .breakpoint — values alias core; stretch-grid is the collection's own leaf
const bpSp = mk('breakpoint/spacing/component/0', 'FLOAT', { '.breakpoint:0': al(d2), '.breakpoint:1': al(d4) });
const bpIn = mk('breakpoint/sizing/input-height', 'FLOAT', { '.breakpoint:0': al(d4), '.breakpoint:1': al(d4) });
const bpGrid = mk('breakpoint/stretch-grid/columns', 'FLOAT', { '.breakpoint:0': al(d2), '.breakpoint:1': al(d4) });
const bpTy = mk('breakpoint/Typography/Title-L/size', 'FLOAT', { '.breakpoint:0': al(d2), '.breakpoint:1': al(d4) });
const bpCol = mk('breakpoint/columns/2-columns', 'FLOAT', { '.breakpoint:0': 101, '.breakpoint:1': 150 });
const bp = col('.breakpoint', ['S Mobile', 'M Tablet'], [bpSp, bpIn, bpGrid, bpTy, bpCol]);

// foundation — the consumption layer
const f = [];
f.push(mk('colours/basic/bg', 'COLOR', { 'foundation:0': al(sBg) }, { description: 'Page background.' }));
f.push(mk('elevation/level-1/x', 'FLOAT', { 'foundation:0': al(sEl) }));
f.push(mk('spacing/component/0', 'FLOAT', { 'foundation:0': al(bpSp) }, { scopes: ['GAP'] }));
f.push(mk('sizing/input-height', 'FLOAT', { 'foundation:0': al(bpIn) }, { scopes: ['WIDTH_HEIGHT'] }));
f.push(mk('radius/zero', 'FLOAT', { 'foundation:0': al(d0) }, { scopes: ['CORNER_RADIUS'] }));
f.push(mk('radius/small', 'FLOAT', { 'foundation:0': al(d2) }, { scopes: ['CORNER_RADIUS'] }));
f.push(mk('radius/full', 'FLOAT', { 'foundation:0': 999 }, { scopes: ['CORNER_RADIUS'] }));
f.push(mk('strokes/1', 'FLOAT', { 'foundation:0': 1 }, { scopes: ['STROKE_FLOAT'] }));
f.push(mk('sizing/component/0', 'FLOAT', { 'foundation:0': al(d0) }, { scopes: ['WIDTH_HEIGHT'] }));
f.push(mk('typography/Title-L/size', 'FLOAT', { 'foundation:0': al(bpTy) }));
f.push(mk('elevation/FAB/x', 'FLOAT', { 'foundation:0': 3 }, { scopes: ['EFFECT_FLOAT'] }));
const foundation = col('foundation', ['foundation'], f);

const collections = [core, foundation, scheme, modes, bp];
const res = E.document(collections, { hooks: { toDtcgFormat: D.toDtcgFormat } });
const doc = res.document;

const flat = (o, p = [], out = []) => {
  for (const k of Object.keys(o)) {
    if (k[0] === '$') continue;
    const v = o[k];
    if (v && typeof v === 'object' && !('$value' in v)) flat(v, p.concat(k), out);
    else out.push(p.concat(k).join('.'));
  }
  return out;
};
const paths = flat(doc);
const NS = 'com.desquared.radd';
const ext = (path) => path.split('.').reduce((o, k) => o && o[k], doc).$extensions[NS];
const val = (path) => path.split('.').reduce((o, k) => o && o[k], doc).$value;

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('ok    ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

// ── the layout ────────────────────────────────────────────────────────────
ok('the layout is the house layout, with the foundation layer beside it', () => {
  assert.strictEqual(res.shape, 'house');
  assert.deepStrictEqual(Object.keys(doc).filter((k) => k[0] !== '$'), ['core', 'foundation', 'breakpoint', 'mode']);
});
ok('what varies with an axis is still under that axis', () => {
  assert.ok(paths.includes('breakpoint.mobile.spacing.component.0'));
  assert.ok(paths.includes('breakpoint.tablet.sizing.input-height'));
  assert.ok(paths.includes('mode.light.neutral.basic.bg'));
  assert.ok(paths.includes('mode.dark.inverted.elevation.level-1.x'));
});

// ── 1. tokens that vary with nothing ──────────────────────────────────────
ok('tokens that vary with nothing are not dropped', () => {
  ['foundation.radius.zero', 'foundation.radius.small', 'foundation.radius.full',
   'foundation.strokes.1', 'foundation.sizing.component.0']
    .forEach((p) => assert.ok(paths.includes(p), 'missing ' + p));
});
ok('an alias of a primitive stays a reference to it; a raw value stays raw', () => {
  assert.strictEqual(val('foundation.radius.zero'), '{core.dimension.0}');
  assert.strictEqual(val('foundation.radius.full').value, 999);
});
ok('they carry no re-target extension — there is nothing to re-aim', () => {
  const t = doc.foundation.radius.zero;
  assert.ok(!t.$extensions || !t.$extensions[NS]);
});
ok('and they do not leak into the breakpoint or mode branches', () => {
  assert.ok(!paths.some((p) => /^(breakpoint|mode)\..*(radius|strokes)/.test(p)));
});

// ── 2. the semantic layer ─────────────────────────────────────────────────
ok('a scheme token aliases its default context and says how to re-target it', () => {
  assert.strictEqual(val('foundation.colours.basic.bg'), '{mode.light.neutral.basic.bg}');
  assert.deepStrictEqual(ext('foundation.colours.basic.bg'), { layer: 'scheme', path: 'basic.bg' });
});
ok('a breakpoint token aliases the first breakpoint', () => {
  assert.strictEqual(val('foundation.spacing.component.0'), '{breakpoint.mobile.spacing.component.0}');
  assert.deepStrictEqual(ext('foundation.spacing.component.0'), { layer: 'breakpoint', path: 'spacing.component.0' });
  assert.deepStrictEqual(ext('foundation.sizing.input-height'), { layer: 'breakpoint', path: 'sizing.input-height' });
});
ok('every alias the layer writes lands on a token that exists', () => {
  const missing = [];
  (function walk(o, p) {
    for (const k of Object.keys(o)) {
      if (k[0] === '$') continue;
      const v = o[k];
      if (v && typeof v === 'object' && !('$value' in v)) walk(v, p.concat(k));
      else if (typeof v.$value === 'string' && /^\{.+\}$/.test(v.$value)) {
        const target = v.$value.slice(1, -1).split('.').reduce((a, s) => a && a[s], doc);
        if (!target || !('$value' in target)) missing.push(p.concat(k).join('.') + ' -> ' + v.$value);
      }
    }
  })(doc, []);
  assert.deepStrictEqual(missing, []);
});
ok('the descriptions of the tokens it points at come with it', () => {
  assert.strictEqual(doc.foundation.colours.basic.bg.$description, 'Page background.');
});

// ── 3. names nobody reads ────────────────────────────────────────────────
ok('the consumption layer\'s `colours` group is not a level inside mode', () => {
  assert.ok(!paths.some((p) => /^mode\.[^.]+\.[^.]+\.colours\./.test(p)));
});
ok('the breakpoint collection\'s own prefix is not a level inside breakpoint', () => {
  assert.ok(paths.includes('breakpoint.mobile.stretch-grid.columns'));
  assert.ok(!paths.some((p) => /^breakpoint\.[^.]+\.breakpoint\./.test(p)));
});

// ── 4. the document says what it is ──────────────────────────────────────
ok('the root names its modes, schemes and defaults', () => {
  const m = doc.$extensions[NS];
  assert.deepStrictEqual(m.modes, ['light', 'dark']);
  assert.deepStrictEqual(m.schemes, ['neutral', 'inverted', 'white']);
  assert.deepStrictEqual(m.foundationDefaults, { mode: 'light', scheme: 'neutral', breakpoint: 'mobile' });
  assert.ok(typeof m.foundationContext === 'string' && m.foundationContext.length > 20);
  assert.ok(typeof doc.$description === 'string' && doc.$description.length > 20);
});
ok('a scheme that reads the same in every mode is named as such', () => {
  // neutral and inverted differ between light and dark; white never asks
  assert.deepStrictEqual(doc.$extensions[NS].modeIndependentSchemes, ['white']);
});

// ── a scheme that never asks light/dark still has both ───────────────────
ok('a scheme that skips the light/dark switch is written under BOTH modes, whole', () => {
  ['light', 'dark'].forEach((m) => {
    assert.ok(paths.includes('mode.' + m + '.white.basic.bg'), 'missing mode.' + m + '.white.basic.bg');
    assert.ok(paths.includes('mode.' + m + '.white.elevation.level-1.x'), 'missing elevation in ' + m);
  });
});

// ── 5. every name is lowercase ───────────────────────────────────────────
ok('no key anywhere has a capital letter', () => {
  const bad = [];
  (function walk(o, p) {
    for (const k of Object.keys(o)) {
      if (k[0] === '$') continue;
      if (/[A-Z]/.test(k)) bad.push(p.concat(k).join('.'));
      const v = o[k];
      if (v && typeof v === 'object' && !('$value' in v)) walk(v, p.concat(k));
    }
  })(doc, []);
  assert.deepStrictEqual(bad, []);
});
ok('a mixed-case name is lowercased in place, alias and re-target path included', () => {
  assert.ok(paths.includes('foundation.typography.title-l.size'));
  assert.ok(paths.includes('foundation.elevation.fab.x'));
  assert.strictEqual(val('foundation.typography.title-l.size'), '{breakpoint.mobile.typography.title-l.size}');
  assert.deepStrictEqual(ext('foundation.typography.title-l.size'), { layer: 'breakpoint', path: 'typography.title-l.size' });
});
ok('lowercase can be switched off', () => {
  const raw = E.document(collections, { lowercase: false, hooks: { toDtcgFormat: D.toDtcgFormat } }).document;
  assert.ok(raw.foundation.typography['Title-L']);
});

// ── 6. numbers that are not lengths ──────────────────────────────────────
ok('an elevation part is a number that keeps its reference', () => {
  const t = doc.mode.light.neutral.elevation['level-1'].x;
  assert.strictEqual(t.$type, 'number');
  assert.strictEqual(t.$value, '{core.shadows.4}');
  assert.strictEqual(doc.foundation.elevation['level-1'].x.$type, 'number');
});
ok('the shadow scale is plain numbers, so the composite can inline them', () => {
  assert.deepStrictEqual([doc.core.shadows['4'].$type, doc.core.shadows['4'].$value], ['number', 4]);
});
ok('a column width is a bare number', () => {
  const t = doc.breakpoint.mobile.columns['2-columns'];
  assert.deepStrictEqual([t.$type, t.$value], ['number', 101]);
});

// ── 7. the core scales' own types ────────────────────────────────────────
ok('a family is a fontFamily, a weight a lowercase fontWeight', () => {
  assert.strictEqual(doc.core.fontfamilies.inter.$type, 'fontFamily');
  assert.deepStrictEqual([doc.core.fontweights['inter-0'].$type, doc.core.fontweights['inter-0'].$value], ['fontWeight', 'bold']);
});
ok('a font size is a dimension with a unit', () => {
  const t = doc.core.fontsize['0'];
  assert.strictEqual(t.$type, 'dimension');
  assert.deepStrictEqual(t.$value, { value: 12, unit: 'px' });
});

// ── 8. no legacy-type stamp ─────────────────────────────────────────────
ok('tokens carry no com.closure.legacyJson extension', () => {
  let n = 0;
  (function walk(o) {
    for (const k of Object.keys(o)) {
      if (k === '$extensions' && o[k]['com.closure.legacyJson']) n++;
      if (k[0] !== '$' && o[k] && typeof o[k] === 'object') walk(o[k]);
    }
  })(doc);
  assert.strictEqual(n, 0);
  // and a token with nothing else to say has no $extensions at all
  assert.ok(!('$extensions' in doc.core.dimension['0']));
});
ok('the re-target extension survives the strip', () => {
  assert.deepStrictEqual(ext('foundation.colours.basic.bg'), { layer: 'scheme', path: 'basic.bg' });
});

console.log('\n' + passed + ' passed');
