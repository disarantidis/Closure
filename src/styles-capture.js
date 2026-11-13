/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
  'use strict';

  /*
    THE STYLES OF A FILE, READ AS DEFINITIONS.

    The export used to read a style's id and name and nothing else — enough for
    a Tokens Studio reference map, and nothing like enough to say what a style
    IS. A Resolved document's typography and shadow composites are built from
    VARIABLES by naming convention, not from the styles, so they say what the
    styles probably hold and are wrong where a style departs from the
    convention (the three Link styles are underlined in Figma; their composites
    say `none`).

    This reads the definition itself — font, case, decoration, the values, and
    which variable each field is bound to — through the async Plugin API, and
    returns plain data. It takes `figma` as an argument, like import-apply.js,
    so a mock can drive it in the suite and the plugin hands it the real one.

    A BOUND VARIABLE IS NAMED, NOT NUMBERED. `collection::variable name`,
    resolved through the variable's own id. Ids are not stable enough to carry:
    in the live RADD file every text style's paragraph-indent is bound to an id
    that is not in the local variable list, and that Figma nevertheless
    resolves to the variable of the same name in `foundation`. The name is what
    survives, and is what an importer can look up.

    ES5 on purpose (var, function, Promise): this runs in the plugin sandbox,
    where the rest of code.source.js is written the same way.
  */

  var TEXT_FIELDS = ['fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'letterSpacing',
                     'lineHeight', 'paragraphSpacing', 'paragraphIndent'];
  var EFFECT_FIELDS = ['color', 'radius', 'spread', 'offsetX', 'offsetY'];
  var GRID_FIELDS = ['sectionSize', 'count', 'offset', 'gutterSize'];

  function round4(n) { return typeof n === 'number' ? Math.round(n * 1e4) / 1e4 : n; }
  function unitValue(x) {
    if (!x || typeof x !== 'object') return x;
    var o = { unit: x.unit };
    if (x.value !== undefined) o.value = round4(x.value);
    return o;
  }

  function captureNow(figmaApi) {
    var vars = figmaApi.variables;
    var nameCache = {};          // variable id -> Promise<'collection::name' | null>
    var collCache = {};          // collection id -> Promise<name>

    function collectionName(id) {
      if (!collCache[id]) {
        collCache[id] = Promise.resolve(vars.getVariableCollectionByIdAsync(id))
          .then(function (c) { return c ? c.name : null; })
          .catch(function () { return null; });
      }
      return collCache[id];
    }
    function variableName(alias) {
      if (!alias || !alias.id) return Promise.resolve(null);
      if (!nameCache[alias.id]) {
        nameCache[alias.id] = Promise.resolve(vars.getVariableByIdAsync(alias.id)).then(function (v) {
          if (!v) return null;
          return collectionName(v.variableCollectionId).then(function (c) {
            return c === null ? null : c + '::' + v.name;
          });
        }).catch(function () { return null; });
      }
      return nameCache[alias.id];
    }
    /* { field: alias } -> Promise<{ field: 'collection::name' }>, leaving out
       what cannot be named rather than writing a null a reader has to guard. */
    function nameAll(bound, fields) {
      var out = {};
      var work = fields.filter(function (f) { return bound && bound[f]; }).map(function (f) {
        var one = Array.isArray(bound[f]) ? bound[f][0] : bound[f];
        return variableName(one).then(function (n) { if (n) out[f] = n; });
      });
      return Promise.all(work).then(function () { return out; });
    }

    function readText(s) {
      return nameAll(s.boundVariables, TEXT_FIELDS).then(function (bound) {
        return {
          id: s.id, name: s.name, type: 'TEXT', description: s.description || '',
          fontName: { family: s.fontName.family, style: s.fontName.style },
          textCase: s.textCase, textDecoration: s.textDecoration,
          values: {
            fontSize: round4(s.fontSize),
            lineHeight: unitValue(s.lineHeight),
            letterSpacing: unitValue(s.letterSpacing),
            paragraphSpacing: round4(s.paragraphSpacing),
            paragraphIndent: round4(s.paragraphIndent)
          },
          bound: bound
        };
      });
    }

    function readEffect(s) {
      var layers = (s.effects || []).map(function (e) {
        return nameAll(e.boundVariables, EFFECT_FIELDS).then(function (bound) {
          var o = { type: e.type, visible: e.visible !== false, blendMode: e.blendMode || 'NORMAL', bound: bound };
          if (e.color) o.color = [round4(e.color.r), round4(e.color.g), round4(e.color.b), round4(e.color.a)];
          if (e.offset) o.offset = { x: round4(e.offset.x), y: round4(e.offset.y) };
          if (e.radius !== undefined) o.radius = round4(e.radius);
          if (e.spread !== undefined) o.spread = round4(e.spread);
          if (e.showShadowBehindNode !== undefined) o.showShadowBehindNode = e.showShadowBehindNode;
          return o;
        });
      });
      return Promise.all(layers).then(function (effects) {
        return { id: s.id, name: s.name, type: 'EFFECT', description: s.description || '', effects: effects };
      });
    }

    /* A grid style holds layout grids; each is a pattern with the fields that
       pattern uses (a COLUMNS grid has count, gutter, and either an offset —
       STRETCH — or a section size), a colour, and variables bound to any of the
       four numeric fields. Only the fields a grid actually has are copied. */
    function readGrid(s) {
      var layers = (s.layoutGrids || []).map(function (g) {
        return nameAll(g.boundVariables, GRID_FIELDS).then(function (bound) {
          var o = { pattern: g.pattern, visible: g.visible !== false, bound: bound };
          if (g.alignment !== undefined) o.alignment = g.alignment;
          ['count', 'gutterSize', 'offset', 'sectionSize'].forEach(function (k) {
            if (g[k] !== undefined) o[k] = round4(g[k]);
          });
          if (g.color) o.color = [round4(g.color.r), round4(g.color.g), round4(g.color.b), round4(g.color.a)];
          return o;
        });
      });
      return Promise.all(layers).then(function (layoutGrids) {
        return { id: s.id, name: s.name, type: 'GRID', description: s.description || '', layoutGrids: layoutGrids };
      });
    }

    return Promise.all([
      Promise.resolve(figmaApi.getLocalTextStylesAsync()),
      Promise.resolve(figmaApi.getLocalEffectStylesAsync()),
      Promise.resolve(figmaApi.getLocalGridStylesAsync ? figmaApi.getLocalGridStylesAsync() : [])
    ]).then(function (lists) {
      return Promise.all([
        Promise.all(lists[0].map(readText)),
        Promise.all(lists[1].map(readEffect)),
        Promise.all(lists[2].map(readGrid))
      ]);
    }).then(function (all) {
      return { textStyles: all[0], effectStyles: all[1], gridStyles: all[2] };
    });
  }

  /* A read that cannot start — a Plugin API without the async getters, say —
     is a REJECTED promise, not a throw, so the caller's fallback to id and name
     is one .catch away and cannot be skipped by a synchronous error. */
  function capture(figmaApi) {
    return Promise.resolve().then(function () { return captureNow(figmaApi); });
  }

  /*
    EVERY LOCAL STYLE, REMOVED — the cleanup that goes with deleting a file's
    variables, so an import can be run again into the same file. Only the kinds
    this plugin reads and creates (text, effect, grid); a paint style is not
    touched because nothing here makes one. A style that refuses is counted and
    named, and does not stop the rest.
  */
  function removeAll(figmaApi, kinds) {
    var result = { text: 0, effect: 0, grid: 0, failed: [] };
    /* `kinds` ({ text, effect, grid } booleans) limits it to the ones ticked;
       absent, all three go. */
    function wanted(kind) { return !kinds || !!kinds[kind]; }
    function sweep(listPromise, kind) {
      if (!wanted(kind)) return Promise.resolve();
      return Promise.resolve(listPromise).then(function (list) {
        (list || []).forEach(function (s) {
          try { s.remove(); result[kind]++; }
          catch (e) { result.failed.push({ name: s.name, error: (e && e.message) || String(e) }); }
        });
      });
    }
    return Promise.resolve().then(function () {
      return sweep(figmaApi.getLocalTextStylesAsync(), 'text');
    }).then(function () {
      return sweep(figmaApi.getLocalEffectStylesAsync(), 'effect');
    }).then(function () {
      return sweep(figmaApi.getLocalGridStylesAsync ? figmaApi.getLocalGridStylesAsync() : [], 'grid');
    }).then(function () { return result; });
  }

  var api = { capture: capture, removeAll: removeAll, TEXT_FIELDS: TEXT_FIELDS, EFFECT_FIELDS: EFFECT_FIELDS, GRID_FIELDS: GRID_FIELDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomStylesCapture = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
