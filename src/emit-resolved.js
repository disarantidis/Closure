/*
 * emit-resolved.js — shape a resolved Figma variable graph into a
 * consumption-oriented document.
 *
 * WHAT IT PRODUCES, and why it looks nothing like the export we already ship.
 * The default export mirrors the authoring structure: one document per
 * collection x mode, alias hops preserved as cross-document references. This
 * produces the other thing a consumer may want — the routing resolved away,
 * grouped by what each token actually varies with:
 *
 *   core              the primitive collection, raw values
 *   breakpoint.<mode> everything that varies by breakpoint
 *   mode.<mode>.<scheme>  everything that varies by scheme/light-dark
 *
 * NONE OF THOSE THREE GROUPS IS A CONVENTION THIS FILE KNOWS. They fall out of
 * resolve-architecture.js: which collection is primitive is the one aliasing
 * nowhere, the axes are the multi-mode collections, and which axis a token
 * belongs under is measured by resolving it and seeing which collections the
 * walk actually entered. Point it at a differently-organised file and it
 * partitions that file instead.
 *
 * REFERENCES, NOT INLINED VALUES. A token resolves by walking until it reaches
 * the primitive collection, then emits a reference to the token it landed on
 * ('{core.core-colours.base.white}') rather than that token's value. Only a
 * chain ending before the primitives contributes a literal. This keeps the
 * output traceable and is what a downstream consumer of this shape expects —
 * measured against a real one, whose core is 352 raw values with zero
 * references while its other groups are 7,128 references all pointing into it.
 *
 * HOOKS, because the pieces this needs already exist elsewhere and reimplementing
 * them would be a second source of truth. code.js owns the raw-value formatting
 * and the composite builders; dtcg-format.js owns the DTCG conversion. The
 * caller passes them in — code.js has them in scope, and a test supplies them
 * the same way. This file only contributes the SHAPE.
 */
