/* node scripts/architecture-ods-selftest.js
   The routing rules against cells read from the live "ODS Test Foundations" (2026-11-13).
   The full 18,010-cell comparison was run inside Figma; these are the cells that pinned the rules down. */
const A = require('../src/architecture-ods.js');
let failed = 0;
const eq = (name, got, want) => {
  const g = got && got.error ? 'ERROR' : got && got.collection + '::' + got.name;
  if (g !== want) { failed++; console.log('FAIL ' + name + '\n   got  ' + g + '\n   want ' + want); } else console.log('ok   ' + name);
};
const B = '/basic/background', E = '/elevation/level-1/colour';
const card = (e, a, m, P) => A.route('.card', 'card/' + e + '/' + a + P, m);

/* .card, basic/background — the live table */
eq('normal white, not-a-card', card('normal', 'white', 'not-a-card', B), '.white::white' + B);
eq('normal white, neutral-card', card('normal', 'white', 'neutral-card', B), '.white::white-subtle' + B);
eq('normal white, magenta-card', card('normal', 'white', 'magenta-card', B), '.magenta-light::magenta-light' + B);
eq('normal white, secondary-card', card('normal', 'white', 'secondary-card', B), '.secondary::secondary-light' + B);
eq('normal white, secondary-card-subtle', card('normal', 'white', 'secondary-card-subtle', B), '.secondary::secondary-light-subtle' + B);
eq('normal black, magenta-card', card('normal', 'black', 'magenta-card', B), '.magenta-dark::magenta-dark' + B);
eq('normal magenta-light, neutral-card', card('normal', 'magenta-light', 'neutral-card', B), '.white::white' + B);
eq('normal magenta-light, magenta-card is the error colour', card('normal', 'magenta-light', 'magenta-card', B), 'ERROR');
eq('normal secondary-light, secondary-card', card('normal', 'secondary-light', 'secondary-card', B), '.secondary::secondary-light-subtle' + B);
eq('subtle white, neutral-card', card('subtle', 'white', 'neutral-card', B), '.white::white' + B);
eq('subtle secondary-dark, secondary-card', card('subtle', 'secondary-dark', 'secondary-card', B), '.secondary::secondary-dark' + B);
eq('subtle magenta-dark, not-a-card', card('subtle', 'magenta-dark', 'not-a-card', B), '.magenta-dark::magenta-dark-subtle' + B);

/* .card, elevation — never the error colour */
eq('elev normal magenta-light, magenta-card', card('normal', 'magenta-light', 'magenta-card', E), '.magenta-light::magenta-light-subtle' + E);
eq('elev normal magenta-light, secondary-card', card('normal', 'magenta-light', 'secondary-card', E), '.magenta-light::magenta-light' + E);
eq('elev subtle magenta-light, secondary-card', card('subtle', 'magenta-light', 'secondary-card', E), '.magenta-light::magenta-light-subtle' + E);
eq('elev normal secondary-light, magenta-card', card('normal', 'secondary-light', 'magenta-card', E), '.secondary::secondary-light' + E);
eq('elev subtle secondary-dark, magenta-card', card('subtle', 'secondary-dark', 'magenta-card', E), '.secondary::secondary-dark' + E);

/* the layers above .card */
eq('.section normal', A.route('.section', 'section/white' + B, 'normal'), '.card::card/normal/white' + B);
eq('.section subtle', A.route('.section', 'section/white' + B, 'subtle'), '.card::card/subtle/white' + B);
eq('.mode neutral light', A.route('.mode', 'mode/neutral' + B, 'light'), '.section::section/white' + B);
eq('.mode inverted light', A.route('.mode', 'mode/inverted' + B, 'light'), '.section::section/black' + B);
eq('.mode secondary dark', A.route('.mode', 'mode/secondary' + B, 'dark'), '.section::section/secondary-dark' + B);
eq('_restricted white is not restricted', A.route('_restricted', 'restrictions/white' + B, 'to-neutral'), '.section::section/white' + B);
eq('_restricted magenta to-neutral is the error colour', A.route('_restricted', 'restrictions/magenta' + B, 'to-neutral'), 'ERROR');
eq('_restricted magenta kept', A.route('_restricted', 'restrictions/magenta' + B, 'to-neutral-and-magenta'), '.mode::mode/magenta' + B);
eq('_restricted secondary kept', A.route('_restricted', 'restrictions/secondary' + B, 'unrestricted'), '.mode::mode/secondary' + B);
eq('.scheme colour', A.route('.scheme', 'scheme' + B, 'magenta'), '_restricted::restrictions/magenta' + B);
eq('.scheme elevation neutral', A.route('.scheme', 'scheme' + E, 'neutral'), '.mode::mode/neutral' + E);
eq('.scheme elevation white skips everything', A.route('.scheme', 'scheme' + E, 'white'), '.white::white' + E);
if (A.route('.white', 'white' + B, '.white') !== undefined) { failed++; console.log('FAIL a palette holds values, not routes'); } else console.log('ok   a palette holds values, not routes');

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
