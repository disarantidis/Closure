/*
  Dual-mode, like the other modules: module.exports under Node, a global in the
  plugin UI.

  A NEW BRANCH FOR A PUSH.

  Push writes to the branch saved in Settings. This is the step that lets it
  write to a branch that does not exist yet: make the branch from the
  repository's default branch, then let the ordinary push run against it.

  WHY THIS IS A STEP OF ITS OWN, NOT A SIDE EFFECT OF PUSHING. The two write
  paths treat a missing branch differently and neither is what is wanted. The
  contents path answers an error. The large-file path used to make the branch
  as a commit with NO PARENT — a branch holding this one file and none of the
  repository. Creating the branch first, from a real commit, gives both paths a
  branch that exists and makes the second behaviour unreachable (it is left for
  an empty repository, where there is no commit to branch from).

  Two ways to ask. By default the name is a NEW branch: if it is taken, the next
  free `-2`, `-3`… is made instead. With `reuseExisting` (what the Push card's
  branch picker uses, as the JSON name beside it does) a name that exists is
  simply the branch to write to, and one that does not is made.
*/
(function (global) {
  'use strict';

  /* git check-ref-format, for the part of it a person can get wrong. */
  function validBranchName(name) {
    var n = String(name == null ? '' : name);
    if (!n) return 'Enter a branch name';
    if (n.length > 200) return 'Branch name is too long';
    if (/[\s~^:?*\[\\\x00-\x1f\x7f]/.test(n)) return 'Branch name cannot contain spaces or ~ ^ : ? * [ \\';
    if (n.indexOf('..') !== -1) return 'Branch name cannot contain ".."';
    if (n.indexOf('@{') !== -1 || n === '@') return 'Branch name cannot contain "@{"';
    if (n.charAt(0) === '/' || n.charAt(n.length - 1) === '/' || n.indexOf('//') !== -1) {
      return 'Branch name cannot start or end with "/" or contain "//"';
    }
    if (n.charAt(0) === '-' ) return 'Branch name cannot start with "-"';
    if (n.charAt(n.length - 1) === '.') return 'Branch name cannot end with "."';
    var parts = n.split('/');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].charAt(0) === '.') return 'No part of a branch name can start with "."';
      if (/\.lock$/.test(parts[i])) return 'No part of a branch name can end with ".lock"';
    }
    return null;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* tokens/<file without extension>-YYYY-MM-DD */
  function suggestBranchName(filename, date) {
    var d = date || new Date();
    var stem = String(filename || 'tokens').replace(/\.json$/i, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').replace(/\.lock$/i, '') || 'tokens';
    return 'tokens/' + stem + '-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function enc(path) { return path.split('/').map(encodeURIComponent).join('/'); }

  function fail(r, what, hint) {
    return r.json().then(function (b) { return b || {}; }, function () { return {}; }).then(function (b) {
      var msg = (hint && hint[r.status]) || b.message || ('the repo answered ' + r.status);
      throw { status: r.status, message: msg, stage: what };
    });
  }

  var HINT_CREATE = {
    403: 'The token cannot create branches. It needs "Contents: Read and write" (fine-grained) or the "repo" scope (classic), and a rule on the repository may also forbid new branches.',
    404: 'GitHub cannot find the repository, or the token has no access to it.',
    409: 'The repository is empty — there is no commit to branch from. Push once to an existing branch first.',
  };

  /*
    Make `name` exist. Resolves { name, created, base } — `name` may carry a
    suffix, so the caller must push to what comes back, not to what it asked.

    cfg: { fetch, owner, repo, headers, baseBranch? }
  */
  function ensureBranch(cfg, name) {
    var f = cfg.fetch;
    var api = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
    var bad = validBranchName(name);
    if (bad) return Promise.reject({ message: bad });

    function refExists(n) {
      return f(api + '/git/ref/heads/' + enc(n), { method: 'GET', headers: cfg.headers }).then(function (r) {
        if (r.status === 404) return false;
        if (r.ok) return true;
        return fail(r, 'ref', r.status === 403 ? HINT_CREATE[403] : null);
      });
    }

    function freeName(n, i) {
      var candidate = i === 1 ? n : n + '-' + i;
      if (i > 9) return Promise.reject({ message: 'Branch names ' + n + ' to ' + n + '-9 are all taken' });
      return refExists(candidate).then(function (taken) { return taken ? freeName(n, i + 1) : candidate; });
    }

    function baseName() {
      if (cfg.baseBranch) return Promise.resolve(cfg.baseBranch);
      return f(api, { method: 'GET', headers: cfg.headers }).then(function (r) {
        if (!r.ok) return fail(r, 'repo', HINT_CREATE);
        return r.json();
      }).then(function (repo) { return repo.default_branch || 'main'; });
    }

    function make(candidate, base, tries) {
      return f(api + '/git/ref/heads/' + enc(base), { method: 'GET', headers: cfg.headers }).then(function (r) {
        if (r.status === 404 || r.status === 409) {
          throw { status: r.status, message: 'The base branch "' + base + '" has no commit to branch from' };
        }
        if (!r.ok) return fail(r, 'base', HINT_CREATE);
        return r.json();
      }).then(function (ref) {
        return f(api + '/git/refs', { method: 'POST', headers: cfg.headers,
          body: JSON.stringify({ ref: 'refs/heads/' + candidate, sha: ref.object.sha }) });
      }).then(function (r) {
        if (r.ok) return { name: candidate, created: true, base: base };
        /* Taken between the check and the create. Same rule as before: next name. */
        if (r.status === 422 && tries < 9) {
          return r.json().then(function (b) { return b || {}; }, function () { return {}; }).then(function (b) {
            if (!/already exists/i.test(b.message || '')) throw { status: 422, message: b.message || 'GitHub refused the branch name' };
            var stem = candidate.replace(/-\d+$/, '');
            var m = /-(\d+)$/.exec(candidate);
            return make(stem + '-' + (m ? Number(m[1]) + 1 : 2), base, tries + 1);
          });
        }
        return fail(r, 'create', HINT_CREATE);
      });
    }

    /* The picker also names branches that exist: then it is not a branch to
       make but one to write to, and nothing is created. */
    if (cfg.reuseExisting) {
      return refExists(name).then(function (taken) {
        if (taken) return { name: name, created: false, base: null };
        return baseName().then(function (base) { return make(name, base, 0); });
      });
    }
    return Promise.all([freeName(name, 1), baseName()]).then(function (v) { return make(v[0], v[1], 0); });
  }

  var api = { validBranchName: validBranchName, suggestBranchName: suggestBranchName, ensureBranch: ensureBranch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomGithubBranch = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
