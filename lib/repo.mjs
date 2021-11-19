import github from "./github.mjs";
import serialize from "./serialize.mjs";
import {fetchJSON}  from "./utils.mjs";

let repoValidationResults;

const DEFAULT_RECENT_THRESHOLD = 7;
const DEFAULT_STALLED_THRESHOLD = 90;

async function fetchRepoValidationResults() {
  if (!repoValidationResults) {
    repoValidationResults = await fetchJSON("https://w3c.github.io/validate-repos/report.json");
  }
  return repoValidationResults;
}

async function getMetadata(repofullname) {
  const results = await fetchRepoValidationResults();
  const [owner, name] = repofullname.split('/');
  return results.repos.find(r => r.name === name && r.owner.login === owner)
}

async function getErrors(repofullname, ignoreErrors = []) {
  const errors = (await fetchRepoValidationResults()).errors;
  return Object.keys(errors)
    .filter(e => !ignoreErrors.includes(e)
            && errors[e].find(r => r === repofullname || r.repo === repofullname));
}

const defaultOptions = {
  stalledThreshold: DEFAULT_STALLED_THRESHOLD,
  recentThreshold: DEFAULT_RECENT_THRESHOLD,
  ignoreIssuesLabels: []
};

async function getTasks(repofullname, branch, options = defaultOptions) {
  options = {...defaultOptions, ...options};
  const ret = {
    issues: {
      recent: [],
      needWork: []
    },
    prs: {
      open: [],
      stalled: []
    },
    check_runs: []
  };

  const [owner, name] = repofullname.split('/');

  let recentThresholdDate = new Date();
  recentThresholdDate.setDate(recentThresholdDate.getDate() - options.recentThreshold);

  let stalledThresholdDate = new Date();
  stalledThresholdDate.setDate(stalledThresholdDate.getDate() - options.stalledThreshold);

  const {issues, prs} = await github.listIssuesAndPRs({owner, repo: name, state: "open"});

  ret.issues.recent = issues.filter(i => i.created_at >= recentThresholdDate.toJSON()).map(serialize.githubIssue);
  ret.issues.needWork = issues.filter(github.skipLabels(options.ignoreIssuesLabels)).map(serialize.githubIssue);

  ret.prs.open = prs.map(serialize.githubIssue);
  ret.prs.stalled = prs.map(serialize.githubIssue).filter(p => p.updated_at <= stalledThresholdDate.toJSON());

  // Repo status
  // CI
  ret.check_runs = (await github.listRepoChecks({owner, repo: name, branch})).map(serialize.githubCheck);
  return ret;
};

export default {
  fetchRepoValidationResults,
  getTasks,
  getMetadata,
  getErrors
};
