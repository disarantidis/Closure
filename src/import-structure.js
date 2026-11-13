/*
  Dual-mode, exactly like src/import-resolved.js: module.exports when there is a require(), a global
  otherwise. Runs in Node (the self-test) and in the plugin UI.

  A RESOLVED EXPORT REBUILT FROM ITS OWN STRUCTURE RECORD.

  src/import-resolved.js rebuilds the two layerings it has written rules for. This rebuilds ANY layering,
  because the export carried the file's whole variable graph inside itself (`restore.structure`, written by
  src/structure-graph.js): the collections and their modes, every variable with its type, scopes,
  description and code syntax, every cell as an alias to a named variable or a literal value, the order,
  and the styles. Nothing of the document's token tree is read: that tree is what a CONSUMER reads, the
  record is what the FILE had.

  It emits the same rows import-resolved.js does, with a manifest that declares every collection and mode,
  so derive() binds by declaration, compile() still enforces the ceilings and apply() writes what it
  always has. A record it cannot read (another format, a newer version) is refused with its reason.

  WHAT IT CANNOT DO: put back a variable of a library (an alias to a variable that is not in the file is
  left out and counted), the inheritance of an extended collection, or an empty collection.
*/
(function (global) {
  'use strict';

  var G = (typeof require === 'function') ? require('./structure-graph.js') : global.PomStructureGraph;
  var NS = 'com.desquared.radd';

  var DTCG_TYPE = { COLOR: 'color', FLOAT: 'number', STRING: 'string', BOOLEAN: 'boolean' };

  /* A dot inside a name travels as U+2024; see import-compile.js. */
  function pathOfName(name) {
    return String(name).split('.').join('․').split('/').join('.');
  }

  function recordOf(doc) {
    var meta = doc && doc.$extensions && doc.$extensions[NS];
    var restore = meta && meta.restore;
    return restore && restore.structure ? restore.structure : null;
  }

  /* { ok, meta, structure } | { ok:false, reason } */
  function recognise(doc) {
    var rec = recordOf(doc);
    if (!rec) return { ok: false, reason: 'the export carries no structure record' };
    if (rec.format !== G.FORMAT) return { ok: false, reason: 'the structure record is not in a format this plugin reads' };
    if (rec.version > G.VERSION) return { ok: false, reason: 'the structure record was written by a newer version (' + rec.version + ')' };
    if (!rec.collections || !rec.collections.length) return { ok: false, reason: 'the structure record holds no collections' };
    return { ok: true, meta: doc.$extensions[NS], structure: rec };
  }

  function colourLiteral(c) {
    return { colorSpace: 'srgb', components: [c.r, c.g, c.b], alpha: c.a };
  }

  function valueOf(cell) {
    if (cell.alias) return { ref: pathOfName(cell.alias.name), refCol: cell.alias.collection };
    var lit = cell.literal;
    if (lit && typeof lit === 'object' && 'r' in lit) return { literal: colourLiteral(lit) };
    return { literal: lit };
  }

  /* A style as the record spells it -> as an import wants it: bound variables looked up by name. */
  function boundOf(map, where, exists, report) {
    var out = {};
    Object.keys(map || {}).forEach(function (field) {
      var full = String(map[field]);
      var i = full.indexOf('::');
      var hit = i === -1 ? null : { collection: full.slice(0, i), name: full.slice(i + 2) };
      if (hit && exists(hit.collection, hit.name)) out[field] = hit;
      else report.bindingsMissing.push(where + '.' + field + ' -> ' + full);
    });
    return out;
  }
  function layerOf(x, name, exists, report) {
    var o = {};
    Object.keys(x).forEach(function (k) { o[k] = k === 'bound' ? boundOf(x.bound, name, exists, report) : x[k]; });
    return o;
  }
  function stylesOf(rs, exists) {
    var report = { source: null, text: 0, effect: 0, bindingsMissing: [] };
    var out = { text: [], effect: [], grid: [], report: report };
    if (!rs) return out;
    report.source = 'structure';
    (rs.grid || []).forEach(function (g) {
      out.grid.push({ name: g.name, description: g.description || '',
                      layoutGrids: g.layoutGrids.map(function (x) { return layerOf(x, g.name, exists, report); }) });
    });
    (rs.text || []).forEach(function (t) {
      out.text.push({ name: t.name, description: t.description || '', fontName: t.fontName,
                      textCase: t.textCase, textDecoration: t.textDecoration, values: t.values,
                      bound: boundOf(t.bound, t.name, exists, report) });
    });
    (rs.effect || []).forEach(function (e) {
      out.effect.push({ name: e.name, description: e.description || '',
                        effects: e.effects.map(function (x) { return layerOf(x, e.name, exists, report); }) });
    });
    report.text = out.text.length;
    report.effect = out.effect.length;
    return out;
  }

  /*
    DOES THIS LITERAL HOLD A PLAIN VALUE OF ITS DECLARED TYPE?

    The record is a FAITHFUL copy of whatever cell Figma gave (structure-graph.js
    never interprets a value, only stores it), and not every cell Figma reports
    is a plain writable value even for a variable whose own resolvedType is
    COLOR/FLOAT/STRING/BOOLEAN: a real file was seen to carry cells shaped
    `{ color: {alias}, opacity: {alias} }` — a colour bound through one alias and
    its opacity through a second, which the Variables API itself has no write
    call for (createVariable + setValueForMode takes one RGBA or one alias, never
    both combined). Importable at a different layer, perhaps, but not as a bare
    cell value, so it is counted here rather than handed to compile(), which
    would otherwise refuse the WHOLE import over one unwritable corner of it —
    2,601 variables lost to 513 cells of a feature nothing in this pipeline
    binds through yet.
  */
  function writableLiteral(type, lit) {
    if (lit === undefined || lit === null) return false;
    if (type === 'color') return typeof lit === 'object' && !Array.isArray(lit) && typeof lit.r === 'number';
    if (type === 'number') return typeof lit === 'number';
    if (type === 'boolean') return typeof lit === 'boolean';
    return typeof lit === 'string';
  }

  function rowsOf(decoded, rows, counts, holes, missing, seen) {
    decoded.forEach(function (c) {
      c.variables.forEach(function (v) {
        var path = pathOfName(v.name);
        seen[c.name + '\u0000' + v.name] = true;
        var type = DTCG_TYPE[v.type] || 'string';
        var gap = [];
        var written = 0;
        c.modes.forEach(function (mode) {
          var cell = v.values[mode];
          if (cell === undefined) { gap.push(mode); return; }
          if (cell.alias === undefined && !writableLiteral(type, cell.literal)) {
            gap.push(mode);
            missing.push(c.name + ' ' + path + ' (' + mode + '): not a plain ' + type + ' value — carried in the structure record but not written');
            return;
          }
          rows.push({ group: c.name, variant: mode, set: c.name, path: path, type: type,
                      value: valueOf(cell), description: v.description || '', scopes: v.scopes.slice(),
                      codeSyntax: v.codeSyntax });
          written++;
        });
        /* Counted only when it will actually be created: a variable with no
           writable cell at all (every mode fell to the check above) never
           reaches derive(), so it never becomes a Figma variable either. */
        if (written) counts[c.name] = (counts[c.name] || 0) + 1;
        if (gap.length && gap.length < c.modes.length) holes.push({ collection: c.name, name: v.name, modes: gap });
      });
    });
  }

  /*
    translate(doc) -> { ok: true, ir, report, collectionOrder } | { ok: false, reason }
    — the same answer import-resolved.translate gives for the layerings it has rules for.
  */
  function translate(doc, opts) {
    var rec = recognise(doc);
    if (!rec.ok) return { ok: false, reason: rec.reason };
    var structure = rec.structure;
    var decoded = G.decode(structure);

    var rows = [], counts = {}, holes = [], missing = [], seen = {};
    rowsOf(decoded, rows, counts, holes, missing, seen);

    /* an alias whose target is not a variable of the record is dropped by derive(); name it here */
    rows.forEach(function (r) {
      if (r.value.ref !== undefined && !seen[r.value.refCol + '\u0000' + String(r.value.ref).split('.').join('/').split('․').join('.')]) {
        missing.push(r.group + ' ' + r.path + ' (' + r.variant + ') -> ' + r.value.refCol + '::' + r.value.ref);
      }
    });

    var exists = function (col, name) { return !!seen[col + '\u0000' + name]; };
    var styles = stylesOf(structure.styles, exists);

    var present = decoded.filter(function (c) { return counts[c.name]; });
    var manifest = {
      version: 1,
      collections: present.map(function (c) {
        return { figmaName: c.name, modes: c.modes.slice(), variables: counts[c.name] };
      })
    };
    var collectionMeta = {};
    present.forEach(function (c) { if (c.hidden) collectionMeta[c.name] = { hidden: true }; });
    var order = present.map(function (c) { return c.name; });
    var variables = 0;
    Object.keys(counts).forEach(function (k) { variables += counts[k]; });

    var perCollection = {};
    order.forEach(function (n) { perCollection[n] = counts[n]; });
    return {
      ok: true,
      ir: { source: 'resolved', rows: rows, sets: order.slice(), themes: null, manifest: manifest,
            collectionMeta: collectionMeta,
            styles: { text: styles.text, effect: styles.effect, grid: styles.grid } },
      collectionOrder: order,
      report: {
        architecture: 'structure',
        declared: true,
        collections: present.length,
        variables: variables,
        modeValues: rows.length,
        perCollection: perCollection,
        scopes: { restore: variables, rules: 0 },
        skipped: { composites: 0, synthesized: 0 },
        links: 0,
        external: structure.external || 0,
        styles: styles.report,
        relinked: { linked: 0, ambiguous: 0, none: 0, examples: [], ambiguousCells: [], noneCells: [], numbers: { linked: 0, ambiguous: 0 } },
        holes: holes,
        missing: missing
      }
    };
  }

  var api = { recognise: recognise, translate: translate, recordOf: recordOf, pathOfName: pathOfName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomImportStructure = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
