/* node scripts/structure-select-selftest.js — which saved structure an imported JSON belongs to. */
const S = require('../src/structure-select.js');
const C = require('../src/structure-capture.js');

let failed = 0;
function ok(name, cond) { if (!cond) { failed++; console.log('FAIL ' + name); } else console.log('ok   ' + name); }

/* two architectures, written as the index lines the sandbox saves */
const v3 = ['foundation[foundation]', '.scheme[neutral,inverted,white,black,magenta,secondary]',
  '_restricted[unrestricted,to-neutral,to-neutral-and-magenta,to-neutral-and-secondary]',
  '.section[normal,subtle]', '.mode[light,dark]', '.breakpoint[S Mobile,M Tablet,L Laptop,XL Desktop,XXL Large Desktop]',
  '.secondary[aperitif,basketball,cheddar]', '.core[.core]'];
const v2 = ['foundation[foundation]', '.scheme[neutral,inverted,white,black,brand,secondary]',
  '.mode[light,dark]', '.breakpoint[S Mobile,M Tablet,L Laptop,XL Desktop,XXL Large Desktop]',
  '.secondary[aperitif,basketball,cheddar]', '.core[.core]'];
const saved = [{ file: 'Foundations v2', items: v2, layers: ['a'] }, { file: 'ODS Test Foundations', items: v3, layers: ['a', 'b'] }];

const doc = (schemes) => ({
  $extensions: { 'com.desquared.radd': { schemes, accentSchemes: ['aperitif', 'basketball', 'cheddar'], modes: ['light', 'dark'] } },
  breakpoint: { mobile: {}, tablet: {}, laptop: {}, desktop: {}, 'large-desktop': {} }
});

ok('breakpoint key drops the size code', S.breakpointKey('S Mobile') === 'mobile' && S.breakpointKey('XXL Large Desktop') === 'large-desktop');
ok('item parses', JSON.stringify(S.parseItem('.mode[light,dark]')) === '{"name":".mode","modes":["light","dark"]}');

const p3 = S.profileOf(doc(['neutral', 'inverted', 'white', 'black', 'magenta', 'secondary']));
ok('profile reads the four sets', p3.schemes.length === 6 && p3.accents.length === 3 && p3.modes.length === 2 && p3.breakpoints.length === 5);

const a = S.choose(saved, p3);
ok('magenta JSON picks the v3 structure', a.kind === 'fits' && a.entry.file === 'ODS Test Foundations');
const b = S.choose(saved, S.profileOf(doc(['neutral', 'inverted', 'white', 'black', 'brand', 'secondary'])));
ok('brand JSON picks the v2 structure', b.kind === 'fits' && b.entry.file === 'Foundations v2');

const c = S.choose([saved[0]], p3);
ok('only v2 saved: magenta JSON is partial and names what is missing', c.kind === 'partial' && c.missing.join() === 'schemes');

const d = S.choose(saved, S.profileOf({ $extensions: { 'com.desquared.radd': { schemes: ['x', 'y'], accentSchemes: ['q'], modes: ['m'] } } }));
ok('nothing fits: none, no guess', d.kind === 'none' && d.entry === null);
ok('nothing saved: none', S.choose([], p3).kind === 'none');

/* the capture's own signature feeds it */
const cap = C.capture([
  { id: 'c1', name: '.scheme', modes: [{ modeId: 'm1', name: 'neutral' }, { modeId: 'm2', name: 'magenta' }], variables: [] }
], {});
const sig = C.signature(cap);
ok('signature items round-trip through parseItem', S.parseItem(sig.items[0]).modes.join() === 'neutral,magenta');

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
