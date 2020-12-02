const fetch=require("node-fetch");
const w3c = require("node-w3capi");
const {Octokit} = require("@octokit/rest");

const jpointer = require("json-pointer");

const {w3capikey, ghToken} = require("./config.json");

w3c.apiKey = w3capikey;
const octokit = new Octokit({auth: ghToken});

// Set to one week
let recentThreshold = new Date();
recentThreshold.setDate(recentThreshold.getDate() - 7);

// Set to one month
let stalledThreshold = new Date();
stalledThreshold.setMonth(stalledThreshold.getMonth() - 1);

const skipLabels = labels => i => !i.labels.find(l => labels.includes(l.name.toLowerCase()));
const wptIgnoreLabels = ["chromium-export", "webkit-export", "mozilla:gecko-sync"];

// WG id
const gid = process.argv[2];

// Move to browser-specs?
const specAnnotations = {
  "image-capture":   {wptShortname: "mediacapture-image"},
  "webxr-ar-module": {wptShortname: "webxr/ar-module"},
  "mediastream-recording": {wptShortname: "mediacapture-record"}
};

// WG configurations
const wgConfig = {
  47318: {
    confluence: true,
    issueIgnoreLabels: ["ready for pr", "editorial", "pr exists", "icebox"],
    ignoreRepoErrors: ["unprotectedbranchforadmin", "norequiredreview", "nocodeofconduct"]
  }
};

const results = {specifications:[], config: wgConfig[gid]};

const sum = (a, b) => a + b;

// For operations, we count 1 for each argument + 1 for the operation itself
// for other members, we count 1
const idlInterfaceMemberSurface = m => m.type === "operation" ?  1 + m.arguments.length : 1;

const objectMap = map => data => {
  const res =  {};
  for (let field of map) {
    if (typeof field === "string") {
      res[field] = data[field];
    } else if (Array.isArray(field)) {
      if (jpointer.has(data, field[1])) {
        const mapper = field[2] || (x => x);
        if (mapper(jpointer.get(data, field[1]))) {
          res[field[0]] = mapper(jpointer.get(data, field[1]));
        } else {
          res[field[0]] = jpointer.get(data, field[1]);
        }
      }
    }
  }
  return res;
};

const fetchJSON = url => fetch(url).then(r => r.json());

const statusMap = {"Candidate Recommendation Draft": "CRD", "Candidate Recommendation": "CR", "Proposed Recommendation": "PR", "Recommendation": "Rec", "Working Draft": "WD", "First Public Working Draft": "FPWD"};

const w3cDataMap = objectMap([ ["tr", "/shortlink"], "title", "shortname", ["seriesShortname", "/_links/series/href", u => u.split('/')[4] ], ["editorDraft", "/editor-draft"], ["trStatus", "/_links/latest-version/title", s => statusMap[s]] ]);
const issueMap = objectMap([ ["href", "/html_url"], "number", "title", "labels", "created_at", "updated_at", "pull_request"]);
const ciMap = objectMap([[ "href", "/html_url"], "conclusion", ["title", "/output/title"], ["summary", "/output/summary"]]);
const trMap = objectMap([[ "href", "/uri"], "date", ["recTrack", "/rec-track"]]);

const statusOrder = ["CRD", "CR", "WD", "FPWD", "ED", "Rec", "PR"];

const implementations = ["chrome", "firefox", "safari"];

const wptImplClasses = ['passes-none', 'passes-hardly', 'passes-a-few', 'passes-half', 'passes-lots', 'passes-most', 'passes-all'];

