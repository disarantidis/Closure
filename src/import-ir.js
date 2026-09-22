/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  IMPORT IR — one shape every token format is flattened into, so that the
  structural decisions are made ONCE instead of once per format.

  THE ADAPTERS DELIBERATELY DO NOT DECIDE COLLECTION AND MODE. That is the
  whole point of the boundary. An adapter knows how to read its own syntax —
  where a token's value lives, how a reference is spelled, what a set is called
  — and nothing else. It emits rows carrying the file's own `group` / `variant`
  decomposition verbatim, and derive() is the only thing that ever decides
  which of those become Figma collections and which become modes.

  Splitting it the other way round is the mistake that makes this unmaintainable:
  every new format would re-implement the same projection, each slightly
  differently, and the "base/white is not a mode" rule would have to be
  rediscovered in each one.

  A ROW IS:
    { group, variant, path, type, value, description }

  `group`/`variant` come from the set name ("mode/light" -> mode + light). A set
  with no separator is its own group with a single variant. `value` is either a
  literal or { ref: 'token.path' } — normalising the reference syntax is the
  adapter's job, because that IS format-specific, while the graph built on top
  of it is not.
*/

/* A reference in Tokens Studio / legacy syntax: "{a.b.c}". Anything else
   containing braces is an EXPRESSION ("{dimension.1}*2"), which is a different
   thing entirely and is classified as such rather than silently evaluated —
   see derive()'s losses.expressions. */
const PURE_REF = /^\{([^}]+)\}$/;

function splitSet(setName) {
  const i = setName.indexOf('/');
  return i === -1
    ? { group: setName, variant: setName, grouped: false }
    : { group: setName.slice(0, i), variant: setName.slice(i + 1), grouped: true };
}

function normaliseValue(raw) {
  if (typeof raw === 'string') {
    const m = PURE_REF.exec(raw.trim());
    if (m) return { ref: m[1] };
    if (raw.indexOf('{') !== -1) return { expr: raw };
  }
  return { literal: raw };
}

/* ── Tokens Studio / Closure "legacy" ──────────────────────────────────────
   Token sets at the top level, $metadata.tokenSetOrder naming them, $themes
   describing which sets a theme enables. A token is any object carrying both
   `value` and `type`. */
function fromLegacy(doc) {
  const sets = (doc.$metadata && doc.$metadata.tokenSetOrder) ||
               Object.keys(doc).filter((k) => k.charAt(0) !== '$');
  const rows = [];
  const seenSets = [];
  for (const set of sets) {
    const node = doc[set];
    if (!node || typeof node !== 'object') continue;
    seenSets.push(set);
    const { group, variant } = splitSet(set);
    (function walk(o, path) {
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (!v || typeof v !== 'object') continue;
        if (v.value !== undefined && v.type) {
          rows.push({
            group, variant, set,
            path: path.concat(k).join('.'),
            type: v.type,
            value: normaliseValue(v.value),
            description: v.description || '',
          });
        } else {
          walk(v, path.concat(k));
        }
      }
    })(node, []);
  }
  return {
    source: 'legacy',
    rows,
    sets: seenSets,
    themes: doc.$themes || null,
    /* Present only on a file this tool exported. When it is there the whole
       derivation is skipped — a declaration beats an inference, always. */
    manifest: doc.$figmaStructure || null,
  };
}

/* ── W3C DTCG ──────────────────────────────────────────────────────────────
   $value / $type instead of value / type, {a.b.c} references spelled the same
   way, and groups that may carry an inherited $type.

   THE TOP-LEVEL KEY IS NOT ALWAYS A SET, and this is the one place the two
   formats genuinely disagree. In Tokens Studio a set is a FILE and its name is
   not part of any token's path, so "{brand.primary}" means brand.primary
   inside whichever set is enabled. In DTCG there are no sets — the document is
   one tree and "{core.red}" names the path from the ROOT, top-level group
   included.

   So: a top-level key containing "/" is read as a set (that separator only
   appears in the set-per-file convention, never in a DTCG group name) and is
   stripped from the path; a plain key is a real group and STAYS in the path.
   Getting this backwards silently breaks every reference in the document —
   which is exactly what the first run of this adapter did. */
