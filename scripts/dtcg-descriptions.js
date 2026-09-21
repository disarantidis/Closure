#!/usr/bin/env node
/*
 * dtcg-descriptions.js — read the deduplicated description map.
 *
 * The exporter stores each description once, at the document root, keyed by the
 * token path (see the description-dedupe note in DTCG.md). This is the
 * reference reader for that, meant to be copied into — or required by —
 * a downstream build-dtcg.js step that finishes the DTCG conversion.
 *
 * Integration is one line. Call inlineDescriptions() on the parsed document
 * before anything else touches it, and every token carries its own
 * $description again, exactly as if it had never been deduplicated:
 *
 *     const tokens = JSON.parse(fs.readFileSync(SRC, 'utf8'));
 *     inlineDescriptions(tokens);          // <- add this
 *     // ...the rest of build-dtcg.js is unchanged
 *
 * Nothing downstream needs to know the map exists, and it is a no-op on an
 * export that has no map (an older file, or one produced with
 * { dedupeDescriptions: false }), so it is safe to add unconditionally.
 *
 * Use lookupDescription() instead if you would rather resolve lazily and have a
 * token's path to hand.
 */
'use strict';

var EXT_EXPORTER = 'com.closure.json-exporter';

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** The path → description map, or {} when the document carries none. */
function descriptionMap(tokens) {
  var ext = tokens && tokens.$extensions && tokens.$extensions[EXT_EXPORTER];
  return (ext && ext.descriptions) || {};
}

/**
 * Resolve one token's description.
 *
 * An inline $description always wins: it is only ever present when two
 * variables share a path with different text, and it is what keeps that export
 * lossless.
 *
 * @param {object} token  the token node ({ $value, $type, ... })
 * @param {string} path   dotted token path WITHIN its set — 'colours.brand.primary',
 *                        not 'foundation.colours.brand.primary'
 */
function lookupDescription(token, path, map) {
  if (token && token.$description !== undefined) return token.$description;
  return map[path];
}

/**
 * Write every mapped description back onto its tokens, in place, and drop the
 * map. After this the document is identical to a { dedupeDescriptions: false }
 * export, so existing code that reads token.$description just works.
 *
 * @returns {number} how many descriptions were inlined
 */
function inlineDescriptions(tokens) {
  var map = descriptionMap(tokens);
  var keys = Object.keys(map);
  if (!keys.length) return 0;

  var applied = 0;
  Object.keys(tokens).forEach(function (setName) {
    if (setName.charAt(0) === '$') return;
    (function walk(node, path) {
      if (!isObject(node)) return;
      if ('$value' in node) {
        if (node.$description === undefined && map[path] !== undefined) {
          node.$description = map[path];
          applied++;
        }
        return;
      }
      Object.keys(node).forEach(function (key) {
        if (key.charAt(0) === '$') return;
        walk(node[key], path ? path + '.' + key : key);
      });
    })(tokens[setName], '');
  });

  // The map has served its purpose; leaving it would duplicate every string
  // again in whatever this document is serialized to next.
  delete tokens.$extensions[EXT_EXPORTER];
  if (!Object.keys(tokens.$extensions).length) delete tokens.$extensions;

  return applied;
}

module.exports = {
  EXT_EXPORTER: EXT_EXPORTER,
  descriptionMap: descriptionMap,
  lookupDescription: lookupDescription,
  inlineDescriptions: inlineDescriptions,
};

// Run directly to check a real export: node scripts/dtcg-descriptions.js <file>
if (require.main === module) {
  var fs = require('fs');
  var file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/dtcg-descriptions.js <dtcg-partial.json>');
    process.exit(1);
  }
  var doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  var mapSize = Object.keys(descriptionMap(doc)).length;
  var applied = inlineDescriptions(doc);
  console.log('map entries : ' + mapSize);
  console.log('inlined     : ' + applied + ' tokens');
  console.log(mapSize ? 'map removed after inlining' : 'no map in this document (nothing to do)');
}
