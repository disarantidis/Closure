#!/usr/bin/env node
/*
  parity-selftest.js — Compare between two RESOLVED documents.

  The resolved export has the layout the Studio's token file has, so the two
  are the same kind of document and a leaf-by-leaf comparison means something.
  This pins what that needed in json-diff.js:
    1. resolved against resolved is comparable (it used to be refused outright);
    2. resolved against any other shape is still refused, and says why;
    3. Figma's float32 (22.870001 for 22.87) is not a difference — numbers are
       compared to three decimals while both sides are resolved — but a real
       difference, one thousandth or more, still is;
    4. the numeric tolerance does not leak into the next comparison;
    5. on the two real files, when they are present, the known figures hold.
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JD = require('../src/json-diff.js');

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('ok    ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

const ROOT_EXT = { 'com.desquared.radd': { foundationDefaults: { mode: 'light', scheme: 'neutral', breakpoint: 'mobile' } } };
const tok = (type, value) => ({ $type: type, $value: value });
const doc = (core, extra) => Object.assign({
  $extensions: ROOT_EXT,
  core, foundation: { a: tok('number', '{core.size.1}') },
}, extra);

const base = () => doc({ size: { '1': tok('number', 22.87), '2': tok('number', 4) } });

ok('resolved against resolved is comparable', () => {
  const r = JD.compare(base(), base());
  assert.strictEqual(r.comparable, true);
  assert.strictEqual(r.identical, true);
  assert.strictEqual(r.figmaFormat, 'resolved');
});

ok('resolved against another shape is refused, and the fix says to match', () => {
  const dtcg = { core: { size: { '1': tok('number', 22.87) } } };
  const r = JD.compare(base(), dtcg);
  assert.strictEqual(r.comparable, false);
  assert.strictEqual(r.problem.kind, 'resolved');
  assert.ok(/same shape/.test(r.problem.fix));
  const r2 = JD.compare(dtcg, base());
  assert.strictEqual(r2.problem.kind, 'resolved');
});

ok('float32 noise is not a difference', () => {
  const figma = doc({ size: { '1': tok('number', 22.870001), '2': tok('number', 4) } });
  const r = JD.compare(figma, base());
  assert.strictEqual(r.identical, true, JSON.stringify(r.changed));
});

ok('a real difference is still one', () => {
  const figma = doc({ size: { '1': tok('number', 22.88), '2': tok('number', 4) } });
  const r = JD.compare(figma, base());
  assert.strictEqual(r.identical, false);
  assert.strictEqual(r.changed.length, 1);
});

ok('the tolerance is gone again after a comparison', () => {
  JD.compare(base(), base());
  assert.notStrictEqual(JD.renderValue(22.870001), JD.renderValue(22.87));
});

ok('tokens on one side only are named per side', () => {
  const figma = doc({ size: { '1': tok('number', 22.87), '2': tok('number', 4) }, extra: { x: tok('number', 9) } });
  const repo = doc({ size: { '1': tok('number', 22.87), '2': tok('number', 4) }, other: { y: tok('color', '#fff') } });
  const r = JD.compare(figma, repo);
  assert.strictEqual(r.onlyInFigma.length, 1);
  assert.strictEqual(r.onlyInRepo.length, 1);
});

/* The two real files, when they are on this machine. */
const H = path.join(os.homedir(), 'Downloads');
const A = path.join(H, 'tokens_resolved.json');
const B = path.join(H, 'Explorer-20261106-1131.tokens (1).json');
if (fs.existsSync(A) && fs.existsSync(B)) {
  ok('real files: 8,665 against 9,030 tokens, 412 only in the Studio file', () => {
    const r = JD.compare(JSON.parse(fs.readFileSync(A, 'utf8')), JSON.parse(fs.readFileSync(B, 'utf8')));
    assert.strictEqual(r.comparable, true);
    assert.strictEqual(r.figmaTokens, 8665);
    assert.strictEqual(r.repoTokens, 9030);
    const sum = (k) => r.groups.reduce((n, g) => n + g[k], 0);
    assert.strictEqual(sum('onlyInRepo'), 412);
    assert.strictEqual(sum('onlyInFigma'), 47);
  });
} else {
  console.log('skip  real files not found in ~/Downloads');
}

console.log('\n' + passed + ' passed');
