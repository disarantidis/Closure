#!/usr/bin/env node
//
// build-ui.js — regenerate the production ui.html AND code.js from their
// sources: ui.html from src/ui.template.html with src/ui-react/buttons.tsx
// bundled in (esbuild), code.js from src/code.source.js with the shared
// modules prepended.
//
// code.js is generated for the same reason ui.html is: a Figma plugin's `main`
// must be ONE self-contained file, and the sandbox has no module loader. The
// resolved-shape export needs resolve-architecture.js and emit-resolved.js to
// run where the raw variable graph and code.js's own formatters already are —
// which is the sandbox. Prepending them beats copying 134 lines of formatters
// into the UI and keeping two versions of them in step.
//
// src/ui.template.html is now the source of truth for the plugin UI; the
// root ui.html is generated output (like dist/ from scripts/build.sh) and
// gets overwritten every run. Figma's local "import from manifest" flow
// still loads the root ui.html directly, so re-run this after any template
// or buttons.tsx edit and before testing in Figma.
//
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src/ui-react');
const TMP_DIR = path.join(ROOT, '.ui-build-tmp');

/*
  A STAMP, SO THE RUNNING BUILD CAN BE IDENTIFIED FROM THE OUTSIDE.

  Figma caches a plugin's UI, and re-importing does not always refresh it — so
  an export can come from a build several edits old while everything on disk
  looks right. That is indistinguishable from a bug in the code, and it cost
  several rounds of looking for one that was not there. Both halves of the
  plugin now say which build they are at load, and the UI shows it.
*/
function buildStamp() {
  let sha = 'nogit';
  try {
    sha = require('child_process')
      .execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch (e) { /* a checkout without git is still buildable */ }
  const t = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return sha + ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds());
}

const STAMP = buildStamp();

async function main() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(SRC, 'buttons.tsx')],
    bundle: true,
    outdir: TMP_DIR,
    format: 'iife',
    target: 'es2020',
    jsx: 'automatic',
    loader: { '.css': 'css' },
    logLevel: 'info',
  });

  const script = fs.readFileSync(path.join(TMP_DIR, 'buttons.js'), 'utf8');
  const stylePath = path.join(TMP_DIR, 'buttons.css');
  const style = fs.existsSync(stylePath) ? fs.readFileSync(stylePath, 'utf8') : '';

  // src/dtcg-format.js is plain ES5-compatible JS with no imports, so it is
  // inlined verbatim rather than bundled. Same file Node loads in
  // scripts/dtcg-preview.js, so both paths run identical conversion code.
  const dtcg = fs.readFileSync(path.join(ROOT, 'src/dtcg-format.js'), 'utf8');

  /*
    The import pipeline, inlined the same way and for the same reason: these
    are the files Node's suite and the CLI load, so the plugin cannot drift
    from what the tests cover.

    ORDER MATTERS, because each one reads its dependency's global at the
    moment its own IIFE runs — manifest before derive, derive before compile,
    verify before diff. Same constraint buildCode() has for
    resolve-architecture -> emit-resolved.

    apply() is NOT here. It is the only module that needs `figma`, so it goes
    into code.js instead (see buildCode); the UI does everything up to the
    program and the sandbox does the writing.
  */
  const IMPORT_MODULES = [
    'src/import-ir.js',
    'src/import-manifest.js',
    'src/import-derive.js',
    'src/import-compile.js',
    'src/import-verify.js',
    'src/import-diff.js',
    /* After import-diff.js, which it reads: it turns a compiled program and
       that diff into the shorter program that writes only what moved. */
    'src/import-filter.js',
    /* The component contract's three UI-side modules, in the order they depend
       on each other: the collapse, then the file it is written as, then the
       comparison of two of them. The capture that feeds all three is in
       code.js, because it is the only one that touches a node. */
    'src/component-contract.js',
    'src/component-file.js',
    'src/component-diff.js',
    /* Not part of the import pipeline at all — it is the Compare page's
       engine, and it rides in here because this is the list of modules the
       UI gets. It answers a different question from import-diff.js (document
       against document, rather than document against the live variable
       graph); see its own header. */
    'src/json-diff.js',
  ];
  const importPipeline = IMPORT_MODULES
    .map((m) => '// ===== ' + m + ' =====\n' + fs.readFileSync(path.join(ROOT, m), 'utf8'))
    .join('\n');

  const template = fs.readFileSync(path.join(ROOT, 'src/ui.template.html'), 'utf8');
  const html = template
    .replace('__Pom_BUTTONS_STYLE__', () => style)
    .replace('__Pom_BUTTONS_SCRIPT__', () => script)
    .replace('__Pom_DTCG_SCRIPT__', () => dtcg)
    .replace('__Pom_IMPORT_SCRIPT__', () => importPipeline)
    .replace(/__Pom_BUILD_STAMP__/g, () => STAMP);

  const outFile = path.join(ROOT, 'ui.html');
  fs.writeFileSync(outFile, html);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`Built ${path.relative(ROOT, outFile)} from src/ui.template.html  [${STAMP}]`);

  buildCode();
}

/*
  code.js = shared modules + src/code.source.js, concatenated.

  Order matters: emit-resolved.js reads global.PomArchitecture when its own
  IIFE runs, so resolve-architecture.js has to be evaluated first. Each module
  prefers require() when there is one and falls back to the global, so the same
  file works unchanged in Node (scripts/, the selftest) and in the sandbox,
  where there is no require at all.
*/
function buildCode() {
  const MODULES = [
    'src/resolve-architecture.js',
    'src/emit-resolved.js',
    'src/dtcg-format.js',
    'src/import-apply.js',
    /* The component capture is the other module that needs a Figma node, so it
       goes where apply() goes: into the sandbox, not the UI. Everything the
       capture produces is plain data, and every judgement made about it —
       collapse, file, diff — happens in the UI on that data. */
    'src/component-capture.js',
  ];
  const banner =
    '// ---------------------------------------------------------------------------\n' +
    '// GENERATED by scripts/build-ui.js — DO NOT EDIT.  build ' + STAMP + '\n' +
    '// Source: src/code.source.js, with these modules prepended:\n' +
    MODULES.map((m) => '//   ' + m).join('\n') + '\n' +
    '// Edit the source, then run: npm run ui:build\n' +
    '// ---------------------------------------------------------------------------\n\n';

  const parts = MODULES.map((m) => {
    const body = fs.readFileSync(path.join(ROOT, m), 'utf8');
    return '// ===== ' + m + ' =====\n' + body;
  });
  parts.push('// ===== src/code.source.js =====\n' +
    fs.readFileSync(path.join(ROOT, 'src/code.source.js'), 'utf8'));

  const outFile = path.join(ROOT, 'code.js');
  const stamp = "\nvar CLOSURE_BUILD = '" + STAMP + "';\n" +
    "console.log('[Closure] build " + STAMP + "');\n";
  fs.writeFileSync(outFile, banner + stamp + parts.join('\n\n'));
  console.log(`Built ${path.relative(ROOT, outFile)} from src/code.source.js + ${MODULES.length} modules  [${STAMP}]`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
