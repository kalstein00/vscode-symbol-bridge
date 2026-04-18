import { HealthResult } from "./protocol";

export function shouldTreatEmptyDefinitionAsNotFound(status: HealthResult["providerStatus"]["definition"]): boolean {
  return status !== "unavailable";
}

export function shouldTreatEmptyDocumentSymbolAsNotFound(): boolean {
  return false;
}

export function shouldTreatEmptyWorkspaceSymbolAsNotFound(
  query: string,
  status: HealthResult["providerStatus"]["workspaceSymbol"]
): boolean {
  return query.trim().length > 0 && status !== "unavailable";
}
