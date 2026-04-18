import * as vscode from "vscode";

export type BridgeMethod =
  | "health"
  | "workspaceSymbol"
  | "definition"
  | "documentSymbol";

export type ErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_METHOD"
  | "WORKSPACE_NOT_FOUND"
  | "DOCUMENT_NOT_FOUND"
  | "NO_PROVIDER"
  | "SYMBOL_NOT_FOUND"
  | "ENDPOINT_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface BridgeRequest {
  id: string;
  method: BridgeMethod;
  params?: Record<string, unknown>;
}

export interface BridgeMeta {
  instanceId: string;
  documentDirty?: boolean;
}

export interface BridgeError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface BridgeResponse {
  id: string;
  ok: boolean;
  meta: BridgeMeta;
  result?: unknown;
  error?: BridgeError;
}

export interface RegistryEntry {
  instanceId: string;
  workspaceFolders: string[];
  endpoint: string;
  pid: number;
  startedAt: string;
  extensionVersion: string;
  capabilities: BridgeMethod[];
  activeFile?: string;
}

export interface HealthResult {
  instanceId: string;
  endpoint: string;
  workspaceFolders: string[];
  activeFile?: string;
  activeLanguageId?: string;
  capabilities: BridgeMethod[];
  singleFileMode: boolean;
  providerReason?: string;
  providerStatus: {
    workspaceSymbol: "unknown" | "ready" | "unavailable";
    definition: "unknown" | "ready" | "unavailable";
    documentSymbol: "unknown" | "ready" | "unavailable";
  };
}

export function uriToRangePayload(range: vscode.Range) {
  return {
    start: {
      line: range.start.line,
      character: range.start.character
    },
    end: {
      line: range.end.line,
      character: range.end.character
    }
  };
}

export function symbolKindToString(kind: vscode.SymbolKind): string {
  return vscode.SymbolKind[kind] ?? "Unknown";
}
