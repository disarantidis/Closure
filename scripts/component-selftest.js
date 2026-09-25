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

  return captureComponentSet(set, figmaWith({ v1: 'colours/basic/text' }, { s1: 'Body M Bold' }), {})
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
    })
    .then(() => {
      console.log('');
      console.log(pass + '/' + (pass + fail) + ' passed');
      if (fail) process.exit(1);
    });
}
