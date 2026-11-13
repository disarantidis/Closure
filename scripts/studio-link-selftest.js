#!/usr/bin/env node
/*
  studio-link-selftest.js — the plugin's side of the Studio link (src/studio-link.js).

  Pins: the pairing code is read however it is typed; the hello carries what the Studio's protocol names; a
  difference is classified against the last sync (who moved away from the baseline), with the honest fallback
  when there is no baseline; float32 noise is not a difference; the reply has the fields the Studio reads.
*/
const assert = require('assert');
const L = require('../src/studio-link.js');

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('ok    ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}
const EXT = { 'com.desquared.radd': { foundationDefaults: { mode: 'light', scheme: 'neutral', breakpoint: 'mobile' } } };
const t = (type, v) => ({ $type: type, $value: v });
const docOf = (core) => ({ $extensions: EXT, core });
const flat = (core) => require('../src/json-diff.js').flattenRounded(docOf(core));

ok('a code is read however it is typed', () => {
  assert.strictEqual(L.normaliseCode('326 906'), '326906');
  assert.strictEqual(L.normaliseCode(' 326-906 '), '326906');
  assert.strictEqual(L.isCode('326 906'), true);
  assert.strictEqual(L.isCode('12345'), false);
  assert.strictEqual(L.isCode(''), false);
});

ok('the hello has what the Studio reads', () => {
  const h = L.helloMessage('326 906', 'Brand', '1.4.0');
  assert.strictEqual(h.type, 'hello');
  assert.strictEqual(h.code, '326906');
  assert.strictEqual(h.fileName, 'Brand');
  assert.strictEqual(h.pluginVersion, '1.4.0');
  assert.ok(Array.isArray(h.commands) && h.commands.indexOf('parity') !== -1 && h.commands.indexOf('status') !== -1);
  assert.strictEqual(L.DEFAULT_ADDRESS, 'ws://localhost:47865/figma');
});

ok('a status reply echoes the id and says null for no sync', () => {
  const s = L.statusReply('7', 'Brand', 4, null);
  assert.deepStrictEqual(s, { type: 'status', id: '7', fileName: 'Brand', collections: 4, lastSync: null });
});

const A = { a: t('number', 1), b: t('number', 2), c: t('number', 3) };

ok('same on both sides is counted, not listed', () => {
  const r = L.classify(flat(A), flat(A), null);
  assert.strictEqual(r.same, 3);
  assert.strictEqual(r.tokens.length, 0);
});

ok('float32 noise is not a difference', () => {
  const r = L.classify(flat({ a: t('number', 22.87) }), flat({ a: t('number', 22.870001) }), null);
  assert.strictEqual(r.same, 1);
  assert.strictEqual(r.tokens.length, 0);
});

ok('only the Studio moved: studio-ahead', () => {
  const base = L.baselineOf(flat(A));
  const studio = flat({ a: t('number', 9), b: t('number', 2), c: t('number', 3) });
  const r = L.classify(studio, flat(A), base);
  assert.deepStrictEqual(r.tokens.map((x) => [x.name, x.class, x.studio, x.figma]), [['core.a', 'studio-ahead', '9', '1']]);
});

ok('only Figma moved: figma-changed', () => {
  const base = L.baselineOf(flat(A));
  const figma = flat({ a: t('number', 1), b: t('number', 5), c: t('number', 3) });
  const r = L.classify(flat(A), figma, base);
  assert.deepStrictEqual(r.tokens.map((x) => [x.name, x.class]), [['core.b', 'figma-changed']]);
});

ok('both moved to different values: conflict; to the same value: same', () => {
  const base = L.baselineOf(flat(A));
  const studio = flat({ a: t('number', 9), b: t('number', 7), c: t('number', 3) });
  const figma = flat({ a: t('number', 8), b: t('number', 7), c: t('number', 3) });
  const r = L.classify(studio, figma, base);
  assert.deepStrictEqual(r.tokens.map((x) => [x.name, x.class]), [['core.a', 'conflict']]);
  assert.strictEqual(r.same, 2);
});

ok('a token added on one side, with a baseline', () => {
  const base = L.baselineOf(flat(A));
  const studio = flat({ a: t('number', 1), b: t('number', 2), c: t('number', 3), d: t('number', 4) });
  const figma = flat({ a: t('number', 1), b: t('number', 2), c: t('number', 3), e: t('number', 5) });
  const r = L.classify(studio, figma, base);
  const by = {}; r.tokens.forEach((x) => { by[x.name] = x.class; });
  assert.strictEqual(by['core.d'], 'studio-ahead');
  assert.strictEqual(by['core.e'], 'figma-changed');
});

ok('a token removed on the Studio since the sync: studio-ahead with a null', () => {
  const base = L.baselineOf(flat(A));
  const studio = flat({ a: t('number', 1), b: t('number', 2) });
  const r = L.classify(studio, flat(A), base);
  assert.deepStrictEqual(r.tokens.map((x) => [x.name, x.class, x.studio, x.figma]), [['core.c', 'studio-ahead', null, '3']]);
});

ok('no baseline: one-sided tokens are that side\'s, a difference is a conflict', () => {
  const studio = flat({ a: t('number', 1), only: t('number', 4), x: t('number', 5) });
  const figma = flat({ a: t('number', 1), x: t('number', 6), mine: t('number', 7) });
  const r = L.classify(studio, figma, null);
  const by = {}; r.tokens.forEach((x) => { by[x.name] = x.class; });
  assert.strictEqual(by['core.only'], 'studio-ahead');
  assert.strictEqual(by['core.mine'], 'figma-changed');
  assert.strictEqual(by['core.x'], 'conflict');
});

ok('a parity reply has the fields the Studio reads, and no more tokens than differ', () => {
  const r = L.parityReply('9', docOf(A), docOf({ a: t('number', 1), b: t('number', 2), c: t('number', 4) }), null);
  assert.strictEqual(r.type, 'parity');
  assert.strictEqual(r.id, '9');
  assert.strictEqual(r.same, 2);
  assert.strictEqual(r.tokens.length, 1);
  assert.deepStrictEqual(Object.keys(r.tokens[0]).sort(), ['class', 'figma', 'name', 'studio']);
});

ok('a colour is compared in any case', () => {
  const r = L.parityReply('1', docOf({ c: t('color', '#FFAA00') }), docOf({ c: t('color', '#ffaa00') }), null);
  assert.strictEqual(r.same, 1);
});

ok('the new baseline holds what both agree on, plus what was just moved, and keeps the rest as it was', () => {
  const base = L.baselineOf(flat(A));
  const studio = flat({ a: t('number', 9), b: t('number', 7), c: t('number', 3) });
  const figma = flat({ a: t('number', 1), b: t('number', 8), c: t('number', 3) });
  const after = L.baselineAfterApply(base, studio, figma, ['core.a']);
  assert.strictEqual(after['core.a'], '9');   // moved from the Studio
  assert.strictEqual(after['core.b'], '2');   // both moved apart: still what it was, so still a conflict
  assert.strictEqual(after['core.c'], '3');
  const again = L.classify(studio, flat({ a: t('number', 9), b: t('number', 8), c: t('number', 3) }), after);
  assert.deepStrictEqual(again.tokens.map((x) => [x.name, x.class]), [['core.b', 'conflict']]);
});
ok('namesOf picks the tokens of the asked classes', () => {
  const r = L.classify(flat({ a: t('number', 9), b: t('number', 2) }), flat({ a: t('number', 1), b: t('number', 2), z: t('number', 4) }), L.baselineOf(flat(A)));
  assert.deepStrictEqual(L.namesOf(r, ['studio-ahead']), ['core.a']);
});

console.log(passed + ' passed');
