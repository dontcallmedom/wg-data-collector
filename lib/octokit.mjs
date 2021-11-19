/* eslint-env node */
/* istanbul ignore file */

"use strict";

import {throttling} from "@octokit/plugin-throttling";
import {getConfig} from "./utils.mjs";
import ok from "@octokit/rest";
const Octokit =  ok.Octokit
  .plugin(throttling);

const MAX_RETRIES = 3;
const config = getConfig();


export default new Octokit({
  auth: config.ghToken,
  throttle: {
    onRateLimit: (retryAfter, options) => {
      if (options.request.retryCount < MAX_RETRIES) {
        console.warn(`Rate limit exceeded, retrying after ${retryAfter} seconds`)
        return true;
      } else {
        console.error(`Rate limit exceeded, giving up after ${MAX_RETRIES} retries`);
        return false;
      }
    },
    onAbuseLimit: (retryAfter, options) => {
      if (options.request.retryCount < MAX_RETRIES) {
        console.warn(`Abuse detection triggered, retrying after ${retryAfter} seconds`)
        return true;
      } else {
        console.error(`Abuse detection triggered, giving up after ${MAX_RETRIES} retries`);
        return false;
      }
    }
  }
});
