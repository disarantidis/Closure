/*
  Dual-mode, exactly like src/architecture-radd.js: module.exports when there is a
  require(), a global otherwise.

  THE ODS FOUNDATIONS ARCHITECTURE ("v3"), AS ROUTING RULES.

  Read off the live file "ODS Test Foundations" and VERIFIED against it: every
  alias of the five routing collections was recomputed from these rules and
  compared with what the file holds — 18,010 of 18,010 mode values identical
  (.scheme 1,074 · _restricted 2,616 · .mode 1,432 · .section 2,148 · .card 10,740).

  THE CHAIN, TOP DOWN (a consumer points at the next):

    foundation -> .scheme(neutral inverted white black magenta secondary)
               -> _restricted(unrestricted to-neutral to-neutral-and-magenta to-neutral-and-secondary)
               -> .mode(light dark) -> .section(normal subtle) -> .card(5 card modes)
               -> palette (.white .black .magenta-light .magenta-dark .secondary) -> .core

  Elevation paths skip _restricted: .scheme goes to .mode (or straight to the white /
  black palette), and a card that a colour would refuse falls back to a palette leaf
  instead of the error colour.

  A leaf is `<palette>` or `<palette>-subtle`; the palette collection holds both.
  route() returns [collection, variable name], or ERROR for the error colour.

  WHAT THIS DOES NOT HOLD: the values. A palette leaf's alias into .core is a design
  decision, not a rule. A Resolved export keeps only the leaf each (mode, scheme)
  lands on by default, so the `-subtle` leaves are not in it (see the README).
*/
(function (global) {
  'use strict';

  var C = {
    core: '.core', foundation: 'foundation', scheme: '.scheme', restricted: '_restricted',
    mode: '.mode', section: '.section', card: '.card', breakpoint: '.breakpoint', secondary: '.secondary'
  };
  var ID = 'ods-foundations';
  var VERSION = 1;
  var PALETTES = ['.white', '.black', '.magenta-light', '.magenta-dark', '.secondary'];
  /* How many leading name segments are the layer's own (`card/normal/white/`), the rest being
     the semantic path P. A description is stored as a template over P (see restoreDescriptions). */
  var PREFIX_SEGMENTS = { '.card': 3, '.section': 2, '.mode': 2, '.scheme': 1, '_restricted': 2,
    '.white': 1, '.black': 1, '.magenta-light': 1, '.magenta-dark': 1, '.secondary': 1, '.breakpoint': 1 };
  function pathOf(collection, name) {
    return String(name).split('/').slice(PREFIX_SEGMENTS[collection]).join('/');
  }
  var SCHEME_MODES = ['neutral', 'inverted', 'white', 'black', 'magenta', 'secondary'];
  var RESTRICTED_MODES = ['unrestricted', 'to-neutral', 'to-neutral-and-magenta', 'to-neutral-and-secondary'];
  var SECTION_MODES = ['normal', 'subtle'];
  var CARD_MODES = ['not-a-card', 'neutral-card', 'magenta-card', 'secondary-card', 'secondary-card-subtle'];
  var ERROR = { error: true, collection: '.core', name: 'core-colours/error' };

  /* The scheme families that .mode switches, and the palette each lands on. */
  var MODE_PALETTE = {
    neutral: { light: 'white', dark: 'black' },
    inverted: { light: 'black', dark: 'white' },
    magenta: { light: 'magenta-light', dark: 'magenta-dark' },
    secondary: { light: 'secondary-light', dark: 'secondary-dark' }
  };

  function collectionOfLeaf(leaf) {
    var base = String(leaf).replace(/-subtle$/, '');
    if (base === 'white') return '.white';
    if (base === 'black') return '.black';
    if (base === 'magenta-light') return '.magenta-light';
    if (base === 'magenta-dark') return '.magenta-dark';
    return C.secondary;
  }
  function leaf(l) { return { collection: collectionOfLeaf(l), leaf: l }; }

  /* Which permission modes keep a scheme instead of falling to the error colour. */
  function keeps(scheme, restricted) {
    if (scheme === 'neutral' || scheme === 'inverted') return true;
    if (restricted === 'unrestricted') return true;
    return (scheme === 'magenta' && restricted === 'to-neutral-and-magenta') ||
           (scheme === 'secondary' && restricted === 'to-neutral-and-secondary');
  }

  function isLightAnchor(a) { return a === 'white' || a === 'magenta-light' || a === 'secondary-light'; }

  /*
    .card: (section emphasis e, anchor palette a, card mode m) -> palette leaf.
    `elev` is an elevation path, which never meets the error colour.
  */
  function cardLeaf(e, a, m, elev) {
    var neutralA = a === 'white' || a === 'black';
    var sec = a.indexOf('secondary') === 0;
    var mag = a.indexOf('magenta') === 0;
    var light = isLightAnchor(a);
    if (m === 'not-a-card') return leaf(e === 'normal' ? a : a + '-subtle');
    if (m === 'neutral-card') {
      var s = light ? 'white' : 'black';
      return leaf(neutralA ? (e === 'normal' ? s + '-subtle' : s) : s);
    }
    if (m === 'magenta-card') {
      if (neutralA) return leaf(light ? 'magenta-light' : 'magenta-dark');
      if (!elev) return ERROR;
      return leaf(mag ? (e === 'normal' ? a + '-subtle' : a) : a);
    }
    /* secondary-card and secondary-card-subtle */
    var base = light ? 'secondary-light' : 'secondary-dark';
    if (neutralA) return leaf(m === 'secondary-card' ? base : base + '-subtle');
    if (sec) return leaf(e === 'normal' ? base + '-subtle' : base);
    if (!elev) return ERROR;
    return leaf(e === 'normal' ? a : a + '-subtle');
  }

  /*
    One alias: variable `name` in collection `collection`, in `mode` ->
    { collection, name } of what it points at, or ERROR. Palette and core
    collections hold values, not routes: undefined.
  */
  function route(collection, name, mode) {
    var seg = String(name).split('/');
    var elev = String(name).indexOf('/elevation/') !== -1;
    var P;
    if (collection === C.scheme) {
      P = seg.slice(1).join('/');
      if (elev) {
        if (mode === 'white' || mode === 'black') return { collection: '.' + mode, name: mode + '/' + P };
        return { collection: C.mode, name: 'mode/' + mode + '/' + P };
      }
      return { collection: C.restricted, name: 'restrictions/' + mode + '/' + P };
    }
    if (collection === C.restricted) {
      var s = seg[1];
      P = seg.slice(2).join('/');
      if (s === 'white' || s === 'black') return { collection: C.section, name: 'section/' + s + '/' + P };
      return keeps(s, mode) ? { collection: C.mode, name: 'mode/' + s + '/' + P } : ERROR;
    }
    if (collection === C.mode) {
      P = seg.slice(2).join('/');
      return { collection: C.section, name: 'section/' + MODE_PALETTE[seg[1]][mode] + '/' + P };
    }
    if (collection === C.section) {
      return { collection: C.card, name: 'card/' + mode + '/' + seg.slice(1).join('/') };
    }
    if (collection === C.card) {
      var r = cardLeaf(seg[1], seg[2], mode, elev);
      if (r.error) return ERROR;
      return { collection: r.collection, name: r.leaf + '/' + seg.slice(3).join('/') };
    }
    return undefined;
  }

  /* At EXPORT time: does this graph have the ODS layering? (.scheme with its six modes,
     and the .section and .card layers below _restricted.) */
  function detectInCollections(collections) {
    var by = {};
    (collections || []).forEach(function (c) { by[c.name] = c; });
    var scheme = by[C.scheme];
    if (!scheme || !by[C.section] || !by[C.card] || !by[C.restricted] || !by[C.mode] || !by[C.core]) return false;
    var names = (scheme.modes || []).map(function (m) { return m.name; });
    return SCHEME_MODES.every(function (m) { return names.indexOf(m) !== -1; });
  }

  /*
    Is this Resolved document one this template can rebuild? Decided from what the
    document says about itself: the export declares `ods-foundations` in its restore
    section, and carries the -subtle leaves (an export from before they were written
    cannot be rebuilt, and saying so beats a half-built file).
  */
  function recognise(doc) {
    var meta = doc && doc.$extensions && doc.$extensions['com.desquared.radd'];
    var restore = meta && meta.restore;
    var declared = restore && restore.architecture;
    if (!declared || declared.id !== ID) return { ok: false, reason: 'not an ODS Foundations export' };
    if (declared.version > VERSION) return { ok: false, reason: 'built for a newer version of the ODS architecture (' + declared.version + ')' };
    if (!restore.collections || !restore.collections.length) return { ok: false, reason: 'no record of the collections' };
    if (!restore.subtle || !restore.subtle.leaves) return { ok: false, reason: 'this export predates the -subtle leaves; export it again' };
    if (!meta.accentSchemes || !meta.accentSchemes.length) return { ok: false, reason: 'no accent schemes' };
    if (!doc.core || !doc.mode || !doc.foundation) return { ok: false, reason: 'core, foundation or mode is missing' };
    return { ok: true, meta: meta, declared: true };
  }

  var api = {
    recognise: recognise,
    ID: ID, VERSION: VERSION, PALETTES: PALETTES, PREFIX_SEGMENTS: PREFIX_SEGMENTS, pathOf: pathOf, detectInCollections: detectInCollections,
    C: C, SCHEME_MODES: SCHEME_MODES, RESTRICTED_MODES: RESTRICTED_MODES, SECTION_MODES: SECTION_MODES,
    CARD_MODES: CARD_MODES, MODE_PALETTE: MODE_PALETTE, ERROR: ERROR,
    route: route, keeps: keeps, collectionOfLeaf: collectionOfLeaf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomArchitectureOds = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
