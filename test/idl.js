/* eslint-env node, mocha */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');
const {parseIdl} = require('reffy');

const {mockFetch} = require("./helper");

// Helper to check results from the surface calculation
const checkResults = (surface, expected) => {
  expected = Object.assign({}, { interfaces: [], dictionaries: [], enums: [], total: 0}, expected);
  assert.deepEqual(Object.values(surface.interfaces), expected.interfaces);
  assert.deepEqual(Object.values(surface.dictionaries), expected.dictionaries);
  assert.deepEqual(Object.values(surface.enums), expected.enums);
  assert.equal(surface.total, expected.total);
};

describe('idl', () => {
  describe('calculateSurface', () => {
    it('calculates surface of a simple interface', async () => {
      const idlDecl = `
interface SimpleInterface { // 1 for the interface
  attribute DOMString attr;  // 1 for the attribute
  undefined show(DOMString name); // 1 for the operation + 1 for its single argument
};`;
      const idl = proxyquire('../lib/idl.js', {
        'node-fetch': mockFetch({idlparsed: await parseIdl(idlDecl)})
      });
      const surface = await idl.calculateSurface("simple-interface");
      checkResults(surface, {interfaces: [4], total: 4});
    });

    it('calculates surface of a simple dictionary', async () => {
      const idlDecl = `
dictionary SimpleDict { // 0 for the dictionary (name not exposed)
  DOMString field;  // 1 for the field
};`;
      const idl = proxyquire('../lib/idl.js', {
        'node-fetch': mockFetch({idlparsed: await parseIdl(idlDecl)})
      });
      const surface = await idl.calculateSurface("simple-dict");
      checkResults(surface, {dictionaries: [1], total: 1});
    });

    it('calculates surface of a simple enum', async () => {
      const idlDecl = `
enum SimpleEnum { // 0 for the enum (name not exposed)
  "one",  // 1 for each value
  "two"
};`;
      const idl = proxyquire('../lib/idl.js', {
        'node-fetch': mockFetch({idlparsed: await parseIdl(idlDecl)})
      });
      const surface = await idl.calculateSurface("simple-enum");
      checkResults(surface, {enums: [2], total: 2});
    });

    it('calculates surface of an interface with inheritance', async () => {
      const idlDecl = `
interface Parent { // 1 for the interface
  attribute DOMString name; // 1 for the attribute
};
interface Child : Parent { // 1 for the interface
  attribute DOMString age; // 1 for the attribute
};`;
      const idl = proxyquire('../lib/idl.js', {
        'node-fetch': mockFetch({idlparsed: await parseIdl(idlDecl)})
      });
      const surface = await idl.calculateSurface("inherited-interface");
      checkResults(surface, {interfaces: [2, 2], total: 4});
    });

    it('calculates surface of a partial interface', async () => {
      const idlDecl = `
interface Parent { // 1 for the interface
  attribute DOMString name; // 1 for the attribute
};
partial interface Parent { // 0, not a new name
  attribute DOMString age; // 1 for the attribute
};`;
      const idl = proxyquire('../lib/idl.js', {
        'node-fetch': mockFetch({idlparsed: await parseIdl(idlDecl)})
      });
      const surface = await idl.calculateSurface("partial-interface");
      checkResults(surface, {interfaces: [3], total: 3});
    });

    it('calculates surface of an interface with a locally defined mixin', async () => {
      const idlDecl = `
interface mixin HasName { // 0, not an exposed name
  attribute DOMString name; // 1 for the attribute
};
interface Parent { // 1 for the interface
  attribute DOMString age; // 1 for the attribute
};
Parent includes HasName;
`;
      const idl = proxyquire('../lib/idl.js', {
        'node-fetch': mockFetch({idlparsed: await parseIdl(idlDecl)})
      });
      const surface = await idl.calculateSurface("local-mixin");
      checkResults(surface, {interfaces: [3], total: 3});
    });

    it('calculates surface of an interface with a locally unknown mixin', async () => {
      const idlDecl = `
interface Parent { // 1 for the interface
  attribute DOMString age; // 1 for the attribute
};
Parent includes HasName;
`;
      const idl = proxyquire('../lib/idl.js', {
        'node-fetch': mockFetch({idlparsed: await parseIdl(idlDecl)})
      });
      const surface = await idl.calculateSurface("unknown-mixin");
      checkResults(surface, {interfaces: [2], total: 2});
    });

  });
});
