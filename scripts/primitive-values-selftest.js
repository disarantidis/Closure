#!/usr/bin/env node
/*
  primitive-values-selftest.js — what the primitive layer writes out.

  Two bugs lived in the six lines that emit it, both found on a real file
  (Pomegranate Identity, 2,601 variables) and neither visible to the suite
  before this, because every fixture here used to put a collection's default
  mode first and let its primitives hold literals only.

    1. A primitive that ALIASES another primitive was written as Figma's own
       value object — { type: 'VARIABLE_ALIAS', id: 'VariableID:35:111' }.
       That id means nothing outside the file it came from, so 817 tokens of
       a real export (2,645 ids in all, counting composites) could not be
       resolved by anything downstream.

    2. The mode was taken as modes[0] rather than the collection's own
       defaultModeId. Figma's plugin API cannot reorder modes, so the two
       part company on any file whose default was set after the fact.

  A composite cell — a colour bound through one variable with its opacity
  bound through a second — is the same bug wearing a hat: each part is its
  own alias and each part has to be named.
*/
const assert = require('assert');
const E = require('../src/emit-resolved.js');
const D = require('../src/dtcg-format.js');

let n = 0;
const id = () => 'V' + (++n);
const mk = (name, type, byMode, extra) => Object.assign(
  { id: id(), name, type, valuesByMode: byMode, resolvedValuesByMode: {}, aliasInfo: {}, scopes: [], description: '' }, extra);
const al = (v) => ({ type: 'VARIABLE_ALIAS', id: v.id });
const magenta = { r: 0.8, g: 0, b: 0.4, a: 1 };

/* ── core: one mode, and it aliases nowhere outside itself, so it is the
      primitive layer. Two of its tokens point at a third INSIDE it, which is
      exactly the shape that leaked. ───────────────────────────────────────── */
const cMagenta = mk('core-colours/magenta/500', 'COLOR', { 'core:0': magenta });
const cBrand   = mk('core-colours/brand/main', 'COLOR', { 'core:0': al(cMagenta) });
const pct40    = mk('core-percentage/40', 'FLOAT', { 'core:0': 0.4 });
const w300     = mk('core-typography/weight/300', 'FLOAT', { 'core:0': 300 });
const w400     = mk('core-typography/weight/400', 'FLOAT', { 'core:0': 400 });
/* A colour bound through one variable, its opacity through another. */
const overlay  = mk('core-effects/overlay', 'COLOR', {
  'core:0': { color: al(cMagenta), opacity: al(pct40) },
});
const core = {
  id: 'C:core', name: 'core',
  modes: [{ modeId: 'core:0', name: 'core' }],
  defaultModeId: 'core:0',
  variables: [cMagenta, cBrand, pct40, w300, w400, overlay],
};

/* ── a primitive collection whose default mode is NOT its first ──────────────
      `regular` sits first because it was made first; `light` is the default.  */
const weight = {
  id: 'C:weight', name: 'weight',
  modes: [{ modeId: 'weight:0', name: 'regular' }, { modeId: 'weight:1', name: 'light' }],
  defaultModeId: 'weight:1',
  variables: [mk('weight/value', 'FLOAT', { 'weight:0': 400, 'weight:1': 300 })],
};

/* ── the consumption layer: nothing aliases into it ─────────────────────── */
const foundation = {
  id: 'C:foundation', name: 'foundation',
  modes: [{ modeId: 'foundation:0', name: 'foundation' }],
  defaultModeId: 'foundation:0',
  variables: [
    mk('colours/brand', 'COLOR', { 'foundation:0': al(cBrand) }),
    mk('colours/scrim', 'COLOR', { 'foundation:0': { color: al(cMagenta), opacity: al(pct40) } }),
    mk('typography/body/weight', 'FLOAT', { 'foundation:0': al(w300) }),
  ],
};

const res = E.document([core, weight, foundation], { hooks: { toDtcgFormat: D.toDtcgFormat } });
const doc = res.document;
const raw = JSON.stringify(doc);
const at = (path) => path.split('.').reduce((o, k) => (o === undefined ? o : o[k]), doc);
const val = (path) => { const t = at(path); return t && t.$value; };

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('ok    ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

ok('no Figma id reaches the document, anywhere', () => {
  const hits = (raw.match(/VariableID:/g) || []).length;
  assert.strictEqual(hits, 0, hits + ' internal id(s) written out');
});

ok('a primitive aliasing a primitive is written as that primitive\'s name', () => {
  assert.strictEqual(val('core.core-colours.brand.main'), '{core.core-colours.magenta.500}');
});

ok('the reference is to the immediate target, so the link survives a change', () => {
  // brand/main -> magenta/500 is one hop and stays one hop; flattening it to
  // the terminal literal is what loses "change magenta and brand follows".
  assert.ok(String(val('core.core-colours.brand.main')).includes('magenta.500'));
});

ok('a primitive holding a real value is still written as that value', () => {
  assert.strictEqual(val('core.core-typography.weight.300'), 300);
  assert.strictEqual(val('core.core-percentage.40'), 0.4);
});

ok('both halves of a colour+opacity cell are named, not id-ed', () => {
  const v = val('core.core-effects.overlay');
  assert.strictEqual(typeof v, 'object', 'expected the composite to survive as an object');
  assert.strictEqual(v.color, '{core.core-colours.magenta.500}');
  assert.strictEqual(v.opacity, '{core.core-percentage.40}');
});

ok('a composite in the consumption layer is named too', () => {
  // A layer that varies with no axis lands under `static`, not its own name.
  const v = val('static.colours.scrim');
  assert.strictEqual(v.color, '{core.core-colours.magenta.500}');
  assert.strictEqual(v.opacity, '{core.core-percentage.40}');
});

ok('an alias through two layers still names a primitive, not an id', () => {
  // foundation -> core-colours/brand/main -> magenta/500. refOrValue() walks to
  // the terminal here, which is the layer's job; what matters is that no id leaks.
  assert.strictEqual(val('static.colours.brand'), '{core.core-colours.magenta.500}');
  assert.strictEqual(val('static.typography.body.weight'), '{core.core-typography.weight.300}');
});

ok('a collection with two modes is an axis, and BOTH modes are written', () => {
  /*
    This is what a primitive collection is not: more than one mode makes it an
    axis, so it never reaches the primitives loop and no mode is chosen for it.
    Worth pinning, because "one mode per collection" was the headline complaint
    against this exporter and for the resolved shape it is not true.
  */
  assert.strictEqual(val('weight.regular.value'), 400);
  assert.strictEqual(val('weight.light.value'), 300);
});

console.log('\n' + passed + '/8 passed');
