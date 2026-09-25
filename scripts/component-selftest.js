#!/usr/bin/env node
//
// component-selftest.js — the component-set capture's own suite. No Figma.
//
// The capture is the one module that touches a node, so the whole point of the
// split is that it can still be driven without one: a stand-in tree and a
// stand-in figma, and every decision it makes is assertable here rather than
// only in a live file.
//
const {
  firstEntry, pathFrom, outermostInstance, hiddenWithin, captureComponentSet,
} = require('../src/component-capture.js');

let pass = 0, fail = 0;
/* The one asynchronous group. Everything else is synchronous, so the tally is
   printed after this settles rather than before it starts. */
let pending = Promise.resolve();
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('ok    ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
}

/* A node stand-in with the surface the capture reads. Children are wired to
   their parent on construction, because every path and ancestry question the
   module asks is answered by walking up. */
let seq = 0;
function node(props, children) {
  const n = Object.assign({
    id: 'n' + ++seq, name: 'node', type: 'FRAME', visible: true,
    width: 0, height: 0, boundVariables: {}, parent: null,
  }, props);
  n.children = children || [];
  n.children.forEach((c) => { c.parent = n; });
  n.findAll = function () {
    const out = [];
    (function walk(x) { x.children.forEach((c) => { out.push(c); walk(c); }); })(n);
    return out;
  };
  return n;
}

/* The variables and styles the stand-in figma knows about. */
function figmaWith(vars, styles) {
  return {
    fileKey: 'FILEKEY',
    variables: {
      getVariableByIdAsync: async (id) => (vars[id] ? { name: vars[id] } : null),
    },
    getStyleByIdAsync: async (id) => (styles && styles[id] ? { name: styles[id] } : null),
  };
}

/* ── the walk-up helpers ──────────────────────────────────────────────────── */
{
  const leaf = node({ name: 'Digits', type: 'TEXT' });
  const badge = node({ name: 'ODS Badge', type: 'INSTANCE' }, [leaf]);
  const root = node({ name: 'Variant=A', type: 'COMPONENT' }, [badge]);

  ok('path: the variant root is called root, whatever the variant is named',
     pathFrom(root, root) === 'root', pathFrom(root, root));
  ok('path: a nested layer carries its ancestry, so two layers sharing a name cannot merge',
     pathFrom(leaf, root) === 'ODS Badge/Digits', pathFrom(leaf, root));
  ok('instance: a layer inside one names the outermost instance it is in',
     outermostInstance(leaf, root) === badge);
  ok('instance: and the component\'s own layers are inside none',
     outermostInstance(badge, root) === badge && outermostInstance(root, root) === null);

  ok('entry: fills arrive as an array of paints and only the first is read',
     firstEntry([{ id: 'v1' }, { id: 'v2' }]).id === 'v1');
  ok('entry: everything else arrives alone',
     firstEntry({ id: 'v9' }).id === 'v9');
}

/* ── hidden travels down ──────────────────────────────────────────────────── */
{
  const leaf = node({ name: 'Label', type: 'TEXT' });
  const wrap = node({ name: 'Wrap', visible: false }, [leaf]);
  const root = node({ name: 'Variant=A', type: 'COMPONENT' }, [wrap]);
  ok('hidden: a layer under a hidden ancestor is hidden, because Figma leaves it out of layout',
     hiddenWithin(leaf, root) === true);
  ok('hidden: and a visible one under a visible root is not',
     hiddenWithin(root, root) === false);
}

