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

/*
  FINDING THE COMPONENT IN THE REPOSITORY, BY ITS NAME.

  Browsing is the fallback. The common case is that the component already has
  a home — "ODS Avatar" in Figma is Avatar.tsx in packages/react/src/panel/node
  — and making somebody descend five dropdowns to a folder the repository could
  have named itself is the plugin asking a question it can answer.

  BOTH SIDES ARE REDUCED TO WORDS, because neither spelling is the other's.
  Figma writes "ODS File Upload" and a repository writes FileUpload.tsx: the
  case, the spaces and the extension are house style on each side, and the
  words underneath are the same words.

  A DESIGN-SYSTEM PREFIX IS NOT STRIPPED, it is out-matched. Hardcoding "ODS"
  would work for one library and quietly mis-file another's; instead a
  candidate matches when its words are what the component's name ENDS with, so
  "ods avatar" finds "avatar" and any prefix at all falls away. The direction
  matters: `Badge` does not match "ODS Badge Number", because the component is
  not a badge, it is a badge number.
*/
function words(text) {
  return String(text || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')     // FileUpload -> File Upload
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function endsWithWords(whole, tail) {
  if (!tail.length || tail.length > whole.length) return false;
  var at = whole.length - tail.length;
  for (var i = 0; i < tail.length; i++) if (whole[at + i] !== tail[i]) return false;
  return true;
}

/* The name a path offers for matching: a contract without its suffix, any
   other file without its extension, a folder by its last segment. */
function candidateName(path, isFolder) {
  var base = String(path || '').split('/').pop();
  if (isFolder) return base;
  if (isContractPath(path)) return componentOfPath(path);
  var dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/*
  matchInRepo(componentName, { files, folders }) -> best | null

  `best` is { path, dir, kind, name, exact, alternatives } where `kind` is
  'contract' | 'file' | 'folder'. A contract outranks the source beside it —
  it is the file being looked for, and its name is the house style already
  settled. An exact name outranks one the component's name merely ends with.

  Alternatives are counted rather than chosen between: a monorepo with the
  same component in react and vue has two right answers, and picking one
  silently would be the plugin guessing where it should be saying so.
*/
function matchInRepo(componentName, tree) {
  var want = words(componentName);
  if (!want.length) return null;
  var files = (tree && tree.files) || [];
  var folders = (tree && tree.folders) || [];

  var hits = [];
  var consider = function (path, isFolder) {
    var name = candidateName(path, isFolder);
    var mine = words(name);
    if (!mine.length) return;
    var exact = mine.length === want.length && endsWithWords(want, mine);
    if (!exact && !endsWithWords(want, mine)) return;
    var kind = isFolder ? 'folder' : (isContractPath(path) ? 'contract' : 'file');
    hits.push({
      path: path, name: name, kind: kind, exact: exact,
      dir: path.indexOf('/') === -1 ? '' : path.slice(0, path.lastIndexOf('/')),
      /* Contract over source over folder; exact over merely-ends-with; and a
         longer match over a shorter one, so `FileUpload` beats `Upload`. */
      score: (kind === 'contract' ? 100 : kind === 'file' ? 50 : 10) +
             (exact ? 20 : 0) + mine.length,
    });
  };
  files.forEach(function (f) { consider(f, false); });
  folders.forEach(function (f) { consider(f, true); });
  if (!hits.length) return null;

  hits.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    /* Deterministic, and the shallower path is the likelier home. */
    var da = a.path.split('/').length, db = b.path.split('/').length;
    if (da !== db) return da - db;
    return a.path < b.path ? -1 : 1;
  });
  var best = hits[0];
  return {
    path: best.path, dir: best.dir, kind: best.kind, name: best.name, exact: best.exact,
    /* Only the ones that could equally have been chosen. A source file beside
       the contract that won is not an alternative, it is the same answer. */
    alternatives: hits.filter(function (h) {
      return h !== best && h.score === best.score;
    }).map(function (h) { return h.path; }),
  };
}

/*
  WHERE THE CONTRACT GOES, given what was found.

  A contract that already exists IS the answer. A source file gives its folder
  AND its name — Avatar.tsx makes Avatar.contract.json, which is how the
  repository would have spelled it. A folder gives only its folder, and the
  name falls back to the component's own slug.
*/
function pathForMatch(componentName, match) {
  if (!match) return null;
  if (match.kind === 'contract') return match.path;
  if (match.kind === 'file') {
    return (match.dir ? match.dir + '/' : '') + match.name + CONTRACT_SUFFIX;
  }
  return (match.path ? match.path + '/' : '') + slugFor(componentName) + CONTRACT_SUFFIX;
}

  var api = { IDENTITY, DEFAULT_PATTERN, CONTRACT_SUFFIX, isContractPath, componentOfPath,
              words, endsWithWords, candidateName, matchInRepo, pathForMatch,
              slugFor, pathFor,
              orderedMap, orderedLayer, ordered, serialise, parse };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomComponentFile = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
