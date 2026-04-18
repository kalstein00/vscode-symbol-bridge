const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  ensureRuntimeDir,
  readRegistry,
  registerEntry,
  unregisterEntry,
  writeRegistry
} = require("../out/registry.js");

test("registerEntry replaces same instance and prunes dead processes", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vsb-registry-test-"));
  process.env.XDG_RUNTIME_DIR = tempRoot;

  await writeRegistry([
    {
      instanceId: "stale",
      workspaceFolders: ["/workspace-a"],
      endpoint: "/tmp/stale.sock",
      pid: 999999,
      startedAt: "2026-01-01T00:00:00.000Z",
      extensionVersion: "0.1.0",
      capabilities: ["health"]
    },
    {
      instanceId: "live",
      workspaceFolders: ["/workspace-b"],
      endpoint: "/tmp/live.sock",
      pid: process.pid,
      startedAt: "2026-01-01T00:00:00.000Z",
      extensionVersion: "0.1.0",
      capabilities: ["health"]
    }
  ]);

  await registerEntry({
    instanceId: "live",
    workspaceFolders: ["/workspace-c"],
    endpoint: "/tmp/live-new.sock",
    pid: process.pid,
    startedAt: "2026-01-02T00:00:00.000Z",
    extensionVersion: "0.2.0",
    capabilities: ["health"],
    activeFile: "/workspace-c/main.cpp"
  });

  const entries = await readRegistry();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].instanceId, "live");
  assert.equal(entries[0].endpoint, "/tmp/live-new.sock");
  assert.equal(entries[0].activeFile, "/workspace-c/main.cpp");

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("unregisterEntry removes matching instance", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vsb-registry-test-"));
  process.env.XDG_RUNTIME_DIR = tempRoot;

  await ensureRuntimeDir();
  await writeRegistry([
    {
      instanceId: "one",
      workspaceFolders: ["/workspace-a"],
      endpoint: "/tmp/one.sock",
      pid: process.pid,
      startedAt: "2026-01-01T00:00:00.000Z",
      extensionVersion: "0.1.0",
      capabilities: ["health"]
    },
    {
      instanceId: "two",
      workspaceFolders: ["/workspace-b"],
      endpoint: "/tmp/two.sock",
      pid: process.pid,
      startedAt: "2026-01-01T00:00:00.000Z",
      extensionVersion: "0.1.0",
      capabilities: ["health"]
    }
  ]);

  await unregisterEntry("one");
  const entries = await readRegistry();
  assert.deepEqual(entries.map((entry) => entry.instanceId), ["two"]);

  await fs.rm(tempRoot, { recursive: true, force: true });
});
