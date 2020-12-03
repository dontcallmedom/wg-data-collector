/* eslint-env node, mocha */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const {loadFixture, mockFetchJSON} = require("./helper");

const fvr = sinon.fake.resolves(loadFixture("validate-report"));

describe('wg', () => {
  describe('listSpecs', () => {
    it("loads specs", async () => {
      const wg = proxyquire('../lib/wg.js', {
        './utils': { fetchJSON: mockFetchJSON({}) },
        './repo': {
          fetchRepoValidationResults: fvr,
          getMetadata: async () => loadFixture("validate-report").repos[0]
        },
        'node-w3capi': {
          group(gid) {
            assert.equal(gid, 42);
            return {
              specifications() {
                return {
                  fetch(options, callback) {
                    callback(null, loadFixture('w3c-specs')._embedded.specifications);
                  }
                }
              }
            }
          },
          specification(shortname) {
            assert(["webrtc", "capture-scenarios"].includes(shortname));
            return {
              latest() {
                return {
                  fetch(callback) {
                    callback(null, {date: "2020-12-03", "rec-track": true});
                  }
                }
              }
            }
          }
        }
      });

      const trs = await wg.listSpecs(42);
      assert.equal(trs.length, 3);
      assert(fvr.calledOnce);
    });
  });
});
