/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  APPLY — run a compiled program against a Figma document.

  THIS IS THE ONLY MODULE THAT WRITES, and it is the smallest one on purpose.
  Every decision was made upstream: derive() chose the projection, compile()
  refused unless it was knowable, and materialise() already pinned what each op
  MEANS by interpreting the same program with no side effects. What is left
  here is a loop with a switch in it, and there is deliberately no judgement in
  it to get wrong.

  If you find yourself wanting to add a decision to this file, it belongs in
  derive() or compile() instead. The value of the split is that the hard part
  is testable without a document open, and this part cannot quietly disagree
  with the part that was tested.

  IT TAKES `figma` AS AN ARGUMENT rather than reaching for the global, so the
  suite can drive it with a mock and assert the exact call sequence. In the
  plugin it is handed the real one.

  WHAT IT REFUSES. A target that already holds variable collections, unless the
  caller says otherwise — importing on top of existing collections silently
  produces duplicates rather than a merge, and there is no version of that
  which is what anyone wanted. And it stops at the first failure by default,
  because a program that has gone wrong halfway through is not going to go
  right in its second half.

  WHAT IT RETURNS is enough to undo itself: every collection it created, in
  creation order. Figma has no transaction, so the honest alternative to
  "rolled back" is "here is exactly what exists now".
*/

function apply(program, figma, opts) {
  opts = opts || {};
  const report = {
    applied: 0, failed: 0,
    collections: [], variables: 0, values: 0, aliases: 0,
    created: [],                 // collection names, in creation order — the undo list
    errors: [],
    dryRun: !!opts.dryRun,
  };

  if (!program || !program.ops) {
    report.errors.push({ op: null, error: 'no program' });
    return report;
  }

  const cols = new Map();        // name -> collection
  const modeIds = new Map();     // "collection␟mode" -> modeId
  const vars = new Map();        // "collection␟name" -> variable
  const K = (a, b) => a + '␟' + b;

  const fail = (op, e) => {
    report.failed++;
    report.errors.push({ op: op.op, collection: op.collection, name: op.name, mode: op.mode,
                         error: (e && e.message) || String(e) });
    return opts.stopOnError === false;   // true == keep going
  };

  for (const op of program.ops) {
    if (report.dryRun) { report.applied++; continue; }
    try {
      switch (op.op) {
        case 'createCollection': {
          const c = figma.variables.createVariableCollection(op.collection);
          /* The collection ARRIVES WITH A MODE, auto-named "Mode 1". The
             program says rename-then-add precisely so this line cannot become
             an addMode by accident — that would leave a junk mode behind and
             spend one of the plan's mode allowance. */
          c.renameMode(c.defaultModeId, op.firstMode);
          cols.set(op.collection, c);
          modeIds.set(K(op.collection, op.firstMode), c.defaultModeId);
          report.collections.push(op.collection);
          report.created.push(op.collection);
          break;
        }
        case 'addMode': {
          const c = cols.get(op.collection);
          if (!c) throw new Error('collection not created: ' + op.collection);
          modeIds.set(K(op.collection, op.mode), c.addMode(op.mode));
          break;
        }
        case 'createVariable': {
          const c = cols.get(op.collection);
          if (!c) throw new Error('collection not created: ' + op.collection);
          const v = figma.variables.createVariable(op.name, c, op.type);
          if (op.description) v.description = op.description;
          if (op.scopes && op.scopes.length) v.scopes = op.scopes;
          vars.set(K(op.collection, op.name), v);
          report.variables++;
          break;
        }
        case 'setValue': {
          const v = vars.get(K(op.collection, op.name));
          const m = modeIds.get(K(op.collection, op.mode));
          if (!v) throw new Error('variable not created: ' + op.collection + '/' + op.name);
          if (m === undefined) throw new Error('mode not created: ' + op.collection + '/' + op.mode);
          v.setValueForMode(m, op.value);
          report.values++;
          break;
        }
        case 'setAlias': {
          const v = vars.get(K(op.collection, op.name));
          const m = modeIds.get(K(op.collection, op.mode));
          const t = vars.get(K(op.target.collection, op.target.name));
          if (!v) throw new Error('variable not created: ' + op.collection + '/' + op.name);
          if (m === undefined) throw new Error('mode not created: ' + op.collection + '/' + op.mode);
          /* Cannot happen from a compiled program — compile() only emits an
             alias whose target it has already emitted a createVariable for —
             so if it does, the program was edited between the two steps. */
          if (!t) throw new Error('alias target not created: ' + op.target.collection + '/' + op.target.name);
          v.setValueForMode(m, figma.variables.createVariableAlias(t));
          report.aliases++;
          break;
        }
        default:
          throw new Error('unknown op: ' + op.op);
      }
      report.applied++;
    } catch (e) {
      if (!fail(op, e)) break;
    }
  }

  return report;
}

/*
  Everything that must be true of the DOCUMENT before a program is run. Split
  out from apply() so a caller can ask first and show the answer, rather than
  finding out halfway through.

  The mode ceiling is checked here and not only in compile() because compile is
  told the ceiling by its caller, who may be wrong about it. This reads the
  real limit by attempting it, and the attempt is made in a throwaway
  collection that is removed either way.
*/
async function preflight(program, figma, opts) {
  opts = opts || {};
  const out = { ok: true, problems: [], existingCollections: 0, modeCeiling: null };

  const existing = await figma.variables.getLocalVariableCollectionsAsync();
  out.existingCollections = existing.length;
  if (existing.length && !opts.allowExisting) {
    out.ok = false;
    out.problems.push({
      kind: 'not-empty',
      message: 'the target already holds ' + existing.length + ' variable collection(s); ' +
               'importing on top of them produces duplicates, not a merge',
    });
  }

  /* The widest collection the program wants. */
  let widest = 0, widestName = null;
  const modes = new Map();
  for (const op of program.ops) {
    if (op.op === 'createCollection') modes.set(op.collection, 1);
    else if (op.op === 'addMode') modes.set(op.collection, (modes.get(op.collection) || 1) + 1);
  }
  for (const [name, n] of modes) if (n > widest) { widest = n; widestName = name; }

  if (widest > 1 && opts.probeCeiling !== false) {
    const probe = figma.variables.createVariableCollection('__closure_preflight__');
    let reached = 1;
    try { for (let i = 1; i < widest; i++) { probe.addMode('m' + i); reached++; } }
    catch (e) { /* the ceiling, found by hitting it */ }
    probe.remove();
    out.modeCeiling = reached < widest ? reached : null;   // null == at least enough
    if (reached < widest) {
      out.ok = false;
      out.problems.push({
        kind: 'mode-ceiling',
        message: 'collection "' + widestName + '" needs ' + widest + ' modes and this file allows ' + reached,
      });
    }
  }

  return out;
}

  var api = { apply, preflight };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomImportApply = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
