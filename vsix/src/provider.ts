import type { Extension } from "vscode";

import { HealthResult } from "./protocol";

interface ProviderDocumentLike {
  languageId?: string;
  uri?: {
    scheme?: string;
  };
}

interface ExtensionPackageJsonLike {
  activationEvents?: string[];
  contributes?: {
    languages?: Array<{
      id?: string;
    }>;
  };
}

interface ProviderExtensionLike {
  id: string;
  isActive?: boolean;
  packageJSON?: ExtensionPackageJsonLike;
}

const LANGUAGE_PROVIDER_HINTS: Record<string, string[]> = {
  c: ["ms-vscode.cpptools", "llvm-vs-code-extensions.vscode-clangd"],
  cpp: ["ms-vscode.cpptools", "llvm-vs-code-extensions.vscode-clangd"],
  "cuda-cpp": ["ms-vscode.cpptools", "llvm-vs-code-extensions.vscode-clangd"],
  "objective-c": ["ms-vscode.cpptools", "llvm-vs-code-extensions.vscode-clangd"],
  "objective-cpp": ["ms-vscode.cpptools", "llvm-vs-code-extensions.vscode-clangd"],
  javascript: ["vscode.typescript-language-features"],
  javascriptreact: ["vscode.typescript-language-features"],
  typescript: ["vscode.typescript-language-features"],
  typescriptreact: ["vscode.typescript-language-features"],
  python: ["ms-python.python", "ms-python.vscode-pylance"],
  go: ["golang.go"],
  rust: ["rust-lang.rust-analyzer"],
  java: ["redhat.java", "vscjava.vscode-java-pack"]
};

export function detectProviderStatusFromContext(
  document: ProviderDocumentLike | undefined,
  workspaceFolderCount: number,
  availableExtensions: ProviderExtensionLike[]
): {
  status: HealthResult["providerStatus"];
  reason?: string;
} {
  if (workspaceFolderCount === 0) {
    return unavailableForAll("single-file mode unsupported");
  }

  if (!document) {
    return unknownForAll("No active document");
  }

  if (document.uri?.scheme && !["file", "untitled"].includes(document.uri.scheme)) {
    return unavailableForAll(`Unsupported document scheme: ${document.uri.scheme}`);
  }

  const languageId = document.languageId;
  if (!languageId) {
    return unknownForAll("No active language");
  }

  const knownProviders = LANGUAGE_PROVIDER_HINTS[languageId];
  if (knownProviders) {
    const matches = availableExtensions.filter((extension) => knownProviders.includes(extension.id));
    if (matches.length === 0) {
      return unavailableForAll(`No known symbol provider extension detected for language: ${languageId}`);
    }

    return readyForAll(
      matches.some((extension) => extension.isActive)
        ? undefined
        : `Known provider extension installed for language: ${languageId}`
    );
  }

  const genericMatches = availableExtensions.filter((extension) => extensionMightHandleLanguage(extension, languageId));
  if (genericMatches.length === 0) {
    return unavailableForAll(`No extension match detected for language: ${languageId}`);
  }

  return unknownForAll(`Generic language extension match detected for language: ${languageId}`);
}

export function detectProviderStatusFromVsCode(document?: ProviderDocumentLike): {
  status: HealthResult["providerStatus"];
  reason?: string;
} {
  const { extensions, workspace } = require("vscode") as typeof import("vscode");

  return detectProviderStatusFromContext(
    document,
    (workspace.workspaceFolders ?? []).length,
    extensions.all.map((extension: Extension<unknown>) => ({
      id: extension.id,
      isActive: extension.isActive,
      packageJSON: extension.packageJSON as ExtensionPackageJsonLike
    }))
  );
}

function extensionMightHandleLanguage(extension: ProviderExtensionLike, languageId: string): boolean {
  const activationEvents = extension.packageJSON?.activationEvents ?? [];
  if (activationEvents.includes("*") || activationEvents.includes(`onLanguage:${languageId}`)) {
    return true;
  }

  return (extension.packageJSON?.contributes?.languages ?? []).some((language) => language.id === languageId);
}

function readyForAll(reason?: string) {
  return {
    status: {
      workspaceSymbol: "ready",
      definition: "ready",
      documentSymbol: "ready"
    } satisfies HealthResult["providerStatus"],
    reason
  };
}

function unknownForAll(reason?: string) {
  return {
    status: {
      workspaceSymbol: "unknown",
      definition: "unknown",
      documentSymbol: "unknown"
    } satisfies HealthResult["providerStatus"],
    reason
  };
}

function unavailableForAll(reason?: string) {
  return {
    status: {
      workspaceSymbol: "unavailable",
      definition: "unavailable",
      documentSymbol: "unavailable"
    } satisfies HealthResult["providerStatus"],
    reason
  };
}
