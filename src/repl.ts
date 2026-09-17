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
  await closeStaleReplWindow();
  await useReplWindowOutput();
  // Passing an explicit connect sequence name skips Calva's "Project
  // Type/Connect Sequence" quick pick (which would otherwise ask the user
  // to manually choose "Generic" every time): the Ekeko nREPL server isn't
  // tied to a Leiningen/deps.edn/shadow-cljs project, so "Generic" -
  // connect straight to the host/port in .nrepl-port - is always correct
  // here.
  await vscode.commands.executeCommand('calva.connect', { connectSequence: 'Generic' });
  await positionReplWindowAtBottom();
}

function isReplWindowTab(tab: vscode.Tab): boolean {
  return tab.input instanceof vscode.TabInputText && tab.input.uri.path.endsWith('repl.calva-repl');
}

// The repl-window is a real file (.calva/repl.calva-repl), so VS Code
// happily restores it as an already-open tab when the editor reopens after
// being closed with it still open - showing last session's leftover
// transcript, disconnected, which reads as a live but stuck REPL. Close any
// such leftover tab before reconnecting so each "Start REPL" begins from a
// clean, unambiguous state instead of reusing whatever was left open.
async function closeStaleReplWindow(): Promise<void> {
  const staleTabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs.filter(isReplWindowTab));
  if (staleTabs.length > 0) {
    await vscode.window.tabGroups.close(staleTabs);
  }
}

// Calva opens the repl-window document beside whatever was already active,
// i.e. as a second column to the right - not the bottom-of-screen,
// terminal-like placement users expect from a REPL/console. There's no
// dedicated "dock to bottom" API, but vscode.setEditorLayout can re-arrange
// the *existing* editor groups (without touching which tabs are in which
// group) from side-by-side into stacked rows, which puts the repl-window's
// group at the bottom, spanning the same width as the code above it.
async function positionReplWindowAtBottom(): Promise<void> {
  const groups = vscode.window.tabGroups.all;
  // Only re-arrange the layout for the specific shape Calva just created
  // (the user's original editor group, plus the new repl-window group
  // beside it); if the user already had a more complex split, leave it
  // alone rather than fight their existing layout.
  if (groups.length !== 2) {
    return;
  }
  const hasReplWindowTab = groups.some((group) => group.tabs.some(isReplWindowTab));
  if (!hasReplWindowTab) {
    return;
  }
  await vscode.commands.executeCommand('vscode.setEditorLayout', {
    orientation: 1, // stack groups in rows instead of side-by-side columns
    groups: [{ size: 0.65 }, { size: 0.35 }],
  });
}

// Recent Calva versions default to routing eval results/output to a
// terminal-style "Calva Output" channel and a tree-view sidebar, neither of
// which render Clojure's traditional `ns=>` prompt. The classic prompted
// REPL, a plain Clojure document showing `clj꞉user꞉>` before each
// evaluation, still exists as the "repl-window" output destination but is
// opt-in (`calva.outputDestinations`) and doesn't auto-open on connect
// (`calva.autoOpenREPLWindow`) unless configured. Set both, workspace-scoped,
// so "Ekeko: Start REPL" lands users in a familiar prompted REPL rather than
// the promptless default.
async function useReplWindowOutput(): Promise<void> {
  const config = vscode.workspace.getConfiguration('calva');
  await config.update('autoOpenREPLWindow', true, vscode.ConfigurationTarget.Workspace);
  await config.update(
    'outputDestinations',
    {
      evalResults: ['repl-window'],
      evalOutput: ['repl-window'],
      otherOutput: ['repl-window'],
    },
    vscode.ConfigurationTarget.Workspace
  );
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
