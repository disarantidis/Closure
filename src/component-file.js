/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  THE FILE — a contract, written the same way twice.

  This one exists because of what the file is FOR. A contract that only had to
  be read could be printed in any order; this one lands in a repository, is
  reviewed as a diff, and is read back later to be compared against Figma. So
  the only property that matters more than being right is being STABLE: the
  same component must produce the same bytes, or every push is a rewrite and
  the diff that was supposed to show a decision shows the file being shuffled.

  Three things are ordered here, and each was a real risk rather than a tidy
  habit:

    THE AXES, alphabetically. Every collapsed key is built by joining axis
    names — "Size=Large, Variant=Avatar" — so the order of the axes IS the
    text of every key in the file. Figma reports them in the order the
    properties were defined, and reordering variants in the set can change it.
    Left alone, somebody rearranging a component set would produce a diff in
    which every line moved and nothing changed.

    THE LAYERS, by path, because Figma reports them in z-order and moving a
    layer up one is not a change to the contract.

    THE FACTS, by name, with the three that say what a layer IS first —
    instanceOf, when, hidden. A reader scanning a layer wants its identity
    before its properties, and a diff wants the same line in the same place.

  THE SUMMARY IS NOT WRITTEN. It is derived from everything else, so a file
  carrying it reports a change in six numbers every time one fact moves — the
  diff would be right and unreadable. The panel computes it; the file states
  facts.
*/

/* Identity first: what the layer is, before what it looks like. */
var IDENTITY = ['instanceOf', 'when', 'hidden'];

/*
  A COMPONENT'S NAME, AS A PATH SEGMENT.

  Lowercased, spaces and punctuation to single hyphens, trimmed. "ODS Avatar"
  becomes "ods-avatar" — the prefix is kept, because stripping it would be a
  guess about which words are a namespace and which are the name, and a wrong
  guess puts the file somewhere nobody looks.
*/
function slugFor(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'component';
}

/*
  WHERE IT GOES, as a pattern rather than a rule.

  A repository's layout is its own business — components/Avatar/, src/avatar/,
  packages/ds/avatar/ are all somebody's house style — so this takes the shape
  from the caller and fills in what it knows. {dir} is the folder chosen in the
  plugin, {slug} the component's name as a path segment, {name} the name as it
  is written in Figma.

  The default puts the contract INSIDE the component's own folder, which is
  what makes it reviewable with the code it describes: a pull request that
  changes the component and the contract shows both in one place.
*/
var DEFAULT_PATTERN = '{dir}/{slug}/{slug}.contract.json';

/*
  WHAT MAKES A FILE A CONTRACT, from its name alone.

  Used to find the ones a repository already holds without reading any of
  them — a tree listing gives names, and opening forty files to ask each one
  what it is would be forty requests to answer a question the name settles.

  The suffix is part of the default pattern rather than a rule, so a
  repository that writes them some other way is found by browsing instead.
  This is a shortcut to the common case, not a definition of the format.
*/
var CONTRACT_SUFFIX = '.contract.json';

function isContractPath(path) {
  return typeof path === 'string' &&
         path.slice(-CONTRACT_SUFFIX.length) === CONTRACT_SUFFIX;
}

/* The component a contract file is probably for — its own name, minus the
   suffix and the folders above it. Shown beside the path so a list of forty
   reads as a list of components rather than of directories. */
function componentOfPath(path) {
  var base = String(path || '').split('/').pop();
  return base.slice(0, -CONTRACT_SUFFIX.length) || base;
}

function pathFor(componentName, opts) {
  opts = opts || {};
  var slug = slugFor(componentName);
  var dir = String(opts.dir || '').replace(/^\/+|\/+$/g, '');
  var out = String(opts.pattern || DEFAULT_PATTERN)
    .replace(/\{slug\}/g, slug)
    .replace(/\{name\}/g, String(componentName || ''))
    .replace(/\{dir\}/g, dir);
  /* A pattern with no {dir}, or an empty one, must not leave a leading slash
     behind — a repo path is relative and an absolute one is refused by both
     providers with a message about nothing in particular. */
  return out.replace(/\/{2,}/g, '/').replace(/^\/+/, '');
}

/* Sorted, and `*` first — the exception form's rule reads before its
   exceptions, which is the order a person says it in. */
function orderedMap(value) {
  var out = {};
  var keys = Object.keys(value).sort();
  if (keys.indexOf('*') !== -1) out['*'] = value['*'];
  keys.forEach(function (k) { if (k !== '*') out[k] = value[k]; });
  return out;
}

function orderedLayer(layer) {
  var out = {};
  /* An absent identity is absent, not null: a layer that is not an instance
     says nothing about instances, and a line of `"instanceOf": null` on every
     own layer is noise the diff has to carry forever. */
  IDENTITY.forEach(function (k) {
    if (layer[k] !== undefined && layer[k] !== null) out[k] = layer[k];
  });
  Object.keys(layer).filter(function (k) { return IDENTITY.indexOf(k) === -1; }).sort()
    .forEach(function (k) {
      var v = layer[k];
      out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? orderedMap(v) : v;
    });
  return out;
}

/*
  ordered(contract) -> the same contract, in the one order it is ever written.

  Built as a new object rather than sorted in place: the contract the panel is
  holding is the panel's, and a serialiser that reorders its caller's data is a
  surprise waiting for whoever reads the summary afterwards.
*/
function ordered(contract) {
  var out = {};
  out.component = contract.component;
  if (contract.description) out.description = contract.description;
  out.figma = {
    fileKey: (contract.figma && contract.figma.fileKey) || null,
    nodeId: (contract.figma && contract.figma.nodeId) || null,
  };

  var api = contract.api || {};
  out.api = Object.keys(api).sort().reduce(function (acc, name) {
    var p = api[name];
    var e = { type: p.type };
    if (p.values) e.values = p.values;
    if (p['default'] !== undefined) e['default'] = p['default'];
    acc[name] = e;
    return acc;
  }, {});

  if (contract.composes && contract.composes.length) out.composes = contract.composes.slice().sort();
  if (contract.truncated) out.truncated = contract.truncated;

  var layers = contract.layers || {};
  out.layers = Object.keys(layers).sort().reduce(function (acc, path) {
    acc[path] = orderedLayer(layers[path]);
    return acc;
  }, {});
  return out;
}

/* One newline at the end, because every other file in a repository has one and
   a diff that reports "\ No newline at end of file" is reporting on us. */
function serialise(contract) {
  return JSON.stringify(ordered(contract), null, 2) + '\n';
}

function parse(text) {
  var doc = JSON.parse(text);
  if (!doc || typeof doc !== 'object' || !doc.layers) {
    throw new Error('that file is not a component contract');
  }
  return doc;
}

  var api = { IDENTITY, DEFAULT_PATTERN, CONTRACT_SUFFIX, isContractPath, componentOfPath,
              slugFor, pathFor,
              orderedMap, orderedLayer, ordered, serialise, parse };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomComponentFile = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
