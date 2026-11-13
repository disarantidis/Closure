/* node scripts/resolved-ods-selftest.js — an ODS Resolved export is rebuilt through the ODS routing rules.
   Uses a small synthetic document; the real 4 MB export was checked by hand (see README). */
const R = require('../src/import-resolved.js');
const O = require('../src/architecture-ods.js');
let failed = 0;
const ok = (n, c) => { if (!c) { failed++; console.log('FAIL ' + n); } else console.log('ok   ' + n); };

const col = (hex) => ({ colorSpace: 'srgb', components: [0, 0, 0], alpha: 1, hex });
const cell = (v) => ({ $type: 'color', $value: v });
const acc = ['aperitif', 'egg'];
const P = { basic: { background: null } };
const modeDoc = {};
['light', 'dark'].forEach((m) => {
  modeDoc[m] = {};
  ['neutral', 'inverted', 'white', 'black', 'magenta'].concat(acc).forEach((s) => {
    modeDoc[m][s] = { basic: { background: cell('{core.core-colours.base.white}') } };
  });
});
const doc = {
  $extensions: { 'com.desquared.radd': {
    modes: ['light', 'dark'], schemes: ['neutral', 'inverted', 'white', 'black', 'magenta'].concat(acc),
    accentSchemes: acc, foundationDefaults: { mode: 'light', scheme: 'neutral', breakpoint: 'mobile' },
    restore: {
      architecture: { id: 'ods-foundations', version: 1 },
      collections: [
        { name: '.core', modes: ['.core'] }, { name: 'foundation', modes: ['foundation'] },
        { name: '.secondary', modes: acc }, { name: '.black', modes: ['.black'] },
        { name: '.magenta-light', modes: ['.magenta-light'] }, { name: '.breakpoint', modes: ['S Mobile'] },
        { name: '.white', modes: ['.white'] }, { name: '.mode', modes: ['light', 'dark'] },
        { name: '_restricted', modes: O.RESTRICTED_MODES }, { name: '.scheme', modes: O.SCHEME_MODES },
        { name: '.magenta-dark', modes: ['.magenta-dark'] }, { name: '.section', modes: ['normal', 'subtle'] },
        { name: '.card', modes: O.CARD_MODES }],
      subtle: { leaves: {
        '.white': { 'white-subtle/basic/background': { '.white': 'core.core-colours.base.white' } },
        '.black': { 'black-subtle/basic/background': { '.black': 'core.core-colours.base.white' } },
        '.magenta-light': { 'magenta-light-subtle/basic/background': { '.magenta-light': 'core.core-colours.base.white' } },
        '.magenta-dark': { 'magenta-dark-subtle/basic/background': { '.magenta-dark': 'core.core-colours.base.white' } },
        '.secondary': {
          'secondary-light-subtle/basic/background': { aperitif: 'core.core-colours.base.white', egg: 'core.core-colours.base.white' },
          'secondary-dark-subtle/basic/background': { aperitif: 'core.core-colours.base.white', egg: 'core.core-colours.base.white' } } } }
    } } },
  core: { 'core-colours': { base: { white: { $type: 'color', $value: col('#ffffff') }, error: { $type: 'color', $value: col('#ff0000') } } } },
  foundation: { colours: { basic: { background: { $type: 'color', $value: '{mode.light.neutral.basic.background}',
    $extensions: { 'com.desquared.radd': { layer: 'scheme', path: 'basic.background' } } } } } },
  breakpoint: { mobile: { grid: { gutters: { $type: 'dimension', $value: { value: 4, unit: 'px' } } } } },
  mode: modeDoc
};
doc.core.grids = { 4: { $type: 'dimension', $value: { value: 4, unit: 'px' } } };
doc.$extensions['com.desquared.radd'].restore.hops = {
  extras: { 'breakpoint/stretch-grid/gutters': { 'S Mobile': 'core.grids.4' }, 'breakpoint/fixed-grid/gutters': { 'S Mobile': 'core.grids.4' } },
  via: { 'breakpoint/grid/gutters': { 'S Mobile': 'breakpoint/stretch-grid/gutters' } } };
