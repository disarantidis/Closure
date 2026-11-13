#!/usr/bin/env node
/*
  resolved-import-selftest.js — a Resolved export comes back as the file it came from.

  A miniature of the RADD Foundations architecture is built as a raw variable graph
  (every collection, every route — .core, the four palettes, _restricted, .mode,
  .scheme, foundation, .breakpoint, layout), exported the way the plugin exports it
  (emit-resolved.js), translated back (import-resolved.js), run through the SAME
  derive and compile the import page uses, interpreted into variables with no Figma
  involved, and compared with the graph it started from.

  What it pins, and why each one matters:
    1. the document is recognised from what it says about itself, and anything else
       is refused rather than guessed at;
    2. every collection, mode and alias comes back — the part a Resolved export
       evaluates away is put back by rules, not measured;
    3. creation order is the panel's order, not the alias graph's;
    4. scopes survive, including the EMPTY list that hides a variable from pickers
       (a different thing from the default), from the document's own section when
       it has one and from the rules when it does not;
    5. what the exporter invented for itself is not turned into variables.
*/
const assert = require('assert');
const E = require('../src/emit-resolved.js');
const D = require('../src/dtcg-format.js');
const A = require('../src/architecture-radd.js');
const R = require('../src/import-resolved.js');
const { derive } = require('../src/import-derive.js');
const { compile } = require('../src/import-compile.js');
const V = require('../src/import-verify.js');
const { apply, preflight } = require('../src/import-apply.js');
const Diff = require('../src/import-diff.js');
const Filter = require('../src/import-filter.js');

// ── a miniature of the architecture, as a raw graph ──────────────────────
let n = 0;
const col = (name, modes) => ({ id: 'C:' + name, name, modes: modes.map((m, i) => ({ modeId: name + ':' + i, name: m })),
                                defaultModeId: name + ':0', variables: [], _by: {} });
const add = (c, name, type, scopes) => {
  const v = { id: 'V' + (++n), name, type, valuesByMode: {}, resolvedValuesByMode: {}, aliasInfo: {}, scopes: scopes || [], description: '' };
  c.variables.push(v); c._by[name] = v; return v;
};
const al = (v) => ({ type: 'VARIABLE_ALIAS', id: v.id });
const set = (c, v, mode, val) => { v.valuesByMode[c.modes.find((m) => m.name === mode).modeId] = val; };
const rgb = (r, g, b) => ({ r: r / 255, g: g / 255, b: b / 255, a: 1 });

const ACCENTS = ['amber', 'aqua'];
const BPS = ['S Mobile', 'M Tablet'];
const COLOUR_PATHS = ['basic/text', 'basic/background'];
const ELEV_PATHS = ['elevation/level-1/x', 'elevation/level-1/colour'];

const core = col('.core', ['.core']);
const secondary = col('.secondary', ACCENTS);
const black = col('.black', ['.black']);
const brand = col('.brand', ['.brand']);
const bp = col('.breakpoint', BPS);
const white = col('.white', ['.white']);
const mode = col('.mode', ['light', 'dark']);
const restricted = col('_restricted', A.RESTRICTED_MODES);
const scheme = col('.scheme', A.SCHEME_MODES);
const foundation = col('foundation', ['foundation']);
const layout = col('layout', ['columns']);
const graph = [core, foundation, secondary, black, brand, bp, white, mode, restricted, scheme, layout];

