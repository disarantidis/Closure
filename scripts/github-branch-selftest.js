// Self-test for src/github-branch.js — name rules and the branch-making steps, against a mock GitHub.
const B = require('../src/github-branch.js');
let pass = 0, failN = 0;
function ok(c, m) { if (c) pass++; else { failN++; console.log('FAIL', m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }

// names
['tokens/a-2026-11-12', 'feature/x', 'a.b', 'v1'].forEach(n => eq(B.validBranchName(n), null, 'valid ' + n));
['', 'a b', 'a..b', '/a', 'a/', 'a//b', '-a', 'a.', 'a.lock', 'x/.y', 'a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', 'a@{b', '@'].forEach(n =>
  ok(B.validBranchName(n) !== null, 'invalid ' + JSON.stringify(n)));
eq(B.suggestBranchName('tokens_resolved.json', new Date(2026, 10, 12)), 'tokens/tokens_resolved-2026-11-12', 'suggest');
eq(B.suggestBranchName('', new Date(2026, 0, 5)), 'tokens/tokens-2026-01-05', 'suggest empty');
ok(B.validBranchName(B.suggestBranchName('Explorer 1.tokens (2).json')) === null, 'suggestion always valid');

// mock GitHub
function mock(opts) {
  const o = Object.assign({ refs: { main: 'sha-main' }, def: 'main', createStatus: 201, empty: false }, opts);
  const calls = [];
  const f = (url, init) => {
    init = init || {};
    const m = init.method || 'GET';
    calls.push(m + ' ' + url.replace('https://api.github.com/repos/o/r', ''));
    const res = (status, body) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
    let mm;
    if ((mm = /\/git\/ref\/heads\/(.+)$/.exec(url))) {
      const n = decodeURIComponent(mm[1]).replace(/%2F/g, '/');
      if (o.empty) return res(409, { message: 'Git Repository is empty.' });
      return o.refs[n] ? res(200, { object: { sha: o.refs[n] } }) : res(404, { message: 'Not Found' });
    }
    if (/\/git\/refs$/.test(url) && m === 'POST') {
      const b = JSON.parse(init.body);
      calls.push('  body ' + b.ref + ' ' + b.sha);
      if (o.createStatus !== 201) return res(o.createStatus, { message: o.createMessage || 'x' });
      o.refs[b.ref.replace('refs/heads/', '')] = b.sha;
      return res(201, {});
    }
    if (/\/repos\/o\/r$/.test(url)) return res(200, { default_branch: o.def });
    return res(500, {});
  };
  return { f, calls, o };
}
const H = { Authorization: 'token t' };
const run = (mk, name, extra) => B.ensureBranch(Object.assign({ fetch: mk.f, owner: 'o', repo: 'r', headers: H }, extra || {}), name);

(async () => {
  let m = mock();
  let r = await run(m, 'tokens/x');
  eq([r.name, r.created, r.base], ['tokens/x', true, 'main'], 'creates from default branch');
  ok(m.calls.includes('  body refs/heads/tokens/x sha-main'), 'create body carries base sha');

  m = mock({ def: 'develop', refs: { develop: 'sha-dev' } });
  r = await run(m, 'a');
  eq([r.base, m.o.refs.a], ['develop', 'sha-dev'], 'uses the repo default branch, not main');

  m = mock({ refs: { main: 's', t: 'x', 't-2': 'y' } });
  r = await run(m, 't');
  eq(r.name, 't-3', 'taken name gets next free suffix');

  m = mock({ refs: { main: 's', work: 'w' } });
  r = await run(m, 'work', { reuseExisting: true });
  eq([r.name, r.created], ['work', false], 'reuseExisting: an existing branch is written to, not remade');
  ok(!m.calls.some(c => /^POST/.test(c)), 'reuseExisting: nothing is created for an existing branch');
  m = mock({ refs: { main: 's' } });
  r = await run(m, 'fresh', { reuseExisting: true });
  eq([r.name, r.created], ['fresh', true], 'reuseExisting: a missing branch is made under its own name');

  m = mock({ refs: { main: 's' } });
  r = await run(m, 'b', { baseBranch: 'main' });
  ok(!m.calls.some(c => /\/repos\/o\/r$/.test(c.split(' ')[1] || '')), 'explicit base skips the repo lookup');

  // race: ref appears between check and create
  m = mock({ refs: { main: 's' }, createStatus: 422, createMessage: 'Reference already exists' });
  let e = null; try { await run(m, 'race'); } catch (x) { e = x; }
  ok(e && e.message, 'race exhausts after retries and reports');

  m = mock({ createStatus: 403 });
  e = null; try { await run(m, 'n'); } catch (x) { e = x; }
  ok(e && e.status === 403 && /Contents/.test(e.message), '403 explains the token permission');

  m = mock({ refs: {} });
  e = null; try { await run(m, 'n'); } catch (x) { e = x; }
  ok(e && /no commit to branch from/.test(e.message), 'missing base branch is reported');

  m = mock({ empty: true });
  e = null; try { await run(m, 'n'); } catch (x) { e = x; }
  ok(e, 'empty repository is refused');

  e = null; try { await run(mock(), 'bad name'); } catch (x) { e = x; }
  ok(e && /spaces/.test(e.message), 'invalid name rejected before any request');

  console.log((failN ? failN + ' FAILED, ' : '') + pass + ' passed');
  process.exit(failN ? 1 : 0);
})();
