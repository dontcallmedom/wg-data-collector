const github = require("./github");
const serialize = require("./serialize");
const {fetchJSON, implementations} = require("./utils");

const wptIgnoreLabels = ["chromium-export", "webkit-export", "mozilla:gecko-sync"];

const wptImplClasses = ['passes-none', 'passes-hardly', 'passes-a-few', 'passes-half', 'passes-lots', 'passes-most', 'passes-all'];

let wptResults = {};
let wptRuns;

const sum = (a,b) => a+b;

async function listPendingTasks(label) {
  const {issues, prs} = (await github.listIssuesAndPRs({owner: "web-platform-tests", repo: "wpt", state: "open", labels: label}));
  return {issues: issues.map(serialize.githubIssue), prs: prs.filter(github.skipLabels(wptIgnoreLabels)).map(serialize.githubIssue)};
}

async function fetchResults(path) {
  if (wptResults[path]) return wptResults[path];
  try {
    if (!wptRuns) {
      wptRuns = (await fetchJSON(`https://wpt.fyi/api/runs?label=master&products=${implementations.join(',')}`))
        .map(r => r.id);
    }
    wptResults[path] = (await fetchJSON(`https://wpt.fyi/api/search?run_ids=${wptRuns.join(",")}&q=${path}/`)).results;
  } catch (e) {
    wptResults[path]= [];
  }
  return wptResults[path];
}

async function getCoverage(path, /* TODO add recursive flag */) {
  const results = await fetchResults(path);
  return {
    files: results.length,
    assertions: results.map(r => Math.max(...r.legacy_status.map(s => s.total))).reduce(sum, 0)
  };
}

async function getTestResults(path) {
  const results = await fetchResults(path);
  let init = {};
  for (let impl of implementations) {
    init[impl] = {passes: 0, total: 0, class: wptImplClasses[0]};
  }
  return results.reduce((acc, res) => {
    res.legacy_status.forEach((v, i) => {
      const impl = acc[implementations[i]];
      impl.passes += v.passes;
      impl.total += v.total;
      impl.class = impl.passes === 0 ? wptImplClasses[0] : (impl.passes === impl.total ? wptImplClasses[wptImplClasses.length - 1] : wptImplClasses[Math.floor((wptImplClasses.length - 2) * impl.passes / impl.total)]);
    });
    return acc;
  }, init);
}

module.exports = {
  listPendingTasks,
  getCoverage,
  getTestResults
};
