/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  COMPARE — this component, against the contract the repository holds.

  Both sides are contracts, and that is the whole reason this is short. The
  collapse has already been applied to each: eighteen variants are one line
  when they agree, and a line that moved moved because a decision moved. So
  this compares decisions rather than variants, and a report of four rows is
  four things somebody did — not four hundred rows of the same thing seen from
  eighteen angles.

  THE SIDES ARE NAMED FOR WHAT THEY ARE, figma and repo, as everywhere else in
  this plugin. Neither is "before": the contract in the repository may be ahead
  of the file or behind it, and a report that assumed one of those would be
  wrong half the time.

  THREE KINDS OF DIFFERENCE, told apart because they are not the same news:

    value        both sides state one value and the values differ. Somebody
                 chose a different token.

    per-variant  both sides depend on the same axes and disagree about what
                 some of them hold. The shape is intact; a case changed.

    shape        the sides do not depend on the same thing at all — a fact
                 that was constant now follows Size, or followed Size and now
                 follows Variant. That is the architecture moving, and it is
                 the one a reader must not skim: the same eventual values can
                 arrive through a completely different rule.
*/

function keysOf(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort() : null;
}

function sameList(a, b) {
  return (a || []).length === (b || []).length &&
         (a || []).every(function (x, i) { return x === (b || [])[i]; });
}

/*
  WHAT KIND OF DIFFERENCE THIS IS, or null when there is none.

  Compared as VALUES, not as text: two maps written in a different key order
  are the same fact, and the file's own ordering already makes that impossible
  — but this runs on parsed objects, and a contract somebody hand-edited is
  allowed to be untidy without being reported as changed.
*/
function factChange(a, b) {
  var ka = keysOf(a), kb = keysOf(b);
  if (ka === null && kb === null) return a === b ? null : 'value';
  if (ka === null || kb === null) return 'shape';
  if (!sameList(ka, kb)) return 'shape';
  var differs = ka.some(function (k) { return a[k] !== b[k]; });
  return differs ? 'per-variant' : null;
}

/* The two sides of a set difference, in one pass. */
function split(a, b) {
  var A = a || [], B = b || [];
  return {
    added: B.filter(function (x) { return A.indexOf(x) === -1; }),
    removed: A.filter(function (x) { return B.indexOf(x) === -1; }),
  };
}

/*
  THE API IS THE PROMISE, so it is reported apart from everything else.

  A layer changing its padding is a detail of how the component is built; an
  axis losing a value is a promise being withdrawn from everyone who used it.
  They travel in the same file and they are not the same news, and a report
  that mixed them would rank a colour change alongside a removed variant.
*/
function diffApi(figma, repo) {
  var f = figma || {}, r = repo || {};
  var names = split(Object.keys(f).sort(), Object.keys(r).sort());
  var out = { added: names.added, removed: names.removed, values: [], defaults: [], types: [] };
  Object.keys(f).forEach(function (name) {
    var a = f[name], b = r[name];
    if (!b) return;
    if (a.type !== b.type) out.types.push({ name: name, figma: a.type, repo: b.type });
    var v = split(a.values, b.values);
    if (v.added.length || v.removed.length) {
      out.values.push({ axis: name, added: v.added, removed: v.removed });
    }
    if (a['default'] !== b['default']) {
      out.defaults.push({ axis: name, figma: a['default'], repo: b['default'] });
    }
  });
  return out;
}

/*
  IS THIS THE SAME COMPONENT AT ALL?

  Asked before anything is compared, because comparing Avatar against Button's
  contract produces a long and perfectly coherent report about nothing. Every
  row of it would be true and the whole of it would be meaningless, and a
  reader has no way to tell that from a component that has genuinely changed
  beyond recognition.

  THE PUBLISHED KEY IS THE ANSWER WHEN THERE IS ONE. It survives the component
  being copied into another file, where the node id does not. A file key and
  node id together are the fallback, and the pair has to match: a node id alone
  means nothing across files, since two documents number their nodes the same
  way.

  A contract with NO identity — hand-written, or from before this was
  recorded — is not a mismatch. It is a file that never said, and refusing to
  compare it would be refusing the case this was built to migrate.
*/
function identity(contract) {
  var f = (contract && contract.figma) || {};
  return { key: f.key || null, fileKey: f.fileKey || null, nodeId: f.nodeId || null };
}

