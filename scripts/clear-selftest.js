#!/usr/bin/env node
/*
  clear-selftest.js — the sandbox's "clear the file" handler, run from the built
  code.js against a stub of the Plugin API (the same way import-selftest runs the
  extract handler).

  What it pins: variables and styles are separate choices; a style that refuses
  is counted and named; and the reply carries what is STILL in the file, counted
  after the removal, so the UI can say "not everything was cleared" instead of a
  success the file does not bear out.
*/
const assert = require('assert');
const fs = require('fs'), vm = require('vm');
const path = require('path');
const built = path.join(__dirname, '..', 'code.js');

async function run(msg, opts) {
  opts = opts || {};
  const state = { collections: 2, text: 3, effect: 2, grid: 1 };
  if (opts.names) { state.names = opts.names.slice(); state.collections = state.names.length; }
  const mkStyles = (kind) => Array.from({ length: state[kind] }, (_, i) => ({
    name: kind + i,
    remove() { if (opts.lock === kind && i === 0) throw new Error('locked'); state[kind]--; },
  }));
  let posted = null;
  const notified = [];
  const quiet = () => {};
  const figma = {
    showUI: quiet, root: { name: 'Stub' }, on: quiet, notify: (t, o) => { notified.push({ t, o }); }, currentPage: { selection: [] },
    clientStorage: { getAsync: async () => null, setAsync: async () => {} },
    getLocalTextStyles: () => [], getLocalEffectStyles: () => [],
    getLocalTextStylesAsync: async () => mkStyles('text'),
    getLocalEffectStylesAsync: async () => mkStyles('effect'),
    getLocalGridStylesAsync: async () => mkStyles('grid'),
    variables: { getLocalVariableCollectionsAsync: async () => Array.from({ length: state.collections }, (_, i) => ({
      name: 'c' + (state.names ? state.names[i] : i), variableIds: ['a', 'b'],
      remove() { if (opts.keepCollections) return; state.collections--; if (state.names) state.names.splice(i, 1); } })) },
    ui: { onmessage: null, postMessage: (m) => { if (m.type === 'variablesCleared') posted = m; } },
  };
  const ctx = { figma, __html__: '', Promise, JSON, Object, Array, Map, Set, String, Number, Math, parseFloat, parseInt,
                isNaN, isFinite, RegExp, Date, setTimeout, Error, Boolean, console: { log: quiet, warn: quiet, error: quiet } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(built, 'utf8'), ctx);
  await figma.ui.onmessage(msg);
  for (let i = 0; i < 100 && !posted; i++) await new Promise((r) => setTimeout(r, 10));
  /* Cloned out of the vm: objects built inside another context have another
     Object.prototype, which strict deep equality (rightly) tells apart. */
  return { posted: posted && JSON.parse(JSON.stringify(posted)), state, notified: JSON.parse(JSON.stringify(notified)) };
}

let passed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log('ok    ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

(async function () {
  await ok('variables and styles together: both gone, and the reply says nothing is left', async () => {
    const { posted, state } = await run({ type: 'clearVariables', includeVariables: true, includeStyles: true });
    assert.strictEqual(posted.removed.length, 2);
    assert.deepStrictEqual([posted.stylesRemoved.text, posted.stylesRemoved.effect, posted.stylesRemoved.grid], [3, 2, 1]);
    assert.deepStrictEqual(posted.remaining, { collections: 0, text: 0, effect: 0, grid: 0 });
    assert.deepStrictEqual(state, { collections: 0, text: 0, effect: 0, grid: 0 });
  });
  await ok('styles only: the collections are not touched', async () => {
    const { posted, state } = await run({ type: 'clearVariables', includeVariables: false, includeStyles: true });
    assert.strictEqual(posted.removed.length, 0);
    assert.strictEqual(state.collections, 2);
    assert.deepStrictEqual(posted.asked, { variables: false, styles: true });
    /* `remaining` is over what was asked for: collections were not, so none are counted */
    assert.strictEqual(posted.remaining.collections, 0);
  });
  await ok('variables only: the styles are not touched', async () => {
    const { posted, state } = await run({ type: 'clearVariables', includeVariables: true, includeStyles: false });
    assert.strictEqual(posted.stylesRemoved, null);
    assert.deepStrictEqual([state.text, state.effect, state.grid], [3, 2, 1]);
  });
  await ok('an older UI that sends neither field still clears the variables, as it always did', async () => {
    const { posted, state } = await run({ type: 'clearVariables' });
    assert.strictEqual(state.collections, 0);
    assert.strictEqual(posted.stylesRemoved, null);
    assert.deepStrictEqual(posted.asked, { variables: true, styles: false });
  });
  await ok('a style that refuses stays, is named, and the reply counts it as still there', async () => {
    const { posted } = await run({ type: 'clearVariables', includeVariables: true, includeStyles: true }, { lock: 'text' });
    assert.deepStrictEqual(posted.stylesRemoved.failed.map((f) => f.name), ['text0']);
    assert.strictEqual(posted.remaining.text, 1);
  });
  await ok('a collection that is not removed is counted as still there, whatever the calls said', async () => {
    const { posted } = await run({ type: 'clearVariables', includeVariables: true, includeStyles: false }, { keepCollections: true });
    assert.strictEqual(posted.remaining.collections, 2);
  });
  await ok('Figma\'s own toast says the handler ran, with the build, and then what is left', async () => {
    const { notified } = await run({ type: 'clearVariables', includeVariables: true, includeStyles: true });
    assert.ok(/Clearing the file/.test(notified[0].t) && /plugin build/.test(notified[0].t));
    assert.ok(notified.some((n) => /^Cleared\. Left of what was selected: 0 collections, 0 styles/.test(n.t)));
  });
  await ok('only the ticked collections go; the others stay, and are not reported as left behind', async () => {
    const { posted, state } = await run({ type: 'clearVariables', includeVariables: true, includeStyles: false, collections: ['cB'] }, { names: ['A', 'B', 'C'] });
    assert.deepStrictEqual(posted.removed.map((r) => r.name), ['cB']);
    assert.deepStrictEqual(state.names, ['A', 'C']);
    assert.strictEqual(posted.remaining.collections, 0);
  });
  await ok('only the ticked kinds of style go', async () => {
    const { posted, state } = await run({ type: 'clearVariables', includeVariables: false, includeStyles: true, collections: [], styles: { text: true, effect: false, grid: false } });
    assert.strictEqual(state.text, 0);
    assert.strictEqual(state.effect, 2);
    assert.strictEqual(state.grid, 1);
    assert.deepStrictEqual(posted.removed, []);
    assert.strictEqual(posted.stylesRemoved.text, 3);
    assert.strictEqual(posted.stylesRemoved.effect, 0);
    assert.deepStrictEqual(posted.remaining, { collections: 0, text: 0, effect: 0, grid: 0 });
  });
  await ok('nothing ticked removes nothing', async () => {
    const { state } = await run({ type: 'clearVariables', includeVariables: false, includeStyles: false, collections: [], styles: { text: false, effect: false, grid: false } }, { names: ['A', 'B'] });
    assert.strictEqual(state.collections, 2);
    assert.strictEqual(state.text, 3);
  });

  console.log('\n' + passed + ' passed');
})();
