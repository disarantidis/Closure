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

pending.then(() => {
  console.log('');
  console.log(pass + '/' + (pass + fail) + ' passed');
  if (fail) process.exit(1);
});
