#!/usr/bin/env node
//
// dtcg-selftest.js — check the DTCG format and the description wiring without
// opening Figma.
//
//   npm run dtcg:selftest
//
// code.js is the Figma plugin main thread: it has no exports and calls figma.*
// at load. To test the real functions rather than a copy, it is evaluated here
// with a stubbed `figma` and the few functions under test returned from the
// bottom of the module. That keeps this honest — a drift in code.js fails here.
//
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { toDtcgFormat, validateDtcgClosure } = require(path.join(ROOT, 'src/dtcg-format.js'));
const { inlineDescriptions, descriptionMap } = require(path.join(ROOT, 'scripts/dtcg-descriptions.js'));

function loadPluginCode() {
  const src = fs.readFileSync(path.join(ROOT, 'code.js'), 'utf8');
  const figmaStub = {
    ui: { set onmessage(_fn) {}, postMessage() {}, resize() {} },
    variables: {},
    clientStorage: {},
    root: { name: 'selftest' },
    showUI() {},
  };
  const quietConsole = { log() {}, warn() {}, error() {} };
  const expose = `
    return {
      transformToFinalFormat: transformToFinalFormat,
      toTokenStudioFormat: toTokenStudioFormat,
      fixBreakpointTypes: fixBreakpointTypes,
      fixLayoutColumnTypes: fixLayoutColumnTypes,
    };
  `;
  return new Function('figma', 'console', '__html__', src + expose)(figmaStub, quietConsole, '');
}

const DESC = 'Primary brand colour. Use for key actions.';

function rawDataFixture() {
  const red = { r: 1, g: 0, b: 0, a: 1 };
  const blue = { r: 0, g: 0, b: 1, a: 1 };
  const green = { r: 0, g: 1, b: 0, a: 1 };
  return {
    collections: [
      {
        id: 'c1',
        name: '.mode',
        modes: [{ modeId: 'm1', name: 'light' }, { modeId: 'm2', name: 'dark' }],
        variables: [
          {
            id: 'v1',
            name: 'mode/brand/primary',
            type: 'COLOR',
            valuesByMode: { m1: red, m2: blue },
            resolvedValuesByMode: { m1: red, m2: blue },
            aliasInfo: {},
            codeSyntax: {},
            description: DESC,
          },
          {
            id: 'v2',
            name: 'mode/brand/secondary',
            type: 'COLOR',
            valuesByMode: { m1: green },
            resolvedValuesByMode: { m1: green },
            aliasInfo: {},
            codeSyntax: {},
            description: '',
          },
        ],
      },
    ],
    styles: { textStyles: [], effectStyles: [] },
  };
}

// The file-name swap lives inline in the UI template, so there is nothing to
// require. Pull the helper block out of the built ui.html and evaluate it — that
// also catches ui.html being stale relative to src/ui.template.html.
function loadFilenameHelpers() {
  const uiPath = path.join(ROOT, 'ui.html');
  if (!fs.existsSync(uiPath)) return null;
  const html = fs.readFileSync(uiPath, 'utf8');
  const start = html.indexOf("var DEFAULT_FILENAME = 'tokens.json';");
  const end = html.indexOf('// Rewrite both providers');
  if (start < 0 || end < 0 || end <= start) return null;
  const block = html.slice(start, end);
  // defaultFilename() closes over dtcgShape in the real UI; inject it here.
  return new Function('dtcgShape', block + `
    return { dtcgFilename, plainFilename, defaultFilename, hasDtcgSuffix };
  `);
}

const results = [];
function check(name, ok) {
  results.push([name, !!ok]);
}