w3c.group(gid).specifications().fetch({embed:true}, async (err, specs) => {
  if (err) return console.log(err);
  const groupRepos = await fetchJSON(`https://w3c.github.io/spec-dashboard/pergroup/${gid}-repo.json`);
  const groupMilestones = await fetchJSON(`https://w3c.github.io/spec-dashboard/pergroup/${gid}-milestones.json`);
  const repoData = await fetchJSON("https://w3c.github.io/validate-repos/report.json");
  const wptRuns = (await fetchJSON(`https://wpt.fyi/api/runs?label=master&products=${implementations.join(',')}`))
        .map(r => r.id);

  results.specifications = await Promise.all(specs.map(async (spec) => {
    let ret = w3cDataMap(spec);
    ret.latestVersion = trMap(await (new Promise((res, rej) => {
      w3c.specification(spec.shortname).latest().fetch(function(err, lv) {
        if (err) return rej(err);
        res(lv);
      });
    })));
    const milestones = groupMilestones[spec.shortlink];
    ret.milestones = milestones ? Object.keys(milestones).map(m => Object.assign({}, {status: m, date: milestones[m]})) : [];
    ret.repo = (groupRepos[spec.shortlink] && groupRepos[spec.shortlink].repo) ? `${groupRepos[spec.shortlink].repo.owner}/${groupRepos[spec.shortlink].repo.name}` : '';
    const [owner, name] = ret.repo.split('/');
    const details = repoData.repos.find(r => r.name === name && r.owner.login === owner);
    ret.defaultBranch = details ? details.defaultBranch.name : undefined;
    ret.hasPrPreview = false;
    ret.editingTool = "";
    if (details && details.prpreview) {
      ret.editingTool = details.prpreview.type;
      ret.hasPrPreview = true;
    }
    ret.wptShortname = specAnnotations[ret.seriesShortname] && specAnnotations[ret.seriesShortname].wptShortname ? specAnnotations[ret.seriesShortname].wptShortname : ret.seriesShortname;
    return ret;
  }));
  // Add specs not yet in TR
  repoData.groups[gid].repos.filter(r => !results.specifications.find(s => s.repo === r.fullName)).forEach(({fullName: repo}) => {
    const [owner, name] = repo.split('/');
    const details = repoData.repos.find(r => r.name === name && r.owner.login === owner);
    if (details.w3c && !details.w3c["repo-type"].includes("rec-track")) return;
    results.specifications.push(
      {
        title: details.description || repo,
        shortname: repo.split("/")[1],
        editorDraft: details.homepageUrl || `https://${owner}.github.io/${name}/`,
        repo: repo,
        defaultBranch: details.defaultBranch.name,
        trStatus: "ED",
        milestones: [], // TODO get data from milestones if available
        hasPrPreview: !!details.prpreview,
        editingTool:  details.prpreview ? details.prpreview.type : "",
        wptShortname: repo.split("/")[1]
      });
  });
  results.specifications = await Promise.all(results.specifications.map(async (spec) => {
    // IDL surface
    let idlData;
    spec.idl = false;
    try {
      idlData = (await fetchJSON(`https://w3c.github.io/webref/ed/idlparsed/${spec.shortname}.json`)).idlparsed;
    } catch (e) {
    }
    if (idlData) {
      // Direct interfaces
      let interfaces = Object.keys(idlData.idlNames).filter(i => idlData.idlNames[i].type === "interface").reduce((acc, i) => {
        acc[i] = idlData.idlNames[i].members.map(idlInterfaceMemberSurface).reduce(sum, 0) + 1; // +1 for the interface name itself
        return acc;
      }, {});

      // Direct dictionaries
      let dictionaries = Object.keys(idlData.idlNames).filter(i => idlData.idlNames[i].type === "dictionary").reduce((acc, i) => {
        acc[i] = idlData.idlNames[i].members.length;
        return acc;
      }, {});

      // Enums
      let enums = Object.keys(idlData.idlNames).filter(i => idlData.idlNames[i].type === "enum").reduce((acc, i) => {
        acc[i] = idlData.idlNames[i].values.length;
        return acc;
      }, {});

      // Extensions
      for (let i in idlData.idlExtendedNames) {
        const extensions = idlData.idlExtendedNames[i];
        for (let extension of extensions) {
          if (extension.type === "interface") {
            if (!interfaces[i]) {
              interfaces[i] = 0;
            }
            // Add members from partial interfaces
            if (extension.partial) {
              interfaces[i] += extension.members.length;
            } else if (extension.includes
                       // we only count mixins defined in the same spec
                       && idlData.idlNames[extension.includes]) {
              interfaces[i] += idlData.idlNames[extension.includes].members.length;
            }
          } else if (extension.type === "dictionary") {
            if (!dictionaries[i]) {
              dictionaries[i] = 0;
            }
            dictionaries[i] += extension.members.length;
          }
        }
      }
      spec.idl = { interfaces, dictionaries, enums };

      spec.idl.total = Object.values(spec.idl.interfaces).reduce(sum, 0) + Object.values(spec.idl.dictionaries).reduce(sum, 0) + Object.values(spec.idl.enums).reduce(sum, 0);
    }

    // Implementations
    spec.implementationGaps = [];
    spec.implementationSummary = false;
    if (wgConfig[gid] && wgConfig[gid].confluence) {
      let implementationData = false;
      try {
        implementationData = await fetchJSON(`https://dontcallmedom.github.io/webrtc-impl-tracker/${spec.shortname}.json`);
      } catch (e) {
      }
      /* Generates an object à la
         { "RTCErrorEvent.error": ["chrome"], "RTCPeerConnection.createOffer": ["chrome", "firefox", "safari"] }
      */
      const featureImplementations = Object.keys(implementationData)
            .map(iface =>
                 Object.keys(implementationData[iface])
                 .map(member => { let ret = {}; ret[iface + "." + member] = Object.keys(implementationData[iface][member] || {}); return ret;}
                     )
                )
            .flat() // [{"RTCErrorEvent.error": ["chrome"]}, {"RTCPeerConnection.createOffer": ["chrome", "firefox", "safari"]}]
            .reduce((acc, feature) => { acc[Object.keys(feature)[0]] = Object.values(feature)[0]; return acc;} , {});
      /* Generates an array à la
         [ { "interface": "RTCErrorEvent", "missing": [{ "noimplementations": "firefox, "safari", members: ["error"], severity: "warning" }] } ]
         severity is "warning" if there are 2 missing implementations, "failure" if there are no implementation
      */
      spec.implementationGaps = Object.keys(featureImplementations)
        .filter(feature => featureImplementations[feature].length < 2)
        .map(feature => {
          return {feature, missing: implementations.filter(impl => !featureImplementations[feature].includes(impl))}; 
        }) // [ { "feature": "RTCErrorEvent.error", "missing": ["firefox", "safari"]} ]
        .reduce((acc, gap) => {
          const [iface, member] = gap.feature.split(".");
          let featureSummary = acc.find(g => g.interface == iface);
          if (!featureSummary) {
            featureSummary = {interface: iface, missing: []};
            acc.push(featureSummary);
          }
          const missingImplementations = gap.missing.join(", ");
          let missingMembers = featureSummary.missing.find(g => g.noimplementations === missingImplementations);
          if (!missingMembers) {
            missingMembers = { noimplementations: missingImplementations, members: [], severity: gap.missing.length === 2 ? "warning" : "failure" };
            featureSummary.missing.push(missingMembers);
          }
          missingMembers.members.push(member);
          return acc;
        }
                , []);
      // Generating summary
      if (implementationData) {
        // Generate { noimpl: 2, oneimpl: 12, twoimpl: 4 }
        // if 2 features have no implementation, 12 only one, 4 have two or more
        spec.implementationSummary = spec.implementationGaps.reduce((acc, ifacedata) => {
          acc.noimpl += ifacedata.missing.filter(m => m.severity === "failure").reduce((acc, b) => acc + b.members.length, 0);
          acc.oneimpl += ifacedata.missing.filter(m => m.severity === "warning").reduce((acc, b) => acc + b.members.length, 0);
          return acc;
        }, {
          noimpl: 0,
          oneimpl: 0,
          twoimpl: Object.keys(featureImplementations)
            .filter(feature => featureImplementations[feature].length >= 2).length
        });
      }
    }

    // Repo errors
    spec.repoErrors = Object.keys(repoData.errors).filter(e => (wgConfig[gid] && !wgConfig[gid].ignoreRepoErrors.includes(e)) && repoData.errors[e].find(r => r === spec.repo || r.repo === spec.repo));

    // Test results
    spec.wpt = {files: 0, assertions: 0, impl: {}};
    let wptResults = [];
    try {
      ({results: wptResults} = await fetchJSON(`https://wpt.fyi/api/search?run_ids=${wptRuns.join(",")}&q=${spec.wptShortname}/`));
    } catch (e) {
    }
    spec.wpt.files = wptResults.length;
    spec.wpt.assertions = wptResults.map(r => Math.max(...r.legacy_status.map(s => s.total))).reduce(sum, 0);
    spec.wpt.impl = wptResults.reduce((acc, res) => {
      res.legacy_status.forEach((v, i) => {
        const impl = acc[implementations[i]];
        impl.passes += v.passes;
        impl.total += v.total;
        impl.class = impl.passes === 0 ? wptImplClasses[0] : (impl.passes === impl.total ? wptImplClasses[wptImplClasses.length - 1] : wptImplClasses[Math.floor((wptImplClasses.length - 2) * impl.passes / impl.total)]);
      });
      return acc;
    }, {"chrome": {passes: 0, total: 0, class: 'passes-none'}, "firefox": {passes: 0, total: 0, class: 'passes-none'}, "safari": {passes: 0, total: 0, class: 'passes-none'}});

    // Test TODOs
    const wptIssuesAndPRs = ((await octokit.issues.listForRepo({owner: "web-platform-tests", repo: "wpt", state: "open", labels: spec.wptShortname})).data || []).map(issueMap);
    spec.wpt.issues = wptIssuesAndPRs.filter(i => !i.pull_request);
    spec.wpt.prs = wptIssuesAndPRs.filter(i => i.pull_request && skipLabels(wptIgnoreLabels)(i));
    
    // Repo-related information
    spec.issues = {recent: [], needWork: []};
    spec.prs = {stalled: [], open: []};
    if (spec.repo) {
      const [owner, name] = spec.repo.split('/');
      const issuesAndPRs = ((await octokit.issues.listForRepo({owner, repo: name, state: "open"})).data || []).map(issueMap);

      // Issues
      const issues = issuesAndPRs.filter(i => !i.pull_request);

      spec.issues.recent = issues.filter(i => i.created_at >= recentThreshold.toJSON());
      spec.issues.needWork = issues.filter(skipLabels((wgConfig[gid] || {}).issueIgnoreLabels || []));

      // Pull requests
      const prs = issuesAndPRs.filter(i => i.pull_request);
      spec.prs.open = prs;
      spec.prs.stalled = prs.filter(p => p.updated_at <= stalledThreshold.toJSON());
      // Repo status
      // CI
      spec.check_runs = [];
      if (spec.defaultBranch) {
        spec.check_runs = ((await octokit.checks.listForRef({owner, repo: name, ref: spec.defaultBranch})).data.check_runs || []).map(ciMap);
      }
      // validate-repos errors
    }


    return spec;
  }));
  results.specifications = results.specifications.filter(s => s.trStatus !== 'Retired' && (s.latestVersion ? s.latestVersion.recTrack : true)).sort((s1, s2) => {
    if (statusOrder.indexOf(s1.trStatus) === statusOrder.indexOf(s2.trStatus)) {
      return s1.title.localeCompare(s2.title);
    } else {
      return statusOrder.indexOf(s1.trStatus) - statusOrder.indexOf(s2.trStatus) ;
    }
  });
  console.log(JSON.stringify(results, null, 2));
});
