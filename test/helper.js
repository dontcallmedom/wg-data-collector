const octokit = require("../lib/octokit.js");
const sinon = require('sinon');
const fs = require("fs");

const mockFetch = fixture => async (url) => {
  return {
    async json () {
      return fixture;
    }
  }
};


const mockFetchJSON = fixture => async (url) => fixture;


function mocktokit(fixture) {
  octokit.hook.wrap("request", sinon.fake.resolves({data: fixture}));
  return octokit;
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(`test/fixtures/${name}.json`, 'utf-8'));
}

module.exports = {
  loadFixture,
  mocktokit,
  mockFetch,
  mockFetchJSON
}
