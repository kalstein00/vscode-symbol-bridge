const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

function runtimeRoot() {
  switch (process.platform) {
    case "win32":
      return path.join(
        process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
        "vscode-symbol-bridge"
      );
    case "darwin":
      return path.join(process.env.TMPDIR || os.tmpdir(), "vscode-symbol-bridge");
    default:
      return path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), "vscode-symbol-bridge");
  }
}

function registryPath() {
  return path.join(runtimeRoot(), "registry.json");
}

async function readRegistry() {
  const raw = await fs.readFile(registryPath(), "utf8");
  return JSON.parse(raw);
}

async function waitFor(predicate, timeoutMs, intervalMs, message) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await predicate();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(lastError instanceof Error ? `${message}: ${lastError.message}` : message);
}

function sendRequest(endpoint, request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let buffer = "";

    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline >= 0) {
        socket.end();
        resolve(JSON.parse(buffer.slice(0, newline)));
      }
    });
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
  });
}

async function activateExtension() {
  const extension = vscode.extensions.getExtension("kalstein.vscode-symbol-bridge");
  assert.ok(extension, "Extension should be discoverable in test host");
  await extension.activate();
}

async function run() {
  await activateExtension();

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(workspaceRoot, "Workspace root should exist");

  const samplePath = path.join(workspaceRoot, "sandbox", "sample.cpp");
  const sampleUri = vscode.Uri.file(samplePath);

  await vscode.window.showTextDocument(sampleUri, { preview: false });

  const initialEntry = await waitFor(
    async () => {
      const entries = await readRegistry();
      return entries.find((entry) => Array.isArray(entry.workspaceFolders) && entry.workspaceFolders.includes(workspaceRoot));
    },
    15000,
    250,
    "Timed out waiting for registry entry"
  );

  assert.ok(initialEntry.endpoint, "Endpoint should be recorded");

  const activeFileEntry = await waitFor(
    async () => {
      const entries = await readRegistry();
      const entry = entries.find((item) => item.instanceId === initialEntry.instanceId);
      return entry && entry.activeFile === samplePath ? entry : undefined;
    },
    15000,
    250,
    "Timed out waiting for active file refresh"
  );

  assert.equal(activeFileEntry.activeFile, samplePath);

  const healthResponse = await sendRequest(activeFileEntry.endpoint, {
    id: "health-1",
    method: "health",
    params: {}
  });

  assert.equal(healthResponse.ok, true);
  assert.equal(healthResponse.result.activeFile, samplePath);
  assert.equal(healthResponse.result.singleFileMode, false);

  const malformedResponse = await sendRequest(initialEntry.endpoint, {
    id: "document-404",
    method: "documentSymbol",
    params: {
      uri: vscode.Uri.file(path.join(workspaceRoot, "sandbox", "missing.cpp")).toString()
    }
  });

  assert.equal(malformedResponse.ok, false);
  assert.equal(malformedResponse.error.code, "DOCUMENT_NOT_FOUND");

  const noProviderResponse = await sendRequest(initialEntry.endpoint, {
    id: "document-no-provider",
    method: "documentSymbol",
    params: {
      uri: sampleUri.toString()
    }
  });

  assert.equal(noProviderResponse.ok, false);
  assert.equal(noProviderResponse.error.code, "NO_PROVIDER");

  const workspaceMissingSymbolResponse = await sendRequest(initialEntry.endpoint, {
    id: "workspace-missing-symbol",
    method: "workspaceSymbol",
    params: {
      query: "__symbol_that_should_not_exist__"
    }
  });

  assert.equal(workspaceMissingSymbolResponse.ok, false);
  assert.ok(
    ["NO_PROVIDER", "SYMBOL_NOT_FOUND"].includes(workspaceMissingSymbolResponse.error.code),
    "Workspace symbol should distinguish provider absence from symbol absence"
  );

  assert.ok(
    Array.isArray(activeFileEntry.workspaceFolders) && activeFileEntry.workspaceFolders.includes(workspaceRoot),
    "Registry should include the current workspace root"
  );
}

module.exports = {
  run
};
