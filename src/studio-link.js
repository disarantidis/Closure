/*
  THE STUDIO LINK, the plugin's side: what the RADD Studio asks over the local WebSocket and what this answers.

  The protocol is the Studio's (android/desktop/docs/FigmaLink.md in the radd-studio repo): one JSON object per
  frame, a request carries an `id` and its reply echoes it, unknown fields are ignored. This file is only the
  part that needs no browser and no Figma: building the messages and deciding what a difference IS. The socket
  and the Figma file are in ui.template.html and code.source.js, so this runs in Node too and the suite covers it.

  A DIFFERENCE IS CLASSIFIED AGAINST THE LAST SYNC. Three values per token: the one the Studio's branch has now,
  the one Figma has now, and the one both agreed on at the last sync (the baseline). Whoever moved away from the
  baseline changed it; if both did, and to different values, someone has to choose. With no baseline at all
  nothing can be said about who moved, so a token on one side only is that side's (studio-ahead when only Figma
  lacks it) and a token on both with two values is a conflict: the report is honest about not knowing.

  Dual-mode like json-diff.js: module.exports under require(), a global otherwise.
*/
(function (global) {
var diff = (typeof require === 'function' && typeof module !== 'undefined') ? require('./json-diff.js') : global.PomJsonDiff;

var DEFAULT_ADDRESS = 'ws://localhost:47865/figma';
/* What this plugin can answer. */
var COMMANDS = ['status', 'parity', 'apply', 'read', 'context', 'changed'];

/* "326 906", "326-906" and "326906" are one code. */
function normaliseCode(text) {
  return String(text === null || text === undefined ? '' : text).replace(/\D/g, '');
}
function isCode(text) { return normaliseCode(text).length === 6; }

function helloMessage(code, fileName, pluginVersion) {
  return { type: 'hello', id: 'hello', code: normaliseCode(code), fileName: String(fileName || ''),
           pluginVersion: String(pluginVersion || ''), commands: COMMANDS.slice() };
}

function statusReply(id, fileName, collections, lastSync) {
  return { type: 'status', id: id, fileName: String(fileName || ''), collections: collections | 0,
           lastSync: lastSync || null };
}

/* A token's place in a flat map -> the value written in a report. */
function shown(entry) { return entry ? entry.value : null; }

/*
  studio, figma: Map path -> { value, ref, type } (json-diff's flatten, numbers rounded).
  baseline: plain object path -> value at the last sync, or null when there has never been one.

  Returns { tokens: [{ name, class, studio, figma }], same: count }.
*/
function classify(studio, figma, baseline) {
  var synced = !!baseline && Object.keys(baseline).length > 0;
  var tokens = [], same = 0;
  function visit(name) {
    var s = studio.get(name), f = figma.get(name);
    var sv = shown(s), fv = shown(f);
    if (s && f && sv === fv) { same++; return; }
    var cls;
    var known = synced && Object.prototype.hasOwnProperty.call(baseline, name);
    if (!known) {
      cls = !f ? 'studio-ahead' : !s ? 'figma-changed' : 'conflict';
    } else {
      var b = baseline[name];
      var studioMoved = !s || sv !== b;
      var figmaMoved = !f || fv !== b;
      if (studioMoved && figmaMoved) cls = 'conflict';
      else cls = studioMoved ? 'studio-ahead' : 'figma-changed';
    }
    tokens.push({ name: name, class: cls, studio: sv, figma: fv });
  }
  studio.forEach(function (_v, name) { visit(name); });
  figma.forEach(function (_v, name) { if (!studio.has(name)) visit(name); });
  return { tokens: tokens, same: same };
}

/* The values both sides share now, as the new baseline once they have been synced. */
function baselineOf(studio) {
  var out = {};
  studio.forEach(function (entry, name) { out[name] = entry.value; });
  return out;
}

/* Both sides read to the same three decimals, and classified: what parity, apply and read all start from. */
function parityDetail(studioDoc, figmaDoc, baseline) {
  var s = diff.flattenRounded(studioDoc), f = diff.flattenRounded(figmaDoc);
  return { studio: s, figma: f, result: classify(s, f, baseline) };
}

/*
  THE PARITY REPLY for a `parity` request: msg.tokens is the Studio's token file as JSON, figmaDoc this file's
  resolved document.
*/
function parityReply(id, studioDoc, figmaDoc, baseline) {
  var r = parityDetail(studioDoc, figmaDoc, baseline).result;
  return { type: 'parity', id: id, same: r.same, tokens: r.tokens };
}

/* The names in a classified result that are of one of `classes`. */
function namesOf(result, classes) {
  return result.tokens.filter(function (t) { return classes.indexOf(t.class) !== -1; }).map(function (t) { return t.name; });
}

/*
  THE NEW BASELINE after an apply: what both sides agree on now. Every token the two already held alike, and every
  token just moved from the Studio. A token that is figma-changed or in conflict keeps what the old baseline said
  (or nothing), so it is still reported as a change afterwards instead of being quietly absorbed.
*/
function baselineAfterApply(old, studio, figma, appliedNames) {
  var out = {};
  if (old) Object.keys(old).forEach(function (k) { out[k] = old[k]; });
  studio.forEach(function (entry, name) {
    var f = figma.get(name);
    if (f && f.value === entry.value) out[name] = entry.value;
  });
  appliedNames.forEach(function (name) {
    var s = studio.get(name);
    if (s) out[name] = s.value;
  });
  return out;
}

/* Why a parity request cannot be answered, as the reply the Studio shows. */
function failedReply(id, message) { return { type: 'failed', id: id, message: String(message || '') }; }
function unsupportedReply(id) { return { type: 'unsupported', id: id }; }

var api = { DEFAULT_ADDRESS: DEFAULT_ADDRESS, COMMANDS: COMMANDS, normaliseCode: normaliseCode, isCode: isCode,
            helloMessage: helloMessage, statusReply: statusReply, classify: classify, baselineOf: baselineOf,
            parityDetail: parityDetail, parityReply: parityReply, namesOf: namesOf, baselineAfterApply: baselineAfterApply, failedReply: failedReply, unsupportedReply: unsupportedReply };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (global) global.PomStudioLink = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
