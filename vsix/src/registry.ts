import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { RegistryEntry } from "./protocol";

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

export async function readRegistry(): Promise<RegistryEntry[]> {
  try {
    const raw = await fs.readFile(registryPath(), "utf8");
    const parsed = JSON.parse(raw) as RegistryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
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

export async function writeRegistry(entries: RegistryEntry[]): Promise<void> {
  await ensureRuntimeDir();
  const file = registryPath();
  const tempFile = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(entries, null, 2), { mode: 0o600 });
  await fs.rename(tempFile, file);
}

export async function registerEntry(entry: RegistryEntry): Promise<void> {
  const entries = await readRegistry();
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
  await writeRegistry(filtered);
}

export async function unregisterEntry(instanceId: string): Promise<void> {
  const entries = await readRegistry();
  const filtered = entries.filter((entry) => entry.instanceId !== instanceId);
  await writeRegistry(filtered);
}

