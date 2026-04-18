import * as vscode from "vscode";
import * as net from "node:net";
import * as path from "node:path";
import { promises as fs } from "node:fs";

import {
  BridgeMethod,
  BridgeRequest,
  BridgeResponse,
  ErrorCode,
  HealthResult,
  RegistryEntry,
  symbolKindToString,
  uriToRangePayload
} from "./protocol";
import { createErrorResponse, createOkResponse, parseRequestLine } from "./bridge";
import { detectProviderStatusFromVsCode } from "./provider";
import { ensureRuntimeDir, registerEntry, unregisterEntry } from "./registry";
import {
  shouldTreatEmptyDefinitionAsNotFound,
  shouldTreatEmptyWorkspaceSymbolAsNotFound
} from "./result-policy";

interface BridgeServerOptions {
  context: vscode.ExtensionContext;
  instanceId: string;
  output: vscode.OutputChannel;
}

const CAPABILITIES: BridgeMethod[] = [
  "health",
  "workspaceSymbol",
  "definition",
  "documentSymbol"
];

export class BridgeServer implements vscode.Disposable {
  private readonly context: vscode.ExtensionContext;
  private readonly instanceId: string;
  private readonly output: vscode.OutputChannel;
  private server?: net.Server;
  private endpoint?: string;
  private startedAt?: string;

  constructor(options: BridgeServerOptions) {
    this.context = options.context;
    this.instanceId = options.instanceId;
    this.output = options.output;
  }

  async start(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length === 0) {
      this.output.appendLine("single-file mode detected; bridge server not started");
      return;
    }

    await ensureRuntimeDir();
    this.endpoint = await this.computeEndpoint();
    await this.cleanupExistingEndpoint();

