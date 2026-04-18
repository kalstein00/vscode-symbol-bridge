"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");

function runtimeRoot() {
  switch (process.platform) {
    case "win32":
      return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "vscode-symbol-bridge");
    case "darwin":
      return path.join(process.env.TMPDIR || os.tmpdir(), "vscode-symbol-bridge");
    default:
      return path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), "vscode-symbol-bridge");
  }
}

function registryPath() {
  return path.join(runtimeRoot(), "registry.json");
}

function parseArgs(argv) {
  let command;
  let rest = argv;

  if (argv[0] && !argv[0].startsWith("--")) {
    command = argv[0];
    rest = argv.slice(1);
  }

  const flags = {};
  const positional = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[index + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        index += 1;
      }
    } else {
      positional.push(token);
    }
  }

  return { command, flags, positional };
}

function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(registryPath(), "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function currentWorkingFile(flags) {
  if (typeof flags.file === "string") {
    return path.resolve(process.cwd(), flags.file);
  }
  return undefined;
}

function selectEntry(entries, flags) {
  const liveEntries = entries.filter((entry) => alive(entry.pid));
  if (liveEntries.length === 0) {
    throw new Error("No live VS Code Symbol Bridge endpoint found. Open VS Code with a workspace folder first.");
  }

  if (typeof flags.workspace === "string") {
    const explicit = path.resolve(process.cwd(), flags.workspace);
    const matches = liveEntries.filter((entry) => (entry.workspaceFolders || []).includes(explicit));
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      throw new Error(`Multiple endpoints matched explicit workspace: ${explicit}`);
    }
  }

  const file = currentWorkingFile(flags);
  if (file) {
    const byActiveFile = liveEntries.filter((entry) => entry.activeFile === file);
    if (byActiveFile.length === 1) {
      return byActiveFile[0];
    }
  }

  const cwd = process.cwd();
  const candidates = liveEntries
    .map((entry) => {
      const roots = (entry.workspaceFolders || []).filter((folder) => cwd.startsWith(folder));
      const bestRoot = roots.sort((left, right) => right.length - left.length)[0];
      return { entry, bestRoot };
    })
    .filter((item) => item.bestRoot);

  if (candidates.length > 0) {
    candidates.sort((left, right) => right.bestRoot.length - left.bestRoot.length);
    if (candidates.length === 1 || candidates[0].bestRoot.length > candidates[1].bestRoot.length) {
      return candidates[0].entry;
    }
    throw new Error("Multiple endpoints matched the current working directory. Use --workspace to disambiguate.");
  }

  if (liveEntries.length === 1) {
    return liveEntries[0];
  }

  throw new Error("Multiple endpoints available. Use --workspace to select one.");
}

function buildRequest(command, flags, positional) {
  switch (command) {
    case "health":
      return { method: "health", params: {} };
    case "workspace-symbol":
      return {
        method: "workspaceSymbol",
        params: {
          query: positional[0] || "",
          workspaceRoot: typeof flags.workspace === "string" ? path.resolve(process.cwd(), flags.workspace) : undefined,
          limit: typeof flags.limit === "string" ? Number(flags.limit) : undefined
        }
      };
    case "document-symbol": {
      const file = typeof flags.file === "string" ? flags.file : positional[0];
      if (!file) {
        throw new Error("document-symbol requires --file <path> or a positional file argument");
      }
      return {
        method: "documentSymbol",
        params: {
          uri: pathToFileURL(path.resolve(process.cwd(), file)).toString()
        }
      };
    }
    case "definition": {
      const file = typeof flags.file === "string" ? flags.file : positional[0];
      if (!file) {
        throw new Error("definition requires --file <path> or a positional file argument");
      }
      return {
        method: "definition",
        params: {
          uri: pathToFileURL(path.resolve(process.cwd(), file)).toString(),
          line: Number(flags.line || 0),
          character: Number(flags.character || 0)
        }
      };
    }
    default:
      throw new Error(`Unsupported command: ${command || "(missing)"}`);
  }
}

function sendRequest(endpoint, request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let buffer = "";

    socket.setEncoding("utf8");
    socket.once("error", (error) => reject(error));
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline >= 0) {
        socket.end();
        try {
          resolve(JSON.parse(buffer.slice(0, newline)));
        } catch (error) {
          reject(error);
        }
      }
    });
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
  });
}

function printHuman(response, command) {
  if (!response.ok) {
    console.error(`Bridge error: ${response.error.code}`);
    console.error(response.error.message);
    process.exitCode = 2;
    return;
  }

  const result = response.result || {};

  switch (command) {
    case "health":
      console.log("Bridge healthy");
      console.log(`Instance: ${result.instanceId}`);
      console.log(`Endpoint: ${result.endpoint}`);
      console.log(`Workspace count: ${(result.workspaceFolders || []).length}`);
      if (result.activeFile) {
        console.log(`Active file: ${result.activeFile}`);
      }
      if (result.activeLanguageId) {
        console.log(`Active language: ${result.activeLanguageId}`);
      }
      console.log(`Capabilities: ${(result.capabilities || []).join(", ")}`);
      console.log(`Single-file mode: ${String(result.singleFileMode)}`);
      console.log(
        `Provider status: workspaceSymbol=${result.providerStatus.workspaceSymbol}, definition=${result.providerStatus.definition}, documentSymbol=${result.providerStatus.documentSymbol}`
      );
      if (result.providerReason) {
        console.log(`Provider reason: ${result.providerReason}`);
      }
      break;
    case "workspace-symbol":
      if (!result.items || result.items.length === 0) {
        console.log("No workspace symbols found");
        return;
      }
      console.log(`Found ${result.items.length} symbol(s)`);
      for (const item of result.items) {
        console.log(`${item.kind}: ${item.name}`);
        console.log(`${item.uri}`);
      }
      break;
    case "document-symbol":
      if (!result.items || result.items.length === 0) {
        console.log("No document symbols found");
        return;
      }
      console.log("Document symbols found");
      if (response.meta && typeof response.meta.documentDirty === "boolean") {
        console.log(`Document dirty: ${String(response.meta.documentDirty)}`);
      }
      for (const item of result.items) {
        console.log(`${item.kind}: ${item.name}`);
      }
      break;
    case "definition":
      if (!result.items || result.items.length === 0) {
        console.log("Definition not found");
        return;
      }
      console.log("Definition found");
      if (response.meta && typeof response.meta.documentDirty === "boolean") {
        console.log(`Document dirty: ${String(response.meta.documentDirty)}`);
      }
      for (const item of result.items) {
        console.log(`${item.uri}`);
      }
      break;
    default:
      console.log(JSON.stringify(response, null, 2));
  }
}

async function main() {
  const { command, flags, positional } = parseArgs(process.argv.slice(2));

  if (!command || flags.help) {
    console.log("Usage: vsb <health|workspace-symbol|document-symbol|definition> [options]");
    process.exit(flags.help ? 0 : 1);
  }

  const payload = buildRequest(command, flags, positional);
  const entry = selectEntry(loadRegistry(), flags);
  const request = {
    id: crypto.randomUUID(),
    method: payload.method,
    params: payload.params
  };

  const response = await sendRequest(entry.endpoint, request);

  if (flags.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  printHuman(response, command);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
