/* node scripts/emit-subtle-selftest.js — the -subtle palette leaves reach the restore section. */
const E = require('../src/emit-resolved.js');
const mk = (id, name, modes, vars) => ({ id, name, modes: modes.map((m) => ({ modeId: id + ':' + m, name: m })), defaultModeId: id + ':' + modes[0], variables: vars });
const al = (id) => ({ type: 'VARIABLE_ALIAS', id });
const core = mk('c', '.core', ['.core'], [
  { id: 'k1', name: 'core-colours/neutral/light/100', resolvedType: 'COLOR', valuesByMode: { 'c:.core': { r: 1, g: 1, b: 1, a: 1 } } },
  { id: 'k2', name: 'core-colours/base/white', resolvedType: 'COLOR', valuesByMode: { 'c:.core': { r: 1, g: 1, b: 1, a: 1 } } }]);
const white = mk('w', '.white', ['.white'], [
  { id: 'w1', name: 'white/basic/background', resolvedType: 'COLOR', valuesByMode: { 'w:.white': al('k2') } },
  { id: 'w2', name: 'white-subtle/basic/background', resolvedType: 'COLOR', valuesByMode: { 'w:.white': al('k1') } }]);
const sec = mk('s', '.secondary', ['aperitif', 'egg'], [
  { id: 's1', name: 'secondary-light-subtle/basic/background', resolvedType: 'COLOR', valuesByMode: { 's:aperitif': al('k1'), 's:egg': al('k2') } }]);
const scheme = mk('sc', '.scheme', ['neutral', 'inverted', 'white', 'black', 'magenta', 'secondary'], []);
const rest = mk('r', '_restricted', ['unrestricted'], []);
const mode = mk('m', '.mode', ['light', 'dark'], []);
const section = mk('se', '.section', ['normal', 'subtle'], []);
const card = mk('ca', '.card', ['not-a-card'], []);
const AO = require('../src/architecture-ods.js');
let failed = 0;
const ok = (n, c) => { if (!c) { failed++; console.log('FAIL ' + n); } else console.log('ok   ' + n); };
const bpc = mk('b', '.breakpoint', ['S Mobile'], [
  { id: 'b1', name: 'breakpoint/grid/gutters', resolvedType: 'FLOAT', valuesByMode: { 'b:S Mobile': al('b2') } },
  { id: 'b2', name: 'breakpoint/stretch-grid/gutters', resolvedType: 'FLOAT', valuesByMode: { 'b:S Mobile': al('k3') } },
  { id: 'b3', name: 'breakpoint/fixed-grid/gutters', resolvedType: 'FLOAT', valuesByMode: { 'b:S Mobile': al('k3') } }]);
core.variables.push({ id: 'k3', name: 'grids/4', resolvedType: 'FLOAT', valuesByMode: { 'c:.core': 4 } });
const found = mk('f', 'foundation', ['foundation'], [
  { id: 'f1', name: 'grid/gutters', resolvedType: 'FLOAT', valuesByMode: { 'f:foundation': al('b1') }, scopes: [] }]);
const all = [core, white, sec, scheme, rest, mode, section, card, bpc, found];
ok('ODS graph is detected', AO.detectInCollections(all));
ok('v2 graph (no .section/.card) is not', !AO.detectInCollections([core, white, scheme, rest, mode]));
const res = E.document(all.map((c) => JSON.parse(JSON.stringify(c))), { restore: true });
const ext = res.document.$extensions && res.document.$extensions['com.desquared.radd'];
const r = ext && ext.restore;
console.log('shape:', res.shape, 'restore:', !!r);
if (r) {
  ok('architecture says ODS', r.architecture && r.architecture.id === 'ods-foundations');
  ok('white-subtle written', r.subtle && r.subtle.leaves['.white']['white-subtle/basic/background']['.white'] === 'core.core-colours.neutral.light.100');
  ok('the plain leaf is not written', !r.subtle.leaves['.white']['white/basic/background']);
  ok('one entry per mode on .secondary', r.subtle.leaves['.secondary']['secondary-light-subtle/basic/background'].egg === 'core.core-colours.base.white');
  ok('count', r.subtle.count === 2);
}
{
  /* restoreHops on its own: the consumption layer reads b1 only */
  const h = E.restoreHops(all, { b1: true });
  ok('hops are written', !!h);
  ok('a variable nothing reads is an extra', h && h.extras['breakpoint/fixed-grid/gutters']['S Mobile'] === 'core.grids.4');
  ok('a variable on the path is an extra too', h && h.extras['breakpoint/stretch-grid/gutters']['S Mobile'] === 'core.grids.4');
  ok('the one the document has is not', h && !h.extras['breakpoint/grid/gutters']);
  ok('it is re-pointed through the hop', h && h.via['breakpoint/grid/gutters']['S Mobile'] === 'breakpoint/stretch-grid/gutters');
  ok('an alias to another variable the document has is recorded too', (() => {
    const g = JSON.parse(JSON.stringify(all)); g[8].variables.push({ id: 'b4', name: 'breakpoint/layout/margins-cards', resolvedType: 'FLOAT', valuesByMode: { 'b:S Mobile': al('b1') } });
    const x = E.restoreHops(g, { b1: true, b4: true });
    return x && x.via['breakpoint/layout/margins-cards']['S Mobile'] === 'breakpoint/grid/gutters';
  })());
  ok('no extras when every variable is read', Object.keys(E.restoreHops(all, { b1: true, b2: true, b3: true }).extras).length === 0);
}
{
  /* descriptions as templates over P, scopes of the primitives */
  const g = JSON.parse(JSON.stringify(all));
  const wh = g.find((c) => c.name === '.white'), cd = g.find((c) => c.name === '.card'), co = g.find((c) => c.name === '.core');
  wh.variables[0].description = 'Leaf for basic/background (light).';
  cd.variables.push({ id: 'cd1', name: 'card/normal/white/basic/background', resolvedType: 'COLOR', description: 'Card layer for basic/background (normal / white).', valuesByMode: {} });
  cd.variables.push({ id: 'cd2', name: 'card/normal/white/basic/text', resolvedType: 'COLOR', description: 'Card layer for basic/text (normal / white).', valuesByMode: {} });
  cd.variables.push({ id: 'cd3', name: 'card/subtle/white/basic/text', resolvedType: 'COLOR', description: 'has {P} inside', valuesByMode: {} });
  co.variables[0].scopes = ['ALL_SCOPES'];
  const d = E.restoreDescriptions(g);
  ok('one template per text, with its names', d['.card'].some((x) => x.t === 'Card layer for {P} (normal / white).' && x.n.length === 2));
  ok('a template over the plain palette leaf', d['.white'][0].t === 'Leaf for {P} (light).' && d['.white'][0].n[0] === 'white/basic/background');
  ok('a description that would not round-trip is kept as it is', d['.card'].some((x) => x.lit === 1 && x.t === 'has {P} inside'));
  const cs = E.restoreCoreScopes(g);
  ok('primitives with scopes are listed', cs && cs[0].scopes[0] === 'ALL_SCOPES' && cs[0].paths[0] === 'core.core-colours.neutral.light.100');
}
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
