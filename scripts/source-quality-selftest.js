#!/usr/bin/env node
/*
  source-quality-selftest.js — a resolved document read on its own: a scheme
  written as plain values, a broken reference, a token missing from some cells.
*/
const assert = require('assert');
const Q = require('../src/source-quality.js');

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('ok    ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}
const col = (hex) => ({ $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 1, hex } });
const ref = (p) => ({ $type: 'color', $value: '{' + p + '}' });

function doc(over) {
  const schemes = ['neutral', 'inverted', 'white', 'black', 'brand', 'amber'];
  const mode = { light: {}, dark: {} };
  ['light', 'dark'].forEach((m) => schemes.forEach((s) => {
    mode[m][s] = { basic: { background: ref('core.c.white'), text: ref('core.c.black') } };
  }));
  const d = { core: { c: { white: col('#ffffff'), black: col('#000000') } }, mode,
              breakpoint: { mobile: { grid: { gutters: { $type: 'number', $value: 8 }, margins: { $type: 'number', $value: 16 } } },
                            tablet: { grid: { gutters: { $type: 'number', $value: 8 }, margins: { $type: 'number', $value: 24 } } } } };
  if (over) over(d);
  return d;
}

ok('a document whose schemes all use references is clean', () => {
  const q = Q.check(doc());
  assert.strictEqual(q.clean, true);
  assert.deepStrictEqual(q.flattened, []);
});
ok('a scheme written as values where the others use references is flagged, with its counts', () => {
  const q = Q.check(doc((d) => { d.mode.light.brand.basic.background = col('#123456'); d.mode.dark.brand.basic.text = col('#654321'); }));
  assert.strictEqual(q.clean, false);
  assert.strictEqual(q.flattened.length, 1);
  assert.strictEqual(q.flattened[0].scheme, 'brand');
  assert.strictEqual(q.flattened[0].literal, 2);
  assert.strictEqual(q.flattened[0].cells, 4);
  assert.ok(q.flattened[0].examples.length >= 1);
});
ok('values in EVERY scheme are not flagged: that is a different file, not a flattened scheme', () => {
  const q = Q.check(doc((d) => {
    ['light', 'dark'].forEach((m) => Object.keys(d.mode[m]).forEach((s) => { d.mode[m][s].basic.background = col('#111111'); }));
  }));
  assert.deepStrictEqual(q.flattened, []);
});
ok('a reference to a token the document does not have is listed', () => {
  const q = Q.check(doc((d) => { d.mode.light.neutral.basic.text = ref('core.c.nope'); }));
  assert.strictEqual(q.broken.length, 1);
  assert.strictEqual(q.broken[0].token, 'mode.light.neutral.basic.text');
  assert.strictEqual(q.broken[0].target, '{core.c.nope}');
});
ok('a token missing from one scheme is a mode hole', () => {
  const q = Q.check(doc((d) => { delete d.mode.dark.amber.basic.text; }));
  assert.strictEqual(q.modeHoles.length, 1);
  assert.deepStrictEqual(q.modeHoles[0].missingIn, ['dark.amber']);
});
ok('a token missing from one breakpoint is a breakpoint hole', () => {
  const q = Q.check(doc((d) => { delete d.breakpoint.tablet.grid.gutters; }));
  assert.strictEqual(q.breakpointHoles.length, 1);
  assert.deepStrictEqual(q.breakpointHoles[0].missingIn, ['tablet']);
});
ok('composites are not followed as references', () => {
  const q = Q.check(doc((d) => { d.foundation = { e: { $type: 'shadow', $value: { color: '{core.c.missing}' } } }; }));
  assert.strictEqual(q.broken.length, 0);
});

console.log('\n' + passed + ' passed');
