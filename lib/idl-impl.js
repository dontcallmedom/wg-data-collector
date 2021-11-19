const {fetchJSON, implementations} = require("./utils");

module.exports = async function getIdlImplData(shortname) {
  let implementationData;
  try {
    const data = await fetchJSON(`https://dontcallmedom.github.io/webrtc-impl-tracker/${shortname}.json`);
    if (data.error) {
      throw (error);
    }
    implementationData = data.results;
  } catch (e) {
    return {implementationGaps: [], implementationSummary: false};
  }
  /* Generates an object à la
         { "RTCErrorEvent.error": ["chrome"], "RTCPeerConnection.createOffer": ["chrome", "firefox", "safari"] }
      */
  const featureImplementations = Object.keys(implementationData)
        .map(iface =>
             Object.keys(implementationData[iface])
             .map(member => { let ret = {}; ret[iface + "." + member] = Object.keys(implementationData[iface][member] || {}).filter(b => implementationData[iface][member][b] === "PASS"); return ret;}
                 )
            )
        .flat() // [{"RTCErrorEvent.error": ["chrome"]}, {"RTCPeerConnection.createOffer": ["chrome", "firefox", "safari"]}]
        .reduce((acc, feature) => { acc[Object.keys(feature)[0]] = Object.values(feature)[0]; return acc;} , {});
  /* Generates an array à la
     [ { "interface": "RTCErrorEvent", "missing": [{ "noimplementations": "firefox, "safari", members: ["error"], severity: "warning" }] } ]
     severity is "warning" if there are 2 missing implementations, "failure" if there are no implementation
  */

  const implementationGaps = Object.keys(featureImplementations)
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
  // Generate { noimpl: 2, oneimpl: 12, twoimpl: 4 }
  // if 2 features have no implementation, 12 only one, 4 have two or more
  const implementationSummary = implementationGaps.reduce((acc, ifacedata) => {
    acc.noimpl += ifacedata.missing.filter(m => m.severity === "failure").reduce((acc, b) => acc + b.members.length, 0);
    acc.oneimpl += ifacedata.missing.filter(m => m.severity === "warning").reduce((acc, b) => acc + b.members.length, 0);
    return acc;
  }, {
    noimpl: 0,
    oneimpl: 0,
    twoimpl: Object.keys(featureImplementations)
      .filter(feature => featureImplementations[feature].length >= 2).length
  });
  return {implementationGaps, implementationSummary};
};