function run() {
  const plugin = loadPluginCode();
  const raw = rawDataFixture();

  // --- description wiring through code.js ---------------------------------
  const off = plugin.transformToFinalFormat(raw).tokens['.mode'];
  const on = plugin.transformToFinalFormat(raw, { includeDescriptions: true }).tokens['.mode'];

  check('off by default, so the Token Studio export is unchanged',
    !('description' in off.light.brand.primary));
  check('includeDescriptions carries the description',
    on.light.brand.primary.description === DESC);
  check('an empty description is not emitted',
    !('description' in on.light.brand.secondary));
  check('the description reaches every mode of the variable',
    on.dark.brand.primary.description === DESC);

  // The three fixups that rebuild token nodes from scratch must keep it.
  const bp = plugin.fixBreakpointTypes(
    { spacing: { s: { value: 4, type: 'number', description: 'kept', codeSyntax: { WEB: 'x' } } } },
    []
  );
  check('fixBreakpointTypes keeps the description', bp.spacing.s.description === 'kept');
  check('fixBreakpointTypes still drops codeSyntax (pre-existing, left alone)',
    !('codeSyntax' in bp.spacing.s));

  const lay = plugin.fixLayoutColumnTypes({ c: { value: 8, type: 'number', description: 'kept' } });
  check('fixLayoutColumnTypes keeps the description', lay.c.description === 'kept');

  // --- end to end into DTCG ------------------------------------------------
  const ts = plugin.toTokenStudioFormat(
    plugin.transformToFinalFormat(raw, { includeDescriptions: true }).tokens,
    raw
  );
  const live = toDtcgFormat(ts, { shape: 'sets' });
  check('$description reaches the DTCG output', live.report.describedCount > 0);

  // --- the checked-in fixture ----------------------------------------------
  const sample = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'scripts/__fixtures__/token-studio-sample.json'), 'utf8')
  );

  // --- 'partial': the drop-in contract for build-dtcg.js -------------------
  const partial = toDtcgFormat(sample, { shape: 'partial' });
  const pt = partial.tokens;

  check('partial keeps $themes at the root, natively',
    Array.isArray(pt.$themes) && !!pt.$themes[0].selectedTokenSets);
  check('partial keeps $metadata.tokenSetOrder at the root',
    Array.isArray(pt.$metadata && pt.$metadata.tokenSetOrder));
  // description is renamed too, but only when it stays inline — by default it is
  // hoisted to the root map instead (see the dedupe checks below).
  check('partial renames value/type',
    pt.foundation.colours.brand.primary.$type === 'color' &&
    pt.foundation.colours.brand.primary.$value === '{mode.brand.primary}' &&
    !('value' in pt.foundation.colours.brand.primary));
  check('partial leaves proprietary type names alone',
    pt['mode/light'].mode.neutral.elevation['level-1']['level-1'].$type === 'boxShadow');
  check('partial does NOT rewrite composite internals',
    pt['mode/light'].mode.neutral.elevation['level-1']['level-1'].$value.type === 'dropShadow' &&
    'x' in pt['mode/light'].mode.neutral.elevation['level-1']['level-1'].$value);
  check('partial leaves embedded math untouched',
    pt.foundation.radius.small.$value === '{dimension.1}*1');
  check('partial adds no per-token $extensions',
    !pt.foundation.colours.brand.primary.$extensions);
  check('partial reports source types for the downstream mapper',
    partial.report.sourceTypes.boxShadow === 1);

  // --- description dedupe ---------------------------------------------------
  const DESC_MAP = 'com.desquared.radd.json-exporter';
  const descriptions = pt.$extensions && pt.$extensions[DESC_MAP] &&
    pt.$extensions[DESC_MAP].descriptions;

  check('descriptions are hoisted to a root map', !!descriptions);
  check('the map is keyed by token path, not by set',
    !!descriptions && descriptions['colours.brand.primary'] ===
      'Primary brand colour for the current scheme and mode.');
  check('no description is left inline once hoisted',
    !pt.foundation.colours.brand.primary.$description);
  check('opting out inlines them again', (function () {
    const inline = toDtcgFormat(sample, { shape: 'partial', dedupeDescriptions: false }).tokens;
    return !inline.$extensions &&
      inline.foundation.colours.brand.primary.$description ===
        'Primary brand colour for the current scheme and mode.';
  })());

  // One variable across two modes: the same path in two sets, which is where
  // the 4.2x repetition on the real export comes from. Both must resolve.
  const repeated = {
    'mode/light': { mode: { a: { value: '#fff', type: 'color', description: 'Surface.' } } },
    'mode/dark': { mode: { a: { value: '#000', type: 'color', description: 'Surface.' } } },
    $metadata: { tokenSetOrder: ['mode/light', 'mode/dark'] },
  };
  const rep = toDtcgFormat(repeated, { shape: 'partial' });
  check('a description repeated across sets is stored once',
    Object.keys(rep.report.descriptions).length === 1 && rep.report.describedCount === 2);
  check('every set resolves it from the one entry',
    rep.tokens.$extensions[DESC_MAP].descriptions['mode.a'] === 'Surface.' &&
    !rep.tokens['mode/light'].mode.a.$description &&
    !rep.tokens['mode/dark'].mode.a.$description);

  // Two variables sharing a path with different text: the map cannot answer for
  // both, so the loser stays inline rather than being silently replaced.
  const clashing = {
    'mode/light': { mode: { a: { value: '#fff', type: 'color', description: 'Light surface.' } } },
    'mode/dark': { mode: { a: { value: '#000', type: 'color', description: 'Dark surface.' } } },
    $metadata: { tokenSetOrder: ['mode/light', 'mode/dark'] },
  };
  const clash = toDtcgFormat(clashing, { shape: 'partial' });
  check('a conflicting description is reported',
    clash.report.descriptionCollisions.length === 1);
  check('a conflicting description stays inline, losing nothing',
    clash.tokens.$extensions[DESC_MAP].descriptions['mode.a'] === 'Light surface.' &&
    clash.tokens['mode/dark'].mode.a.$description === 'Dark surface.');

  const sets = toDtcgFormat(sample, { shape: 'sets' });
  check('fixture converts in sets shape', sets.report.tokenCount > 0);
  check('fixture descriptions become $description', sets.report.describedCount === 5);

  const themes = toDtcgFormat(sample, { shape: 'themes' });
  const closure = validateDtcgClosure(themes.tokens);
  const docs = Object.keys(closure);
  check('themes shape produces one document per theme', docs.length === 2);
  check('every theme document resolves its own references',
    docs.length > 0 && docs.every((d) => closure[d].ok));

  // --- the _dtcg file-name swap ---------------------------------------------
  const makeHelpers = loadFilenameHelpers();
  check('file-name helpers found in the built ui.html', !!makeHelpers);
  if (makeHelpers) {
    const off = makeHelpers(null);
    const on = makeHelpers('partial');

    check('switching on suffixes the name', on.dtcgFilename('tokens.json') === 'tokens_dtcg.json');
    check('switching off strips it again', on.plainFilename('tokens_dtcg.json') === 'tokens.json');
    check('a customised name keeps its stem', on.dtcgFilename('radd.json') === 'radd_dtcg.json');
    check('suffixing twice is a no-op', on.dtcgFilename('tokens_dtcg.json') === 'tokens_dtcg.json');
    check('stripping a plain name is a no-op', on.plainFilename('tokens.json') === 'tokens.json');
    check('round-trips exactly', on.plainFilename(on.dtcgFilename('a.b.json')) === 'a.b.json');
    check('handles a name with no extension', on.dtcgFilename('tokens') === 'tokens_dtcg');
    check('does not mistake a short name for a suffix', !on.hasDtcgSuffix('a.json'));
    check('default follows the active format',
      off.defaultFilename() === 'tokens.json' && on.defaultFilename() === 'tokens_dtcg.json');

    // A name saved by a build that used the old _W3C suffix must not strand or
    // stack — it strips cleanly and re-suffixes to _dtcg.
    check('a legacy _W3C name is recognised', on.hasDtcgSuffix('tokens_W3C.json'));
    check('a legacy _W3C name strips cleanly',
      on.plainFilename('tokens_W3C.json') === 'tokens.json');
    check('a legacy _W3C name migrates to _dtcg, not tokens_W3C_dtcg',
      on.dtcgFilename('tokens_W3C.json') === 'tokens_dtcg.json');
    check('a legacy suffix on a customised stem migrates too',
      on.dtcgFilename('radd_W3C.json') === 'radd_dtcg.json');
  }

  // --- the reader build-dtcg.js will use --------------------------------------
  // One call on the parsed document puts every description back on its token, so
  // the generator's own walk needs no changes at all.
  const rehydrated = toDtcgFormat(sample, { shape: 'partial' }).tokens;
  const mapBefore = Object.keys(descriptionMap(rehydrated)).length;
  const applied = inlineDescriptions(rehydrated);

  // 5 described tokens, 4 distinct paths: mode.brand.primary is one variable
  // appearing in both mode/light and mode/dark, which is where the real
  // export's 4.2x repetition comes from.
  check('the reader finds one entry per variable, not per token', mapBefore === 4);
  check('the reader inlines every described token', applied === 5);
  check('the reader removes the map once spent',
    Object.keys(descriptionMap(rehydrated)).length === 0 && !rehydrated.$extensions);
  check('rehydrating equals never having deduplicated',
    JSON.stringify(rehydrated) ===
    JSON.stringify(toDtcgFormat(sample, { shape: 'partial', dedupeDescriptions: false }).tokens));

  // Safe to call unconditionally, which is what makes it a one-line change.
  const noMap = toDtcgFormat(sample, { shape: 'partial', dedupeDescriptions: false }).tokens;
  const before = JSON.stringify(noMap);
  check('the reader is a no-op on a document with no map',
    inlineDescriptions(noMap) === 0 && JSON.stringify(noMap) === before);

  // An inline description must survive: it is the collision case, and the map
  // must not overwrite it.
  const clashReader = toDtcgFormat(clashing, { shape: 'partial' }).tokens;
  inlineDescriptions(clashReader);
  check('the reader keeps a conflicting inline description',
    clashReader['mode/light'].mode.a.$description === 'Light surface.' &&
    clashReader['mode/dark'].mode.a.$description === 'Dark surface.');

  // Composite sub-values must be renamed to the DTCG spelling.
  const light = themes.tokens['mode/light'];
  const shadow = light.mode.neutral.elevation['level-1']['level-1'];
  check('boxShadow becomes a DTCG shadow with offsetX/offsetY',
    shadow.$type === 'shadow' && 'offsetX' in shadow.$value && !('x' in shadow.$value));

  const typo = light.breakpoint.typography['title-L']['title-L'];
  check('typography $value holds only the five DTCG sub-values',
    typo.$type === 'typography' && Object.keys(typo.$value).length === 5);
  check('non-DTCG typography sub-values move to $extensions',
    !!typo.$extensions['com.radd.tokenStudio'].typography.textCase);
}

try {
  run();
} catch (err) {
  console.error('selftest threw:', err && err.stack ? err.stack : err);
  process.exit(1);
}

let failed = 0;
results.forEach(([name, ok]) => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
