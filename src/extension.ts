import * as vscode from 'vscode';
import { startRepl, stopRepl } from './repl';
import { queryFinished, queryStarted } from './queryProgress';
import { EkekoResultsViewProvider, QueryResult } from './resultsPanel';

// nREPL can only forcibly stop an evaluation that ignores Thread.interrupt
// (e.g. one timed out via the ekeko.queryTimeout setting) when the JVM
// it runs in -- jdt.ls -- may attach an agent to itself. Adds the flag
// allowing that to the user's jdt.ls VM arguments; it takes effect the next
// time jdt.ls starts.
async function ensureJVMArgs(): Promise<void> {
  const FLAG = '-Djdk.attach.allowAttachSelf=true';
  const cfg = vscode.workspace.getConfiguration('java');
  const current = cfg.get<string>('jdt.ls.vmargs') ?? '';
  if (current.includes(FLAG)) {
    return;
  }
  try {
    await cfg.update('jdt.ls.vmargs', `${current} ${FLAG}`.trim(), vscode.ConfigurationTarget.Global);
  } catch (err) {
    console.error('Ekeko: failed to update java.jdt.ls.vmargs', err);
  }
}

// Registered under distinct ids (not the raw server command ids, e.g.
// 'ekeko.rebuildModel') because the LSP client library used by redhat.java
// auto-registers a client-side passthrough command under that exact name
// for every command the server advertises via executeCommandProvider --
// registering our own handler under the same id collides with it.
export function activate(context: vscode.ExtensionContext) {
  const resultsView = new EkekoResultsViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(EkekoResultsViewProvider.viewType, resultsView),
    vscode.commands.registerCommand('ekeko.command.rebuildModel', rebuildModel),
    vscode.commands.registerCommand('ekeko.command.startRepl', () => startRepl(context)),
    vscode.commands.registerCommand('ekeko.command.stopRepl', stopRepl),
    // Not a client-side passthrough of a server-advertised executeCommand
    // id (see the note above) -- this is the server pushing to us, via a
    // workspace/notify notification (damp.ekeko.jdtls.EkekoResultsBridge,
    // called from this bundle's own damp.ekeko.gui/open-barista-results-
    // viewer*) every time (ekeko* ...)/(ekeko-n* ...) is evaluated at the
    // connected Calva REPL, mirroring how the Eclipse plugin pops its
    // Barista results view for the same two macros.
    vscode.commands.registerCommand('ekeko.showResults', (payload: QueryResult) =>
      resultsView.reveal(payload)
    ),
    // Likewise pushed by the server around each of those queries.
    vscode.commands.registerCommand('ekeko.queryStarted', queryStarted),
    vscode.commands.registerCommand('ekeko.queryFinished', queryFinished)
  );
  void ensureJVMArgs();
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
