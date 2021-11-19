"use strict";
import octokit from "./octokit.mjs";

async function listIssuesAndPRs({owner, repo, state="open", labels=""}) {
  const issuesAndPRs = (await octokit.issues.listForRepo({owner, repo, state, labels})).data;
  return {
    issues: issuesAndPRs.filter(i => !i.pull_request),
    prs: issuesAndPRs.filter(i => i.pull_request)
  }
}

async function listRepoChecks({owner, repo, branch}) {
  return (await octokit.checks.listForRef({owner, repo, ref: branch})).data.check_runs || [];
}

const skipLabels = labels => i => !i.labels.find(l => labels.find(ll => ll.toLowerCase() === l.name.toLowerCase()));

export default {
  listIssuesAndPRs,
  listRepoChecks,
  skipLabels
};
