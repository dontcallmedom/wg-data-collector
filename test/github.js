/* eslint-env node, mocha */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');
const {loadFixture, mocktokit} = require("./helper");


describe('github', () => {
  describe('listIssuesAndPRs', () => {
    const fixture = loadFixture("repo-issues");;

    it('returns expected results', async () => {
      const github = proxyquire('../lib/github.js', {
        './octokit.js': mocktokit(fixture)
      });
      const issues = await github.listIssuesAndPRs({owner: "acme", repo: "inc"});
      assert.deepStrictEqual(issues.issues[0], fixture[0]);
      assert.deepStrictEqual(issues.prs[0], fixture[1]);
    });

  });
  describe('listRepoChecks', () => {
    it('returns expected results', async () => {
      const fixture = loadFixture("repo-checks");
      const github = proxyquire('../lib/github.js', {
        './octokit.js': mocktokit({check_runs: fixture})
      });
      const checks = await github.listRepoChecks({owner: "acme", repo: "inc", branch: "master"});
      assert.deepStrictEqual(checks, fixture);

    });
  });
  describe('skipLabels', () => {
    it('skips issues with a given label, case insensitive', () => {
      const github = require('../lib/github');
      const issues = [
        {labels: [{name: "ok"}, {name: "IgNoRe"}]},
        {labels: [{name: "good"}, {name: "IgNoReToo"}]},
        {labels: [{name: "gothrough"}]}
      ];
      assert.deepStrictEqual(issues.filter(github.skipLabels(['ignore', 'IGNORETOO'])), [{labels: [{name: "gothrough"}]}]);
    });
  });
});
