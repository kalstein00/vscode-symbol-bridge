const test = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldTreatEmptyDocumentSymbolAsNotFound,
  shouldTreatEmptyDefinitionAsNotFound,
  shouldTreatEmptyWorkspaceSymbolAsNotFound
} = require("../out/result-policy.js");

test("empty definition results become SYMBOL_NOT_FOUND unless provider is unavailable", () => {
  assert.equal(shouldTreatEmptyDefinitionAsNotFound("ready"), true);
  assert.equal(shouldTreatEmptyDefinitionAsNotFound("unknown"), true);
  assert.equal(shouldTreatEmptyDefinitionAsNotFound("unavailable"), false);
});

test("workspace symbol empty results become SYMBOL_NOT_FOUND only for non-empty queries", () => {
  assert.equal(shouldTreatEmptyWorkspaceSymbolAsNotFound("Foo", "ready"), true);
  assert.equal(shouldTreatEmptyWorkspaceSymbolAsNotFound("Foo", "unknown"), true);
  assert.equal(shouldTreatEmptyWorkspaceSymbolAsNotFound("Foo", "unavailable"), false);
  assert.equal(shouldTreatEmptyWorkspaceSymbolAsNotFound("", "ready"), false);
  assert.equal(shouldTreatEmptyWorkspaceSymbolAsNotFound("   ", "ready"), false);
});

test("document symbol empty results stay as successful empty payloads", () => {
  assert.equal(shouldTreatEmptyDocumentSymbolAsNotFound(), false);
});