// primitives: a distinct colour per palette and path so a mis-route shows up
const cc = (name, r, g, b) => { const v = add(core, name, 'COLOR'); set(core, v, '.core', rgb(r, g, b)); return v; };
const err = cc('core-colours/error', 255, 0, 0);
const dim = (i, px) => { const v = add(core, 'dimension/' + i, 'FLOAT'); set(core, v, '.core', px); return v; };
const d0 = dim(0, 0), d4 = dim(1, 4), d8 = dim(2, 8), d16 = dim(3, 16);
const shadow = add(core, 'shadows/2', 'FLOAT'); set(core, shadow, '.core', 2);
const PAL = ['white', 'black', 'brand-light', 'brand-dark', 'secondary-light', 'secondary-dark'];
const palColour = {};
PAL.forEach((p, i) => COLOUR_PATHS.concat(ELEV_PATHS[1]).forEach((P, j) => { palColour[p + '|' + P] = cc('core-colours/' + p + '/' + P.replace(/\//g, '-'), 10 * (i + 1), 20 * (j + 1), 7 * (i + j + 1)); }));
const accentColour = {};
ACCENTS.forEach((a, k) => ['secondary-light', 'secondary-dark'].forEach((p, i) => COLOUR_PATHS.concat(ELEV_PATHS[1]).forEach((P, j) => { accentColour[a + '|' + p + '|' + P] = cc('core-colours/' + a + '/' + p + '/' + P.replace(/\//g, '-'), 100 + 30 * k + 10 * i, 50 + 20 * j, 200 - 10 * k - 5 * i); })));

const owner = (p) => ({ white, black, 'brand-light': brand, 'brand-dark': brand, 'secondary-light': secondary, 'secondary-dark': secondary }[p]);
const isElev = (P) => P.indexOf('elevation/') === 0;
const palVar = {};
COLOUR_PATHS.concat(ELEV_PATHS).forEach((P) => {
  const colour = P !== ELEV_PATHS[0];
  PAL.forEach((p) => {
    const c = owner(p), v = add(c, p + '/' + P, colour ? 'COLOR' : 'FLOAT');
    palVar[p + '|' + P] = v;
    if (c === secondary) ACCENTS.forEach((a) => set(c, v, a, colour ? al(accentColour[a + '|' + p + '|' + P]) : al(d4)));
    else set(c, v, c.modes[0].name, colour ? al(palColour[p + '|' + P]) : al(p === 'white' ? d0 : p === 'black' ? d4 : p.indexOf('brand') === 0 ? d8 : d16));
  });
});
// elevation FLOAT leaves differ per palette, so a mis-route shows there as well
COLOUR_PATHS.forEach((P) => PAL.forEach((p) => {
  const c = owner(p);
  Object.keys(A.PALETTE).forEach((s) => ['light', 'dark'].forEach((m) => {
    if (A.PALETTE[s][m] !== p) return;
    const mv = add(mode, A.MODE_PREFIX[s] + '/' + P, 'COLOR');
    set(mode, mv, m, al(add(restricted, 'restrictions/' + p + '/' + P, 'COLOR')));
  }));
}));
// (the loop above creates restrictions/… and mode/… variables lazily; fill them properly below)
mode.variables.length = 0; mode._by = {}; restricted.variables.length = 0; restricted._by = {};
const rVar = {}, mVar = {}, sVar = {};
COLOUR_PATHS.forEach((P) => {
  PAL.forEach((p) => {
    const v = add(restricted, 'restrictions/' + p + '/' + P, 'COLOR'); rVar[p + '|' + P] = v;
    A.RESTRICTED_MODES.forEach((rm) => set(restricted, v, rm, A.keeps(p, rm) ? al(palVar[p + '|' + P]) : al(err)));
  });
});
COLOUR_PATHS.concat(ELEV_PATHS).forEach((P) => {
  const colour = P !== ELEV_PATHS[0];
  Object.keys(A.MODE_PREFIX).forEach((s) => {
    const v = add(mode, A.MODE_PREFIX[s] + '/' + P, colour ? 'COLOR' : 'FLOAT'); mVar[s + '|' + P] = v;
    ['light', 'dark'].forEach((m) => { const p = A.PALETTE[s][m]; set(mode, v, m, al(isElev(P) ? palVar[p + '|' + P] : rVar[p + '|' + P])); });
  });
  const v = add(scheme, 'scheme/' + P, colour ? 'COLOR' : 'FLOAT'); sVar[P] = v;
  A.SCHEME_MODES.forEach((s) => set(scheme, v, s, al(A.MODE_PREFIX[s] ? mVar[s + '|' + P]
    : isElev(P) ? palVar[s + '|' + P] : rVar[s + '|' + P])));
});

// breakpoint
const bpVar = {};
const bpDef = [['spacing/component/0', [d4, d8]], ['sizing/input-height', [d8, d8]], ['columns/1-columns', [d16, d16]]];
bpDef.forEach(([P, tg]) => { const v = add(bp, 'breakpoint/' + P, 'FLOAT'); bpVar[P] = v; BPS.forEach((b, i) => set(bp, v, b, al(tg[i]))); });
// literals in the breakpoint set — one the foundation reads (and is named after), one nothing reads
const litG = add(bp, 'breakpoint/grid/gutters', 'FLOAT'); BPS.forEach((b, i) => set(bp, litG, b, i ? 24 : 16));
const litS = add(bp, 'breakpoint/stretch-grid/column-width', 'FLOAT'); BPS.forEach((b, i) => set(bp, litS, b, i ? 52.5 : 48.5));

// the consumption layer — and the scopes it carries
const fv = (name, type, scopes, target) => { const v = add(foundation, name, type, scopes); set(foundation, v, 'foundation', typeof target === 'object' ? al(target) : target); return v; };
fv('colours/basic/text', 'COLOR', ['ALL_SCOPES'], sVar['basic/text']);
fv('colours/basic/background', 'COLOR', ['ALL_SCOPES'], sVar['basic/background']);
fv('elevation/level-1/x', 'FLOAT', ['EFFECT_FLOAT', 'FONT_VARIATIONS'], sVar['elevation/level-1/x']);
fv('elevation/level-1/colour', 'COLOR', ['EFFECT_COLOR'], sVar['elevation/level-1/colour']);
fv('spacing/component/0', 'FLOAT', ['FONT_VARIATIONS', 'GAP', 'WIDTH_HEIGHT'], bpVar['spacing/component/0']);
fv('sizing/input-height', 'FLOAT', ['FONT_VARIATIONS', 'GAP', 'WIDTH_HEIGHT'], bpVar['sizing/input-height']);
// a consumption token whose layer variable has ANOTHER name, read by it alone — a rename
const litM = add(bp, 'breakpoint/layout/margins-cards', 'FLOAT'); BPS.forEach((b, i) => set(bp, litM, b, i ? 24 : 8));
fv('grid/margins-overflow', 'FLOAT', [], litM);
// two tokens reading ONE layer variable — sharing, not renaming
const tyA = add(bp, 'breakpoint/typography/a/size', 'FLOAT'); BPS.forEach((b, i) => set(bp, tyA, b, al(i ? d16 : d8)));
fv('typography/a/size', 'FLOAT', ['FONT_SIZE', 'FONT_VARIATIONS', 'FONT_WEIGHT', 'LETTER_SPACING', 'LINE_HEIGHT', 'PARAGRAPH_INDENT', 'PARAGRAPH_SPACING'], tyA);
fv('typography/b/size', 'FLOAT', ['FONT_SIZE', 'FONT_VARIATIONS', 'FONT_WEIGHT', 'LETTER_SPACING', 'LINE_HEIGHT', 'PARAGRAPH_INDENT', 'PARAGRAPH_SPACING'], tyA);
fv('radius/small', 'FLOAT', ['CORNER_RADIUS', 'FONT_VARIATIONS'], d4);
fv('radius/full', 'FLOAT', ['CORNER_RADIUS', 'FONT_VARIATIONS'], 999);
fv('grid/gutters', 'FLOAT', [], litG);                     // an empty scope list is a statement
{ const v = add(layout, 'columns/1-columns', 'FLOAT', ['FONT_VARIATIONS', 'WIDTH_HEIGHT']); set(layout, v, 'columns', al(bpVar['columns/1-columns'])); }

const clean = graph.map((c) => { const o = Object.assign({}, c); delete o._by; return o; });

// ── export it the way the plugin does ────────────────────────────────────
/* Styles as styles-capture.js reads them — shaped like the live RADD file's
   (captured 2026-11-11), including the two ways that file departs from its own
   convention: a style whose paragraph indent is bound to ANOTHER scale's
   variable, and one with no weight bound at all. The variable names carry
   Figma's own capitals; the section lowercases them, an import finds them. */
const STYLES = {
  textStyles: [
    { id: 'S:1', name: 'Link A Bold', type: 'TEXT', description: '', fontName: { family: 'Inter', style: 'Bold' },
      textCase: 'ORIGINAL', textDecoration: 'UNDERLINE',
      values: { fontSize: 16, lineHeight: { unit: 'PIXELS', value: 20 }, letterSpacing: { unit: 'PIXELS', value: 0 }, paragraphSpacing: 0, paragraphIndent: 0 },
      bound: { fontSize: 'foundation::Typography/A/Size', paragraphIndent: 'foundation::typography/b/size' } },
    { id: 'S:2', name: 'Plain', type: 'TEXT', description: 'no weight bound', fontName: { family: 'Inter', style: 'Medium' },
      textCase: 'ORIGINAL', textDecoration: 'NONE', values: { fontSize: 12 }, bound: { fontSize: 'foundation::typography/b/size', fontWeight: 'foundation::typography/gone/weight' } },
    { id: 'S:9', name: 'only an id and a name', type: 'TEXT' },
  ],
  gridStyles: [
    { id: 'S:4', name: 'Grid', type: 'GRID', description: '', layoutGrids: [
      { pattern: 'COLUMNS', visible: true, alignment: 'STRETCH', count: 6, gutterSize: 4, offset: 24, color: [0.3, 0.88, 0.69, 0.1],
        bound: { gutterSize: 'foundation::Grid/Gutters', count: '.breakpoint::breakpoint/columns/1-columns' } },
      { pattern: 'COLUMNS', visible: true, alignment: 'CENTER', count: 0, sectionSize: 0, gutterSize: 0, color: [0.3, 0.88, 0.69, 0.1],
        bound: { sectionSize: '.breakpoint::breakpoint/grid/gone' } },
    ] },
  ],
  effectStyles: [
    { id: 'S:3', name: 'elevation/FAB/standard', type: 'EFFECT', description: '', effects: [{
      type: 'DROP_SHADOW', visible: true, blendMode: 'NORMAL', color: [0, 0, 0, 0.13], offset: { x: 0, y: 4 }, radius: 8, spread: 1,
      bound: { color: 'foundation::Elevation/Level-1/Colour', offsetX: 'foundation::elevation/level-1/x' } }] },
  ],
  /* Read since 2026-11-13. A gradient's stop binds a variable of its own, so
     the lowercasing has to reach inside the stop list too, not just the
     paint's own `bound`. */
  paintStyles: [
    { id: 'S:5', name: 'Gradient/Fade Out', type: 'PAINT', description: '', paints: [{
      type: 'GRADIENT_LINEAR', visible: true, blendMode: 'NORMAL', opacity: 1,
      gradientTransform: [[1, 0, 0], [0, 1, 0.5]],
      gradientStops: [
        { position: 0, color: [0, 0, 0, 0] },
        { position: 1, color: [0, 0, 0, 1], bound: { color: 'foundation::Colours/Base/Black' } },
      ],
      bound: {} }] },
    { id: 'S:8', name: 'only an id and a name', type: 'PAINT' },
  ],
};
const exported = E.document(clean, { hooks: { toDtcgFormat: D.toDtcgFormat }, restore: true, styles: STYLES });
const exportedPlain = E.document(clean, { hooks: { toDtcgFormat: D.toDtcgFormat } });
/* The sandbox writes a colour as a DTCG colour object (its formatValue hook);
   the emitter alone leaves { r, g, b, a }. Done here so the document is the one
   the plugin really produces. */
const hex2 = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
function dtcgColours(o) {
  Object.keys(o).forEach((k) => {
    const v = o[k];
    if (!v || typeof v !== 'object') return;
    if (k === '$value' && 'r' in v) o[k] = { colorSpace: 'srgb', components: [v.r, v.g, v.b], alpha: v.a, hex: '#' + hex2(v.r) + hex2(v.g) + hex2(v.b) };
    else dtcgColours(v);
  });
}
dtcgColours(exported.document); dtcgColours(exportedPlain.document);
const doc = exported.document;               // with the restore section
const docPlain = exportedPlain.document;     // without

// ── and bring it back ───────────────────────────────────────────────────
function roundTrip(document) {
  const t = R.translate(document);
  if (!t.ok) return { t };
  const plan = derive(t.ir, {});
  const out = compile(t.ir, plan, { evaluateExpressions: true, collectionOrder: t.collectionOrder });
  return { t, plan, out };
}
const norm = (l) => {
  const p = l.split('|'); let v = p.slice(3).join('|');
  if (/^-?\d+\.\d+$/.test(v)) v = String(Math.round(parseFloat(v) * 1e3) / 1e3);
  return [p[0], p[1].toLowerCase(), p[2].toLowerCase(), v.toLowerCase()].join('|');
};
const rt = roundTrip(doc);
const rtPlain = roundTrip(docPlain);

let passed = 0;
const queue = [];                     // tests that return a promise are awaited at the end
function ok(name, fn) {
  const done = () => { passed++; console.log('ok    ' + name); };
  const fail = (e) => { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') queue.push(r.then(done, fail)); else done();
  } catch (e) { fail(e); }
}

// ── 1. recognition ───────────────────────────────────────────────────────
ok('the export carries the metadata the architecture is recognised by', () => {
  const r = A.recognise(doc);
  assert.ok(r.ok, r.reason);
  assert.ok(r.meta.accentSchemes.length === 2);
});
ok('a document that is not resolved, or is another architecture, is refused', () => {
  assert.strictEqual(A.recognise({ core: {} }).ok, false);
  const other = JSON.parse(JSON.stringify(doc));
  other.$extensions['com.desquared.radd'].restore = { architecture: { id: 'something-else', version: 1 } };
  assert.strictEqual(A.recognise(other).ok, false);
  assert.strictEqual(R.translate(other).ok, false);
});
ok('the graph is recognised at export time as well', () => {
  assert.strictEqual(A.detectInCollections(clean), true);
  assert.strictEqual(A.detectInCollections(clean.filter((c) => c.name !== '_restricted')), false);
});

// ── 2. the structure comes back ──────────────────────────────────────────
ok('the document translates, derives, and compiles with no open question', () => {
  assert.ok(rt.t.ok, rt.t.reason);
  assert.deepStrictEqual(rt.plan.unresolved, [], JSON.stringify(rt.plan.unresolved));
  assert.ok(rt.out.ok, JSON.stringify(rt.out.refusals));
  assert.deepStrictEqual(rt.t.report.missing, []);
});
ok('all eleven collections come back, with the modes they have in the file', () => {
  const made = {};
  rt.out.program.ops.forEach((o) => { if (o.op === 'createCollection') (made[o.collection] = [o.firstMode]); else if (o.op === 'addMode') made[o.collection].push(o.mode); });
  const want = {};
  clean.forEach((c) => { want[c.name] = c.modes.map((m) => m.name); });
  assert.deepStrictEqual(made, want);
});
ok('every variable and alias comes back — the routing is put back by rules', () => {
  const truth = V.lines(V.fromRawGraph(clean)).map(norm);
  const built = V.lines(V.materialise(rt.out.program)).map(norm);
  const A_ = new Set(truth), B_ = new Set(built);
  /* ONE known difference, by decision: two tokens that share a layer variable
     (typography/a/size and typography/b/size) come back as two variables, each
     named after the token that reads it — the way the reference document names
     them. Everything else must be identical. */
  const shared = (l) => /typography\/b\/size/.test(l);
  const missing = truth.filter((l) => !B_.has(l)), extra = built.filter((l) => !A_.has(l));
  assert.deepStrictEqual(missing.filter((l) => !shared(l)), [], 'missing: ' + missing.slice(0, 5).join(' // '));
  assert.deepStrictEqual(extra.filter((l) => !shared(l)), [], 'extra: ' + extra.slice(0, 5).join(' // '));
  assert.deepStrictEqual(missing, ['foundation|typography/b/size|foundation|alias:.breakpoint/breakpoint/typography/a/size']);
  assert.ok(extra.indexOf('foundation|typography/b/size|foundation|alias:.breakpoint/breakpoint/typography/b/size') !== -1);
});

// ── 3. creation order ────────────────────────────────────────────────────
ok('collections are created in the panel\'s order, not the alias graph\'s', () => {
  const order = rt.out.program.ops.filter((o) => o.op === 'createCollection').map((o) => o.collection);
  assert.deepStrictEqual(order, clean.map((c) => c.name));
});

// ── 4. scopes ────────────────────────────────────────────────────────────
const scopesOf = (program) => {
  const m = {};
  program.ops.filter((o) => o.op === 'createVariable').forEach((o) => { m[o.collection + '|' + o.name.toLowerCase()] = o.scopes; });
  return m;
};
ok('scopes come back from the rules when the document has no section', () => {
  assert.ok(rtPlain.out.ok);
  const s = scopesOf(rtPlain.out.program);
  assert.deepStrictEqual(s['foundation|colours/basic/text'], ['ALL_SCOPES']);
  assert.deepStrictEqual(s['foundation|spacing/component/0'].slice().sort(), ['FONT_VARIATIONS', 'GAP', 'WIDTH_HEIGHT']);
  assert.deepStrictEqual(s['foundation|radius/small'].slice().sort(), ['CORNER_RADIUS', 'FONT_VARIATIONS']);
  assert.deepStrictEqual(s['foundation|elevation/level-1/colour'], ['EFFECT_COLOR']);
});
ok('a hidden variable keeps its EMPTY scope list — not the default', () => {
  const s = scopesOf(rtPlain.out.program);
  assert.deepStrictEqual(s['.core|core-colours/error'], []);
  assert.deepStrictEqual(s['.mode|mode/basic/text'], []);
  assert.deepStrictEqual(s['foundation|grid/gutters'], []);
});
ok('every variable\'s scopes equal the graph\'s', () => {
  const s = scopesOf(rt.out.program);
  const bad = [];
  clean.forEach((c) => c.variables.forEach((v) => {
    const k = c.name + '|' + v.name.toLowerCase();
    if ((s[k] || []).slice().sort().join() !== v.scopes.slice().sort().join()) bad.push(k + ' want ' + v.scopes + ' got ' + s[k]);
  }));
  assert.deepStrictEqual(bad, []);
});
ok('a restore section overrides the rules', () => {
  const d2 = JSON.parse(JSON.stringify(docPlain));
  d2.$extensions['com.desquared.radd'].restore = {
    architecture: { id: A.ID, version: A.VERSION },
    scopes: [{ scopes: ['CORNER_RADIUS'], paths: ['foundation.colours.basic.text'] }],
  };
  const r = roundTrip(d2);
  assert.deepStrictEqual(scopesOf(r.out.program)['foundation|colours/basic/text'], ['CORNER_RADIUS']);
  assert.ok(r.t.report.scopes.restore >= 1);
});

// ── links the document names ────────────────────────────────────────────
ok('a foundation token that reads a differently-named breakpoint variable is rewired by restore.links', () => {
  const d2 = JSON.parse(JSON.stringify(docPlain));
  d2.$extensions['com.desquared.radd'].restore = {
    architecture: { id: A.ID, version: A.VERSION },
    links: { 'foundation.grid.gutters': 'layout.gutters-x' },
  };
  const r = roundTrip(d2);
  assert.ok(r.out.ok);
  const names = r.out.program.ops.filter((o) => o.op === 'createVariable' && o.collection === '.breakpoint').map((o) => o.name);
  assert.ok(names.indexOf('breakpoint/layout/gutters-x') !== -1);
  assert.ok(names.indexOf('breakpoint/grid/gutters') === -1);
  const alias = r.out.program.ops.find((o) => o.op === 'setAlias' && o.collection === 'foundation' && o.name === 'grid/gutters');
  assert.strictEqual(alias.target.name, 'breakpoint/layout/gutters-x');
});

// ── the restore section, as the exporter writes it ──────────────────────
const NS_ = 'com.desquared.radd';
ok('no section unless asked for', () => {
  assert.ok(!('restore' in docPlain.$extensions[NS_]));
});
ok('the section is the LAST key of the metadata, and carries no tokens', () => {
  const keys = Object.keys(doc.$extensions[NS_]);
  assert.strictEqual(keys[keys.length - 1], 'restore');
  assert.ok(['architecture', 'collections', 'scopes'].every((k) => k in doc.$extensions[NS_].restore));
});
ok('it names the architecture and the collections in the panel\'s order', () => {
  const r = doc.$extensions[NS_].restore;
  assert.deepStrictEqual(r.architecture, { id: A.ID, version: A.VERSION });
  assert.deepStrictEqual(r.collections.map((c) => c.name), clean.map((c) => c.name));
  assert.deepStrictEqual(r.collections.find((c) => c.name === '.secondary').modes, ACCENTS);
});
ok('its scopes are grouped by set, keyed by document path, and the empty set is kept', () => {
  const g = doc.$extensions[NS_].restore.scopes;
  const find = (path) => g.find((x) => x.paths.indexOf(path) !== -1).scopes;
  assert.deepStrictEqual(find('foundation.colours.basic.text'), ['ALL_SCOPES']);
  assert.deepStrictEqual(find('foundation.grid.gutters'), []);
  assert.deepStrictEqual(find('foundation.columns.1-columns'), ['FONT_VARIATIONS', 'WIDTH_HEIGHT']);
});
ok('a rename is recorded as a link; a layer variable two tokens share is not', () => {
  const l = doc.$extensions[NS_].restore.links;
  assert.deepStrictEqual(l, { 'foundation.grid.margins-overflow': 'layout.margins-cards' });
});
ok('with the section, the rename comes back with its real name', () => {
  const names = rt.out.program.ops.filter((o) => o.op === 'createVariable' && o.collection === '.breakpoint').map((o) => o.name);
  assert.ok(names.indexOf('breakpoint/layout/margins-cards') !== -1);
  assert.ok(names.indexOf('breakpoint/grid/margins-overflow') === -1);
  assert.ok(rt.t.report.scopes.restore > 0);
});
ok('without it the architecture\'s own link table gives the same name', () => {
  const names = (r) => r.out.program.ops.filter((o) => o.op === 'createVariable' && o.collection === '.breakpoint').map((o) => o.name);
  assert.ok(names(rtPlain).indexOf('breakpoint/layout/margins-cards') !== -1);
  assert.strictEqual(names(rtPlain).indexOf('breakpoint/grid/margins-overflow'), -1);
  assert.deepStrictEqual(names(rtPlain).sort(), names(rt).sort());
});
ok('the section does not change a single token', () => {
  const strip = (d) => { const c = JSON.parse(JSON.stringify(d)); delete c.$extensions[NS_].restore; return JSON.stringify(c); };
  assert.strictEqual(strip(doc), strip(docPlain));
});

// ── styles: written by the exporter, read back by the translator ──────────
ok('without styles there is no styles section, and an id-and-name entry is not written', () => {
  assert.ok(!('styles' in docPlain.$extensions[NS_]));
  const r = doc.$extensions[NS_].restore.styles;
  assert.deepStrictEqual(r.text.map((t) => t.name), ['Link A Bold', 'Plain']);
});
ok('style names keep their capitals; a bound variable is named with its name lowercased', () => {
  const r = doc.$extensions[NS_].restore.styles;
  assert.strictEqual(r.effect[0].name, 'elevation/FAB/standard');
  assert.strictEqual(r.text[0].bound.fontSize, 'foundation::typography/a/size');
  assert.strictEqual(r.effect[0].effects[0].bound.color, 'foundation::elevation/level-1/colour');
});
ok('the definition is carried: font, decoration, values, the layer\'s shape', () => {
  const r = doc.$extensions[NS_].restore.styles;
  assert.deepStrictEqual(r.text[0].fontName, { family: 'Inter', style: 'Bold' });
  assert.strictEqual(r.text[0].textDecoration, 'UNDERLINE');
  assert.deepStrictEqual(r.effect[0].effects[0].offset, { x: 0, y: 4 });
});
ok('a paint style is recorded as its list of paints, and an id-and-name entry still is not', () => {
  const r = doc.$extensions[NS_].restore.styles;
  assert.deepStrictEqual(r.paint.map((p) => p.name), ['Gradient/Fade Out']);
  const p = r.paint[0].paints[0];
  assert.strictEqual(p.type, 'GRADIENT_LINEAR');
  assert.deepStrictEqual(p.gradientTransform, [[1, 0, 0], [0, 1, 0.5]]);
  assert.strictEqual(p.gradientStops.length, 2);
});
ok('a gradient stop\'s bound variable is lowercased like every other binding', () => {
  const stops = doc.$extensions[NS_].restore.styles.paint[0].paints[0].gradientStops;
  assert.deepStrictEqual(stops[1].bound, { color: 'foundation::colours/base/black' });
  assert.ok(!('bound' in stops[0]));   // an unbound stop is not given an empty one
});
ok('the translator reads the styles back, with every binding resolved to a variable that will exist', () => {
  const st = rt.t.ir.styles;
  assert.deepStrictEqual(st.text.map((t) => t.name), ['Link A Bold', 'Plain']);
  assert.deepStrictEqual(st.text[0].bound.fontSize, { collection: 'foundation', name: 'typography/a/size' });
  assert.strictEqual(st.text[0].textDecoration, 'UNDERLINE');
  assert.deepStrictEqual(st.effect[0].effects[0].bound.offsetX, { collection: 'foundation', name: 'elevation/level-1/x' });
  assert.strictEqual(rt.t.report.styles.source, 'restore');
});
ok('a style\'s own departures from the convention survive: a borrowed binding, and a field left unbound', () => {
  const t = rt.t.ir.styles.text;
  assert.deepStrictEqual(t[0].bound.paragraphIndent, { collection: 'foundation', name: 'typography/b/size' });   // another scale's variable
  assert.ok(!('fontWeight' in t[0].bound));                                                                       // never bound
});
ok('a binding to a variable that does not exist is reported and left out — the style still comes', () => {
  const t = rt.t.ir.styles.text[1];
  assert.ok(!('fontWeight' in t.bound));
  assert.ok(rt.t.report.styles.bindingsMissing.some((m) => /Plain\.fontWeight/.test(m) && /typography\/gone\/weight/.test(m)));
});
ok('without a styles section, the composites give the styles by convention — and say what that costs', () => {
  const d2 = JSON.parse(JSON.stringify(docPlain));
  d2.foundation.elevation['level-1']['level-1'] = { $type: 'shadow', $value: '{mode.light.neutral.elevation.level-1.level-1}',
    $extensions: { [NS_]: { layer: 'scheme', path: 'elevation.level-1.level-1' } } };
  d2.mode.light.neutral.elevation['level-1']['level-1'] = { $type: 'shadow', $value: {
    color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.2, hex: '#00000033' }, offsetX: { value: 0, unit: 'px' },
    offsetY: { value: 2, unit: 'px' }, blur: { value: 6, unit: 'px' }, spread: { value: 1, unit: 'px' }, inset: false } };
  d2.foundation.typography.a = d2.foundation.typography.a || {};
  d2.foundation.typography.a.a = { $type: 'typography', $value: '{breakpoint.mobile.typography.a.a}',
    $extensions: { [NS_]: { layer: 'breakpoint', path: 'typography.a.a' } } };
  d2.breakpoint.mobile.typography.a.a = { $type: 'typography', $value: { fontFamily: 'Inter', fontWeight: 700, lineHeight: 20, fontSize: 16, letterSpacing: 0 },
    $extensions: { 'com.tokens-studio': { textCase: 'none', textDecoration: 'underline' } } };
  const r = R.translate(d2);
  assert.ok(r.ok);
  assert.strictEqual(r.report.styles.source, 'rules');
  assert.deepStrictEqual(r.ir.styles.effect.map((e) => e.name), ['elevation/level-1']);
  assert.deepStrictEqual(r.ir.styles.effect[0].effects[0].offset, { x: 0, y: 2 });
  assert.strictEqual(r.ir.styles.effect[0].effects[0].bound.color.name, 'elevation/level-1/colour');
  assert.deepStrictEqual(r.ir.styles.text.map((t) => [t.name, t.fontName.style, t.textDecoration]), [['A', 'Bold', 'UNDERLINE']]);
});

// ── 5. what the exporter invented ────────────────────────────────────────
ok('a core scale the exporter invented for itself is not turned into variables', () => {
  const d2 = JSON.parse(JSON.stringify(docPlain));
  d2.core.letterspacing = { '0': { $type: 'number', $value: -0.05 } };
  d2.core.lineheights = { '0': { $type: 'number', $value: 1 } };
  const r = roundTrip(d2);
  assert.ok(r.t.ok);
  assert.strictEqual(r.t.report.skipped.synthesized, 2);
  assert.ok(!r.out.program.ops.some((o) => /letterspacing|lineheights/.test(o.name || '')));
});
ok('composites are not variables and are skipped, not refused', () => {
  const d2 = JSON.parse(JSON.stringify(docPlain));
  d2.mode.light.neutral.elevation = d2.mode.light.neutral.elevation || {};
  d2.mode.light.neutral.elevation.stack = { $type: 'shadow', $value: { color: '{core.core-colours.error}', offsetX: 0, offsetY: 1, blur: 2, spread: 0 } };
  const r = roundTrip(d2);
  assert.ok(r.out.ok);
  assert.ok(r.t.report.skipped.composites >= 1);
});

// ── 6. what Figma will accept on a write ─────────────────────────────────
/* A Figma that refuses a scope it does not know, as the real one does: on the
   first real import, FONT_VARIATIONS (which a file READS) was refused on a
   WRITE and stopped the run 2,870 operations in. */
const VALID = new Set(['ALL_SCOPES', 'TEXT_CONTENT', 'CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'ALL_FILLS', 'FRAME_FILL',
  'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'STROKE_FLOAT', 'EFFECT_FLOAT', 'EFFECT_COLOR', 'OPACITY',
  'FONT_FAMILY', 'FONT_STYLE', 'FONT_WEIGHT', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT']);
function strictFigma(opts) {
  opts = opts || {};
  let seq = 0; const made = []; const textStyles = []; const effectStyles = [];
  const loaded = new Set(); const gridStyles = [];
  const FLOAT_TEXT = ['fontSize', 'letterSpacing', 'lineHeight', 'paragraphSpacing', 'paragraphIndent', 'fontWeight'];
  return {
    made, textStyles, effectStyles, gridStyles, loaded,
    /* Fonts: a text style can only be given one that is loaded; loading is async. */
    loadFontAsync: async (f) => {
      if (opts.missingFonts && opts.missingFonts.indexOf(f.family + ' ' + f.style) !== -1) throw new Error('font not available');
      loaded.add(f.family + ' ' + f.style);
    },
    getLocalTextStylesAsync: async () => (opts.existingText ? [{}] : textStyles.slice()),
    getLocalEffectStylesAsync: async () => effectStyles.slice(),
    createTextStyle() {
      let fontName = { family: 'Inter', style: 'Regular' };
      const st = { name: '', description: '', boundVariables: {}, textCase: 'ORIGINAL', textDecoration: 'NONE',
        get fontName() { return fontName; },
        set fontName(f) { if (!loaded.has(f.family + ' ' + f.style)) throw new Error('font is not loaded: ' + f.family + ' ' + f.style); fontName = f; },
        setBoundVariable(field, v) {
          if (opts.refuseField === field) throw new Error('refused binding ' + field);
          const type = field === 'fontFamily' || field === 'fontStyle' ? 'STRING' : FLOAT_TEXT.indexOf(field) !== -1 ? 'FLOAT' : null;
          if (!type) throw new Error('not a bindable text field: ' + field);
          if (v.resolvedType !== type) throw new Error(field + ' needs a ' + type + ' variable, got ' + v.resolvedType);
          this.boundVariables[field] = { type: 'VARIABLE_ALIAS', id: v.id };
        } };
      textStyles.push(st); return st;
    },
    createEffectStyle() { const st = { name: '', description: '', effects: [] }; effectStyles.push(st); return st; },
    getLocalGridStylesAsync: async () => (opts.existingGrid ? [{}] : gridStyles.slice()),
    createGridStyle() { const st = { name: '', description: '', layoutGrids: [] }; gridStyles.push(st); return st; },
    variables: {
      setBoundVariableForLayoutGrid(grid, field, v) {
        if (['sectionSize', 'count', 'offset', 'gutterSize'].indexOf(field) === -1) throw new Error('not a bindable grid field: ' + field);
        if (v.resolvedType !== 'FLOAT') throw new Error(field + ' needs a FLOAT variable, got ' + v.resolvedType);
        return Object.assign({}, grid, { boundVariables: Object.assign({}, grid.boundVariables, { [field]: { type: 'VARIABLE_ALIAS', id: v.id } }) });
      },
      setBoundVariableForEffect(effect, field, v) {
        const type = field === 'color' ? 'COLOR' : ['radius', 'spread', 'offsetX', 'offsetY'].indexOf(field) !== -1 ? 'FLOAT' : null;
        if (!type) throw new Error('not a bindable effect field: ' + field);
        if (v.resolvedType !== type) throw new Error(field + ' needs a ' + type + ' variable, got ' + v.resolvedType);
        return Object.assign({}, effect, { boundVariables: Object.assign({}, effect.boundVariables, { [field]: { type: 'VARIABLE_ALIAS', id: v.id } }) });
      },
      createVariableCollection(name) {
        const col = { id: 'c' + ++seq, name, vars: [], modes: [{ modeId: 'm' + ++seq, name: 'Mode 1' }],
          get defaultModeId() { return this.modes[0].modeId; },
          renameMode(id, n) { this.modes.find((m) => m.modeId === id).name = n; },
          addMode(n) { const id = 'm' + ++seq; this.modes.push({ modeId: id, name: n }); return id; } };
        made.push(col); return col;
      },
      createVariable(name, col, type) {
        let scopes = ['ALL_SCOPES'];                 // what Figma gives a new variable
        const v = { id: 'v' + ++seq, name, resolvedType: type, description: '', valuesByMode: {},
          get scopes() { return scopes; },
          set scopes(list) {
            list.forEach((x, i) => { if (!VALID.has(x)) throw new Error('Property "scopes" failed validation: Invalid option at index ' + i); });
            scopes = list.slice();
          },
          setValueForMode(mid, val) { this.valuesByMode[mid] = val; } };
        col.vars.push(v); return v;
      },
      createVariableAlias(v) { return { type: 'VARIABLE_ALIAS', id: v.id }; },
      getLocalVariableCollectionsAsync: async () => made.slice(),
    },
  };
}
ok('a scope Figma reads but will not write is left out and counted — the import does not stop', async () => {
  const F = strictFigma();
  await preflight(rt.out.program, F, { probeCeiling: false });          // loads the fonts, as the plugin does first
  const rep = apply(rt.out.program, F, {});
  assert.strictEqual(rep.failed, 0, JSON.stringify(rep.errors[0]));
  assert.ok(rep.scopesDropped && rep.scopesDropped.FONT_VARIATIONS > 0);
  assert.ok(!rep.scopesFailed);
  assert.strictEqual(rep.variables, rt.out.stats.variables);
  assert.ok(rep.values > 0 && rep.aliases > 0, 'values and aliases were written');
});
ok('what it does write is what the graph had, minus the unwritable scope', async () => {
  const F = strictFigma();
  await preflight(rt.out.program, F, { probeCeiling: false });
  apply(rt.out.program, F, {});
  const got = {};
  F.made.forEach((c) => c.vars.forEach((v) => { got[c.name + '|' + v.name.toLowerCase()] = v.scopes.slice().sort().join(); }));
  const bad = [];
  clean.forEach((c) => c.variables.forEach((v) => {
    const want = v.scopes.filter((x) => x !== 'FONT_VARIATIONS').sort().join();
    const k = c.name + '|' + v.name.toLowerCase();
    if (got[k] !== want) bad.push(k + ' want [' + want + '] got [' + got[k] + ']');
  }));
  assert.deepStrictEqual(bad, []);
});
ok('a variable whose only scope is unwritable keeps the default rather than becoming hidden', () => {
  const prog = { version: 1, source: 'x', ops: [
    { op: 'createCollection', collection: 'c', firstMode: 'm' },
    { op: 'createVariable', collection: 'c', name: 'a', type: 'FLOAT', scopes: ['FONT_VARIATIONS'] },
    { op: 'createVariable', collection: 'c', name: 'b', type: 'FLOAT', scopes: [] },
  ] };
  const F = strictFigma();
  const rep = apply(prog, F, {});
  assert.strictEqual(rep.failed, 0);
  const vars = F.made[0].vars;
  assert.deepStrictEqual(vars.find((v) => v.name === 'a').scopes, ['ALL_SCOPES']);   // untouched: Figma's default
  assert.deepStrictEqual(vars.find((v) => v.name === 'b').scopes, []);               // an explicit empty list is kept
  assert.strictEqual(rep.scopesDropped.FONT_VARIATIONS, 1);
});

// ── 7. the styles an import creates ──────────────────────────────────────
ok('style ops come last, after every value and alias they could be bound to', () => {
  const ops = rt.out.program.ops;
  const first = ops.findIndex((o) => /^create(Text|Effect|Grid)Style$/.test(o.op));
  const lastValue = ops.map((o) => o.op).lastIndexOf('setAlias');
  assert.ok(first > lastValue && first !== -1);
  assert.ok(ops.slice(first).every((o) => /^create(Text|Effect|Grid)Style$/.test(o.op)));
});
ok('compile counts the styles, and a binding to a variable that is not created is dropped and counted', () => {
  assert.deepStrictEqual(rt.out.stats.styles, { text: 2, effect: 1, grid: 1, bindingsSkipped: 0 });
  /* the grid\'s binding to a variable that does not exist never reaches compile: the translator reports and drops it */
  assert.ok(rt.t.report.styles.bindingsMissing.some((m) => /Grid/.test(m) && /grid\/gone/.test(m)));
});
ok('apply creates the styles with their definition, and binds each field to the variable it names', async () => {
  const F = strictFigma();
  await F.loadFontAsync({ family: 'Inter', style: 'Bold' }); await F.loadFontAsync({ family: 'Inter', style: 'Medium' });
  const rep = apply(rt.out.program, F, {});
  assert.strictEqual(rep.failed, 0, JSON.stringify(rep.errors[0]));
  assert.strictEqual(F.textStyles.length, 2); assert.strictEqual(F.effectStyles.length, 1);
  const t = F.textStyles.find((x) => x.name === 'Link A Bold');
  assert.deepStrictEqual(t.fontName, { family: 'Inter', style: 'Bold' });
  assert.strictEqual(t.textDecoration, 'UNDERLINE');
  assert.deepStrictEqual(Object.keys(t.boundVariables).sort(), ['fontSize', 'paragraphIndent']);
  const e = F.effectStyles[0].effects[0];
  assert.deepStrictEqual([F.effectStyles[0].name, e.type, e.radius, e.spread], ['elevation/FAB/standard', 'DROP_SHADOW', 8, 1]);
  assert.deepStrictEqual(Object.keys(e.boundVariables).sort(), ['color', 'offsetX']);
  assert.deepStrictEqual(e.color, { r: 0, g: 0, b: 0, a: 0.13 });
  assert.strictEqual(rep.styleBindings, 7);           // 2 + 1 on the text styles, 2 on the effect, 2 on the grid
});
ok('a binding Figma refuses costs that field its binding — not the style, not the import', async () => {
  const F = strictFigma({ refuseField: 'fontSize' });
  await F.loadFontAsync({ family: 'Inter', style: 'Bold' }); await F.loadFontAsync({ family: 'Inter', style: 'Medium' });
  const rep = apply(rt.out.program, F, {});
  assert.strictEqual(rep.failed, 0);
  assert.ok(rep.styleBindingsFailed >= 2);
  assert.strictEqual(F.textStyles.length, 2);
});
ok('preflight loads the fonts the styles need, before anything is written', async () => {
  const F = strictFigma();
  const pre = await preflight(rt.out.program, F, { probeCeiling: false });
  assert.ok(pre.ok, JSON.stringify(pre.problems));
  assert.ok(F.loaded.has('Inter Bold') && F.loaded.has('Inter Medium'));
});
ok('a missing font refuses the whole import and says which', async () => {
  const F = strictFigma({ missingFonts: ['Inter Medium'] });
  const pre = await preflight(rt.out.program, F, { probeCeiling: false });
  assert.strictEqual(pre.ok, false);
  const p = pre.problems.find((x) => x.kind === 'font-missing');
  assert.ok(p && /Inter Medium/.test(p.message));
});
ok('a file that already has styles is refused, rather than given a second set', async () => {
  const F = strictFigma({ existingText: true });
  const pre = await preflight(rt.out.program, F, { probeCeiling: false });
  assert.strictEqual(pre.ok, false);
  assert.ok(pre.problems.some((x) => x.kind === 'styles-exist'));
});
ok('a program with no styles asks nothing about fonts or styles', async () => {
  const noStyles = { version: 1, source: 'x', ops: rt.out.program.ops.filter((o) => !/^create(Text|Effect|Grid)Style$/.test(o.op)) };
  const F = strictFigma({ existingText: true, missingFonts: ['Inter Bold'] });
  const pre = await preflight(noStyles, F, { probeCeiling: false });
  assert.ok(pre.ok);
});

// ── the grid style ───────────────────────────────────────────────────────
ok('the section carries the grid style: exact name, each layout grid with its pattern, alignment, colour and bound variables', () => {
  const g = doc.$extensions[NS_].restore.styles.grid[0];
  assert.strictEqual(g.name, 'Grid');
  assert.deepStrictEqual(g.layoutGrids[0].alignment, 'STRETCH');
  assert.deepStrictEqual(g.layoutGrids[1].alignment, 'CENTER');
  assert.deepStrictEqual(g.layoutGrids[0].color, [0.3, 0.88, 0.69, 0.1]);
  assert.strictEqual(g.layoutGrids[0].bound.gutterSize, 'foundation::grid/gutters');
});
ok('the translator reads it, with bindings resolved — and there is no grid without the section', () => {
  const g = rt.t.ir.styles.grid[0];
  assert.deepStrictEqual(g.layoutGrids[0].bound.gutterSize, { collection: 'foundation', name: 'grid/gutters' });
  assert.deepStrictEqual(g.layoutGrids[0].bound.count, { collection: '.breakpoint', name: 'breakpoint/columns/1-columns' });
  assert.ok(!('sectionSize' in g.layoutGrids[1].bound));
  /* and without it the architecture's pattern makes the grid, bound where the file has the variable */
  const plain = R.translate(docPlain);
  assert.strictEqual(plain.ir.styles.grid.length, 1);
  assert.deepStrictEqual(plain.ir.styles.grid[0].layoutGrids.some((l) => l.bound.gutterSize && l.bound.gutterSize.name === 'grid/gutters'), true);
});
ok('apply writes the grid with its binding on each field, and a file that already has a grid style is refused', async () => {
  const F = strictFigma();
  await preflight(rt.out.program, F, { probeCeiling: false });
  apply(rt.out.program, F, {});
  const g = F.gridStyles[0];
  assert.strictEqual(g.layoutGrids.length, 2);
  assert.deepStrictEqual(Object.keys(g.layoutGrids[0].boundVariables).sort(), ['count', 'gutterSize']);
  assert.deepStrictEqual(g.layoutGrids[0].color, { r: 0.3, g: 0.88, b: 0.69, a: 0.1 });
  const pre = await preflight(rt.out.program, strictFigma({ existingGrid: true }), { probeCeiling: false });
  assert.ok(pre.problems.some((x) => x.kind === 'styles-exist' && /grid/.test(x.message)));
});

// ── 9. what the import panel is told ─────────────────────────────────────
ok('style ops do not make a collection: the panel counts 11 new collections, none called undefined', () => {
  const report = Diff.diff([], rt.out.program);
  assert.strictEqual(report.collections.added.length, 11);
  assert.ok(report.collections.added.every((n) => typeof n === 'string' && n.length));
  assert.strictEqual(report.summary.willCreateCollections, 11);
});
ok('the panel is told which styles will arrive, by kind, and that they are something to do', () => {
  const report = Diff.diff([], rt.out.program);
  assert.deepStrictEqual(report.styles.text, ['Link A Bold', 'Plain']);
  assert.deepStrictEqual(report.styles.effect, ['elevation/FAB/standard']);
  assert.deepStrictEqual(report.styles.grid, ['Grid']);
  assert.strictEqual(report.summary.willCreateStyles, 4);
  assert.strictEqual(report.summary.noop, false);
});
ok('a program with no styles reports none, and is not counted as having something to do for their sake', () => {
  const noStyles = { version: 1, source: 'x', ops: rt.out.program.ops.filter((o) => !/^create(Text|Effect|Grid)Style$/.test(o.op)) };
  const again = Diff.diff([], noStyles);
  assert.strictEqual(again.summary.willCreateStyles, 0);
  assert.deepStrictEqual(again.styles, { text: [], effect: [], grid: [] });
});

// ── 8. the filter in front of apply() ────────────────────────────────────
/* The import page cuts the program down to what the diff justified before it
   runs it. A style has no diff row, so the first real import of styles lost
   every one of them in the "everything" scope — after a summary that had said
   how many it would create. */
const isStyle = (o) => /^create(Text|Effect|Grid)Style$/.test(o.op);
ok('the "everything" scope keeps every style, in the program\'s order, after the variables', () => {
  const report = Diff.diff([], rt.out.program);
  const cut = Filter.filter(rt.out.program, report, { scope: 'all' });
  assert.strictEqual(cut.program.ops.filter(isStyle).length, rt.out.program.ops.filter(isStyle).length);
  assert.strictEqual(cut.stats.styles, 4);
  const firstStyle = cut.program.ops.findIndex(isStyle);
  assert.ok(cut.program.ops.slice(0, firstStyle).every((o) => !isStyle(o)));
  assert.ok(cut.program.ops.slice(firstStyle).every(isStyle));
});
ok('"only values" never writes a style', () => {
  const report = Diff.diff([], rt.out.program);
  const cut = Filter.filter(rt.out.program, report, { scope: 'values' });
  assert.strictEqual(cut.program.ops.filter(isStyle).length, 0);
});
ok('what the filter leaves, apply writes: the styles exist afterwards', async () => {
  const report = Diff.diff([], rt.out.program);
  const cut = Filter.filter(rt.out.program, report, { scope: 'all' });
  const F = strictFigma();
  await preflight(cut.program, F, { probeCeiling: false });
  const rep = apply(cut.program, F, {});
  assert.strictEqual(rep.failed, 0, JSON.stringify(rep.errors[0]));
  assert.strictEqual(F.textStyles.length, 2);
  assert.strictEqual(F.effectStyles.length, 1);
  assert.strictEqual(F.gridStyles.length, 1);
});

/* A palette cell that is a bare colour goes back to an alias when exactly one
   core colour holds that value — and only then. */
ok('a literal palette colour is relinked to the one core colour that has it', () => {
  const base = JSON.parse(JSON.stringify(doc));
  const hex = '#3d5ce4';
  const cv = (h) => ({ colorSpace: 'srgb', components: [0, 0, 0], alpha: 1, hex: h });
  base.core['core-colours']['relink-a'] = { $type: 'color', $value: cv(hex) };
  base.mode.light.brand.basic.background = { $type: 'color', $value: cv(hex) };
  const on = R.translate(base, {});
  const off = R.translate(base, { relinkColours: false });
  const cellOf = (r) => r.ir.rows.find((x) => x.set === '.brand' && x.path === 'brand-light.basic.background');
  assert.deepStrictEqual(cellOf(on).value, { ref: 'core-colours.relink-a', refCol: '.core' });
  assert.ok(cellOf(off).value.literal);
  assert.ok(on.report.relinked.linked >= 1);
});
ok('two core colours with the same value leave the cell a literal, and say so', () => {
  const base = JSON.parse(JSON.stringify(doc));
  const cv = { colorSpace: 'srgb', components: [0, 0, 0], alpha: 1, hex: '#abcdef' };
  base.core['core-colours']['dup-a'] = { $type: 'color', $value: cv };
  base.core['core-colours']['dup-b'] = { $type: 'color', $value: cv };
  base.mode.light.brand.basic.background = { $type: 'color', $value: cv };
  const r = R.translate(base, {});
  const cell = r.ir.rows.find((x) => x.set === '.brand' && x.path === 'brand-light.basic.background');
  assert.ok(cell.value.literal);
  assert.ok(r.report.relinked.ambiguous >= 1);
});

ok('a core scale that something references is a real token, not a synthesised one', () => {
  const d2 = JSON.parse(JSON.stringify(docPlain));
  d2.core.letterspacing = { '0': { $type: 'number', $value: -0.05 }, '1': { $type: 'number', $value: -0.04 } };
  const bp = Object.keys(d2.breakpoint)[0];
  d2.breakpoint[bp].typography = d2.breakpoint[bp].typography || {};
  d2.breakpoint[bp].typography.display = d2.breakpoint[bp].typography.display || {};
  d2.breakpoint[bp].typography.display['letter-spacing'] = { $type: 'number', $value: '{core.letterspacing.1}' };
  const t = R.translate(d2);
  assert.ok(t.ok);
  const names = t.ir.rows.filter((x) => x.set === '.core').map((x) => x.path);
  assert.ok(names.indexOf('letterspacing.1') !== -1, 'the referenced step is written');
  assert.ok(names.indexOf('letterspacing.0') === -1, 'the unreferenced step is still skipped');
});

// ── the restore section, reduced to what the rules cannot say ─────────────
const Slim = require('../src/restore-slim.js');
function deepDiffs(a, b, p, out) {
  if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-3) out.push(p); return out; }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    new Set(Object.keys(a).concat(Object.keys(b))).forEach((k) => deepDiffs(a[k], b[k], p + '.' + k, out));
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push(p);
  return out;
}
const slimmed = Slim.slim(doc);
ok('slimming keeps the architecture and drops what the rules reproduce', () => {
  assert.ok(slimmed.slimmed);
  const r = slimmed.document.$extensions[NS_].restore;
  assert.ok(r.architecture);
  assert.ok(!('collections' in r) && !('synthesized' in r));
  /* the structure record is the file itself and is kept whole; the rest must still halve */
  const keep = JSON.stringify(r.structure || {}).length;
  assert.ok(slimmed.after - keep < (slimmed.before - keep) / 2, slimmed.before + ' -> ' + slimmed.after + ' (structure ' + keep + ')');
});
ok('the slimmed document imports to the same variables, scopes and styles as the full one', () => {
  const full = R.translate(doc), lean = R.translate(slimmed.document);
  assert.ok(lean.ok);
  const key = (x) => JSON.stringify([x.set, x.path, x.variant, x.value, x.scopes]);
  assert.deepStrictEqual(lean.ir.rows.map(key).sort(), full.ir.rows.map(key).sort());
  const out = [];
  ['text', 'effect', 'grid'].forEach((k) => {
    assert.strictEqual(lean.ir.styles[k].length, full.ir.styles[k].length, k);
    full.ir.styles[k].forEach((s) => {
      const t = lean.ir.styles[k].find((q) => q.name === s.name);
      assert.ok(t, k + ': ' + s.name);
      deepDiffs(s, t, k + ':' + s.name, out);
    });
  });
  assert.deepStrictEqual(out, []);
});
ok('a value the document changed since is the document\'s, not the record\'s', () => {
  const d2 = JSON.parse(JSON.stringify(slimmed.document));
  const bp = Object.keys(d2.breakpoint)[0];
  const leafPath = 'spacing.component.0';
  const leaf = d2.breakpoint[bp].spacing.component['0'];
  assert.ok(leaf && '$value' in leaf, 'fixture has the breakpoint token');
  const find = (d) => R.translate(d).ir.rows.find((x) => x.set === '.breakpoint' && x.path.replace(/^breakpoint\./, '') === leafPath && x.variant === A.breakpointMode(bp));
  const before = find(slimmed.document);
  leaf.$value = 98765;
  const after = find(d2);
  assert.ok(before && after, 'rows found for ' + leafPath + ' (' + R.translate(d2).ir.rows.filter((x) => x.set === '.breakpoint').slice(0, 2).map((x) => x.path + '|' + x.variant) + ')');
  assert.notDeepStrictEqual(before.value, after.value);
});
ok('a document with no restore section is left as it is', () => {
  const r = Slim.slim(docPlain);
  assert.strictEqual(r.slimmed, false);
  assert.strictEqual(r.document, docPlain);
});
ok('the architecture\'s rules make the underline, the upper-case acronym, and a grid style on their own', () => {
  assert.ok(A.UNDERLINED_PREFIX && A.ACRONYMS.indexOf('fab') !== -1 && A.GRID_STYLE.grids.length === 3);
  assert.strictEqual(R.translate(docPlain).ir.styles.grid.length, 1);
});

ok('a fractional size goes back to the core font size that names it; a line height with the same number does not', () => {
  const d2 = JSON.parse(JSON.stringify(docPlain));
  const bp = Object.keys(d2.breakpoint)[0];
  d2.core['font-sizes'] = d2.core['font-sizes'] || {};
  d2.core['font-sizes']['87-111'] = { $type: 'number', $value: 87.111 };
  d2.breakpoint[bp].typography = d2.breakpoint[bp].typography || {};
  d2.breakpoint[bp].typography.display = d2.breakpoint[bp].typography.display || {};
  d2.breakpoint[bp].typography.display.size = { $type: 'number', $value: 87.111 };
  d2.breakpoint[bp].typography.display['line-height'] = { $type: 'number', $value: 87.111 };
  const t = R.translate(d2);
  const cell = (leafName) => t.ir.rows.find((x) => x.set === '.breakpoint' && x.path === 'breakpoint.typography.display.' + leafName && x.variant === A.breakpointMode(bp));
  assert.deepStrictEqual(cell('size').value, { ref: 'font-sizes.87-111', refCol: '.core' });
  assert.ok(cell('line-height').value.literal !== undefined);
  assert.ok(t.report.relinked.numbers.linked >= 1);
  const off = R.translate(d2, { relinkColours: false });
  assert.ok(off.ir.rows.find((x) => x.set === '.breakpoint' && x.path === 'breakpoint.typography.display.size' && x.variant === A.breakpointMode(bp)).value.literal !== undefined);
});
ok('a round number is never relinked by value', () => {
  const t = R.translate(docPlain);
  assert.strictEqual(t.report.relinked.numbers.linked, 0);
});
ok('an ambiguous colour is named in the report with its candidates', () => {
  const base = JSON.parse(JSON.stringify(doc));
  const cv = { colorSpace: 'srgb', components: [0, 0, 0], alpha: 1, hex: '#abcdef' };
  base.core['core-colours']['dup-a'] = { $type: 'color', $value: cv };
  base.core['core-colours']['dup-b'] = { $type: 'color', $value: cv };
  base.mode.light.brand.basic.background = { $type: 'color', $value: cv };
  const r = R.translate(base, {});
  const c = r.report.relinked.ambiguousCells.find((x) => /background/.test(x.cell));
  assert.ok(c, 'the cell is listed');
  assert.deepStrictEqual(c.candidates.sort(), ['core-colours/dup-a', 'core-colours/dup-b']);
});
ok('a variable with a value in some modes and not others is reported', () => {
  const d2 = JSON.parse(JSON.stringify(docPlain));
  const bps = Object.keys(d2.breakpoint);
  const path = ['spacing', 'component', '0'];
  const last = bps[bps.length - 1];
  let o = d2.breakpoint[last]; for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  assert.ok(o[path[path.length - 1]], 'fixture has the token');
  delete o[path[path.length - 1]];
  const t = R.translate(d2);
  const h = t.report.holes.find((x) => x.name === 'breakpoint/spacing/component/0');
  assert.ok(h, JSON.stringify(t.report.holes));
  assert.deepStrictEqual(h.modes, [A.breakpointMode(last)]);
});

ok('a colour that fits two core colours takes the one its sibling schemes link that cell to', () => {
  const base = JSON.parse(JSON.stringify(doc));
  const cv = { colorSpace: 'srgb', components: [0, 0, 0], alpha: 1, hex: '#abcdef' };
  base.core['core-colours']['dup-a'] = { $type: 'color', $value: cv };
  base.core['core-colours']['dup-b'] = { $type: 'color', $value: cv };
  base.mode.light.brand.basic.background = { $type: 'color', $value: cv };
  base.mode.light.neutral.basic.background = { $type: 'color', $value: '{core.core-colours.dup-b}' };
  const r = R.translate(base, {});
  const cellRow = r.ir.rows.find((x) => x.set === '.brand' && x.path === 'brand-light.basic.background');
  assert.deepStrictEqual(cellRow.value, { ref: 'core-colours.dup-b', refCol: '.core' });
  assert.ok(r.report.relinked.bySibling >= 1);
  assert.ok(!r.report.relinked.ambiguousCells.some((x) => /background/.test(x.cell)));
});

ok('a colour that is only NEARLY a core colour is never linked: only identical values are', () => {
  const base = JSON.parse(JSON.stringify(doc));
  const cv = (hex, c) => ({ colorSpace: 'srgb', components: [c, c, c], alpha: 1, hex });
  base.core['core-colours']['near-a'] = { $type: 'color', $value: cv('#212121', 0.1294) };
  base.mode.light.brand.basic.background = { $type: 'color', $value: cv('#222222', 0.1333) };   // one step off
  base.mode.light.brand.basic.text = { $type: 'color', $value: cv('#212121', 0.1294) };         // identical
  const r = R.translate(base, {});
  const row = (n) => r.ir.rows.find((x) => x.set === '.brand' && x.path === 'brand-light.basic.' + n);
  assert.ok(row('background').value.literal !== undefined, 'one step off stays a value');
  assert.deepStrictEqual(row('text').value, { ref: 'core-colours.near-a', refCol: '.core' });
  /* same for a number: 22.9 is not 22.87 */
  assert.ok(r.report.relinked.noneCells.some((c) => /background/.test(c)));
});


ok('core groups the per-theme export looks up in camel case get their capitals back, and only those', () => {
  const d2 = JSON.parse(JSON.stringify(docPlain));
  d2.core.fontfamilies = { inter: { $type: 'text', $value: 'Inter' } };
  d2.core.paragraphspacing = { '0': { $type: 'number', $value: 0 } };
  d2.core.paragraphindent = { '0': { $type: 'number', $value: 0 } };
  d2.core['font-family'] = d2.core['font-family'] || { inter: { $type: 'text', $value: 'Inter' } };
  const bp = Object.keys(d2.breakpoint)[0];
  d2.breakpoint[bp].typography = d2.breakpoint[bp].typography || {};
  d2.breakpoint[bp].typography.display = d2.breakpoint[bp].typography.display || {};
  d2.breakpoint[bp].typography.display['font-family'] = { $type: 'text', $value: '{core.fontfamilies.inter}' };
  const t = R.translate(d2);
  assert.ok(t.ok);
  const names = t.ir.rows.filter((x) => x.set === '.core').map((x) => x.path);
  assert.ok(names.indexOf('fontFamilies.inter') !== -1, names.filter((n) => /font/i.test(n)).join(','));
  assert.ok(names.indexOf('paragraphSpacing.0') !== -1);
  assert.ok(names.indexOf('paragraphIndent.0') !== -1);
  assert.ok(names.indexOf('font-family.inter') !== -1, 'a dash group keeps its name');
  const cell = t.ir.rows.find((x) => x.set === '.breakpoint' && /typography\.display\.font-family$/.test(x.path));
  assert.deepStrictEqual(cell.value, { ref: 'fontFamilies.inter', refCol: '.core' });
});


// ── Send to Figma / Bring from Figma: the same documents, moved one way ───
const SA = require('../src/studio-apply.js');
const firstNumber = (d, root) => { for (const [name, t] of SA.tokensOf(d)) if (name.indexOf(root + '.') === 0 && typeof t.node.$value === 'number' && t.node.$value !== 0) return name; return null; };
ok('apply: a Studio change is the only write, and a document with no change writes nothing', () => {
  const name = firstNumber(docPlain, 'core');
  assert.ok(name, 'the miniature has a core number');
  const studio = JSON.parse(JSON.stringify(docPlain));
  SA.tokensOf(studio).get(name).node.$value += 5;
  const none = SA.planApply(docPlain, docPlain, [], clean);
  assert.strictEqual(none.ok, true);
  assert.strictEqual(none.writes, 0);
  const one = SA.planApply(docPlain, studio, [name], clean);
  assert.strictEqual(one.ok, true, one.reason);
  assert.strictEqual(one.moved, 1);
  assert.strictEqual(one.writes, 1, 'exactly the one value moves; the round trip adds no noise of its own');
  const op = one.program.ops.find((o) => o.op === 'setValue');
  assert.strictEqual(op.collection, '.core');
  assert.strictEqual(String(op.value), String(SA.tokensOf(studio).get(name).node.$value));
});
ok('apply: a token the Studio removed is skipped, never deleted', () => {
  const name = firstNumber(docPlain, 'core');
  const studio = JSON.parse(JSON.stringify(docPlain));
  const segs = SA.tokensOf(studio).get(name).segs;
  delete segs.slice(0, -1).reduce((o, k) => o[k], studio)[segs[segs.length - 1]];
  const r = SA.planApply(docPlain, studio, [name], clean);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.skipped, [name]);
  assert.strictEqual(r.writes, 0);
});
ok('apply: a document the architecture does not recognise is refused with the reason', () => {
  const r = SA.planApply({ core: { a: { $type: 'number', $value: 1 } } }, { core: { a: { $type: 'number', $value: 2 } } }, ['core.a'], clean);
  assert.strictEqual(r.ok, false);
  assert.ok(/Studio/.test(r.reason));
});
ok('read: the Figma value goes into the Studio file, rounded, and nothing else moves', () => {
  const name = firstNumber(docPlain, 'core');
  const figma = JSON.parse(JSON.stringify(docPlain));
  SA.tokensOf(figma).get(name).node.$value = 22.870001;
  const r = SA.readText(docPlain, figma, [name]);
  assert.ok(r.text.endsWith('\n'));
  const out = JSON.parse(r.text);
  assert.strictEqual(SA.tokensOf(out).get(name).node.$value, 22.87);
  const before = JSON.parse(JSON.stringify(docPlain)); SA.tokensOf(before).get(name).node.$value = 22.87;
  assert.deepStrictEqual(out, before);
});
ok('read: a token Figma added arrives whole, and one Figma removed leaves, with its empty group', () => {
  const name = firstNumber(docPlain, 'core');
  const figma = JSON.parse(JSON.stringify(docPlain));
  figma.core.brandnew = { x: { $type: 'number', $value: 7 } };
  const segs = SA.tokensOf(figma).get(name).segs;
  delete segs.slice(0, -1).reduce((o, k) => o[k], figma)[segs[segs.length - 1]];
  const out = JSON.parse(SA.readText(docPlain, figma, ['core.brandnew.x', name]).text);
  assert.strictEqual(out.core.brandnew.x.$value, 7);
  assert.strictEqual(SA.tokensOf(out).has(name), false);
});
ok('a reply under the limit is one message; over it, pieces that join back', () => {
  const small = { type: 'read', id: '1', text: 'abc' };
  assert.deepStrictEqual(SA.chunkReply(small, 10, 4), [small]);
  const big = { type: 'read', id: '2', text: 'abcdefghij'.repeat(5) };
  const parts = SA.chunkReply(big, 10, 8);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((x) => x.id === '2' && x.type === 'read' && x.chunks === parts.length && !('text' in x)));
  assert.deepStrictEqual(parts.map((x) => x.chunk), parts.map((_, i) => i));
  assert.strictEqual(parts.map((x) => x.data).join(''), big.text);
});

Promise.all(queue).then(() => console.log('\n' + passed + ' passed'));
