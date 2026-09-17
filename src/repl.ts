import * as vscode from 'vscode';

const CALVA_EXTENSION_ID = 'betterthantomorrow.calva';
const NREPL_PORT_FILE = '.nrepl-port';

export async function startRepl(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('Ekeko: open a folder before starting the REPL.');
    return;
  }

  let port: number | undefined;
  try {
    port = await vscode.commands.executeCommand<number>(
      'java.execute.workspaceCommand',
      'ekeko.startRepl'
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Ekeko: failed to start REPL - ${err}`);
    return;
  }
  if (typeof port !== 'number' || port <= 0) {
    vscode.window.showErrorMessage('Ekeko: REPL did not start (no port returned).');
    return;
  }

  await writePortFile(folder.uri, port);

  const calva = vscode.extensions.getExtension(CALVA_EXTENSION_ID);
  if (!calva) {
    const install = 'Install Calva';
    const choice = await vscode.window.showInformationMessage(
      `Ekeko: nREPL server started on port ${port} (.nrepl-port written). ` +
        'Install Calva to connect to it from an editor REPL.',
      install
    );
    if (choice === install) {
      await vscode.commands.executeCommand(
        'workbench.extensions.installExtension',
        CALVA_EXTENSION_ID
      );
    }
    return;
  }

  vscode.window.showInformationMessage(`Ekeko: nREPL server started on port ${port}.`);
  await vscode.commands.executeCommand('calva.connect');
}

export async function stopRepl(): Promise<void> {
  try {
    await vscode.commands.executeCommand('java.execute.workspaceCommand', 'ekeko.stopRepl');
  } catch (err) {
    vscode.window.showErrorMessage(`Ekeko: failed to stop REPL - ${err}`);
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder) {
    await deletePortFile(folder.uri);
  }
  vscode.window.showInformationMessage('Ekeko: nREPL server stopped.');
}

async function writePortFile(folderUri: vscode.Uri, port: number): Promise<void> {
  const uri = vscode.Uri.joinPath(folderUri, NREPL_PORT_FILE);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(String(port), 'utf8'));
}

async function deletePortFile(folderUri: vscode.Uri): Promise<void> {
  const uri = vscode.Uri.joinPath(folderUri, NREPL_PORT_FILE);
  try {
    await vscode.workspace.fs.delete(uri);
  } catch {
    // Already gone; nothing to do.
  }
}