    await new Promise<void>((resolve, reject) => {
      this.server = net.createServer((socket) => {
        socket.setEncoding("utf8");
        let buffer = "";

        socket.on("data", (chunk) => {
          buffer += chunk;
          let index = buffer.indexOf("\n");
          while (index >= 0) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (line.length > 0) {
              void this.handleLine(line, socket);
            }
            index = buffer.indexOf("\n");
          }
        });
      });

      this.server.once("error", reject);
      this.server.listen(this.endpoint, () => resolve());
    });

    await this.updateRegistry();
    this.registerEventHandlers();
    this.output.appendLine(`server started at ${this.endpoint}`);
  }

  async dispose(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()));
      this.server = undefined;
    }

    await unregisterEntry(this.instanceId);
    await this.cleanupExistingEndpoint();
  }

  private async computeEndpoint(): Promise<string> {
    if (process.platform === "win32") {
      return `\\\\.\\pipe\\vscode-symbol-bridge-${this.instanceId}`;
    }

    const storage = await ensureRuntimeDir();
    return path.join(storage, `bridge-${this.instanceId}.sock`);
  }

  private async cleanupExistingEndpoint(): Promise<void> {
    if (!this.endpoint || process.platform === "win32") {
      return;
    }

    try {
      await fs.unlink(this.endpoint);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  private async handleLine(line: string, socket: net.Socket): Promise<void> {
    const startedAt = Date.now();
    const response = await this.handleRequest(line);
    socket.write(`${JSON.stringify(response)}\n`);
    this.output.appendLine(
      `request ${response.id} finished in ${Date.now() - startedAt}ms ok=${String(response.ok)}`
    );
  }

  private async handleRequest(line: string): Promise<BridgeResponse> {
    const parsed = parseRequestLine(this.instanceId, line);
    if ("ok" in parsed) {
      return parsed;
    }

    const request: BridgeRequest = parsed;

    try {
      switch (request.method) {
        case "health":
          return this.okResponse(request.id, await this.healthResult());
        case "workspaceSymbol":
          return this.okResponse(request.id, await this.workspaceSymbol(request.params ?? {}));
        case "definition":
          return await this.definitionResponse(request.id, request.params ?? {});
        case "documentSymbol":
          return await this.documentSymbolResponse(request.id, request.params ?? {});
        default:
          return this.errorResponse(request.id, "UNSUPPORTED_METHOD", `Unsupported method: ${request.method}`, false);
      }
    } catch (error) {
      if (error instanceof BridgeRequestError) {
        return this.errorResponse(request.id, error.code, error.message, false);
      }

      if (error instanceof ProviderUnavailableError) {
        return this.errorResponse(request.id, "NO_PROVIDER", error.message, false);
      }

      return this.errorResponse(
        request.id,
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Unexpected bridge failure",
        true
      );
    }
  }

  private okResponse(id: string, result: unknown, documentDirty?: boolean): BridgeResponse {
    return createOkResponse(this.instanceId, id, result, documentDirty);
  }

  private errorResponse(
    id: string,
    code: ErrorCode,
    message: string,
    retryable: boolean
  ): BridgeResponse {
    return createErrorResponse(this.instanceId, id, code, message, retryable);
  }

  private async healthResult(): Promise<HealthResult> {
    const activeDocument = vscode.window.activeTextEditor?.document;
    const providerDiagnosis = this.detectProviderStatus(activeDocument);

    return {
      instanceId: this.instanceId,
      endpoint: this.endpoint ?? "",
      workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      activeFile: activeDocument?.uri.fsPath,
      activeLanguageId: activeDocument?.languageId,
      capabilities: CAPABILITIES,
      singleFileMode: (vscode.workspace.workspaceFolders ?? []).length === 0,
      providerReason: providerDiagnosis.reason,
      providerStatus: providerDiagnosis.status
    };
  }

  private async workspaceSymbol(params: Record<string, unknown>) {
    const query = String(params.query ?? "");
    const limit = params.limit ? Number(params.limit) : undefined;
    const workspaceRoot = params.workspaceRoot ? String(params.workspaceRoot) : undefined;
    const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    const providerDiagnosis = this.detectProviderStatus(vscode.window.activeTextEditor?.document);

    if (workspaceRoot && !workspaceFolders.includes(workspaceRoot)) {
      throw new BridgeRequestError("WORKSPACE_NOT_FOUND", `Workspace not found: ${workspaceRoot}`);
    }

    const symbols =
      (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        "vscode.executeWorkspaceSymbolProvider",
        query
      )) ?? [];

    const filtered = workspaceRoot
      ? symbols.filter((item) => item.location.uri.fsPath.startsWith(workspaceRoot))
      : symbols;

    if (filtered.length === 0 && providerDiagnosis.status.workspaceSymbol === "unavailable") {
      throw new ProviderUnavailableError(providerDiagnosis.reason ?? "No symbol provider available for this workspace");
    }

    if (filtered.length === 0 && shouldTreatEmptyWorkspaceSymbolAsNotFound(query, providerDiagnosis.status.workspaceSymbol)) {
      throw new BridgeRequestError("SYMBOL_NOT_FOUND", `No workspace symbols found for query: ${query}`);
    }

    return {
      items: filtered.slice(0, limit ?? filtered.length).map((item) => ({
        name: item.name,
        kind: symbolKindToString(item.kind),
        uri: item.location.uri.toString(),
        range: uriToRangePayload(item.location.range),
        containerName: item.containerName ?? ""
      }))
    };
  }

  private async definitionResponse(id: string, params: Record<string, unknown>): Promise<BridgeResponse> {
    const document = await this.resolveDocument(params);
    const providerDiagnosis = this.assertProviderAvailable(document, "definition");
    const result = await this.definition(params, document, providerDiagnosis.status.definition);
    return this.okResponse(id, result, document.isDirty);
  }

  private async definition(
    params: Record<string, unknown>,
    document: vscode.TextDocument,
    providerStatus: HealthResult["providerStatus"]["definition"]
  ) {
    const position = new vscode.Position(
      Number(params.line ?? 0),
      Number(params.character ?? 0)
    );

    const definitions =
      (await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        "vscode.executeDefinitionProvider",
        document.uri,
        position
      )) ?? [];

    if (definitions.length === 0 && shouldTreatEmptyDefinitionAsNotFound(providerStatus)) {
      throw new BridgeRequestError("SYMBOL_NOT_FOUND", "Definition not found");
    }

    const items = definitions.map((item) => {
      if ("targetUri" in item) {
        return {
          uri: item.targetUri.toString(),
          range: uriToRangePayload(item.targetRange),
          targetSelectionRange: item.targetSelectionRange
            ? uriToRangePayload(item.targetSelectionRange)
            : undefined
        };
      }

      return {
        uri: item.uri.toString(),
        range: uriToRangePayload(item.range)
      };
    });

    return {
      items
    };
  }

  private async documentSymbolResponse(id: string, params: Record<string, unknown>): Promise<BridgeResponse> {
    const document = await this.resolveDocument(params);
    this.assertProviderAvailable(document, "documentSymbol");
    const result = await this.documentSymbol(params, document);
    return this.okResponse(id, result, document.isDirty);
  }

  private async documentSymbol(params: Record<string, unknown>, document: vscode.TextDocument) {
    const symbols =
      (await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
        "vscode.executeDocumentSymbolProvider",
        document.uri
      )) ?? [];

    return {
      items: symbols.map((item) => this.serializeDocumentSymbol(item))
    };
  }

  private serializeDocumentSymbol(symbol: vscode.DocumentSymbol | vscode.SymbolInformation): unknown {
    if ("selectionRange" in symbol) {
      return {
        name: symbol.name,
        detail: symbol.detail,
        kind: symbolKindToString(symbol.kind),
        range: uriToRangePayload(symbol.range),
        selectionRange: uriToRangePayload(symbol.selectionRange),
        children: symbol.children.map((child) => this.serializeDocumentSymbol(child))
      };
    }

    return {
      name: symbol.name,
      kind: symbolKindToString(symbol.kind),
      uri: symbol.location.uri.toString(),
      range: uriToRangePayload(symbol.location.range),
      containerName: symbol.containerName ?? ""
    };
  }

  private async resolveDocument(params: Record<string, unknown>): Promise<vscode.TextDocument> {
    const uriValue = params.uri;
    if (!uriValue || typeof uriValue !== "string") {
      throw new BridgeRequestError("INVALID_REQUEST", "uri is required");
    }

    try {
      const uri = vscode.Uri.parse(uriValue);
      return await vscode.workspace.openTextDocument(uri);
    } catch {
      throw new BridgeRequestError("DOCUMENT_NOT_FOUND", `Document not found: ${uriValue}`);
    }
  }

  private assertProviderAvailable(
    document: vscode.TextDocument,
    method: "definition" | "documentSymbol"
  ): {
    status: HealthResult["providerStatus"];
    reason?: string;
  } {
    const diagnosis = this.detectProviderStatus(document);
    const status = diagnosis.status[method];

    if (status === "unavailable") {
      throw new ProviderUnavailableError(diagnosis.reason ?? "No symbol provider available for this document");
    }

    return diagnosis;
  }

  private detectProviderStatus(document?: vscode.TextDocument): {
    status: HealthResult["providerStatus"];
    reason?: string;
  } {
    return detectProviderStatusFromVsCode(document);
  }

  private async updateRegistry(): Promise<void> {
    if (!this.endpoint) {
      return;
    }

    this.startedAt ??= new Date().toISOString();

    const entry: RegistryEntry = {
      instanceId: this.instanceId,
      workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      endpoint: this.endpoint,
      pid: process.pid,
      startedAt: this.startedAt,
      extensionVersion: this.context.extension.packageJSON.version,
      capabilities: CAPABILITIES,
      activeFile: vscode.window.activeTextEditor?.document.uri.fsPath
    };

    await registerEntry(entry);
  }

  private registerEventHandlers(): void {
    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        void this.updateRegistry();
      })
    );
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.updateRegistry();
      })
    );
  }
}

class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

class BridgeRequestError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "BridgeRequestError";
    this.code = code;
  }
}
