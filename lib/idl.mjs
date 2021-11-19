import fetch from "node-fetch";

const sum = (a, b) => a + b;

// For operations, we count 1 for each argument + 1 for the operation itself
// for other members, we count 1
const idlInterfaceMemberSurface = m => m.type === "operation" ?  1 + m.arguments.length : 1;

const idlWithType = idldata => type => Object.keys(idldata.idlNames).filter(i => idldata.idlNames[i].type === type);

export async function calculateSurface(shortname) {
  let idlData;
  try {
    idlData = (await fetch(`https://w3c.github.io/webref/ed/idlparsed/${shortname}.json`).then(r => r.json())).idlparsed;
  } catch (e) {
    return false;
  }
  // Direct interfaces
  let interfaces = idlWithType(idlData)("interface")
      .reduce((acc, i) => {
        acc[i] = idlData.idlNames[i].members.map(idlInterfaceMemberSurface).reduce(sum, 0) + 1; // +1 for the interface name itself
        return acc;
      }, {});

  // Direct dictionaries
  let dictionaries = idlWithType(idlData)("dictionary")
      .reduce((acc, i) => {
        acc[i] = idlData.idlNames[i].members.length;
        return acc;
      }, {});

  // Enums
  let enums = idlWithType(idlData)("enum")
      .reduce((acc, i) => {
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

  const total = Object.values(interfaces).reduce(sum, 0) + Object.values(dictionaries).reduce(sum, 0) + Object.values(enums).reduce(sum, 0);
  return { interfaces, dictionaries, enums, total };
}