/* ── what is worth writing down ───────────────────────────────────────────── */
{
  const plain = node({ name: 'Spacer' });                                  // nothing to say
  const bound = node({ name: 'Box', boundVariables: { fills: { id: 'v1' } } });
  const text = node({ name: 'Label', type: 'TEXT', textAlignHorizontal: 'CENTER', textStyleId: 's1' });
  const inst = node({ name: 'Badge', type: 'INSTANCE' });
  const auto = node({ name: 'Row', layoutMode: 'HORIZONTAL', itemSpacing: 8,
                      paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 4,
                      primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'MIN' });
  const root = node({ name: 'Variant=A', type: 'COMPONENT', width: 10, height: 10 },
                    [plain, bound, text, inst, auto]);
  const set = node({ name: 'Thing', type: 'COMPONENT_SET', componentPropertyDefinitions: {} }, [root]);
  set.children[0].variantProperties = { Size: 'Large' };

  /* Held, not returned: a `return` here is a return from the MODULE, and every
     test written below it would be dead code that reports nothing and passes. */
  pending = captureComponentSet(set, figmaWith({ v1: 'colours/basic/text' }, { s1: 'Body M Bold' }), {})
    .then((cap) => {
      const paths = cap.variants[0].layers.map((l) => l.path);
      ok('capture: a layer with nothing to say is left out',
         paths.indexOf('Spacer') === -1, paths.join(','));
      ok('capture: and everything that has something is kept — bound, text, instance, auto-layout',
         ['root', 'Box', 'Label', 'Badge', 'Row'].every((p) => paths.indexOf(p) !== -1),
         paths.join(','));

      const box = cap.variants[0].layers.find((l) => l.path === 'Box');
      ok('capture: a binding is recorded by the variable\'s NAME, not its id',
         box.bindings.fills === 'colours/basic/text', JSON.stringify(box.bindings));

      const label = cap.variants[0].layers.find((l) => l.path === 'Label');
      ok('capture: a text layer resolves its style, which is the one fact seven bindings share',
         label.textStyle && label.textStyle.name === 'Body M Bold', JSON.stringify(label.textStyle));
      ok('capture: and keeps its alignment, which no binding carries',
         label.textAlign === 'CENTER');

      const row = cap.variants[0].layers.find((l) => l.path === 'Row');
      ok('capture: auto-layout is recorded whole — mode, gap, padding, both alignments',
         row.layout.mode === 'HORIZONTAL' && row.layout.gap === 8 &&
         row.layout.padding.join(',') === '1,2,3,4' &&
         row.layout.primary === 'CENTER' && row.layout.counter === 'MIN',
         JSON.stringify(row.layout));

      ok('capture: the set\'s own identity travels with it',
         cap.name === 'Thing' && cap.fileKey === 'FILEKEY' && cap.nodeId === set.id);
      ok('capture: and the variant says which combination it is',
         cap.variants[0].props.Size === 'Large');
    });
}

