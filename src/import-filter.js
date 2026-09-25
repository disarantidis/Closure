/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  FILTER — the same program, cut down to the ops that change something.

  WHY THIS EXISTS. apply() is already an upsert: run the whole program against
  a populated document and every name resolves to what is already there, every
  value is written, and the ones that were already right are written again with
  what they already held. The result is correct and the cost is the whole file
  — thirty-five thousand setValueForMode calls to move five hundred values, on
  an API that is neither fast nor transactional.

  diff() already knows exactly which of them move: it interprets the same
  program with no side effects and reports every value that is new or
  different, keyed `collection|variable|mode`. So the reduction is not a new
  comparison. It is a filter over ops that were already decided, driven by a
  report that was already computed, and it cannot disagree with the panel the
  person read before pressing the button — because it is the same report.

  WHAT IT KEEPS, and the order is the point:

    1. the value ops whose key diff() called added or changed;
    2. the createVariable for every variable one of those writes to, and for
       every variable a kept alias POINTS AT — apply resolves an alias through
       its own variable table, so a target that is neither already in the
       document nor created by this run is an alias into nothing;
    3. the addMode for every (collection, mode) a kept op writes in;
    4. the createCollection for every collection the above mention.

  WHAT IT DROPS is every op that would write a value the document already
  holds, the ones this scope is not allowed to write, and the scaffolding that
  exists only for those.

  WHAT IT DOES NOT DO is decide anything. A value diff() did not name is not
  examined here, an op is never rewritten, and the ops that survive keep the
  program's own order — which apply() depends on, because every createVariable
  must run before any setValue that names it.

  IT IS NOT A DELETE. Nothing in a filtered program removes anything, for the
  same reason nothing in an unfiltered one does: the document's own variables
  that this file does not mention are not mentioned here either. A filtered run
  is a smaller version of the same promise, never a different one.
*/

var __dep = (typeof require !== 'undefined')
  ? require('./import-diff.js')
  : global.PomImportDiff;
var diff = __dep.diff;

var VALUE_OPS = { setValue: 1, setAlias: 1 };

function keyOf(op) {
  return op.collection + '|' + op.name + '|' + op.mode;
}

var IS_ALIAS = /^ALIAS:/;

/*
  WHAT KIND OF WRITE EACH DIFFERENCE IS, AND WHICH OF THEM TOUCH THE CHAIN.

  A value in a mode is one of two things: a literal, or a reference to another
  variable. diff() already renders the second as `ALIAS:collection/name`, so
  every row it reports can be told apart with nothing else to hand — which
  matters, because the four combinations are four different acts and only one
  of them is what anybody means by "change the values".

    value       a literal becomes another literal. This is the colour someone
                chose being a different colour. Nothing about the shape of the
                system moves.

    bound       a literal becomes a reference. The repo points where this file
                spelled it out, so applying it JOINS a token to the chain.

    repointed   a reference becomes a different reference. The token stays
                bound and follows something else — the shape moving, on
                purpose.

    flattened   A REFERENCE BECOMES A LITERAL, and this is the one to be
                careful about. The token still resolves to the same colour
                today and has stopped following anything: change the core
                token tomorrow and this one will not move. Nothing on the page
                looks wrong, which is exactly why it has to be said out loud.

  `added` is a value with nothing before it — a variable or a mode this
  document has not got. Architecture rather than a value, and it is kept apart
  for that reason.

  THE CLASSIFICATION IS THE DIFF'S, NOT A SECOND READING OF THE DOCUMENT.
  Every row here came from the report the person was shown, which is what lets
  the count under a scope control and the writes a run makes be the same
  numbers.
*/
function classify(report) {
  var out = { value: [], bound: [], repointed: [], flattened: [], added: [] };
  ((report && report.added) || []).forEach(function (x) { out.added.push(x.key); });
  ((report && report.changed) || []).forEach(function (x) {
    var wasRef = IS_ALIAS.test(String(x.from));
    var willRef = IS_ALIAS.test(String(x.to));
    if (wasRef && willRef) out.repointed.push(x.key);
    else if (wasRef) out.flattened.push(x.key);
    else if (willRef) out.bound.push(x.key);
    else out.value.push(x.key);
  });
  return out;
}

/*
  WHICH OF THOSE A RUN IS ALLOWED TO WRITE.

    'all'      everything the file says, which is what an import has always
               meant.
    'values'   only a literal becoming another literal, in a variable this
               document already has. No collection appears, no variable
               appears, no mode appears, and nothing that is bound comes
               unbound or gets rebound. It is the smallest thing a sync can
               be, and the only one that cannot change the shape of anything.

  FLATTENING IS HELD BACK IN BOTH, unless it is asked for. A run that silently
  replaces a reference with a copy of what it resolved to leaves a file that
  looks right and has quietly stopped following its own core — and the count
  of what was held back is returned, because holding something back without
  saying so is its own kind of lie.
*/
function wantedKeys(report, opts) {
  var kinds = classify(report);
  var scope = (opts && opts.scope) || 'all';
  var take = scope === 'values'
    ? [kinds.value]
    : [kinds.value, kinds.bound, kinds.repointed, kinds.added];
  if (opts && opts.flatten) take.push(kinds.flattened);
  var wanted = Object.create(null);
  take.forEach(function (list) { list.forEach(function (k) { wanted[k] = 1; }); });
  return { wanted: wanted, kinds: kinds, scope: scope,
           heldBack: (opts && opts.flatten) ? 0 : kinds.flattened.length };
}

