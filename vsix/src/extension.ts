import * as vscode from "vscode";
import { randomUUID } from "node:crypto";

import { BridgeServer } from "./server";

let server: BridgeServer | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("VS Code Symbol Bridge");
  const instanceId = randomUUID();

  server = new BridgeServer({
    context,
    instanceId,
    output
  });

  context.subscriptions.push(output);
  context.subscriptions.push({
    dispose: () => {
      void server?.dispose();
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("vscodeSymbolBridge.showHealth", async () => {
      if (!server) {
        return;
      }

      await vscode.window.showInformationMessage("VS Code Symbol Bridge is running. See Output panel for details.");
      output.show(true);
    })
  );

  await server.start();
}

export function deactivate(): Thenable<void> | undefined {
  return server?.dispose();
}