/* ── the collapse ─────────────────────────────────────────────────────────── */
{
  const { layerFacts, smallestKey, collapse, presence, contract } =
    require('../src/component-contract.js');
  const axes = ['Variant', 'Size', 'Badge'];
  const P = (V, S, B) => ({ Variant: V, Size: S, Badge: B });

  /* The smallest key wins, because a larger one is true and misleading: it
     tells the reader the value depends on things it does not. */
  {
    const rows = [
      { props: P('A', 'L', 'N'), value: 'big' }, { props: P('B', 'L', 'N'), value: 'big' },
      { props: P('A', 'S', 'N'), value: 'small' }, { props: P('B', 'S', 'N'), value: 'small' },
    ];
    ok('collapse: a value that follows one axis is keyed by that axis alone',
       smallestKey(rows, axes).join(',') === 'Size', smallestKey(rows, axes).join(','));
    ok('collapse: and comes back as a map of exactly its values',
       JSON.stringify(collapse(rows, axes)) === '{"Size=L":"big","Size=S":"small"}',
       JSON.stringify(collapse(rows, axes)));
  }

  /* Agreement is the commonest case and costs no key at all. */
  {
    const rows = [{ props: P('A', 'L', 'N'), value: 'x' }, { props: P('B', 'S', 'I'), value: 'x' }];
    ok('collapse: a fact every variant agrees on loses its key entirely',
       collapse(rows, axes) === 'x');
  }

  /*
    THE ODD ONE OUT. Measured on the real ODS Avatar: seventeen variants FIXED
    and one HUG, which no axis predicts — so the smallest key is every axis and
    the fact costs eighteen lines to say "FIXED, except once". A lone variant
    disagreeing with its siblings is almost always a slip, and the form that
    buries it hides the most interesting thing on the layer.
  */
  {
    const rows = [];
    ['A', 'B', 'C'].forEach((v) => ['L', 'M'].forEach((s) => rows.push({ props: P(v, s, 'N'), value: 'FIXED' })));
    rows[3].value = 'HUG';
    const out = collapse(rows, axes);
    ok('collapse: one variant disagreeing with the rest is named as an exception',
       out['*'] === 'FIXED' && out['Variant=B, Size=M, Badge=N'] === 'HUG', JSON.stringify(out));
    ok('collapse: and the exception form is only taken when it is shorter',
       Object.keys(out).length === 2, JSON.stringify(out));
  }

  /* Presence is a fact like any other, and gets the same smallest key. */
  {
    const all = [P('A', 'L', 'N'), P('A', 'S', 'N'), P('B', 'L', 'N'), P('B', 'S', 'N')];
    ok('when: a layer only some variants have says which, by the axis that decides it',
       presence([true, true, false, false], all, axes) === 'Variant=A',
       presence([true, true, false, false], all, axes));
    ok('when: and a layer every variant has says nothing',
       presence([true, true, true, true], all, axes) === null);
  }

  /*
    A TEXT STYLE IS ONE FACT, NOT SEVEN. RADD typography is authored as styles
    and a style bundles fontSize, family, weight, lineHeight, letterSpacing,
    paragraphSpacing and paragraphIndent — on ODS Avatar that is seven bindings
    saying `typography/body-M-bold/*`, in every one of eighteen variants.
  */
  {
    const styled = layerFacts({
      path: 'Digits', type: 'TEXT', sizing: ['FILL', 'HUG'],
      textStyle: { name: 'Body M Bold' },
      bindings: { fills: 'colours/basic/text-on-accent',
                  fontSize: 'typography/body-M-bold/size',
                  fontFamily: 'typography/body-M-bold/font-family',
                  lineHeight: 'typography/body-M-bold/line-height' },
    });
    ok('typography: the style is kept and its seven parts are not repeated',
       styled.textStyle === 'Body M Bold' && styled.fontSize === undefined &&
       styled.fills === 'colours/basic/text-on-accent', JSON.stringify(styled));

    const unstyled = layerFacts({
      path: 'Loose', type: 'TEXT', sizing: ['HUG', 'HUG'],
      bindings: { fontSize: 'typography/body-M-bold/size' },
    });
    ok('typography: but a layer binding them with no style has no shorter truth',
       unstyled.fontSize === 'typography/body-M-bold/size', JSON.stringify(unstyled));
  }

  /* Four corners agreeing is one radius; disagreeing is four facts. */
  {
    const round = layerFacts({ path: 'x', type: 'FRAME', bindings: {
      topLeftRadius: 'radius/full', topRightRadius: 'radius/full',
      bottomRightRadius: 'radius/full', bottomLeftRadius: 'radius/full' } });
    ok('radius: four corners agreeing is one fact', round.radius === 'radius/full' &&
       round.topLeftRadius === undefined, JSON.stringify(round));
    const partial = layerFacts({ path: 'x', type: 'FRAME', bindings: {
      topLeftRadius: 'radius/full', topRightRadius: 'radius/full' } });
    ok('radius: and a component that rounds two corners means it',
       partial.radius === undefined && partial.topLeftRadius === 'radius/full',
       JSON.stringify(partial));
  }

  /*
    A SIZE IS A DECISION ONLY WHERE IT WAS CHOSEN. On ODS Avatar the Digits
    layer is FILL/HUG and its width is whatever the placeholder digits render
    to — a contract carrying that reports a change every time someone edits the
    text.
  */
  {
    const fixed = layerFacts({ path: 'a', type: 'FRAME', bindings: {}, sizing: ['FIXED', 'FIXED'], size: [48, 48] });
    const hug = layerFacts({ path: 'b', type: 'TEXT', bindings: {}, sizing: ['FILL', 'HUG'], size: [14, 20] });
    ok('size: a fixed layer records the number somebody typed',
       fixed.width === 48 && fixed.height === 48, JSON.stringify(fixed));
    ok('size: a hugging one records nothing, because the number is a consequence',
       hug.width === undefined && hug.height === undefined, JSON.stringify(hug));
    const bound = layerFacts({ path: 'c', type: 'FRAME', bindings: { width: 'sizing/component/14' },
                               sizing: ['FIXED', 'FIXED'], size: [48, 48] });
    ok('size: and a bound one records the token, not the token\'s value twice',
       bound.width === 'sizing/component/14', JSON.stringify(bound));
  }

  /* End to end, on a two-axis stand-in. */
  {
    const layer = (path, over) => Object.assign({ path, type: 'FRAME', bindings: {}, sizing: ['FIXED', 'FIXED'], size: [10, 10] }, over);
    const variant = (Size, Variant) => ({ props: { Size, Variant }, layers: [
      layer('root', { bindings: { width: Size === 'L' ? 'sizing/14' : 'sizing/10' } }),
      ...(Variant === 'Avatar' ? [layer('Image', { bindings: { fills: 'colours/img' } })] : []),
    ] });
    const capture = {
      name: 'Thing', nodeId: '1:1', fileKey: 'K', description: '',
      api: [{ name: 'Size', type: 'VARIANT', values: ['L', 'S'], default: 'L' },
            { name: 'Variant', type: 'VARIANT', values: ['Avatar', 'Icon'], default: 'Avatar' }],
      variants: [variant('L', 'Avatar'), variant('S', 'Avatar'), variant('L', 'Icon'), variant('S', 'Icon')],
    };
    const c = contract(capture);
    ok('contract: the api survives with its values and defaults',
       c.api.Size.values.join(',') === 'L,S' && c.api.Size['default'] === 'L', JSON.stringify(c.api));
    ok('contract: a width that follows Size is keyed by Size',
       JSON.stringify(c.layers.root.width) === '{"Size=L":"sizing/14","Size=S":"sizing/10"}',
       JSON.stringify(c.layers.root.width));
    ok('contract: a layer only one variant value has says when',
       c.layers.Image.when === 'Variant=Avatar', c.layers.Image.when);
    ok('contract: and the summary counts what a reader is about to see',
       c.summary.variants === 4 && c.summary.layers === 2 && c.summary.facts > 0,
       JSON.stringify(c.summary));
  }
}

