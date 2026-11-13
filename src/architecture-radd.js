/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
  'use strict';

  /*
    THE RADD FOUNDATIONS ARCHITECTURE, AS DATA.

    A Resolved export has had its routing evaluated away: the chain a token
    followed through .scheme, .mode, _restricted and a palette collection to
    reach .core is gone, and only the answer for every (mode, scheme) is left.
    What that chain WAS is not lost, though — it is not in the document, it is
    in here. The architecture is regular: every name and every route is a plain
    function of a semantic path and a mode, so a reader that knows the rules can
    put the chain back exactly. Measured against the live file: 11,464 of its
    11,481 (collection, variable, mode) values come back identical.

    So this file is the one place those rules live, and import-resolved.js reads
    them. It carries no behaviour of its own beyond naming and recognition.

    THE CHAIN, BOTTOM UP:

      .core         primitives                                  one mode
      palettes      .white .black .brand .secondary             alias .core
                    white/P  black/P  brand-light/P brand-dark/P
                    secondary-light/P secondary-dark/P          (.secondary has one mode per accent)
      _restricted   restrictions/<palette>/P                    four modes of permission:
                    unrestricted -> the palette; the others -> the palette when allowed,
                    else .core::core-colours/error
      .mode         mode/P  mode-inverted/P  mode-brand/P  mode-secondary/P      light, dark
      .scheme       scheme/P                                    neutral inverted white black brand secondary
      foundation    the consumption layer: aliases .scheme or .breakpoint or .core
      .breakpoint   breakpoint/P                                one mode per breakpoint
      layout        columns/N-columns                           aliases .breakpoint

    P is a semantic path ("basic/text"). Elevation paths ("elevation/…") skip
    _restricted — they route from .mode and .scheme straight to the palette.
  */

  var ID = 'radd-foundations';
  var VERSION = 2;

  var C = {
    core: '.core', foundation: 'foundation', layout: 'layout', scheme: '.scheme', mode: '.mode',
    breakpoint: '.breakpoint', restricted: '_restricted',
    white: '.white', black: '.black', brand: '.brand', secondary: '.secondary'
  };

  /* The order the panel lists them in — and so the order an import has to
     CREATE them in, because the Plugin API cannot reorder a collection. */
  var ORDER = [C.core, C.foundation, C.secondary, C.black, C.brand, C.breakpoint, C.white,
               C.mode, C.restricted, C.scheme, C.layout];

  /* A breakpoint's name in the document is its mode with the size code taken
     off ("S Mobile" -> "mobile"); this puts the code back. A breakpoint this
     table does not know keeps the name the document gave it. */
  var BREAKPOINTS = { 'mobile': 'S Mobile', 'tablet': 'M Tablet', 'laptop': 'L Laptop',
                      'desktop': 'XL Desktop', 'large-desktop': 'XXL Large Desktop' };

  var SCHEME_MODES = ['neutral', 'inverted', 'white', 'black', 'brand', 'secondary'];
  var RESTRICTED_MODES = ['unrestricted', 'to-neutral', 'to-neutral-and-brand', 'to-neutral-and-secondary'];
  var LAYOUT_MODE = 'columns';
  var ERROR_COLOUR = 'core-colours/error';

  /* .mode has one family of variables per scheme that reaches it. */
  var MODE_PREFIX = { neutral: 'mode', inverted: 'mode-inverted', brand: 'mode-brand', secondary: 'mode-secondary' };

  /* Which palette each (scheme, light/dark) lands on. */
  var PALETTE = {
    neutral:   { light: 'white', dark: 'black' },
    inverted:  { light: 'black', dark: 'white' },
    brand:     { light: 'brand-light', dark: 'brand-dark' },
    secondary: { light: 'secondary-light', dark: 'secondary-dark' }
  };

  /* Palette variable prefix -> the collection that holds it. */
  function paletteCollection(pal) {
    if (pal === 'white') return C.white;
    if (pal === 'black') return C.black;
    if (pal.indexOf('brand') === 0) return C.brand;
    return C.secondary;
  }

  /* Which permission modes keep a palette instead of falling back to the error
     colour. */
  var KEEPS = {
    'white': 'all', 'black': 'all',
    'brand-light': ['unrestricted', 'to-neutral-and-brand'],
    'brand-dark': ['unrestricted', 'to-neutral-and-brand'],
    'secondary-light': ['unrestricted', 'to-neutral-and-secondary'],
    'secondary-dark': ['unrestricted', 'to-neutral-and-secondary']
  };
  function keeps(pal, restrictedMode) {
    var k = KEEPS[pal];
    return k === 'all' || (k && k.indexOf(restrictedMode) !== -1);
  }

  /*
    Core scales the EXPORTER invents so a typography composite has something to
    point at. They are not Figma variables, so an import leaves them out; a
    `restore.synthesized` list in the document adds to this.
  */
  var SYNTHESIZED_CORE_GROUPS = ['letterspacing', 'lineheights'];

  /*
    WHAT THE FILE IS KNOWN FOR, written down so an import does not need a
    record of it. Each of these was once only in a document's `restore`
    section; they are conventions of this architecture, and a convention
    belongs here.

    DEFAULT_LINKS   a foundation token whose breakpoint cell is a variable of
                    another name. The token says `breakpoint` / `grid.margins-
                    overflow`; the variable is `layout/margins-cards`.
    UNDERLINED      a text style whose scale starts with this is underlined —
                    the Studio composites say `none` for it, the file says
                    underline.
    ACRONYMS        a path segment that is an acronym is upper-case in a style
                    name (elevation/FAB/standard) and lower-case everywhere else.
    GRID_STYLE      the one layout-grid style, as the pattern it is: which
                    variable each field is bound to and the colour of each grid.
                    A field is bound only if that variable exists in the file.
  */
  var DEFAULT_LINKS = { 'foundation.grid.margins-overflow': 'layout.margins-cards' };
  /*
    CORE GROUPS THAT ARE CAMEL-CASE IN THE FILE. A resolved document is written
    in lower case, so these come back as `fontfamilies`, `paragraphspacing`…,
    but the file they came from names them `fontFamilies`, `paragraphSpacing`…
    and the plugin's own export (the per-theme shape) looks them up by exactly
    those names: its typography composites refer to `{fontFamilies.inter}`,
    `{paragraphSpacing.0}`, `{paragraphIndent.0}`. Written in lower case they are
    "not present in this export" and 240 references break. So the first segment
    of a core name is given its capitals back. Only these groups: every other
    name stays lower case, as agreed.
  */
  var CORE_CAMEL_GROUPS = { fontfamilies: 'fontFamilies', fontsize: 'fontSize', fontweights: 'fontWeights',
                            paragraphspacing: 'paragraphSpacing', paragraphindent: 'paragraphIndent' };
  function coreName(name) {
    var i = String(name).indexOf('/');
    var head = i === -1 ? String(name) : String(name).slice(0, i);
    var camel = CORE_CAMEL_GROUPS[head];
    return camel ? camel + (i === -1 ? '' : String(name).slice(i)) : String(name);
  }

  /* A number goes back to a core token only if the cell's own name says what
     it is: a `size` is a font size, so it may read `font-sizes/…`; a
     `line-height` that happens to equal one may not. The leaf of the cell's
     path -> the core groups it may read. */
  var NUMBER_LINKS = { 'size': ['font-sizes'] };
  var UNDERLINED_PREFIX = 'link-';
  var ACRONYMS = ['fab'];
  var GRID_STYLE = {
    name: 'grid',
    grids: [
      { alignment: 'STRETCH', color: [0.3686, 0.7608, 0.9294, 0.3], count: 1, fields: ['count', 'gutterSize', 'offset'],
        bound: { offset: '.breakpoint::breakpoint/overflow-grid/margins', gutterSize: '.breakpoint::breakpoint/fixed-grid/gutters' } },
      { alignment: 'STRETCH', color: [0.302, 0.8784, 0.6863, 0.1], fields: ['count', 'gutterSize', 'offset'],
        bound: { offset: 'foundation::grid/margins', gutterSize: 'foundation::grid/gutters', count: '.breakpoint::breakpoint/stretch-grid/columns' } },
      { alignment: 'CENTER', color: [0.302, 0.8784, 0.6863, 0.1], fields: ['count', 'gutterSize', 'sectionSize'],
        bound: { gutterSize: '.breakpoint::breakpoint/fixed-grid/gutters', sectionSize: '.breakpoint::breakpoint/fixed-grid/column-width', count: '.breakpoint::breakpoint/fixed-grid/columns' } }
    ]
  };

  /* ── scopes ─────────────────────────────────────────────────────────────
     A scope says where Figma offers a variable in its pickers. Only the
     consumption layer's variables carry any — everything under it is hidden
     (an EMPTY scope list, which is not the same as the default ALL_SCOPES) —
     and which set a variable has is a function of its group and, in two
     groups, its leaf. Measured: this table reproduces the scopes of all 3,179
     variables in the live file. A `restore.scopes` section in the document
     overrides it, which is how a scope someone changed by hand survives. */
  var TEXT_SCOPES = ['FONT_SIZE', 'FONT_VARIATIONS', 'FONT_WEIGHT', 'LETTER_SPACING', 'LINE_HEIGHT',
                     'PARAGRAPH_INDENT', 'PARAGRAPH_SPACING'];
  var GROUP_SCOPES = {
    'colours': ['ALL_SCOPES'],
    'spacing': ['FONT_VARIATIONS', 'GAP', 'WIDTH_HEIGHT'],
    'sizing': ['FONT_VARIATIONS', 'GAP', 'WIDTH_HEIGHT'],
    'radius': ['CORNER_RADIUS', 'FONT_VARIATIONS'],
    'strokes': ['FONT_VARIATIONS', 'STROKE_FLOAT'],
    'grid': [],
    'columns': ['FONT_VARIATIONS', 'WIDTH_HEIGHT']
  };

  /* `path` is the variable's name as a dotted path inside its collection
     ("typography.display.size"). Returns null for a group the table does not
     know, so the caller can leave the default alone rather than invent one. */
  function scopesFor(collection, path) {
    if (collection !== C.foundation && collection !== C.layout) return [];
    var seg = String(path).split('.');
    var group = seg[0];
    var leaf = seg[seg.length - 1];
    if (group === 'elevation') return leaf === 'colour' ? ['EFFECT_COLOR'] : ['EFFECT_FLOAT', 'FONT_VARIATIONS'];
    if (group === 'typography') return leaf === 'font-family' ? ['ALL_SCOPES'] : TEXT_SCOPES.slice();
    return GROUP_SCOPES[group] ? GROUP_SCOPES[group].slice() : null;
  }

  /* ── collections ────────────────────────────────────────────────────────
     The collections an import creates, in creation order, with their modes.
     `meta` is the document's own com.desquared.radd block and `breakpoints`
     the keys under its top-level `breakpoint` group. */
  function collectionsFor(meta, breakpoints, opts) {
    opts = opts || {};
    var modes = {};
    modes[C.core] = [C.core];
    modes[C.foundation] = [C.foundation];
    modes[C.secondary] = (meta.accentSchemes || []).slice();
    modes[C.black] = [C.black];
    modes[C.brand] = [C.brand];
    modes[C.breakpoint] = (breakpoints || []).map(breakpointMode);
    modes[C.white] = [C.white];
    modes[C.mode] = (meta.modes || []).slice();
    modes[C.restricted] = RESTRICTED_MODES.slice();
    modes[C.scheme] = SCHEME_MODES.slice();
    modes[C.layout] = [LAYOUT_MODE];
    return ORDER.filter(function (n) { return !(opts.without && opts.without[n]); })
                .map(function (n) { return { name: n, modes: modes[n] }; });
  }
  function breakpointMode(key) { return BREAKPOINTS[key] || key; }

  /* ── recognition ────────────────────────────────────────────────────────
     Is this document one this template can rebuild? Decided from what the
     document says about itself, never from a file name. */
  function recognise(doc) {
    var meta = doc && doc.$extensions && doc.$extensions['com.desquared.radd'];
    if (!meta || typeof meta !== 'object' || !meta.foundationDefaults) {
      return { ok: false, reason: 'not a resolved export (no foundationDefaults)' };
    }
    var declared = meta.restore && meta.restore.architecture;
    if (declared && declared.id && declared.id !== ID) {
      return { ok: false, reason: 'built for another architecture (' + declared.id + ')' };
    }
    if (declared && declared.version && declared.version > VERSION) {
      return { ok: false, reason: 'built for a newer version of this architecture (' + declared.version + ')' };
    }
    var schemes = meta.schemes || [];
    var need = ['neutral', 'inverted', 'white', 'black', 'brand'];
    for (var i = 0; i < need.length; i++) {
      if (schemes.indexOf(need[i]) === -1) return { ok: false, reason: 'scheme "' + need[i] + '" is missing' };
    }
    if (!meta.accentSchemes || !meta.accentSchemes.length) return { ok: false, reason: 'no accent schemes' };
    if (!meta.modes || meta.modes.indexOf('light') === -1 || meta.modes.indexOf('dark') === -1) {
      return { ok: false, reason: 'expected the modes light and dark' };
    }
    if (!doc.core || !doc.mode || !doc.foundation) return { ok: false, reason: 'core, foundation or mode is missing' };
    return { ok: true, meta: meta, declared: !!declared };
  }

  /* At EXPORT time: does this variable graph have the architecture? (A
     .scheme with its six modes and a _restricted with its four.) */
  function detectInCollections(collections) {
    var by = {};
    (collections || []).forEach(function (c) { by[c.name] = c; });
    var scheme = by[C.scheme], restricted = by[C.restricted];
    if (!scheme || !restricted || !by[C.mode] || !by[C.core]) return false;
    var names = function (c) { return (c.modes || []).map(function (m) { return m.name; }); };
    return SCHEME_MODES.every(function (m) { return names(scheme).indexOf(m) !== -1; }) &&
           RESTRICTED_MODES.every(function (m) { return names(restricted).indexOf(m) !== -1; });
  }

  var api = {
    ID: ID, VERSION: VERSION, C: C, ORDER: ORDER, BREAKPOINTS: BREAKPOINTS,
    SCHEME_MODES: SCHEME_MODES, RESTRICTED_MODES: RESTRICTED_MODES, LAYOUT_MODE: LAYOUT_MODE,
    ERROR_COLOUR: ERROR_COLOUR, MODE_PREFIX: MODE_PREFIX, PALETTE: PALETTE,
    SYNTHESIZED_CORE_GROUPS: SYNTHESIZED_CORE_GROUPS,
    DEFAULT_LINKS: DEFAULT_LINKS, NUMBER_LINKS: NUMBER_LINKS, CORE_CAMEL_GROUPS: CORE_CAMEL_GROUPS, coreName: coreName, UNDERLINED_PREFIX: UNDERLINED_PREFIX, ACRONYMS: ACRONYMS, GRID_STYLE: GRID_STYLE,
    paletteCollection: paletteCollection, keeps: keeps, scopesFor: scopesFor,
    collectionsFor: collectionsFor, breakpointMode: breakpointMode,
    recognise: recognise, detectInCollections: detectInCollections
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomArchitectureRadd = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
