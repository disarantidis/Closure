/* One edit in an alias chain is one cause, however many rows it changes. */
const JD = require('../src/json-diff.js');
const tok = (v) => ({ $type: 'color', $value: v });
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };

function doc(txt, upstream) {
  const d = { core: { c: { brand: tok('#111'), b900: tok('#222') } }, mode: {} };
  [['light', 'neutral'], ['light', 'white'], ['dark', 'inverted'], ['dark', 'white']].forEach(([m, s]) => {
    d.mode[m] = d.mode[m] || {};
    d.mode[m][s] = { basic: { 'text-dominant': tok(txt) } };
  });
  if (upstream) d.mode.light.neutral.basic.derived = tok('{mode.light.neutral.basic.text-dominant}');
  return d;
}

// 1. the same edit in four modes is one cause, listed with where
let r = JD.compare(doc('{core.c.b900}'), doc('{core.c.brand}'));
ok(r.changed.length === 4, 'four changed rows');
ok(r.causes.length === 1, 'one cause');
ok(r.causes[0].name === 'basic.text-dominant', 'named without mode/scheme');
ok(r.causes[0].where.length === 4, 'four places');

// 2. a row that points at a changed token is a consequence, not a cause
const a = doc('{core.c.b900}', true), b = doc('{core.c.brand}', true);
a.mode.light.neutral.basic.derived = tok('{mode.light.neutral.basic.text-dominant}');
b.mode.light.neutral.basic.derived = tok('#abcdef');
r = JD.compare(a, b);
ok(r.causes.length === 1, 'derived row is folded under its root: ' + r.causes.length);
ok(r.causes[0].downstream === 1, 'counted as downstream');

// 3. identical → no causes
r = JD.compare(doc('{core.c.brand}'), doc('{core.c.brand}'));
ok(r.causes.length === 0 && r.identical, 'identical has none');

console.log(fails ? fails + ' failed' : '3 passed');
process.exit(fails ? 1 : 0);