/* ── the file, and where it goes ──────────────────────────────────────────── */
{
  const fileMod = require('../src/component-file.js');
  const { contract } = require('../src/component-contract.js');

  ok('slug: a component name becomes one path segment',
     fileMod.slugFor('ODS Avatar') === 'ods-avatar', fileMod.slugFor('ODS Avatar'));
  ok('slug: punctuation collapses rather than accumulating',
     fileMod.slugFor('Button / Primary (new)') === 'button-primary-new',
     fileMod.slugFor('Button / Primary (new)'));
  ok('slug: and a name with nothing usable still produces a segment',
     fileMod.slugFor('  ---  ') === 'component', fileMod.slugFor('  ---  '));

  ok('path: the default puts the contract inside the component\'s own folder',
     fileMod.pathFor('ODS Avatar', { dir: 'packages/ds' }) ===
       'packages/ds/ods-avatar/ods-avatar.contract.json',
     fileMod.pathFor('ODS Avatar', { dir: 'packages/ds' }));
  ok('path: a repository with its own shape says so',
     fileMod.pathFor('ODS Avatar', { dir: 'contracts', pattern: '{dir}/{slug}.json' }) ===
       'contracts/ods-avatar.json');
  /* A repo path is relative. An absolute one is refused by both providers with
     a message about nothing in particular. */
  ok('path: an empty folder leaves no leading slash behind',
     fileMod.pathFor('ODS Avatar', { pattern: '{dir}/{slug}.json' }) === 'ods-avatar.json',
     fileMod.pathFor('ODS Avatar', { pattern: '{dir}/{slug}.json' }));

  /*
    THE ONE PROPERTY THAT MATTERS MORE THAN BEING RIGHT. The file lands in a
    repository and is reviewed as a diff, so the same component must produce
    the same bytes — otherwise every push is a rewrite and the diff that was
    meant to show a decision shows the file being shuffled.
  */
  const build = (apiOrder, layerOrder) => ({
    name: 'T', nodeId: '1:1', fileKey: 'K', description: '',
    api: apiOrder,
    variants: [
      { props: { Size: 'L', Variant: 'A' }, layers: layerOrder.map((p) => ({
        path: p, type: 'FRAME', bindings: { width: 'w14' }, sizing: ['FIXED', 'FIXED'], size: [1, 1] })) },
      { props: { Size: 'S', Variant: 'A' }, layers: layerOrder.map((p) => ({
        path: p, type: 'FRAME', bindings: { width: 'w10' }, sizing: ['FIXED', 'FIXED'], size: [1, 1] })) },
    ],
  });
  const axesA = [{ name: 'Size', type: 'VARIANT', values: ['L', 'S'] },
                 { name: 'Variant', type: 'VARIANT', values: ['A'] }];
  const axesB = [{ name: 'Variant', type: 'VARIANT', values: ['A'] },
                 { name: 'Size', type: 'VARIANT', values: ['L', 'S'] }];

  ok('file: the axis order Figma happens to report does not reach the file',
     fileMod.serialise(contract(build(axesA, ['root', 'Box']))) ===
     fileMod.serialise(contract(build(axesB, ['root', 'Box']))));
  ok('file: nor does the z-order the layers came back in',
     fileMod.serialise(contract(build(axesA, ['root', 'Box']))) ===
     fileMod.serialise(contract(build(axesA, ['Box', 'root']))));

  const text = fileMod.serialise(contract(build(axesA, ['root', 'Box'])));
  ok('file: the summary is derived, so it is not written — six numbers churning on every edit',
     text.indexOf('summary') === -1);
  ok('file: a layer that is not an instance says nothing about instances',
     text.indexOf('instanceOf') === -1, text.slice(0, 120));
  ok('file: it ends with a newline, like everything else in a repository',
     text.charAt(text.length - 1) === '\n');
  ok('file: and it reads back as what it was',
     fileMod.parse(text).component === 'T');
  let refused = null;
  try { fileMod.parse('{"hello":true}'); } catch (e) { refused = e.message; }
  ok('file: something that is not a contract is refused rather than half-read',
     /not a component contract/.test(refused || ''), String(refused));

  /*
    FINDING WHAT A REPOSITORY ALREADY HOLDS, from names alone. A tree listing
    gives names, and opening forty files to ask each one what it is would be
    forty requests to answer a question the name settles.
  */
  ok('browse: a contract is recognised by its suffix',
     fileMod.isContractPath('src/panel/node/Avatar.contract.json') === true);
  ok('browse: and the component beside it is not mistaken for one',
     fileMod.isContractPath('src/panel/node/Avatar.tsx') === false &&
     fileMod.isContractPath('package.json') === false &&
     fileMod.isContractPath(null) === false);
  ok('browse: a contract names the component it is for, without its folders',
     fileMod.componentOfPath('src/panel/node/Avatar.contract.json') === 'Avatar',
     fileMod.componentOfPath('src/panel/node/Avatar.contract.json'));

  /*
    ONE LEVEL AT A TIME. A flat list of every folder is fine for nine and
    unusable for four hundred, which is the shape a monorepo actually has. The
    ladder is built from the same paths; this is the arithmetic under it.
  */
  {
    const childrenOf = (folders, prefix) => {
      const at = prefix ? prefix + '/' : '';
      const out = [];
      folders.forEach((f) => {
        if (prefix && f.indexOf(at) !== 0) return;
        const rest = f.slice(at.length);
        if (!rest || rest.indexOf('/') !== -1) return;
        if (out.indexOf(rest) === -1) out.push(rest);
      });
      return out.sort();
    };
    const dirs = ['apps', 'apps/web', 'docs', 'packages', 'packages/react',
                  'packages/react/src', 'packages/react/src/panel',
                  'packages/react/src/panel/node', 'packages/tokens'];
    ok('ladder: the first level is the repository\'s own top folders',
       childrenOf(dirs, '').join(',') === 'apps,docs,packages', childrenOf(dirs, '').join(','));
    ok('ladder: a level offers only what is inside the one above it',
       childrenOf(dirs, 'packages').join(',') === 'react,tokens',
       childrenOf(dirs, 'packages').join(','));
    ok('ladder: a grandchild is not offered as a child',
       childrenOf(dirs, 'packages').indexOf('src') === -1);
    ok('ladder: a folder with nothing inside ends the descent',
       childrenOf(dirs, 'packages/react/src/panel/node').length === 0);
    ok('ladder: and a prefix that merely starts the same is not a parent',
       childrenOf(dirs, 'app').length === 0, JSON.stringify(childrenOf(dirs, 'app')));
  }

  /*
    RECOGNISING THE COMPONENT IN THE REPOSITORY.

    Figma writes "ODS File Upload" and a repository writes FileUpload.tsx. The
    case, the spaces and the extension are house style on each side, and the
    words underneath are the same words.
  */
  {
    const tree = {
      folders: ['packages', 'packages/react', 'packages/react/src',
                'packages/react/src/panel', 'packages/react/src/panel/node'],
      files: ['packages/react/src/panel/node/Avatar.tsx',
              'packages/react/src/panel/node/Button.tsx',
              'packages/react/src/panel/node/Button.contract.json',
              'packages/react/src/panel/node/FileUpload.tsx',
              'packages/react/src/panel/node/Badge.tsx'],
    };
    const find = (name) => fileMod.matchInRepo(name, tree);
    const place = (name) => fileMod.pathForMatch(name, find(name));

    ok('match: two spellings of one name meet in the middle',
       fileMod.words('ODS File Upload').join(',') === 'ods,file,upload' &&
       fileMod.words('FileUpload.tsx').join(',') === 'file,upload,tsx',
       fileMod.words('FileUpload.tsx').join(','));
    ok('match: a component finds the source file that is named for it',
       find('ODS Avatar').path === 'packages/react/src/panel/node/Avatar.tsx');
    ok('match: and camel case is not an obstacle',
       find('ODS File Upload').path === 'packages/react/src/panel/node/FileUpload.tsx');

    /*
      THE PREFIX IS OUT-MATCHED RATHER THAN STRIPPED. Hardcoding "ODS" would
      work for one library and quietly mis-file another's, so a candidate wins
      by being what the name ENDS with — and the direction is what keeps Badge
      away from a badge NUMBER.
    */
    ok('match: a design-system prefix falls away without being named',
       find('RADD Avatar').path === 'packages/react/src/panel/node/Avatar.tsx' &&
       find('Avatar').path === 'packages/react/src/panel/node/Avatar.tsx');
    ok('match: but a component is not its own first word',
       find('ODS Badge Number') === null, JSON.stringify(find('ODS Badge Number')));
    ok('match: and a name the repo has never heard of matches nothing',
       find('Totally Unknown') === null);

    ok('match: an existing contract outranks the source beside it',
       find('ODS Button').kind === 'contract' &&
       place('ODS Button') === 'packages/react/src/panel/node/Button.contract.json');
    /* A source file gives its folder AND its name — Avatar.tsx makes
       Avatar.contract.json, which is how the repository would have spelled it. */
    ok('match: a source file names the contract that goes beside it',
       place('ODS Avatar') === 'packages/react/src/panel/node/Avatar.contract.json',
       place('ODS Avatar'));

    /* Two right answers is a fact to report, not a coin to toss. */
    {
      const twin = { folders: [], files: ['packages/react/Avatar.tsx', 'packages/vue/Avatar.tsx'] };
      const m = fileMod.matchInRepo('ODS Avatar', twin);
      ok('match: the same component in two packages says so rather than choosing quietly',
         m.alternatives.length === 1, JSON.stringify(m));
    }
    /* A folder-per-component repository is the other house style, and it
       carries no file to take a name from. */
    {
      const byFolder = { folders: ['src/Avatar', 'src/Button'], files: [] };
      const m = fileMod.matchInRepo('ODS Avatar', byFolder);
      ok('match: a folder named for the component is a home too',
         m.kind === 'folder' &&
         fileMod.pathForMatch('ODS Avatar', m) === 'src/Avatar/ods-avatar.contract.json',
         fileMod.pathForMatch('ODS Avatar', m));
    }
  }

  /* The exception form's rule reads before its exceptions, which is the order
     a person says it in. */
  const exc = fileMod.orderedMap({ 'Size=S': 'x', '*': 'FIXED', 'Size=L': 'y' });
  ok('file: `*` is written first, then the exceptions in a fixed order',
     Object.keys(exc).join(',') === '*,Size=L,Size=S', Object.keys(exc).join(','));
}

