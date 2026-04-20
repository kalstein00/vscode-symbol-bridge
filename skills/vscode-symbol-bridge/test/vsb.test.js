const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  CliError,
  buildRequest,
  formatPathWithPosition,
  initLogger,
  logsDir,
  maxLogFiles,
  parseFirstJsonDocument,
  parseJsonDocuments,
  parseArgs,
  pruneOldLogs,
  selectEntry
} = require("../lib/vsb.js");

test("parseArgs separates command, flags, and positional arguments", () => {
  assert.deepEqual(parseArgs(["definition", "--file", "a.cpp", "--json", "extra"]), {
    command: "definition",
    flags: {
      file: "a.cpp",
      json: "extra"
    },
    positional: []
  });
});

test("selectEntry prefers active file match", () => {
  const file = path.join(process.cwd(), "sandbox/sample.cpp");
  const entry = selectEntry(
    [
      {
        instanceId: "one",
        pid: process.pid,
        workspaceFolders: [process.cwd()],
        activeFile: file
      },
      {
        instanceId: "two",
        pid: process.pid,
        workspaceFolders: [process.cwd()]
      }
    ],
    { file: "sandbox/sample.cpp" }
  );

  assert.equal(entry.instanceId, "one");
});

test("selectEntry reports missing explicit workspace clearly", () => {
  assert.throws(
    () =>
      selectEntry(
        [
          {
            instanceId: "one",
            pid: process.pid,
            workspaceFolders: [path.join(process.cwd(), "workspace-a")]
          }
        ],
        { workspace: "workspace-b" }
      ),
    (error) => error instanceof CliError && error.code === "WORKSPACE_NOT_FOUND"
  );
});

test("buildRequest resolves definition params", () => {
  const request = buildRequest("definition", { file: "sandbox/sample.cpp", line: "4", character: "7" }, []);
  assert.equal(request.method, "definition");
  assert.equal(request.params.line, 4);
  assert.equal(request.params.character, 7);
  assert.match(request.params.uri, /^file:/);
});

test("formatPathWithPosition converts file uri to path line and column", () => {
  const output = formatPathWithPosition("file:///tmp/example.cpp", {
    start: { line: 9, character: 1 }
  });
  assert.equal(output, `${path.sep}tmp${path.sep}example.cpp:10:2`);
});

test("parseJsonDocuments accepts concatenated JSON arrays", () => {
  const parsed = parseJsonDocuments('[{"a":1}][{"b":2}]');
  assert.deepEqual(parsed, [[{ a: 1 }], [{ b: 2 }]]);
});

test("parseFirstJsonDocument ignores trailing non-json junk", () => {
  const parsed = parseFirstJsonDocument('{"ok":true}garbage-after');
  assert.deepEqual(parsed, { ok: true });
});

test("initLogger writes logs under the skill folder and prunes old files", () => {
  const created = [];
  for (let index = 0; index < maxLogFiles + 2; index += 1) {
    created.push(initLogger([`cmd-${index}`]));
  }

  pruneOldLogs();

  const files = require("node:fs").readdirSync(logsDir)
    .filter((name) => name.startsWith("vsb-") && name.endsWith(".log"))
    .sort();

  assert.ok(created.every((filePath) => filePath.startsWith(logsDir)));
  assert.ok(files.length <= maxLogFiles);
});

test("bin/vsb executes main and reports missing endpoint", () => {
  const skillRoot = path.resolve(__dirname, "..");
  const result = spawnSync("node", [path.join(skillRoot, "bin/vsb"), "health"], {
    cwd: skillRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: path.join(skillRoot, ".tmp", "missing-runtime")
    }
  });

  assert.equal(result.status, 3);
  assert.match(result.stderr, /Bridge error: ENDPOINT_UNAVAILABLE/);
});
