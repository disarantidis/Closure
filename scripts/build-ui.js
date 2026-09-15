#!/usr/bin/env node
//
// build-ui.js — regenerate the production ui.html from src/ui.template.html
// by bundling src/ui-react/buttons.tsx (esbuild) and inlining the result.
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

  const template = fs.readFileSync(path.join(ROOT, 'src/ui.template.html'), 'utf8');
  const html = template
    .replace('__RADD_BUTTONS_STYLE__', () => style)
    .replace('__RADD_BUTTONS_SCRIPT__', () => script)
    .replace('__RADD_DTCG_SCRIPT__', () => dtcg);

  const outFile = path.join(ROOT, 'ui.html');
  fs.writeFileSync(outFile, html);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`Built ${path.relative(ROOT, outFile)} from src/ui.template.html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
