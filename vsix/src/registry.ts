import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";

import { RegistryEntry } from "./protocol";

export interface RegistryLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
}

function runtimeRoot(): string {
  switch (process.platform) {
    case "win32":
      return path.join(
        process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
        "vscode-symbol-bridge"
      );
    case "darwin":
      return path.join(process.env.TMPDIR ?? os.tmpdir(), "vscode-symbol-bridge");
    default:
      return path.join(process.env.XDG_RUNTIME_DIR ?? os.tmpdir(), "vscode-symbol-bridge");
  }
}

export function registryPath(): string {
  return path.join(runtimeRoot(), "registry.json");
}

export async function ensureRuntimeDir(): Promise<string> {
  const dir = runtimeRoot();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export async function readRegistry(logger?: RegistryLogger): Promise<RegistryEntry[]> {
  try {
    const file = registryPath();
    const raw = await fs.readFile(file, "utf8");
    logger?.debug(`registry.read path=${file} bytes=${Buffer.byteLength(raw, "utf8")}`);
    const parsed = JSON.parse(raw) as RegistryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      logger?.debug(`registry.missing path=${registryPath()}`);
      return [];
    }
    logger?.warn(
      `registry.error path=${registryPath()} message=${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

async function processAlive(pid: number): Promise<boolean> {
  if (pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function writeRegistry(entries: RegistryEntry[], logger?: RegistryLogger): Promise<void> {
  await ensureRuntimeDir();
  const file = registryPath();
  const tempFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const payload = JSON.stringify(entries, null, 2);
  logger?.debug(
    `registry.write path=${file} temp=${path.basename(tempFile)} entries=${entries.length} bytes=${Buffer.byteLength(payload, "utf8")}`
  );
  await fs.writeFile(tempFile, payload, { mode: 0o600 });
  await fs.rename(tempFile, file);
}

export async function registerEntry(entry: RegistryEntry, logger?: RegistryLogger): Promise<void> {
  const entries = await readRegistry(logger);
  const filtered: RegistryEntry[] = [];

  for (const existing of entries) {
    if (existing.instanceId === entry.instanceId) {
      continue;
    }

    if (await processAlive(existing.pid)) {
      filtered.push(existing);
    }
  }

  filtered.push(entry);
  logger?.info(
    `registry.register instance=${entry.instanceId} endpoint=${entry.endpoint} workspaces=${entry.workspaceFolders.length} activeFile=${entry.activeFile ?? ""}`
  );
  await writeRegistry(filtered, logger);
}

export async function unregisterEntry(instanceId: string, logger?: RegistryLogger): Promise<void> {
  const entries = await readRegistry(logger);
  const filtered = entries.filter((entry) => entry.instanceId !== instanceId);
  logger?.info(`registry.unregister instance=${instanceId} remaining=${filtered.length}`);
  await writeRegistry(filtered, logger);
}
