const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createErrorResponse,
  createOkResponse,
  parseRequestLine,
  serializeRange
} = require("../out/bridge.js");

test("parseRequestLine returns INVALID_REQUEST for malformed json", () => {
  const response = parseRequestLine("instance-1", "{");
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INVALID_REQUEST");
  assert.equal(response.meta.instanceId, "instance-1");
});

test("parseRequestLine returns INVALID_REQUEST when id or method is missing", () => {
  const response = parseRequestLine("instance-1", JSON.stringify({ id: "req-1" }));
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INVALID_REQUEST");
  assert.match(response.error.message, /Missing id or method/);
});

test("parseRequestLine returns the parsed request for valid payloads", () => {
  const request = parseRequestLine(
    "instance-1",
    JSON.stringify({ id: "req-1", method: "health", params: { verbose: true } })
  );

  assert.deepEqual(request, {
    id: "req-1",
    method: "health",
    params: { verbose: true }
  });
});

test("serializeRange preserves line and character coordinates", () => {
  assert.deepEqual(
    serializeRange({
      start: { line: 3, character: 4 },
      end: { line: 5, character: 6 }
    }),
    {
      start: { line: 3, character: 4 },
      end: { line: 5, character: 6 }
    }
  );
});

test("response factories include instance metadata", () => {
  const ok = createOkResponse("instance-1", "req-1", { alive: true }, true);
  assert.equal(ok.ok, true);
  assert.equal(ok.meta.instanceId, "instance-1");
  assert.equal(ok.meta.documentDirty, true);

  const error = createErrorResponse("instance-1", "req-2", "NO_PROVIDER", "missing", false);
  assert.equal(error.ok, false);
  assert.equal(error.error.code, "NO_PROVIDER");
  assert.equal(error.meta.instanceId, "instance-1");
});