function fromDtcg(doc) {
  const rows = [];
  const seenSets = [];
  /* A DOCUMENT THAT DECLARES ITS SETS HAS NO ROOT GROUPS — every top-level key
     is a set, whether or not its name happens to contain a "/", and a set name
     is never part of a token's path. Checked against a real file before being
     written this way: its references read {core-colours.neutral.150}, which
     resolves only once the top-level "core" is stripped. Without this every
     one of its 4,874 references dangled. */
  const declaresSets = !!(doc.$metadata && Array.isArray(doc.$metadata.tokenSetOrder));
  for (const top of Object.keys(doc)) {
    if (top.charAt(0) === '$') continue;
    seenSets.push(top);
    const { group, variant, grouped } = splitSet(top);
    const base = (grouped || declaresSets) ? [] : [top];
    (function walk(o, path, inheritedType) {
      const t = o.$type || inheritedType;
      for (const k of Object.keys(o)) {
        if (k.charAt(0) === '$') continue;
        const v = o[k];
        if (!v || typeof v !== 'object') continue;
        if (v.$value !== undefined) {
          rows.push({
            group, variant, set: top,
            path: path.concat(k).join('.'),
            type: v.$type || t || null,
            value: normaliseValue(v.$value),
            description: v.$description || '',
          });
        } else {
          walk(v, path.concat(k), t);
        }
      }
    })(doc[top], base, null);
  }
  return { source: 'dtcg', rows, sets: seenSets, themes: doc.$themes || null,
           manifest: doc.$figmaStructure || null };
}

/* ── FLAT ──────────────────────────────────────────────────────────────────
   No sets at all — one tree of tokens. Perfectly legitimate, and the right
   answer is one collection with one mode; it is only "structureless" relative
   to formats that carry axes. Handled explicitly so it does not fall through
   one of the above and get mis-grouped by a stray "/" in a name. */
function fromFlat(doc, name) {
  const rows = [];
  const group = name || 'tokens';
  (function walk(o, path) {
    for (const k of Object.keys(o)) {
      if (k.charAt(0) === '$') continue;
      const v = o[k];
      if (!v || typeof v !== 'object') continue;
      const val = v.$value !== undefined ? v.$value : v.value;
      const typ = v.$type || v.type;
      if (val !== undefined && typ) {
        rows.push({ group, variant: group, set: group, path: path.concat(k).join('.'),
                    type: typ, value: normaliseValue(val),
                    description: v.$description || v.description || '' });
      } else walk(v, path.concat(k));
    }
  })(doc, []);
  return { source: 'flat', rows, sets: [group], themes: null, manifest: null };
}

/*
  Which adapter — decided by what the document actually contains, not by a
  file name or a flag the caller might get wrong.

  THE TOKEN SHAPE IS PROBED FIRST, and $metadata only breaks a tie. It used to
  be the other way round: `$metadata.tokenSetOrder` returned 'legacy'
  immediately, on the assumption that only Tokens Studio writes one. It is not
  only Tokens Studio — this plugin's OWN DTCG export keeps $themes and
  $metadata at the root, by design, so a downstream build step can still read
  them. Such a file was handed to the legacy adapter, which looks for `value`
  and `type` rather than `$value` and `$type`, found nothing at all, and
  reported "no tokens in that file" about a 771 KB document full of them.

  A set list says how a document is ORGANISED. It says nothing about how its
  tokens are spelled, and those are independent.
*/
function detect(doc) {
  let sawDollarValue = false, sawPlainValue = false;
  (function probe(o, depth) {
    if (!o || typeof o !== 'object' || depth > 6) return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (!v || typeof v !== 'object') continue;
      if (v.$value !== undefined) { sawDollarValue = true; return; }
      if (v.value !== undefined && v.type) { sawPlainValue = true; return; }
      probe(v, depth + 1);
    }
  })(doc, 0);
  if (sawDollarValue) return 'dtcg';
  if (sawPlainValue) return 'legacy';
  /* No token found either way — a set list is then the only evidence there is
     of how this document is meant to be read. */
  if (doc.$metadata && doc.$metadata.tokenSetOrder) return 'legacy';
  return 'flat';
}

function toIR(doc, opts) {
  const kind = (opts && opts.format) || detect(doc);
  if (kind === 'legacy') return fromLegacy(doc);
  if (kind === 'dtcg') return fromDtcg(doc);
  return fromFlat(doc, opts && opts.name);
}

  var api = { toIR, detect, fromLegacy, fromDtcg, fromFlat, splitSet, normaliseValue };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomImportIR = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
