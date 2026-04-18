const test = require("node:test");
const assert = require("node:assert/strict");

const { detectProviderStatusFromContext } = require("../out/provider.js");

test("single-file mode is unavailable for all provider methods", () => {
  const result = detectProviderStatusFromContext(undefined, 0, []);
  assert.equal(result.status.definition, "unavailable");
  assert.equal(result.status.documentSymbol, "unavailable");
  assert.match(result.reason, /single-file mode unsupported/);
});

test("known C++ language without installed provider returns unavailable", () => {
  const result = detectProviderStatusFromContext(
    {
      languageId: "cpp",
      uri: { scheme: "file" }
    },
    1,
    []
  );

  assert.equal(result.status.workspaceSymbol, "unavailable");
  assert.match(result.reason, /No known symbol provider extension detected/);
});

test("known language with matching provider returns ready", () => {
  const result = detectProviderStatusFromContext(
    {
      languageId: "typescript",
      uri: { scheme: "file" }
    },
    1,
    [
      {
        id: "vscode.typescript-language-features",
        isActive: false,
        packageJSON: {}
      }
    ]
  );

  assert.equal(result.status.definition, "ready");
  assert.match(result.reason, /Known provider extension installed/);
});

test("generic language match without known provider remains unknown", () => {
  const result = detectProviderStatusFromContext(
    {
      languageId: "mylang",
      uri: { scheme: "file" }
    },
    1,
    [
      {
        id: "example.mylang",
        isActive: false,
        packageJSON: {
          activationEvents: ["onLanguage:mylang"]
        }
      }
    ]
  );

  assert.equal(result.status.definition, "unknown");
  assert.match(result.reason, /Generic language extension match detected/);
});

test("unsupported uri scheme returns unavailable", () => {
  const result = detectProviderStatusFromContext(
    {
      languageId: "cpp",
      uri: { scheme: "git" }
    },
    1,
    []
  );

  assert.equal(result.status.workspaceSymbol, "unavailable");
  assert.match(result.reason, /Unsupported document scheme/);
});
