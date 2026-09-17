import * as vscode from 'vscode';
import { startRepl, stopRepl } from './repl';

// Registered under distinct ids (not the raw server command ids, e.g.
// 'ekeko.rebuildModel') because the LSP client library used by redhat.java
// auto-registers a client-side passthrough command under that exact name
// for every command the server advertises via executeCommandProvider --
// registering our own handler under the same id collides with it.
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ekeko.command.rebuildModel', rebuildModel),
    vscode.commands.registerCommand('ekeko.command.startRepl', startRepl),
    vscode.commands.registerCommand('ekeko.command.stopRepl', stopRepl)
  );
}

async function rebuildModel(): Promise<void> {
  try {
    const rebuiltProjects = await vscode.commands.executeCommand<string[]>(
      'java.execute.workspaceCommand',
      'ekeko.rebuildModel'
    );
    if (rebuiltProjects && rebuiltProjects.length > 0) {
      vscode.window.showInformationMessage(
        `Ekeko: rebuilt model for ${rebuiltProjects.join(', ')}`
      );
    } else {
      vscode.window.showInformationMessage('Ekeko: no open Java projects to rebuild.');
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Ekeko: failed to rebuild model - ${err}`);
  }
}

export function deactivate() {}