function samePairing(figma, repo) {
  var a = identity(figma), b = identity(repo);
  if (!b.key && !b.nodeId) return { verdict: 'unstated' };
  if (a.key && b.key) {
    return a.key === b.key ? { verdict: 'same' }
                           : { verdict: 'different', by: 'key', figma: a.key, repo: b.key };
  }
  if (a.nodeId && b.nodeId) {
    var sameFile = !a.fileKey || !b.fileKey || a.fileKey === b.fileKey;
    if (sameFile && a.nodeId === b.nodeId) return { verdict: 'same' };
    return { verdict: 'different', by: 'nodeId',
             figma: (a.fileKey || '?') + ' ' + a.nodeId,
             repo: (b.fileKey || '?') + ' ' + b.nodeId };
  }
  return { verdict: 'unstated' };
}

/*
  diff(figmaContract, repoContract) -> report

  Neither side is modified and nothing is written. `same` is the answer most
  runs want, and it is computed from the report rather than alongside it, so
  it cannot disagree with the rows underneath it.
*/
function diff(figma, repo) {
  figma = figma || {}; repo = repo || {};
  var report = {
    pairing: samePairing(figma, repo),
    component: figma.component !== repo.component
      ? { figma: figma.component, repo: repo.component } : null,
    api: diffApi(figma.api, repo.api),
    composes: split(figma.composes, repo.composes),
    layers: split(Object.keys(figma.layers || {}).sort(), Object.keys(repo.layers || {}).sort()),
    facts: { added: [], removed: [], changed: [] },
  };

  var fl = figma.layers || {}, rl = repo.layers || {};
  Object.keys(fl).sort().forEach(function (path) {
    var b = rl[path];
    /* A layer only one side has is already reported as a layer. Listing every
       fact inside it again would say the same thing forty times. */
    if (!b) return;
    var a = fl[path];
    var names = {};
    Object.keys(a).forEach(function (k) { names[k] = 1; });
    Object.keys(b).forEach(function (k) { names[k] = 1; });
    Object.keys(names).sort().forEach(function (fact) {
      var av = a[fact], bv = b[fact];
      if (av === undefined) { report.facts.added.push({ layer: path, fact: fact, value: bv }); return; }
      if (bv === undefined) { report.facts.removed.push({ layer: path, fact: fact, value: av }); return; }
      var kind = factChange(av, bv);
      if (kind) report.facts.changed.push({ layer: path, fact: fact, kind: kind, figma: av, repo: bv });
    });
  });

  var api = report.api;
  report.summary = {
    apiChanges: api.added.length + api.removed.length + api.values.length +
                api.defaults.length + api.types.length,
    composesChanges: report.composes.added.length + report.composes.removed.length,
    layersAdded: report.layers.added.length,
    layersRemoved: report.layers.removed.length,
    factsAdded: report.facts.added.length,
    factsRemoved: report.facts.removed.length,
    valueChanges: report.facts.changed.filter(function (x) { return x.kind === 'value'; }).length,
    perVariantChanges: report.facts.changed.filter(function (x) { return x.kind === 'per-variant'; }).length,
    shapeChanges: report.facts.changed.filter(function (x) { return x.kind === 'shape'; }).length,
  };
  var s = report.summary;
  report.same = !report.component &&
    Object.keys(s).every(function (k) { return s[k] === 0; });
  return report;
}

  var api = { keysOf, sameList, factChange, split, diffApi, identity, samePairing, diff };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomComponentDiff = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
