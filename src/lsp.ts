import * as path from 'path';
import * as vscode from 'vscode';

// clj-kondo/clojure-lsp (which power Calva's autocomplete and diagnostics)
// only know about symbols they can find on a classpath they can inspect.
// Ekeko's own .clj source is embedded as plain resources inside
// damp.ekeko.jdtls.jar -- readable by clj-kondo directly, the same way it
// reads any Clojure library dependency jar -- but nothing in an opened
// Java project tells clj-kondo that jar exists (there's no deps.edn/
// project.clj naming it; it's only ever loaded into jdt.ls's own OSGi
// runtime). Without that, every Ekeko/core.logic symbol in a user's .clj
// script shows up as an unresolved-symbol warning and gets no
// autocomplete.
//
// Fix: write a .lsp/config.edn with a :project-specs entry pointing
// clojure-lsp at a :classpath-cmd that just echoes the jars we want on the
// classpath (the bundle jar, plus core.logic/qwal's plain jars, staged
// separately by scripts/build-server.sh since those two are only embedded
// as *nested* jars inside the OSGi bundle, which clj-kondo can't see
// into). There is no plain static ":classpath" override key in
// clojure-lsp despite that being the first thing one reaches for --
// :project-specs/:classpath-cmd is the actual supported mechanism for "no
// build tool describes my classpath" (verified against clojure-lsp's own
// source: clojure-lsp.classpath/valid-project-spec? requires each entry's
// :project-path to be a file that exists under the project root before
// its :classpath-cmd is used at all -- ".lsp/config.edn" itself, which we
// just wrote, always qualifies). Only works where a plain "echo" binary
// is on PATH (Linux/macOS); Windows isn't handled here.
export async function ensureClojureLspClasspath(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }

  const jarPaths = await collectLintClasspathJars(context);
  if (jarPaths.length === 0) {
    return;
  }

  const configUri = vscode.Uri.joinPath(folder.uri, '.lsp', 'config.edn');
  const existing = await readFileIfExists(configUri);
  const classpathString = jarPaths.join(path.delimiter);

  if (existing !== undefined) {
    if (existing.includes(classpathString)) {
      return; // Already set up (e.g. a previous activation wrote it).
    }
    vscode.window.showWarningMessage(
      `Ekeko: ${vscode.workspace.asRelativePath(configUri)} already exists and doesn't have a ` +
        ":project-specs entry for Ekeko's Clojure jars, so Calva won't recognize Ekeko/core.logic " +
        `symbols. Add this :classpath-cmd entry to its :project-specs vector yourself: ["echo" ` +
        `${ednString(classpathString)}]`
    );
    return;
  }

  const edn =
    '{:project-specs [{:project-path ".lsp/config.edn"\n' +
    `                   :classpath-cmd ["echo" ${ednString(classpathString)}]}]}\n`;
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, '.lsp'));
  await vscode.workspace.fs.writeFile(configUri, Buffer.from(edn, 'utf8'));

  const restart = 'Restart Clojure LSP';
  const choice = await vscode.window.showInformationMessage(
    `Ekeko: wrote ${vscode.workspace.asRelativePath(configUri)} so Calva recognizes Ekeko/core.logic ` +
      'symbols (autocomplete, diagnostics) in .clj files. Restart Clojure LSP to pick it up.',
    restart
  );
  if (choice === restart) {
    try {
      await vscode.commands.executeCommand('calva.clojureLsp.restart');
    } catch (err) {
      // Calva may not be installed, or not active yet (it only activates
      // once a Clojure file is open) -- the config is already written and
      // will take effect the next time clojure-lsp starts regardless.
      console.error('Ekeko: could not restart Clojure LSP', err);
    }
  }
}

async function collectLintClasspathJars(context: vscode.ExtensionContext): Promise<string[]> {
  const paths: string[] = [];

  const bundleJar = vscode.Uri.joinPath(context.extensionUri, 'server', 'damp.ekeko.jdtls.jar');
  if (await fileExists(bundleJar)) {
    paths.push(bundleJar.fsPath);
  }

  const lintLibsDir = vscode.Uri.joinPath(context.extensionUri, 'server', 'lint-libs');
  try {
    const entries = await vscode.workspace.fs.readDirectory(lintLibsDir);
    for (const [name, type] of entries) {
      if (type === vscode.FileType.File && name.endsWith('.jar')) {
        paths.push(vscode.Uri.joinPath(lintLibsDir, name).fsPath);
      }
    }
  } catch {
    // lint-libs/ not present -- e.g. a dev build where build-server.sh
    // hasn't been re-run since this feature was added. Ekeko's own
    // symbols (from the bundle jar above, if present) still get set up.
  }

  return paths;
}

function ednString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readFileIfExists(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return undefined;
  }
}