(function (global) {
  'use strict';

  var A = (typeof require === 'function')
    ? require('./resolve-architecture.js')
    : global.PomArchitecture;

  function dotted(name) { return name.split('/').join('.'); }

  function setDeep(root, path, value) {
    var parts = path.split('/');
    var node = root;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }

  function lookupDotted(tree, path) {
    var parts = path.split('.');
    var node = tree;
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== 'object') return undefined;
      node = node[parts[i]];
    }
    return node;
  }

  /*
    Figma reports FLOAT / COLOR / STRING; dtcg-format.js keys off the SEMANTIC
    legacy type ('dimension', 'color', 'spacing', ...). Without this mapping no
    composite converter ever fires and every dimension ships as a bare number —
    the same namespace-driven rule code.js's own getFoundationTokenType applies.
  */
  function semanticType(name, resolvedType) {
    var ns = name.split('/')[0];
    if (/colour|color/i.test(name)) return 'color';
    if (resolvedType === 'COLOR') return 'color';
    if (ns === 'dimension' || /^viewport-/.test(ns)) return 'dimension';
    if (ns === 'font-family' || ns === 'fontFamilies') return 'fontFamilies';
    if (ns === 'fontWeights') return 'fontWeights';
    if (ns === 'spacing') return 'spacing';
    if (ns === 'sizing' || ns === 'strokes') return 'sizing';
    if (ns === 'radius') return 'borderRadius';
    if (resolvedType === 'FLOAT') return 'number';
    return resolvedType === 'STRING' ? 'text' : 'number';
  }

  /*
    code.js builds an elevation composite pointing at its own sibling flat
    tokens, which is what the legacy tree wants. In this shape there is no
    sibling for a consumer to follow, so each part goes one hop further: the
    colour lands on the core reference the sibling itself holds, and the
    dimensional parts resolve to a literal and take the dimension composite
    shape. `inset` is stated rather than left to the spec's default, which is
    what a consumer of this shape compares against.
  */
  function derefShadowComposites(branch, core) {
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if ('$value' in node) {
        if (node.$type === 'shadow' && node.$value && typeof node.$value === 'object') {
          var v = node.$value;
          ['color', 'offsetX', 'offsetY', 'blur', 'spread'].forEach(function (part) {
            var cur = v[part];
            if (typeof cur === 'string' && /^\{[^}]+\}$/.test(cur)) {
              var path = cur.slice(1, -1);
              if (path.indexOf('core.') !== 0) {
                var sibling = lookupDotted(branch, path);
                if (sibling && '$value' in sibling) cur = sibling.$value;
              }
            }
            if (part !== 'color' && typeof cur === 'string' && /^\{core\./.test(cur)) {
              var target = lookupDotted(core, cur.slice(1, -1).replace(/^core\./, ''));
              if (target && '$value' in target && typeof target.$value === 'number') {
                cur = { value: target.$value, unit: 'px' };
              }
            }
            if (part !== 'color' && typeof cur === 'number') cur = { value: cur, unit: 'px' };
            v[part] = cur;
          });
          if (v.inset === undefined) v.inset = false;
        }
        return;
      }
      Object.keys(node).forEach(function (k) { if (k.charAt(0) !== '$') walk(node[k]); });
    })(branch);
  }

  /*
    options.hooks — formatValue, formatFloatForExport, addTypographyComposite,
                    addElevationCompositesDeep (code.js), toDtcgFormat
                    (dtcg-format.js)
    options.coreGroup       what to call the primitive group in references
    options.breakpointNames optional mode-name -> output-name map
    options.pin             axes held at one mode instead of becoming branches
  */
  function emit(collections, options) {
    options = options || {};
    var hooks = options.hooks || {};
    var coreGroup = options.coreGroup || 'core';
    var bpNames = options.breakpointNames || {};
    var pin = options.pin || {};

    var index = A.buildIndex(collections);
    var cls = A.classify(collections);
    var primitiveName = cls.primitive[0];
    var primitive = index.collsByName[primitiveName];

    function fmt(value, resolvedType) {
      if (value && typeof value === 'object' && value.r !== undefined && hooks.formatValue) {
        return hooks.formatValue(value, 'COLOR');
      }
      if (typeof value === 'number' && hooks.formatFloatForExport) {
        return hooks.formatFloatForExport(value);
      }
      return value;
    }

    // Walk to the primitive layer, then reference it rather than inline it.
    function refOrValue(variable, vector) {
      var r = A.resolve(index, variable, vector);
      if (r.terminal) {
        var tc = index.collectionOfVar[r.terminal.id];
        if (tc && tc.name === primitiveName) {
          return '{' + coreGroup + '.' + dotted(r.terminal.name) + '}';
        }
      }
      return fmt(r.value, variable.type);
    }

    var legacy = { core: {}, breakpoint: {}, mode: {} };

    var primMode = primitive.modes[0].modeId;
    primitive.variables.forEach(function (v) {
      setDeep(legacy.core, v.name, {
        value: fmt(v.valuesByMode[primMode], v.type),
        type: semanticType(v.name, v.type)
      });
    });

    // Axes a token can vary by, minus whatever the caller pinned.
    var axes = cls.axes.filter(function (a) { return pin[a.name] === undefined; });
    var byName = {}; axes.forEach(function (a) { byName[a.name] = a; });

    var bpAxis = byName['.breakpoint'];
    if (bpAxis) {
      var bpColl = index.collsByName['.breakpoint'];
      bpAxis.modes.forEach(function (mode) {
        var vector = { '.breakpoint': mode };
        Object.keys(pin).forEach(function (k) { vector[k] = pin[k]; });
        var branch = {};
        bpColl.variables.forEach(function (v) {
          var nm = v.name.replace(/^breakpoint\//, '');
          setDeep(branch, nm, { value: refOrValue(v, vector), type: semanticType(nm, v.type) });
        });
        (index.collsByName['layout'] ? index.collsByName['layout'].variables : []).forEach(function (v) {
          setDeep(branch, v.name, { value: refOrValue(v, vector), type: semanticType(v.name, v.type) });
        });
        legacy.breakpoint[bpNames[mode] || mode] = branch;
      });
    }

    // Scheme branches: the scheme axis, with any axis it routes INTO expanded
    // in place (a router mode that lands in a palette collection becomes one
    // branch per palette, named for the palette) — derived by resolving, not listed.
    var schemeAxis = byName['.scheme'];
    var modeAxis = byName['.mode'];
    var secondary = byName['.secondary'];
    if (schemeAxis && modeAxis) {
      var consumption = (options.roots || cls.consumption).filter(function (n) { return n !== 'layout'; });
      var combos = [];
      schemeAxis.modes.forEach(function (s) {
        if (secondary && s === 'secondary') {
          secondary.modes.forEach(function (p) { combos.push({ scheme: s, palette: p, out: p }); });
        } else {
          combos.push({ scheme: s, palette: secondary ? secondary.modes[0] : undefined, out: s });
        }
      });
      modeAxis.modes.forEach(function (m) {
        var branchSet = {};
        combos.forEach(function (combo) {
          var vector = { '.mode': m, '.scheme': combo.scheme };
          if (combo.palette !== undefined) vector['.secondary'] = combo.palette;
          Object.keys(pin).forEach(function (k) { vector[k] = pin[k]; });
          var branch = {};
          consumption.forEach(function (collName) {
            var coll = index.collsByName[collName];
            if (!coll) return;
            coll.variables.forEach(function (v) {
              // only what actually varies by scheme belongs in this group
              if (A.resolve(index, v, vector).visited.indexOf('.scheme') === -1) return;
              var nm = v.name.replace(/^colours\//, '');
              setDeep(branch, nm, { value: refOrValue(v, vector), type: semanticType(v.name, v.type) });
            });
          });
          branchSet[combo.out] = branch;
        });
        legacy.mode[m] = branchSet;
      });
    }

    // Composites, built by code.js so there is one implementation of them.
    if (hooks.addElevationCompositesDeep) {
      Object.keys(legacy.mode).forEach(function (m) {
        Object.keys(legacy.mode[m]).forEach(function (s) {
          hooks.addElevationCompositesDeep(legacy.mode[m][s], '', null);
        });
      });
    }
    if (hooks.addTypographyComposite) {
      Object.keys(legacy.breakpoint).forEach(function (bp) {
        var group = legacy.breakpoint[bp].typography;
        if (!group) return;
        Object.keys(group).forEach(function (scale) {
          var scaleObj = group[scale];
          if (!scaleObj || typeof scaleObj !== 'object' || 'value' in scaleObj) return;
          group[scale] = hooks.addTypographyComposite(scaleObj, scale);
          // textCase/textDecoration ride inside the composite's $extensions
          // in this shape rather than as tokens of their own.
          delete group[scale]['text-case'];
          delete group[scale]['text-decoration'];
        });
      });
    }

    // DTCG conversion, by dtcg-format.js for the same reason.
    var toDtcg = hooks.toDtcgFormat;
    function convert(tree) {
      if (!toDtcg) return tree;
      return toDtcg({ b: tree, $metadata: { tokenSetOrder: ['b'] } }, { shape: 'sets' }).tokens.b;
    }

    var out = { core: convert(legacy.core), breakpoint: {}, mode: {} };
    Object.keys(legacy.breakpoint).forEach(function (k) { out.breakpoint[k] = convert(legacy.breakpoint[k]); });
    Object.keys(legacy.mode).forEach(function (m) {
      out.mode[m] = {};
      Object.keys(legacy.mode[m]).forEach(function (s) { out.mode[m][s] = convert(legacy.mode[m][s]); });
    });

    Object.keys(out.mode).forEach(function (m) {
      Object.keys(out.mode[m]).forEach(function (s) { derefShadowComposites(out.mode[m][s], out.core); });
    });

    return { tokens: out, classification: cls };
  }

  var api = { emit: emit, semanticType: semanticType };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomEmitResolved = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