/*
  filter(program, report) -> { program, dropped, kept }

  `report` is what diff() returned for this program against this document. The
  caller passes it rather than this recomputing it, because the whole claim
  being made is that the run does what the panel said, and two calls to diff()
  is two chances to differ.
*/
function filter(program, report, opts) {
  var out = { ops: [] };
  var stats = { kept: 0, dropped: 0, values: 0, variables: 0, collections: 0, modes: 0 };
  if (!program || !program.ops) return { program: out, stats: stats };

  /* The keys diff() named, narrowed to the ones this scope may write. Strings,
     not objects, so an op can ask about itself without either side knowing how
     the other was built. */
  var choice = wantedKeys(report, opts);
  var wanted = choice.wanted;
  stats.scope = choice.scope;
  stats.kinds = {
    value: choice.kinds.value.length,
    bound: choice.kinds.bound.length,
    repointed: choice.kinds.repointed.length,
    flattened: choice.kinds.flattened.length,
    added: choice.kinds.added.length,
  };
  stats.heldBack = choice.heldBack;

  /* One pass to learn what is needed, one to emit in the program's own order.
     Learning and emitting in a single pass would drop a createVariable that
     comes before the setValue that justifies it — which is every one of them,
     because that ordering is exactly what compile() guarantees. */
  var needVar = Object.create(null);         // "collection|name"
  var needMode = Object.create(null);        // "collection|mode"
  var needCol = Object.create(null);         // "collection"
  var keepOp = new Array(program.ops.length);

  program.ops.forEach(function (op, i) {
    if (!VALUE_OPS[op.op]) return;
    if (!wanted[keyOf(op)]) return;
    keepOp[i] = true;
    needVar[op.collection + '|' + op.name] = 1;
    needMode[op.collection + '|' + op.mode] = 1;
    needCol[op.collection] = 1;
    if (op.op === 'setAlias' && op.target) {
      /* The target may live in a collection this run otherwise never touches,
         and it still has to exist by the time the alias is set. */
      needVar[op.target.collection + '|' + op.target.name] = 1;
      needCol[op.target.collection] = 1;
    }
  });

  program.ops.forEach(function (op, i) {
    if (keepOp[i]) return;
    if (op.op === 'createVariable' && needVar[op.collection + '|' + op.name]) {
      keepOp[i] = true;
      needCol[op.collection] = 1;
    } else if (op.op === 'addMode' && needMode[op.collection + '|' + op.mode]) {
      keepOp[i] = true;
      needCol[op.collection] = 1;
    }
  });

  program.ops.forEach(function (op, i) {
    if (keepOp[i]) return;
    /* A collection's first mode arrives with it, so createCollection is what
       carries it — a kept op writing in that mode needs this even when no
       addMode names it. */
    if (op.op === 'createCollection' && needCol[op.collection]) keepOp[i] = true;
  });

  program.ops.forEach(function (op, i) {
    if (!keepOp[i]) { stats.dropped++; return; }
    out.ops.push(op);
    stats.kept++;
    if (VALUE_OPS[op.op]) stats.values++;
    else if (op.op === 'createVariable') stats.variables++;
    else if (op.op === 'createCollection') stats.collections++;
    else if (op.op === 'addMode') stats.modes++;
  });

  /* Everything else compile() put on the program travels with it: a caller
     reads program.ok, program.questions and the rest off whichever version it
     is holding, and a filtered one that quietly lost them would be a trap. */
  Object.keys(program).forEach(function (k) {
    if (k !== 'ops' && !Object.prototype.hasOwnProperty.call(out, k)) out[k] = program[k];
  });

  return { program: out, stats: stats };
}

/*
  The whole step in one call, for a caller that has a document and a program
  and wants the short version of the program. Returns the diff too, because
  the panel and the run must be reading the same one.
*/
function reduce(program, existingRawGraph, opts) {
  var report = diff(existingRawGraph, program);
  var cut = filter(program, report, opts);
  return { program: cut.program, stats: cut.stats, report: report };
}

  /* The same question the run asks, asked by the panel that describes it.
     Exported so the two cannot drift: a section counting rows the run will not
     write is the panel disagreeing with itself in front of the person who is
     about to press the button. */
  var api = { filter, reduce, classify, wantedKeys };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomImportFilter = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
