import fetch from "node-fetch";
import fs from "fs";

export const
  fetchJSON = async (u) => fetch(u).then(r => r.json()),
  implementations = ["chrome", "firefox", "safari"],
  getConfig = function () {
    return JSON.parse(fs.readFileSync("./config.json", "utf-8"));
  };
