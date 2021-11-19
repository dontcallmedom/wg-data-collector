const wg = require("./lib/wg");
const repo = require("./lib/repo");
const wpt = require("./lib/wpt");
const idl = require("./lib/idl");
const idlImpl = require("./lib/idl-impl");

// WG id
const gid = process.argv[2];


// WG configurations
const wgConfig = require("./group-config.json");

const results = {specifications:[], config: wgConfig[gid]};

(async function() {
  results.specifications = await wg.listSpecs(gid);
  results.specifications = await Promise.all(results.specifications.map(async (spec) => {
    // IDL surface
    spec.idl = await idl.calculateSurface(spec.shortname);

    // Implementations
    spec.implementationGaps = [];
    spec.implementationSummary = false;
    if (wgConfig[gid] && wgConfig[gid].idlImpl) {
      Object.assign(spec, await idlImpl(spec.shortname));
    }

    if (spec.wptShortname) {
      // Test results
      spec.wpt = Object.assign({}, await wpt.getCoverage(spec.wptShortname), {impl: await wpt.getTestResults(spec.wptShortname)});
    // WPT Tasks
      Object.assign(spec.wpt, await wpt.listPendingTasks(spec.wptShortname));
    }

    if (spec.repo) {
      Object.assign(spec, await repo.getTasks(spec.repo, spec.defaultBranch, wgConfig[gid]));
      spec.repoErrors = await repo.getErrors(spec.repo, wgConfig[gid] ? wgConfig[gid].ignoreRepoErrors || [] : []);
    }
    return spec;
  }));

  console.log(JSON.stringify(results, null, 2));
})();
