const w3c = require("node-w3capi");

const {fetchRepoValidationResults} = require("./repo");
const serialize = require("./serialize");
const {fetchJSON} = require("./utils");
const repo = require("./repo");

const {w3capikey} = require("../config.json");
w3c.apiKey = w3capikey;

// TODO: Get from browser-specs
const wptPaths = {
  "image-capture": "mediacapture-image",
  "webxr-ar-module": "webxr/ar-module",
  "mediastream-recording":  "mediacapture-record"
};

const statusOrder = ["CRD", "CR", "WD", "FPWD", "ED", "Rec", "PR"];

function onRecTrack(spec) {
  return spec.recTrack && spec.trStatus !== "Retired";
}

function byStatus(s1, s2) {
  if (statusOrder.indexOf(s1.trStatus) === statusOrder.indexOf(s2.trStatus)) {
    return s1.title.localeCompare(s2.title);
  } else {
    return statusOrder.indexOf(s1.trStatus) - statusOrder.indexOf(s2.trStatus) ;
  }
}

async function annotateSpecs(specs, groupMilestones) {
  return Promise.all(specs.map(async (spec) => {
    const milestones = groupMilestones[spec.tr || spec.editorDraft];
    spec.milestones = milestones ? Object.keys(milestones).map(m => Object.assign({}, {status: m, date: milestones[m]})) : [];
    spec.hasPrPreview = false;
    spec.editingTool = "";
    spec.defaultBranch = undefined;
    if (spec.repo) {
      const details = await repo.getMetadata(spec.repo);
      spec.defaultBranch = details.defaultBranch ? details.defaultBranch.name : undefined;
      if (details.prpreview) {
        spec.editingTool = details.prpreview.type;
        spec.hasPrPreview = true;
      }
    }
    spec.wptShortname = wptPaths[spec.wptShortname] ? wptPaths[spec.wptShortname] : spec.wptShortname;
    return spec;
  }));
}

async function listTRSpecs(gid) {
  const groupRepos = await fetchJSON(`https://w3c.github.io/spec-dashboard/pergroup/${gid}-repo.json`);

  const trSpecs = (await (new Promise((res, rej) => w3c.group(gid).specifications().fetch({embed:true}, (err, specs) => {
    if (err) return rej(err);
    return res(specs);
  })))).map(serialize.spec);
  for (let spec of trSpecs) {
    spec.latestVersion = serialize.latestVersion(await (new Promise((res, rej) => {
      w3c.specification(spec.shortname).latest().fetch((err, lv) => {
        if (err) return rej(err);
        return res(lv);
      });
    })));
    spec.recTrack = spec.latestVersion.recTrack;
    if ((groupRepos[spec.tr] && groupRepos[spec.tr].repo)) {
      spec.repo = `${groupRepos[spec.tr].repo.owner}/${groupRepos[spec.tr].repo.name}`;
    }
    spec.wptShortname = spec.seriesShortname;
  }
  return trSpecs;
}

async function listNonTRSpecs(gid, trSpecs) {
  return Promise.all((await fetchRepoValidationResults()).groups[gid].repos
    .filter(r => !trSpecs.find(s => s.repo === r.fullName))
    .map(async ({fullName: reponame}) => {
      const [owner, name] = reponame.split("/");
      const details = await repo.getMetadata(reponame);
      const spec = {
        title: details.description || reponame,
        shortname: name,
        editorDraft: details.homepageUrl || `https://${owner}.github.io/${name}/`,
        repo: reponame,
        recTrack: details.w3c && details.w3c["repo-type"] && details.w3c["repo-type"].includes("rec-track"),
        trStatus: "ED",
        wptShortname: name
      };
      let trSpec = trSpecs.find(s => s.editorDraft === spec.editorDraft);
      if (trSpec) {
        trSpec = Object.assign({}, spec, trSpec);
      } else {
        return spec;
      }
    }));
}

async function listSpecs(gid) {
  const groupMilestones = await fetchJSON(`https://w3c.github.io/spec-dashboard/pergroup/${gid}-milestones.json`);
  const trSpecs = await listTRSpecs(gid);
  const nonTRSpecs =  (await listNonTRSpecs(gid, trSpecs)).filter(x => x);
  const annotatedSpecs = await annotateSpecs(trSpecs.concat(nonTRSpecs), groupMilestones);
  return annotatedSpecs.filter(onRecTrack).sort(byStatus);
}

module.exports = {
  listSpecs
};
