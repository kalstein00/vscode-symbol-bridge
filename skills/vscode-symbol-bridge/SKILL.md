---
name: vscode-symbol-bridge
description: Query code navigation data from a running VS Code Symbol Bridge instead of re-deriving it from text search. Use when Codex needs workspace symbols, document symbols, definition locations, or bridge health for files that are open in a VS Code workspace where the VS Code Symbol Bridge extension is installed and running.
---

# VS Code Symbol Bridge

Use the helper CLI in this skill to query a live VS Code instance that already has language providers loaded.

## Use the CLI

- Run `./bin/vsb health` first when bridge availability is unclear.
- Run `./bin/vsb workspace-symbol "<query>"` for workspace-wide symbol lookup.
- Run `./bin/vsb document-symbol --file <path>` for outline-style symbol structure in one file.
- Run `./bin/vsb definition --file <path> --line <zero-based> --character <zero-based>` for go-to-definition.
- Add `--workspace <path>` when multiple VS Code workspaces may match.
- Add `--json` when downstream processing needs raw bridge output.

## Follow This Workflow

1. Prefer this bridge over `rg` when the user is asking for symbol-aware navigation.
2. Start with `health` if you do not yet know whether a live endpoint exists.
3. If the bridge reports multiple candidates, show them and disambiguate with `--workspace`; do not pick one arbitrarily.
4. If the bridge is unavailable or reports no provider, explain that plainly and only then fall back to text search.
5. Report the conclusion first, then the relevant file path, line, and symbol details.

## Interpret Failures

- `ENDPOINT_UNAVAILABLE`: VS Code is not running with a workspace folder, or the extension is not active.
- `WORKSPACE_NOT_FOUND`: The requested `--workspace` path does not match a registered VS Code workspace.
- `NO_PROVIDER`: VS Code is running, but the current file or workspace has no symbol provider.
- `SYMBOL_NOT_FOUND`: The provider ran but found no matching symbol.

## Notes

- Do not talk to the socket or registry directly unless you are debugging the bridge itself; use `./bin/vsb`.
- The CLI resolves `--file` and `--workspace` relative to the current working directory.
- `definition` line and character arguments are zero-based because they map directly to VS Code positions.
