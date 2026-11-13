#!/usr/bin/env node
/*
  styles-capture-selftest.js — a style is read as a definition, and a bound
  variable is named, not numbered.
*/
const assert = require('assert');
const S = require('../src/styles-capture.js');

// a mock of the parts of the Plugin API the reader touches
const collections = { 'C:f': { id: 'C:f', name: 'foundation' }, 'C:b': { id: 'C:b', name: '.breakpoint' } };
const variables = {
  'V:size': { id: 'V:size', name: 'typography/link-M-bold/size', variableCollectionId: 'C:f' },
  'V:lh': { id: 'V:lh', name: 'typography/link-M-bold/line-height', variableCollectionId: 'C:f' },
  // the live file: a style binds an id the LOCAL list does not hold, which Figma still resolves by name
  'V:stale': { id: 'V:stale', name: 'typography/link-M-bold/paragraph-indent', variableCollectionId: 'C:f' },
  'V:colour': { id: 'V:colour', name: 'elevation/FAB/standard/colour', variableCollectionId: 'C:f' },
  'V:blur': { id: 'V:blur', name: 'elevation/FAB/standard/blur', variableCollectionId: 'C:f' },
  'V:margins': { id: 'V:margins', name: 'grid/margins', variableCollectionId: 'C:f' },
  'V:gutters': { id: 'V:gutters', name: 'grid/gutters', variableCollectionId: 'C:f' },
  'V:cols': { id: 'V:cols', name: 'breakpoint/stretch-grid/columns', variableCollectionId: 'C:b' },
  'V:colw': { id: 'V:colw', name: 'breakpoint/fixed-grid/column-width', variableCollectionId: 'C:b' },
};
const alias = (id) => ({ type: 'VARIABLE_ALIAS', id });
const figmaMock = {
  variables: {
    getVariableByIdAsync: async (id) => variables[id] || null,
    getVariableCollectionByIdAsync: async (id) => collections[id] || null,
  },
  getLocalTextStylesAsync: async () => [{
    id: 'S:1', name: 'Link M Bold', description: '', fontName: { family: 'Inter', style: 'Bold' },
    textCase: 'ORIGINAL', textDecoration: 'UNDERLINE', fontSize: 16,
    lineHeight: { unit: 'PIXELS', value: 15.600000381469727 }, letterSpacing: { unit: 'PIXELS', value: 0 },
    paragraphSpacing: 0, paragraphIndent: 0,
    boundVariables: { fontSize: alias('V:size'), lineHeight: alias('V:lh'), paragraphIndent: alias('V:stale') },
  }, {
    id: 'S:2', name: 'Display', description: 'big', fontName: { family: 'Inter', style: 'Bold' },
    textCase: 'ORIGINAL', textDecoration: 'NONE', fontSize: 72,
    lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PERCENT', value: -1.5 }, paragraphSpacing: 0, paragraphIndent: 0,
    boundVariables: {},
  }],
  getLocalGridStylesAsync: async () => [{
    id: 'S:4', name: 'grid', description: '',
    layoutGrids: [
      { pattern: 'COLUMNS', alignment: 'STRETCH', count: 6, gutterSize: 4, offset: 24, visible: true,
        color: { r: 0.3, g: 0.88, b: 0.69, a: 0.1 },
        boundVariables: { offset: alias('V:margins'), count: alias('V:cols'), gutterSize: alias('V:gutters') } },
      { pattern: 'COLUMNS', alignment: 'CENTER', count: 0, sectionSize: 0, gutterSize: 0, visible: true,
        color: { r: 0.3, g: 0.88, b: 0.69, a: 0.1 }, boundVariables: { sectionSize: alias('V:colw') } },
    ],
  }],
  getLocalEffectStylesAsync: async () => [{
    id: 'S:3', name: 'elevation/FAB/standard', description: '',
    effects: [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.30000001192092896 }, offset: { x: 0, y: 4 }, radius: 8, spread: 1,
                visible: true, blendMode: 'NORMAL', showShadowBehindNode: false,
                boundVariables: { color: alias('V:colour'), radius: alias('V:blur') } }],
  }],
};