doc.$extensions['com.desquared.radd'].restore.descriptions = {
  '.card': [{ t: 'Card layer for {P}.', n: ['card/normal/white/basic/background', 'card/subtle/white/basic/background'] },
            { t: 'kept {P}', n: ['card/normal/black/basic/background'], lit: 1 }],
  '.white': [{ t: 'Leaf for {P}.', n: ['white/basic/background'] }] };
doc.$extensions['com.desquared.radd'].restore.coreScopes = [{ scopes: ['ALL_SCOPES'], paths: ['core.core-colours.base.white'] }];
doc.core['core-colours'].error = { $type: 'color', $value: col('#ff0000') };

const rec = R.recognise(doc);
ok('recognised as ODS', rec.ok && rec.arch === 'ods');
const noSubtle = JSON.parse(JSON.stringify(doc));
delete noSubtle.$extensions['com.desquared.radd'].restore.subtle;
const old = R.recognise(noSubtle);
ok('an export without -subtle leaves is refused, with the reason', !old.ok && /export it again/.test(old.reason));

const t = R.translate(doc);
ok('translates', t.ok);
const per = t.report.perCollection;
ok('one variable per anchor and mode family', per['.card'] === 12 && per['.section'] === 6 && per['.mode'] === 4 && per['.scheme'] === 1 && per._restricted === 6);
ok('palettes hold plain and -subtle leaves', per['.white'] === 2 && per['.secondary'] === 4);
ok('collections come in the document\'s own order', t.collectionOrder[0] === '.core' && t.collectionOrder[t.collectionOrder.length - 1] === '.card');
ok('nothing missing', t.report.missing.length === 0);
const row = (g, p, v) => t.ir.rows.find((r) => r.group === g && r.path === p && r.variant === v);
const rc = row('.card', 'card.normal.magenta-light.basic.background', 'magenta-card');
ok('a card the rules refuse points at the error colour', rc && rc.value.ref === 'core-colours.error');
const rs = row('.section', 'section.white.basic.background', 'subtle');
ok('a section mode points at its card', rs && rs.value.ref === 'card.subtle.white.basic.background' && rs.value.refCol === '.card');
ok('architecture is named', t.report.architecture === 'ods-foundations v1');

ok('hop variables are added', per['.breakpoint'] === 3);
const hv = row('.breakpoint', 'breakpoint.grid.gutters', 'S Mobile');
ok('a variable routed through a hop points at it, not at core', hv && hv.value.ref === 'breakpoint.stretch-grid.gutters' && hv.value.refCol === '.breakpoint');
const ex = row('.breakpoint', 'breakpoint.stretch-grid.gutters', 'S Mobile');
ok('the hop points at core', ex && ex.value.refCol === '.core' && ex.value.ref === 'grids.4');

const descOf = (g, p) => { const r = t.ir.rows.find((x) => x.group === g && x.path === p); return r && r.description; };
ok('a description comes back from its template', descOf('.card', 'card.subtle.white.basic.background') === 'Card layer for basic/background.');
ok('a literal one is not expanded', descOf('.card', 'card.normal.black.basic.background') === 'kept {P}');
ok('a palette leaf takes the file\'s description, not the cell\'s', descOf('.white', 'white.basic.background') === 'Leaf for basic/background.');
ok('a variable without one has none', descOf('.section', 'section.white.basic.background') === '');
const sc = t.ir.rows.find((x) => x.group === '.core' && x.path === 'core-colours.base.white');
ok('the primitives get their recorded scopes', sc && sc.scopes && sc.scopes[0] === 'ALL_SCOPES');
const sc2 = t.ir.rows.find((x) => x.group === '.core' && x.path === 'core-colours.error');
ok('the others stay hidden', sc2 && Array.isArray(sc2.scopes) && sc2.scopes.length === 0);

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