/* ── compare: this component against the contract the repo holds ──────────── */
{
  const { factChange, diff } = require('../src/component-diff.js');

  /*
    THREE KINDS OF DIFFERENCE, and they are not the same news. A value moved
    is a decision; a shape moved is the architecture, and the same eventual
    values can arrive through a completely different rule.
  */
  ok('compare: two sides stating the same value are not a difference',
     factChange('a', 'a') === null);
  ok('compare: two sides stating different values is a value change',
     factChange('a', 'b') === 'value');
  ok('compare: a constant on one side and a map on the other is the shape moving',
     factChange('a', { 'Size=L': 'a' }) === 'shape');
  ok('compare: the same axes disagreeing about a case is per-variant',
     factChange({ 'Size=L': 'a' }, { 'Size=L': 'b' }) === 'per-variant');
  ok('compare: and following a different axis is the shape moving, though every value matched',
     factChange({ 'Size=L': 'a' }, { 'Variant=A': 'a' }) === 'shape');
  /* Parsed objects, not text: a contract somebody hand-edited is allowed to be
     untidy without being reported as changed. */
  ok('compare: a map written in another key order is the same fact',
     factChange({ a: 1, b: 2 }, { b: 2, a: 1 }) === null);

  const base = {
    component: 'A',
    api: { Size: { type: 'variant', values: ['L', 'S'], default: 'L' } },
    composes: ['Badge'],
    layers: { root: { radius: 'radius/full', width: { 'Size=L': 'w14', 'Size=S': 'w10' } } },
  };
  const clone = () => JSON.parse(JSON.stringify(base));

  ok('compare: a contract that matches says so, and says it from the rows rather than beside them',
     diff(base, clone()).same === true);

  /*
    THE API IS THE PROMISE, reported apart from everything else: an axis losing
    a value is a promise withdrawn from everyone who used it, and ranking that
    alongside a padding change would be the report losing its nerve.
  */
  {
    const r = clone(); r.api.Size.values = ['L'];
    const d = diff(base, r);
    ok('compare: an axis losing a value is reported as an api change',
       d.api.values.length === 1 && d.api.values[0].removed.join(',') === 'S',
       JSON.stringify(d.api.values));
    ok('compare: and it alone makes the two sides differ',
       d.same === false && d.summary.apiChanges === 1, JSON.stringify(d.summary));
  }
  {
    const r = clone(); r.api.Size['default'] = 'S';
    ok('compare: a default moving is named, because it is what every consumer gets',
       diff(base, r).api.defaults[0].repo === 'S');
  }

  /* A layer only one side has is reported once, as a layer — listing every
     fact inside it again would say the same thing forty times. */
  {
    const r = clone(); r.layers.Badge = { fills: 'x', radius: 'y' };
    const d = diff(base, r);
    ok('compare: a layer the repo has and Figma does not is one row, not one per fact',
       d.layers.added.join(',') === 'Badge' && d.facts.added.length === 0,
       JSON.stringify({ l: d.layers, f: d.facts.added }));
  }

  {
    const r = clone();
    r.layers.root.radius = 'radius/2';        // a value
    r.layers.root.width = 'w14';              // a shape
    const d = diff(base, r);
    ok('compare: a value change and a shape change are counted apart',
       d.summary.valueChanges === 1 && d.summary.shapeChanges === 1, JSON.stringify(d.summary));
    ok('compare: and each row says which it is, with both sides on it',
       d.facts.changed.every((c) => c.kind && c.figma !== undefined && c.repo !== undefined));
  }

  /* Neither side is "before". The repo may be ahead of the file or behind it,
     and a report that assumed one of those would be wrong half the time. */
  {
    const r = clone(); r.layers.root.radius = 'radius/2';
    const forward = diff(base, r), backward = diff(r, base);
    ok('compare: the report is symmetric, because neither side is the older one',
       forward.summary.valueChanges === backward.summary.valueChanges &&
       forward.facts.changed[0].figma === backward.facts.changed[0].repo);
  }

  {
    const r = clone(); r.composes = ['Badge', 'Icon'];
    ok('compare: a component it did not used to compose is named',
       diff(base, r).composes.added.join(',') === 'Icon');
  }
}

pending.then(() => {
  console.log('');
  console.log(pass + '/' + (pass + fail) + ' passed');
  if (fail) process.exit(1);
});