let passed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log('ok    ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

(async function () {
  const got = await S.capture(figmaMock);

  await ok('every text and effect style is read, with its id and name kept for the reference map', async () => {
    assert.deepStrictEqual(got.textStyles.map((s) => [s.id, s.name, s.type]), [['S:1', 'Link M Bold', 'TEXT'], ['S:2', 'Display', 'TEXT']]);
    assert.deepStrictEqual(got.effectStyles.map((s) => [s.id, s.name, s.type]), [['S:3', 'elevation/FAB/standard', 'EFFECT']]);
  });
  await ok('the definition is read, not just the name', async () => {
    const t = got.textStyles[0];
    assert.deepStrictEqual(t.fontName, { family: 'Inter', style: 'Bold' });
    assert.strictEqual(t.textDecoration, 'UNDERLINE');
    assert.strictEqual(t.values.fontSize, 16);
  });
  await ok('float noise is rounded, units are kept', async () => {
    assert.deepStrictEqual(got.textStyles[0].values.lineHeight, { unit: 'PIXELS', value: 15.6 });
    assert.deepStrictEqual(got.textStyles[1].values.lineHeight, { unit: 'AUTO' });
    assert.deepStrictEqual(got.textStyles[1].values.letterSpacing, { unit: 'PERCENT', value: -1.5 });
    assert.strictEqual(got.effectStyles[0].effects[0].color[3], 0.3);
  });
  await ok('a bound variable is named collection::name — including one whose id is not in the local list', async () => {
    assert.deepStrictEqual(got.textStyles[0].bound, {
      fontSize: 'foundation::typography/link-M-bold/size',
      lineHeight: 'foundation::typography/link-M-bold/line-height',
      paragraphIndent: 'foundation::typography/link-M-bold/paragraph-indent',
    });
  });
  await ok('a field that is not bound is left out, not written as null', async () => {
    assert.deepStrictEqual(got.textStyles[1].bound, {});
    assert.ok(!('fontWeight' in got.textStyles[0].bound));
  });
  await ok('an effect layer carries its shape and the variables bound to its fields', async () => {
    const e = got.effectStyles[0].effects[0];
    assert.strictEqual(e.type, 'DROP_SHADOW');
    assert.deepStrictEqual(e.offset, { x: 0, y: 4 });
    assert.deepStrictEqual([e.radius, e.spread, e.visible, e.blendMode], [8, 1, true, 'NORMAL']);
    assert.deepStrictEqual(e.bound, { color: 'foundation::elevation/FAB/standard/colour', radius: 'foundation::elevation/FAB/standard/blur' });
  });
  await ok('a grid style is read: each layout grid with the fields its pattern has, and the variables bound to them', async () => {
    const g = got.gridStyles[0];
    assert.deepStrictEqual([g.id, g.name, g.type], ['S:4', 'grid', 'GRID']);
    assert.deepStrictEqual(g.layoutGrids[0], { pattern: 'COLUMNS', visible: true, alignment: 'STRETCH', count: 6, gutterSize: 4, offset: 24,
      color: [0.3, 0.88, 0.69, 0.1],
      bound: { offset: 'foundation::grid/margins', count: '.breakpoint::breakpoint/stretch-grid/columns', gutterSize: 'foundation::grid/gutters' } });
    assert.ok(!('offset' in g.layoutGrids[1]));                       // a CENTER grid has a section size, not an offset
    assert.deepStrictEqual(g.layoutGrids[1].bound, { sectionSize: '.breakpoint::breakpoint/fixed-grid/column-width' });
  });
  await ok('a Plugin API without grid styles reads none rather than failing', async () => {
    const noGrid = Object.assign({}, figmaMock); delete noGrid.getLocalGridStylesAsync;
    const r = await S.capture(noGrid);
    assert.deepStrictEqual(r.gridStyles, []);
    assert.strictEqual(r.textStyles.length, 2);
  });
  await ok('a variable that cannot be resolved is left out and does not stop the read', async () => {
    const broken = Object.assign({}, figmaMock, { variables: { getVariableByIdAsync: async () => { throw new Error('gone'); }, getVariableCollectionByIdAsync: async () => null } });
    const r = await S.capture(broken);
    assert.deepStrictEqual(r.textStyles[0].bound, {});
    assert.strictEqual(r.textStyles.length, 2);
  });
  await ok('an API without the async getters is a rejection, so the caller can fall back', async () => {
    let rejected = false;
    try { await S.capture({ variables: {} }); } catch (e) { rejected = true; }
    assert.ok(rejected);
  });
  await ok('removeAll deletes every text, effect and grid style, counts them, and names one that refuses', async () => {
    const made = (kind, n, refuse) => Array.from({ length: n }, (_, i) => ({ name: kind + i, removed: false,
      remove() { if (refuse === i) throw new Error('locked'); this.removed = true; } }));
    const t = made('t', 3), e = made('e', 2), g = made('g', 1, 0);
    const r = await S.removeAll({ getLocalTextStylesAsync: async () => t, getLocalEffectStylesAsync: async () => e, getLocalGridStylesAsync: async () => g });
    assert.deepStrictEqual([r.text, r.effect, r.grid], [3, 2, 0]);
    assert.deepStrictEqual(r.failed, [{ name: 'g0', error: 'locked' }]);
    assert.ok(t.every((x) => x.removed) && e.every((x) => x.removed));
  });
  await ok('removeAll on a Plugin API without grid styles removes the rest', async () => {
    const t = [{ name: 'a', remove() { this.gone = true; } }];
    const r = await S.removeAll({ getLocalTextStylesAsync: async () => t, getLocalEffectStylesAsync: async () => [] });
    assert.strictEqual(r.text, 1); assert.strictEqual(r.grid, 0);
  });
  console.log('\n' + passed + ' passed');
})();
