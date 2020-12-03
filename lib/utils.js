const fetch = require("node-fetch");

module.exports = {
  fetchJSON: async (u) => fetch(u).then(r => r.json()),
  implementations: ["chrome", "firefox", "safari"]
}
