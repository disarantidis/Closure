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
    /* The sandbox watches the selection from the moment it loads, and asks once
       straight away. An empty page answers both, which is what this harness
       means by "no document". */
    on() {},
    currentPage: { selection: [] },
  };
  const quietConsole = { log() {}, warn() {}, error() {} };
  const expose = `
    return {
      transformToFinalFormat: transformToFinalFormat,
      toTokenFormat: toTokenFormat,
      fixBreakpointTypes: fixBreakpointTypes,
      fixLayoutColumnTypes: fixLayoutColumnTypes,
      validateReferenceClosure: validateReferenceClosure,
      completeThemeSelections: completeThemeSelections,
      defaultModeSetNames: defaultModeSetNames,
      isAliasComposite: isAliasComposite,
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

/*
  A collection named without a leading dot ("weight"), two of whose variables
  are "weight/value" and "weight/style-name" — the Pomegranate Identity file's
  own shape, found 2026-11-13. A native-tree group for an undotted multi-mode
  collection keeps the collection's own name on each variable
  (normalizeVariableName only strips it for a ".foo" collection), so this
  group comes out as `{ value: {...}, "style-name": {...} }`: an own property
  literally called "value" sitting beside a sibling. `'value' in node` alone
  mistakes that group for a leaf token and never visits "style-name" — the
  regression this fixture pins. A second collection aliases "weight.style-name",
  exactly as a typography scale in the real file does, so the closure check has
  a reference to find broken or not.
*/
function weightLikeFixture() {
  return {
    collections: [
      {
        id: 'w1',
        name: 'weight',
        modes: [{ modeId: 'wm1', name: 'light' }, { modeId: 'wm2', name: 'regular' }, { modeId: 'wm3', name: 'bold' }],
        variables: [
          {
            id: 'wv1', name: 'weight/value', type: 'FLOAT',
            valuesByMode: { wm1: 300, wm2: 400, wm3: 700 },
            resolvedValuesByMode: { wm1: 300, wm2: 400, wm3: 700 },
            aliasInfo: {}, codeSyntax: {}, description: '',
          },
          {
            id: 'wv2', name: 'weight/style-name', type: 'STRING',
            valuesByMode: { wm1: 'Light', wm2: 'Regular', wm3: 'Bold' },
            resolvedValuesByMode: { wm1: 'Light', wm2: 'Regular', wm3: 'Bold' },
            aliasInfo: {}, codeSyntax: {}, description: '',
          },
        ],
      },
      {
        id: 'u1',
        name: 'uses',
        modes: [{ modeId: 'um1', name: 'uses' }],
        variables: [
          {
            id: 'uv1', name: 'label/style-name', type: 'STRING',
            valuesByMode: { um1: { type: 'VARIABLE_ALIAS', id: 'wv2' } },
            resolvedValuesByMode: { um1: 'Regular' },
            /* What buildAliasPath computes for a non-dot collection: the
               variable's own name, slashes turned to dots — no mode segment,
               because the reference is by logical path, not by which mode set
               is enabled (exactly like "scheme.basic.text" for `.scheme`). */
            aliasInfo: { um1: { isAlias: true, aliasPath: 'weight.style-name', aliasedVarId: 'wv2', aliasedVarCollection: 'weight' } },
            codeSyntax: {}, description: '',
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
  // Anchored on declarations rather than on prose: the previous end marker was
  // a comment ('// Rewrite both providers'), it was reworded, and the block
  // silently stopped being found — which skipped every file-name check below
  // while the suite still reported a near-perfect count.
  const start = html.indexOf("var DEFAULT_FILENAME = 'tokens.json';");
  const end = html.indexOf('function applyFilenameForFormat');
  if (start < 0 || end < 0 || end <= start) return null;
  const block = html.slice(start, end);
  // defaultFilename() closes over dtcgShape in the real UI; inject it here.
  return new Function('dtcgShape', block + `
    return { dtcgFilename, plainFilename, defaultFilename, hasDtcgSuffix };
  `);
}

/*
  stampExport() from the built ui.html, the same anchored-extraction trick
  loadFilenameHelpers() uses — and for the same reason, since the identity it
  writes is added to the finished document rather than built in the sandbox.
  It closes over the UI's module state, so that is injected.

  A null return is reported as a FAILURE below, not skipped: the note on
  loadFilenameHelpers records what happened when an anchor moved and a block
  silently stopped being found while the suite still reported near-perfect.
*/
function loadStampExport() {
  const uiPath = path.join(ROOT, 'ui.html');
  if (!fs.existsSync(uiPath)) return null;
  const html = fs.readFileSync(uiPath, 'utf8');
  const start = html.indexOf('function stampExport(tokens) {');
  const end = html.indexOf('function getTokensToExport()');
  if (start < 0 || end < 0 || end <= start) return null;
  return new Function(
    'dtcgShape', 'transformedData', 'lastFigmaFileName', 'lastFigmaFileKey', 'rawData', 'CLOSURE_BUILD',
    html.slice(start, end) + '\nreturn stampExport;'
  );
}

const results = [];
/*
  `ok` may be a boolean or a function returning one. The function form exists
  because a boolean argument has to be computed before the call, which means a
  reference into a tree that might not be there throws before check() is
  reached; a function lets the throw be caught and reported as a failure.

  It also closes a trap: a function passed to the OLD two-line version was
  coerced with !! and a function is always truthy, so such a check passed
  without running. Two written on 2026-11-15 did exactly that, and were only
  noticed because a third, written as a boolean, failed beside them.
*/
/* One variable, as the extractor hands them over. `scopes` is Figma's own,
   and says what a FLOAT actually is — see isLengthVariable. */
function mkVar(id, name, type, byMode, scopes) {
  return {
    id: id, name: name, type: type,
    valuesByMode: byMode, resolvedValuesByMode: byMode,
    aliasInfo: {}, codeSyntax: {}, description: '', scopes: scopes || [],
  };
}

function check(name, ok) {
  var value;
  if (typeof ok === 'function') {
    try { value = ok(); }
    catch (e) { results.push([name + ' — threw: ' + (e && e.message), false]); return; }
  } else {
    value = ok;
  }
  results.push([name, !!value]);
}

function run() {
  const plugin = loadPluginCode();
  const raw = rawDataFixture();

  // --- description wiring through code.js ---------------------------------
  const off = plugin.transformToFinalFormat(raw).tokens['.mode'];
  const on = plugin.transformToFinalFormat(raw, { includeDescriptions: true }).tokens['.mode'];

  check('off by default, so the Legacy JSON export is unchanged',
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
  const ts = plugin.toTokenFormat(
    plugin.transformToFinalFormat(raw, { includeDescriptions: true }).tokens,
    raw
  );
  const live = toDtcgFormat(ts, { shape: 'sets' });
  check('$description reaches the DTCG output', live.report.describedCount > 0);

  // --- the checked-in fixture ----------------------------------------------
  const sample = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'scripts/__fixtures__/legacy-sample.json'), 'utf8')
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
  const DESC_MAP = 'com.closure.json-exporter';
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
  if (!makeHelpers) {
    // Say what was lost. A silently shorter run is worse than a failing one.
    check('...and therefore the 13 file-name checks below actually ran', false);
  }
  if (makeHelpers) {
    const off = makeHelpers(null);
    const on = makeHelpers('partial');

    check('switching on suffixes the name', on.dtcgFilename('tokens.json') === 'tokens_dtcg.json');
    check('switching off strips it again', on.plainFilename('tokens_dtcg.json') === 'tokens.json');
    check('a customised name keeps its stem', on.dtcgFilename('custom.json') === 'custom_dtcg.json');
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

    /*
      THE SETS SHAPE HAS A FILE NAME OF ITS OWN (2026-11-15).

      dtcg-format could always build it; nothing could ask for it, so the
      Settings control is now a choice of three. Each shape needs its own
      suffix for the reason Resolved already had one — switching format must
      never land two shapes on the same file.
    */
    const sets = loadFilenameHelpers()('sets');
    check('the sets shape suffixes a name with _sets',
      sets.dtcgFilename('tokens.json') === 'tokens_sets.json');
    check('and strips it again, so switching format round-trips',
      sets.plainFilename('tokens_sets.json') === 'tokens.json');
    check('a _sets name is recognised as a shape suffix, not part of the stem',
      sets.hasDtcgSuffix('tokens_sets.json'));
    check('switching away from sets does not leave _sets behind',
      on.dtcgFilename(sets.plainFilename('tokens_sets.json')) === 'tokens_dtcg.json');
    /* filenameForShape() is not checked here: it reads the filename FIELD, so
       it needs the DOM this extraction does not have. It is a thin wrapper
       over withSuffix, which the four checks above exercise directly. */
    check('a legacy _W3C name strips cleanly',
      on.plainFilename('tokens_W3C.json') === 'tokens.json');
    check('a legacy _W3C name migrates to _dtcg, not tokens_W3C_dtcg',
      on.dtcgFilename('tokens_W3C.json') === 'tokens_dtcg.json');
    check('a legacy suffix on a customised stem migrates too',
      on.dtcgFilename('custom_W3C.json') === 'custom_dtcg.json');
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
    !!typo.$extensions['com.closure.legacyJson'].typography.textCase);

  // --- a variable literally named "value" beside a sibling (Pomegranate's "weight") ---
  const wraw = weightLikeFixture();
  const wnative = plugin.transformToFinalFormat(wraw, { includeDescriptions: true }).tokens;
  check('the native tree really does nest an own "value" property beside a sibling',
    wnative.weight && wnative.weight.regular &&
    'value' in wnative.weight.regular.weight && 'style-name' in wnative.weight.regular.weight);

  const wtokens = plugin.toTokenFormat(wnative, wraw);
  const wclosure = plugin.validateReferenceClosure(wtokens);
  check('closure: a reference into a "weight"-shaped group with a bare "value" sibling is not broken',
    wclosure.ok && wclosure.brokenCount === 0);

  const wdtcg = toDtcgFormat(wnative, { shape: 'sets' }).tokens;
  const wset = wdtcg['weight/regular'] || wdtcg['weight.regular'] || wdtcg['weight']?.regular;
  check('DTCG: both "value" and "style-name" survive the conversion as separate tokens',
    !!wset && !!wset.weight && wset.weight.value && wset.weight.value.$type === 'number' &&
    wset.weight['style-name'] && wset.weight['style-name'].$type === 'string');

  // completeThemeSelections() (2026-11-13): found on Pomegranate Identity — a
  // theme whose own tokens reference "weight.style-name" never pulled in any
  // "weight/<mode>" set, because the SAME bare-"value"-property group fooled
  // this function's own leaf check: at `{ weight: { value: {...}, "style-name":
  // {...} } }` (the native shape a non-dot collection's "weight/value" and
  // "weight/style-name" variables produce), the inner object has an own
  // "value" property without being a token, so the whole group was recorded
  // as defining just the path "weight" rather than "weight.value" and
  // "weight.style-name" — no set ever looked like it provided the missing
  // path, so the fixpoint closed with the reference still dangling.
  const weightSet = (val, name) => ({ weight: { value: { value: val, type: 'number' }, 'style-name': { value: name, type: 'string' } } });
  const wout = {
    'weight/light': weightSet(300, 'Light'),
    'weight/regular': weightSet(400, 'Regular'),
    'weight/bold': weightSet(700, 'Bold'),
    uses: { label: { 'style-name': { value: '{weight.style-name}', type: 'string' } } },
    $themes: [{ id: 't1', name: 'only', selectedTokenSets: { uses: 'enabled' } }],
    $metadata: { tokenSetOrder: ['weight/light', 'weight/regular', 'weight/bold', 'uses'] },
  };
  plugin.completeThemeSelections(wout);
  const pulled = wout.$themes[0].selectedTokenSets;
  check('completeThemeSelections pulls in the "weight" set a theme\'s own tokens reference',
    pulled['weight/light'] === 'source' || pulled['weight/regular'] === 'source' || pulled['weight/bold'] === 'source');

  /*
    WHICH of those three, when the theme itself does not say (2026-11-13).

    Figma's plugin API cannot reorder modes, so a collection reports them in
    creation order and its default can sit anywhere inside. Pomegranate
    Identity's `weight` lists `regular` first and defaults to `light`. Picking
    the earliest set in tokenSetOrder therefore shipped weight/regular, and
    every reading-text weight came out 400 where the file says 300.
  */
  const orderedRegularFirst = () => ({
    'weight/regular': weightSet(400, 'Regular'),
    'weight/light': weightSet(300, 'Light'),
    'weight/bold': weightSet(700, 'Bold'),
    uses: { label: { 'style-name': { value: '{weight.style-name}', type: 'string' } } },
    $themes: [{ id: 't1', name: 'only', selectedTokenSets: { uses: 'enabled' } }],
    $metadata: { tokenSetOrder: ['weight/regular', 'weight/light', 'weight/bold', 'uses'] },
  });

  const wDefault = orderedRegularFirst();
  plugin.completeThemeSelections(wDefault, { 'weight/light': true });
  const byDefault = wDefault.$themes[0].selectedTokenSets;
  check('the tie goes to the collection\'s DEFAULT mode, not the first set in order',
    byDefault['weight/light'] === 'source' && byDefault['weight/regular'] === undefined);

  const wNoHint = orderedRegularFirst();
  plugin.completeThemeSelections(wNoHint);
  check('with no default named, document order still breaks the tie',
    wNoHint.$themes[0].selectedTokenSets['weight/regular'] === 'source');

  /*
    DEFAULTS NOBODY REFERENCES DO NOT SHIP (2026-11-13).

    Three passes write tokens the file does not have, so that references made
    by convention — "{lineHeights.0}" from a typography composite, the shadow
    scale that is not a Figma variable at all — have somewhere to land. On a
    file that makes none of those references they were 28 tokens of another
    design system's constants: 12 elevation levels of literal hex and px, 4
    line heights, 9 letter spacings, 3 case/decoration. Pomegranate Identity
    shipped all 28 and referenced none.

    weightLikeFixture() is that file in miniature: one `weight` collection, no
    typography composites, no shadow tokens, nothing pointing at core.
  */
  const defaultsGone = ['Elevation', 'lineHeights', 'letterSpacing', 'textCase', 'textDecoration']
    .filter((g) => wtokens.core && wtokens.core[g] !== undefined);
  check('a default the file neither has nor references is not exported',
    defaultsGone.length === 0, 'still present: ' + defaultsGone.join(', '));

  /*
    And the other way: the reference is what keeps it. One token pointing at
    {lineHeights.0} has to find it, or the export ships a dangling reference —
    which is the failure the defaults were added to prevent in the first place.
  */
  const refRaw = weightLikeFixture();
  refRaw.collections.push({
    id: 'cRef', name: 'foundation',
    modes: [{ modeId: 'fm1', name: 'foundation' }],
    defaultModeId: 'fm1',
    variables: [{
      id: 'vRef', name: 'typography/body/line-height', type: 'STRING',
      valuesByMode: { fm1: '{lineHeights.0}' },
      resolvedValuesByMode: { fm1: '{lineHeights.0}' },
      aliasInfo: {}, codeSyntax: {}, description: '', scopes: [],
    }],
  });
  const refTokens = plugin.toTokenFormat(
    plugin.transformToFinalFormat(refRaw, { includeDescriptions: true }).tokens, refRaw);
  check('a default something DOES reference is kept',
    !!(refTokens.core && refTokens.core.lineHeights && refTokens.core.lineHeights['0']));
  check('and keeping it leaves the reference closed',
    plugin.validateReferenceClosure(refTokens).brokenCount === 0);

  /*
    A FLOAT'S TYPE COMES FROM ITS SCOPE, NOT ITS NAME (2026-11-15, issue 7).

    Figma has one numeric type, so a radius, a gap, an opacity, a duration and
    a column count are all FLOAT. The exporter chose between DTCG `dimension`
    and `number` by the token's first path segment — `spacing` and `radius`
    were on the list, `border/width`, `grid`, `focus`, `surface-width`,
    `tappable-area`, `viewport` and `elevation` were not. On Pomegranate
    Identity that split 90 pixel lengths 40 / 50, by nothing but which words
    someone had thought of.

    The scopes below are the ones read live from that file.
  */
  const scRaw = {
    collections: [{
      id: 'sq1', name: 'foundation',
      modes: [{ modeId: 'sqm', name: 'foundation' }],
      defaultModeId: 'sqm',
      variables: [
        mkVar('q1', 'radius/medium', 'FLOAT', { sqm: 12 }, ['CORNER_RADIUS']),
        mkVar('q2', 'border/width/hairline', 'FLOAT', { sqm: 1 }, ['STROKE_FLOAT']),
        mkVar('q3', 'grid/gutters', 'FLOAT', { sqm: 16 }, ['GAP']),
        mkVar('q4', 'surface-width/small', 'FLOAT', { sqm: 380 }, ['WIDTH_HEIGHT']),
        mkVar('q5', 'spacing/component/4', 'FLOAT', { sqm: 4 }, ['WIDTH_HEIGHT', 'GAP']),
        /* not lengths */
        mkVar('q6', 'rim/intensity', 'FLOAT', { sqm: 80 }, ['OPACITY']),
        mkVar('q7', 'grid/count', 'FLOAT', { sqm: 12 }, []),
        mkVar('q8', 'core-effects/angle', 'FLOAT', { sqm: 315 }, []),
      ],
    }],
  };
  const scT = plugin.toTokenFormat(
    plugin.transformToFinalFormat(scRaw, { includeDescriptions: true }).tokens, scRaw);
  const scTypes = {};
  (function w(n, p) {
    if (!n || typeof n !== 'object') return;
    if ('value' in n && 'type' in n) { scTypes[p.join('/')] = n.type; return; }
    Object.keys(n).forEach((k) => { if (k[0] !== '$') w(n[k], p.concat(k)); });
  })(scT.foundation || {}, []);
  /* The DTCG type is what a consumer reads. `spacing` and `borderRadius` are
     legacy names that TYPE_MAP already sends to `dimension`; the ones this
     change moves had no such name and were landing on `number`. */
  const scD = toDtcgFormat(scT, { shape: 'sets' }).tokens.foundation;
  const dt = (path) => path.split('/').reduce((o, k) => (o || {})[k], scD).$type;
  check('a length scope makes a FLOAT a dimension, whatever it is called', () =>
    ['radius/medium', 'border/width/hairline', 'grid/gutters', 'surface-width/small',
     'spacing/component/4'].every((k) => dt(k) === 'dimension'));
  check('an opacity stays a number', () => dt('rim/intensity') === 'number');
  check('a FLOAT with no scope at all stays a number — the honest answer', () =>
    dt('grid/count') === 'number' && dt('core-effects/angle') === 'number');
  check('the rule only ever adds: what was already a dimension still is', () =>
    dt('radius/medium') === 'dimension' && dt('spacing/component/4') === 'dimension');

  /*
    WHICH FILE, AND WHICH VARIABLE WAS WHICH (2026-11-15, issue 12).

    The document said neither. $figmaVariableReferences holds a HASH of the id
    per theme — a stable surrogate, but one-way — and nothing named the Figma
    file, so an importer could not refuse an export taken from the wrong one.
  */
  const stampFactory = loadStampExport();
  check('stampExport can still be found in the built ui.html', !!stampFactory);
  if (stampFactory) {
    const idRaw = {
      collections: [{
        name: 'core',
        variables: [
          { id: 'VariableID:35:111', name: 'core-colours/brand/main' },
          { id: 'VariableID:44:3509', name: 'core-percentage/40' },
        ],
      }],
    };
    const stamp = stampFactory('legacy', null, 'Pomegranate Identity', 'qFTKlfV7NrWXttRskDqzzL', idRaw, 'abc1234');
    const out = stamp({ core: {} });
    const c = out.$extensions['com.closure'];
    check('the export says which file it came from', () =>
      c.fileKey === 'qFTKlfV7NrWXttRskDqzzL' && c.fileName === 'Pomegranate Identity');
    check('the variable map is keyed BY ID, which is what tells a rename from a delete', () =>
      c.variableIds['VariableID:35:111'] === 'core::core-colours/brand/main' &&
      Object.keys(c.variableIds).length === 2);
    check('the build and format stamp still goes out', () =>
      c.build === 'abc1234' && c.format === 'legacy');

    /* No permission, no key: say nothing rather than claim a file. */
    const noKey = stampFactory('legacy', null, null, null, null, 'abc1234')({ core: {} });
    check('without a file key the export claims no file, rather than guessing', () =>
      !('fileKey' in noKey.$extensions['com.closure']) &&
      !('variableIds' in noKey.$extensions['com.closure']));

    /* A resolved document carries its own root metadata and is left alone. */
    const res = stampFactory('resolved', null, 'x', 'y', idRaw, 'abc1234')({ core: {}, $extensions: {} });
    check('a resolved document is still returned untouched', () =>
      !res.$extensions['com.closure']);
  }

  /*
    THE FILE'S STYLES REACH THE TOKEN TREE (2026-11-15, issue 6).

    A style used to arrive only as a NAME — $figmaStyleReferences maps it to a
    Figma id, restore.styles carries the definition for an import. Neither is a
    token, so Pomegranate Identity's four effect, one grid and eight paint
    styles were invisible to anything reading the tokens.

    Under their own `styles` set, because all three kinds collide with groups
    the variables own: `elevation` holds shadow-low/medium/high, `grid` holds
    columns/count/gutters/margins, `colours.gradient` exists.
  */
  const stRaw = {
    collections: [{
      id: 'f9', name: 'foundation',
      modes: [{ modeId: 'f9m', name: 'foundation' }],
      defaultModeId: 'f9m',
      variables: [mkVar('f9v', 'radius/small', 'FLOAT', { f9m: 4 })],
    }],
    styles: {
      textStyles: [],
      effectStyles: [
        { id: 'E:1', name: 'Elevation/medium', type: 'EFFECT', description: '', effects: [
          { type: 'DROP_SHADOW', visible: true, blendMode: 'NORMAL', color: [0, 0, 0, 0.12],
            offset: { x: 0, y: 3 }, radius: 6, spread: 0,
            bound: { color: 'core::core-colours/base/black' } },
          { type: 'DROP_SHADOW', visible: true, blendMode: 'NORMAL', color: [0, 0, 0, 0.08],
            offset: { x: 0, y: 6 }, radius: 24, spread: 0, bound: {} },
        ] },
        { id: 'E:2', name: 'Background blur', type: 'EFFECT', description: '', effects: [
          { type: 'BACKGROUND_BLUR', visible: true, blendMode: 'NORMAL', radius: 24, bound: {} },
        ] },
        { id: 'E:9', name: 'unreadable', type: 'EFFECT' },
      ],
      gridStyles: [
        { id: 'G:1', name: 'Grid/page', type: 'GRID', description: '', layoutGrids: [
          { pattern: 'COLUMNS', alignment: 'STRETCH', count: 12, gutterSize: 16, offset: 24,
            visible: true, bound: { gutterSize: 'foundation::grid/gutters' } },
        ] },
      ],
      paintStyles: [
        { id: 'P:1', name: 'Gradient/Fade out · down', type: 'PAINT', description: '', paints: [
          { type: 'GRADIENT_LINEAR', visible: true, blendMode: 'NORMAL', opacity: 1,
            gradientStops: [
              { position: 0, color: [0, 0, 0, 0] },
              { position: 1, color: [0, 0, 0, 1], bound: { color: 'core::core-colours/base/black' } },
            ], bound: {} },
        ] },
        { id: 'P:2', name: 'Surface/raised', type: 'PAINT', description: '', paints: [
          { type: 'SOLID', visible: true, blendMode: 'NORMAL', color: [1, 1, 1], opacity: 0.4,
            bound: {} },
        ] },
      ],
    },
  };
  const stTokens = plugin.toTokenFormat(
    plugin.transformToFinalFormat(stRaw, { includeDescriptions: true }).tokens, stRaw);
  const ST = (stTokens.foundation || {}).styles || {};
  check('the styles land under one group, one subgroup per kind', () =>
    !!(ST.effect && ST.grid && ST.paint));
  check('a two-layer effect style becomes a list of shadows', () => {
    const v = ST.effect.elevation.medium.value;
    return Array.isArray(v) && v.length === 2 && v[0].type === 'dropShadow' && v[0].y === '3';
  });
  check('a shadow colour bound to a variable is the reference, unbound is a literal', () => {
    const v = ST.effect.elevation.medium.value;
    return v[0].color === '{core-colours.base.black}' && /^(#|rgba)/.test(v[1].color);
  });
  check('a blur has no DTCG type, so it is the radius with its effect named', () => {
    const b = ST.effect['background-blur'];
    return b.value === 24 && b.type === 'number' && b.figmaEffect === 'BACKGROUND_BLUR';
  });
  check('a style that arrived as id-and-name only is not written', () =>
    ST.effect.unreadable === undefined);
  check('a grid style keeps the fields its pattern uses, bound ones as references', () => {
    const g = ST.grid.page;
    return g.pattern.value === 'COLUMNS' && g.count.value === 12 &&
      g.gutterSize.value === '{grid.gutters}';
  });
  check('a gradient becomes stops with colour and position', () => {
    const p = ST.paint.gradient['fade-out-down'];
    return p.type === 'gradient' && p.value.length === 2 &&
      p.value[1].color === '{core-colours.base.black}' && p.value[0].position === 0;
  });
  check('a solid paint becomes a colour, and its opacity is kept beside it', () => {
    const p = ST.paint.surface.raised;
    return p.type === 'color' && /^(#|rgba)/.test(p.value) && p.figmaOpacity === 0.4;
  });
  check('the styles sit in foundation, so both shapes carry them without a set of their own', () => {
    /* A set's groups merge at the THEME root, so a "styles" SET arrived as
       grid.page beside the grid variables. A group inside foundation does not. */
    return !stTokens.styles && !!(stTokens.foundation && stTokens.foundation.styles);
  });
  check('the gradient survives the DTCG conversion as $type gradient', () => {
    const dt = toDtcgFormat(stTokens, { shape: 'sets' }).tokens;
    return dt.foundation.styles.paint.gradient['fade-out-down'].$type === 'gradient';
  });
  check('the effect survives as $type shadow', () => {
    const dt = toDtcgFormat(stTokens, { shape: 'sets' }).tokens;
    return dt.foundation.styles.effect.elevation.medium.$type === 'shadow';
  });

  /*
    A PLAIN REFERENCE SURVIVES THE DIMENSION FAMILY (2026-11-15, issue 3).

    dimension and number resolved every reference, because they must evaluate
    arithmetic — `2*{dimension.base}` has no DTCG spelling. A value that is one
    reference and nothing else is not arithmetic, and resolving it threw the
    link away: 193 tokens of the real export came out as numbers where the file
    says `{core-dimensions.12}`.
  */
  const refTree = {
    core: {
      'core-dimensions': { 12: { value: 12, type: 'number' } },
      dimension: { base: { value: 4, type: 'dimension' } },
      'line-heights': { 100: { value: '100%', type: 'number' } },
    },
    foundation: {
      /* The math's targets sit in THIS set: in the sets shape each set is
         converted on its own, so a reference out of it cannot be resolved and
         would be left alone for that reason instead of this one. */
      dimension: { base: { value: 4, type: 'dimension' } },
      'core-dimensions': { 12: { value: 12, type: 'number' } },
      'line-heights': { 100: { value: '100%', type: 'number' } },
      radius: { medium: { value: '{core-dimensions.12}', type: 'dimension' } },
      spacing: { gutter: { value: '2*{dimension.base}', type: 'dimension' } },
      type: { leading: { value: '{line-heights.100}', type: 'number' } },
      computed: { lh: { value: '( {core-dimensions.12} / 100 ) * {line-heights.100}', type: 'number' } },
    },
    $metadata: { tokenSetOrder: ['core', 'foundation'] },
  };
  const refOut = toDtcgFormat(refTree, { shape: 'sets' }).tokens;
  check('a dimension that is one reference keeps the reference', () =>
    refOut.foundation.radius.medium.$value === '{core-dimensions.12}');
  check('a number that is one reference keeps the reference', () =>
    refOut.foundation.type.leading.$value === '{line-heights.100}');
  check('arithmetic is still evaluated — that is why this resolved at all', () =>
    refOut.foundation.spacing.gutter.$value.value === 8 &&
    refOut.foundation.spacing.gutter.$value.unit === 'px');
  check('a computed number with two references is still evaluated', () =>
    typeof refOut.foundation.computed.lh.$value === 'number');
  check('a plain number is untouched', () =>
    refOut.core.dimension.base.$value.value === 4);

  /*
    EVERY MODE OF THE SCHEME AXIS GETS A THEME (2026-11-15, second re-test).

    The scheme rule works from a hand-written list — neutral, inverted, white,
    black, brand, secondary — and that list is also what CLAIMS the collection,
    so the pass-through rule skips it. A file whose scheme axis has other modes
    got a theme for none of them, from either path.

    Pomegranate Identity has nine: the five it knows plus success, error, info
    and warning. The four sets were in the document and in tokenSetOrder, named
    and unselected — 212 values nothing pointed at.
  */
  const sRaw = {
    collections: [{
      id: 'sc1', name: 'scheme',
      modes: ['neutral', 'inverted', 'brand', 'white', 'black', 'success', 'error', 'info', 'warning']
        .map((n, i) => ({ modeId: 'sm' + i, name: n })),
      defaultModeId: 'sm0',
      variables: [mkVar('sv1', 'scheme/text/basic', 'COLOR',
        Object.fromEntries([...Array(9)].map((_, i) => ['sm' + i, { r: i / 10, g: 0, b: 0, a: 1 }])))],
    }],
  };
  const sTokens = plugin.toTokenFormat(
    plugin.transformToFinalFormat(sRaw, { includeDescriptions: true }).tokens, sRaw);
  const sThemes = sTokens.$themes || [];
  const sNames = sThemes.map((t) => t.name);
  check('a scheme mode the hand-written list does not know still gets a theme',
    ['success', 'error', 'info', 'warning'].every((n) => sNames.includes(n)));
  check('the five it does know are still there, and none is duplicated', () => {
    const want = ['neutral', 'inverted', 'brand', 'white', 'black'];
    return want.every((n) => sNames.filter((x) => x === n).length === 1);
  });
  check('a derived scheme mode selects its own set', () => {
    const t = sThemes.find((x) => x.name === 'warning');
    return t && t.selectedTokenSets['scheme/warning'] === 'enabled';
  });
  check('an undotted scheme collection is grouped like its siblings, not as ".scheme"', () => {
    const t = sThemes.find((x) => x.name === 'error');
    return t && t.group === 'scheme';
  });

  /*
    A TEXT STYLE'S PROPERTY COMES FROM THE VARIABLE IT BINDS (2026-11-15).

    foundation.typography.<scale>.<prop> pointed at the same-named sibling
    under breakpoint.typography — a convention, not a reading. Pomegranate
    Identity binds line height to `line-height-px` (an absolute, per
    breakpoint) while `line-height` beside it is a multiplier aliased to core
    (normal = 1.5). For eight of ten levels size × multiplier happens to equal
    the px value; for subtitle (22 → 26, not 33) and body-m (16 → 18, not 24)
    it does not, and the export described a line height the file never draws.

    `paragraph` below binds nothing, which is the other half of the rule: with
    no binding to read, the conventional sibling is all there is.
  */
  const tRaw = {
    collections: [{
      id: 'bp1', name: 'breakpoint',
      modes: [{ modeId: 'bm1', name: 'mobile' }],
      defaultModeId: 'bm1',
      variables: [
        mkVar('tv1', 'breakpoint/typography/subtitle/size', 'FLOAT', { bm1: 22 }),
        mkVar('tv2', 'breakpoint/typography/subtitle/line-height', 'FLOAT', { bm1: 1.5 }),
        mkVar('tv3', 'breakpoint/typography/subtitle/line-height-px', 'FLOAT', { bm1: 26 }),
        mkVar('tv4', 'breakpoint/typography/paragraph/size', 'FLOAT', { bm1: 16 }),
        mkVar('tv5', 'breakpoint/typography/paragraph/line-height', 'FLOAT', { bm1: 1.5 }),
      ],
    }],
    styles: {
      textStyles: [
        { id: 'S:1', name: 'Subtitle', type: 'TEXT', description: '',
          fontName: { family: 'Inter', style: 'Regular' }, textCase: 'ORIGINAL', textDecoration: 'NONE',
          values: { fontSize: 22 },
          bound: { fontSize: 'breakpoint::breakpoint/typography/subtitle/size',
                   lineHeight: 'breakpoint::breakpoint/typography/subtitle/line-height-px' } },
        { id: 'S:2', name: 'Paragraph', type: 'TEXT', description: '',
          fontName: { family: 'Inter', style: 'Regular' }, textCase: 'ORIGINAL', textDecoration: 'NONE',
          values: { fontSize: 16 }, bound: {} },
        /* A read that failed: id and name only, no bindings to offer. */
        { id: 'S:3', name: 'Subtitle', type: 'TEXT' },
      ],
    },
  };
  const tTokens = plugin.toTokenFormat(
    plugin.transformToFinalFormat(tRaw, { includeDescriptions: true }).tokens, tRaw);
  const styleTypo = (tTokens.foundation && tTokens.foundation.typography) || {};
  check('a bound property points at the variable the style binds, not the sibling', () => {
    return styleTypo.subtitle['line-height'].value === '{breakpoint.typography.subtitle.line-height-px}';
  });
  check('the binding also names the collection it came from', () => {
    return styleTypo.subtitle['line-height'].aliasCollection === 'breakpoint';
  });
  check('a property bound to the sibling is unchanged by the new reading', () => {
    return styleTypo.subtitle.size.value === '{breakpoint.typography.subtitle.size}';
  });
  check('an unbound property keeps the conventional sibling', () => {
    return styleTypo.paragraph['line-height'].value === '{breakpoint.typography.paragraph.line-height}';
  });
  /*
    THE STYLE'S NAME IS NOT THE SCALE'S NAME (2026-11-15, third export).

    c054e82 read the bindings correctly and still changed nothing in the real
    export: every style is called `Title/Display`, `Body/M`, `Title/Subtitle`,
    so the key came out `title/display` and matched no scale. Both shapes are
    needed — the whole path hyphenated for `Title/XL` -> `title-xl`, the last
    segment alone for `Title/Display` -> `display` — and the file decides which.
  */
  const nRaw = {
    collections: [{
      id: 'bp2', name: 'breakpoint',
      modes: [{ modeId: 'nm1', name: 'mobile' }],
      defaultModeId: 'nm1',
      variables: [
        mkVar('nv1', 'breakpoint/typography/display/size', 'FLOAT', { nm1: 40 }),
        mkVar('nv2', 'breakpoint/typography/display/line-height', 'FLOAT', { nm1: 1.2 }),
        mkVar('nv3', 'breakpoint/typography/display/line-height-px', 'FLOAT', { nm1: 48 }),
        mkVar('nv4', 'breakpoint/typography/title-xl/size', 'FLOAT', { nm1: 32 }),
        mkVar('nv5', 'breakpoint/typography/title-xl/line-height-px', 'FLOAT', { nm1: 38.4 }),
        mkVar('nv6', 'breakpoint/typography/subtitle/size', 'FLOAT', { nm1: 22 }),
        mkVar('nv7', 'breakpoint/typography/subtitle/line-height-px', 'FLOAT', { nm1: 26 }),
      ],
    }],
    styles: {
      textStyles: ['Title/Display', 'Title/XL', 'Title/Subtitle'].map((name, i) => ({
        id: 'S:' + (20 + i), name: name, type: 'TEXT', description: '',
        fontName: { family: 'Inter', style: 'Bold' }, textCase: 'ORIGINAL', textDecoration: 'NONE',
        values: {},
        bound: { lineHeight: 'breakpoint::breakpoint/typography/' +
          ['display', 'title-xl', 'subtitle'][i] + '/line-height-px' },
      })),
    },
  };
  const nTypo = (plugin.toTokenFormat(
    plugin.transformToFinalFormat(nRaw, { includeDescriptions: true }).tokens, nRaw)
    .foundation || {}).typography || {};
  check('"Title/XL" resolves to the scale title-xl (whole path hyphenated)', () =>
    nTypo['title-xl']['line-height'].value === '{breakpoint.typography.title-xl.line-height-px}');
  check('"Title/Display" resolves to the scale display (last segment alone)', () =>
    nTypo.display['line-height'].value === '{breakpoint.typography.display.line-height-px}');
  check('"Title/Subtitle" resolves to subtitle, not title-subtitle', () =>
    nTypo.subtitle['line-height'].value === '{breakpoint.typography.subtitle.line-height-px}');

  check('an id-and-name-only style does not blank out what a real one bound', () => {
    // S:3 is the same scale as S:1 and carries no `bound`; S:1 must survive it.
    return styleTypo.subtitle['line-height'].value.indexOf('line-height-px') !== -1;
  });

  /*
    A THEME PER MODE, FOR A COLLECTION NO RULE RECOGNISES (2026-11-15).

    The pass-through writer has always emitted one set per mode — 37 of them on
    Pomegranate Identity, every one named in tokenSetOrder. Nothing selected
    them: $themes held only "foundation" and ".core", built from the two
    collections whose names happen to match a rule. A reader following $themes
    therefore saw one mode of each collection and read it as modes being
    dropped.

    weightLikeFixture() has exactly that shape: `weight` has three modes and no
    rule claims it.
  */
  const themeNames = (wtokens.$themes || []).map((t) => t.name);
  check('an unclaimed multi-mode collection gets one theme per mode',
    ['light', 'regular', 'bold'].every((m) => themeNames.includes(m)),
    'themes were: ' + themeNames.join(', '));
  check('each one is grouped under its collection and selects its own set', () => {
    const t = (wtokens.$themes || []).find((x) => x.name === 'bold');
    return t && t.group === 'weight' && t.selectedTokenSets['weight/bold'] === 'enabled';
  });
  /*
    This used to assert that a single-mode collection gets NO theme, because
    one set offers no choice. True of the axis rule, which still skips it —
    but it left such a set with nothing marking it `enabled`, reachable only
    inside themes that take it as `source`. On Pomegranate Identity that was
    `base`, 624 values with no theme that IS base the way `foundation` and
    `.core` are. The rule now is the sharper one: every set is claimed by
    exactly one theme.
  */
  check('a single-mode collection\'s set is claimed by exactly one theme', () => {
    /* `uses` is the single-mode collection here. The axis rule still skips it;
       the orphan rule gives it the theme that marks its set enabled.
       (`core` and `foundation` are sets this exporter writes whether or not
       the file has such a collection, so there is nothing to attach a theme
       to when it does not — which is the case in this fixture.) */
    const claims = (wtokens.$themes || [])
      .filter((t) => (t.selectedTokenSets || {})['uses'] === 'enabled');
    return claims.length === 1 && claims[0].name === 'uses';
  });
  check('and the theme still closes: what its tokens reference is pulled in', () => {
    const t = (wtokens.$themes || []).find((x) => x.name === 'light');
    // `uses` references {weight.style-name}; a weight set must be selected.
    return t && Object.keys(t.selectedTokenSets).some((k) => k.indexOf('weight/') === 0);
  });

  /*
    A COMPOSITE CELL IS NAMED, NOT ID-ED (2026-11-15).

    { color: <alias>, opacity: <alias> } carries no `type: 'VARIABLE_ALIAS'` of
    its own, so the bare-alias branch walked past it and the raw value went out:
    21 tokens of Pomegranate Identity's per-theme export held strings like
    "VariableID:69:10655", which mean nothing outside that file. Verified against
    a real export on 2026-11-15: 21 before, and this is the path that wrote them.
  */
  const cRaw = {
    collections: [{
      id: 'cc1', name: 'foundation',
      modes: [{ modeId: 'cm1', name: 'foundation' }],
      defaultModeId: 'cm1',
      variables: [{
        id: 'cv1', name: 'colours/gradient/accent-0', type: 'COLOR',
        valuesByMode: { cm1: { color: { type: 'VARIABLE_ALIAS', id: 'VariableID:69:10655' },
                               opacity: { type: 'VARIABLE_ALIAS', id: 'VariableID:44:3509' } } },
        resolvedValuesByMode: { cm1: { color: { type: 'VARIABLE_ALIAS', id: 'VariableID:69:10655' },
                                       opacity: { type: 'VARIABLE_ALIAS', id: 'VariableID:44:3509' } } },
        /* What the extractor now records for a composite, in place of nothing. */
        aliasInfo: { cm1: { isAlias: false, isComposite: true,
                            parts: { color: 'core-colours.base.black', opacity: 'core-percentage.40' },
                            partCollections: { color: '.core', opacity: '.core' } } },
        codeSyntax: {}, description: '',
      }, {
        /* A composite with one field bound and one literal — the unbound half
           must keep its value rather than vanish with the ids. */
        id: 'cv2', name: 'colours/scrim', type: 'COLOR',
        valuesByMode: { cm1: { color: { type: 'VARIABLE_ALIAS', id: 'VariableID:1:1' }, opacity: 0.4 } },
        resolvedValuesByMode: { cm1: { color: { type: 'VARIABLE_ALIAS', id: 'VariableID:1:1' }, opacity: 0.4 } },
        aliasInfo: { cm1: { isAlias: false, isComposite: true,
                            parts: { color: 'core-colours.base.white' }, partCollections: { color: '.core' } } },
        codeSyntax: {}, description: '',
      }],
    }],
  };
  const cNative = plugin.transformToFinalFormat(cRaw, { includeDescriptions: true }).tokens;
  const cTokens = plugin.toTokenFormat(cNative, cRaw);
  check('no Figma id survives into a composite token value',
    JSON.stringify(cTokens).indexOf('VariableID:') === -1);
  check('each half of a composite is written as the name its target spells', () => {
    const t = cTokens.foundation.colours.gradient['accent-0'];
    return t.value.color === '{core-colours.base.black}' && t.value.opacity === '{core-percentage.40}';
  });
  check('a literal half of a composite keeps its value', () => {
    const t = cTokens.foundation.colours.scrim;
    return t.value.color === '{core-colours.base.white}' && t.value.opacity === 0.4;
  });
  check('a composite names the collection of each of its references',
    () => {
      const t = cTokens.foundation.colours.gradient['accent-0'];
      return t.aliasCollectionParts && t.aliasCollectionParts.color === '.core';
    });
  check('isAliasComposite knows the shape from a bare alias and from a plain value',
    plugin.isAliasComposite({ color: { type: 'VARIABLE_ALIAS', id: 'x' } }) === true &&
    plugin.isAliasComposite({ type: 'VARIABLE_ALIAS', id: 'x' }) === false &&
    plugin.isAliasComposite({ r: 1, g: 0, b: 0, a: 1 }) === false &&
    plugin.isAliasComposite(null) === false);

  // The map that feeds it, read off the collections Figma handed over.
  const names = plugin.defaultModeSetNames({
    collections: [
      { name: 'weight', defaultModeId: 'm2',
        modes: [{ modeId: 'm1', name: 'regular' }, { modeId: 'm2', name: 'light' }] },
      { name: '.mode', defaultModeId: 'd1',
        modes: [{ modeId: 'd1', name: 'light' }, { modeId: 'd2', name: 'dark' }] },
      { name: 'foundation', defaultModeId: 'f1', modes: [{ modeId: 'f1', name: 'foundation' }] },
    ],
  });
  check('the default-mode map names the default set, strips the helper dot, and keeps a single-mode collection bare',
    names['weight/light'] === true && names['weight/regular'] === undefined &&
    names['mode/light'] === true && names['foundation'] === true);
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
