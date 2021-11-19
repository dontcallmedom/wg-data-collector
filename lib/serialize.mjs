import jpointer from "json-pointer";

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


const statusMap = {"Candidate Recommendation Draft": "CRD", "Candidate Recommendation": "CR", "Proposed Recommendation": "PR", "Recommendation": "Rec", "Working Draft": "WD", "First Public Working Draft": "FPWD"};

const serializeSpec = objectMap([ ["tr", "/shortlink"], "title", "shortname", ["seriesShortname", "/_links/series/href", u => u.split('/')[4] ], ["editorDraft", "/editor-draft"], ["trStatus", "/_links/latest-version/title", s => statusMap[s]] ]);
const serializeLatestVersion = objectMap([[ "href", "/uri"], "date", ["recTrack", "/rec-track"]]);

const serializeGithubIssue = objectMap([ ["href", "/html_url"], "number", "title", "labels", "created_at", "updated_at", "pull_request"]);
const serializeGithubCheck = objectMap([[ "href", "/html_url"], "conclusion", ["title", "/output/title"], ["summary", "/output/summary"]]);

export default {
  spec: serializeSpec,
  latestVersion: serializeLatestVersion,
  githubIssue: serializeGithubIssue,
  githubCheck: serializeGithubCheck,
};
