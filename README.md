# Ekeko for VS Code

Query and explore Java code from VS Code using
[Ekeko](https://github.com/cderoove/damp.ekeko), a Clojure/core.logic-based
logic-programming query engine over Java ASTs — originally an Eclipse
plugin, ported here to run inside the same JDT Language Server process that
powers VS Code's own Java support.

Ekeko's query engine runs as a real OSGi bundle installed directly into the
JDT Language Server started by the
[Language Support for Java](https://marketplace.visualstudio.com/items?itemName=redhat.java)
(`redhat.java`) extension, giving it full, direct access to Eclipse JDT's AST
and binding APIs — the same access it had as a native Eclipse plugin, not
just what the Language Server Protocol exposes. An interactive Clojure REPL
(nREPL) runs inside that same process; connect to it with the
[Calva](https://marketplace.visualstudio.com/items?itemName=betterthantomorrow.calva)
extension to query the currently loaded Java project interactively. Query
results that resolve to real code elements (methods, types, ...) show up in
a results table and are clickable to jump straight to the source location.

## Requirements

- VS Code or VSCodium, 1.85 or newer.
- The [Language Support for Java](https://marketplace.visualstudio.com/items?itemName=redhat.java)
  (`redhat.java`) extension. Declared as a hard dependency
  (`extensionDependencies`), so installing this extension installs that one
  automatically if it isn't already present.
- The [Calva](https://marketplace.visualstudio.com/items?itemName=betterthantomorrow.calva)
  extension, to connect to the REPL. Not a hard dependency (Ekeko's other
  commands work without it), but listed as a recommended extension
  (`.vscode/extensions.json`) — VS Code will offer to install it, or you can
  install it yourself from the Marketplace.

## Installing

This extension isn't published to the Marketplace; install it from a built
`.vsix`:

1. Build one — see "Building" below — or use an existing
   `ekeko-*.vsix` in this directory.
2. In VS Code: Extensions view → `...` menu → "Install from VSIX...", and
   pick the file. Or from the command line:
   ```sh
   code --install-extension ekeko-0.0.1.vsix
   # or, for VSCodium:
   codium --install-extension ekeko-0.0.1.vsix
   ```
3. VS Code installs `redhat.java` alongside it if it isn't already present,
   and offers to install Calva.

## Usage

1. **Open a Java project.** Any folder VS Code/`redhat.java` recognizes as a
   Java project (an Eclipse `.project`/`.classpath` pair, a Maven `pom.xml`,
   or a Gradle build) works. Wait for the status bar's Java icon to read
   "Java: Ready" — Ekeko's bundle activates alongside `redhat.java` and
   automatically enables itself on every open Java project, so there's
   nothing project-specific to configure.
2. **Ekeko: Rebuild Model** (command palette) — (re)builds Ekeko's queryable
   fact base for all open Java projects. Runs automatically on project open;
   use this after large offline changes (e.g. a git checkout) to force a
   full rebuild.
3. **Ekeko: Start REPL** (command palette) — starts an nREPL server inside
   the JDT Language Server process, writes a `.nrepl-port` file (the
   standard file Calva auto-detects) to the workspace root, and connects
   Calva to it automatically, opening a classic prompted REPL window
   (`clj:user:>`) docked as a column on the right, beside the code editor.
   From here you can evaluate any Clojure code with full access to the live
   project's AST, exactly as in the Eclipse plugin. For example:
   ```clojure
   (require 'damp.ekeko)
   (in-ns 'damp.ekeko)
   (count (ekeko [?m] (ast :MethodDeclaration ?m)))
   ```
   **Ekeko: Stop REPL** stops the server and removes `.nrepl-port` again.
4. **Running a query and seeing results.** There are two ways to see a
   query's results in the **Ekeko** panel (bottom panel area, next to
   Problems/Output/Terminal — drag it to the secondary/right sidebar if you
   prefer, via VS Code's own "Move View"/"Move Panel to Secondary Side Bar"):
   - Evaluate `(ekeko* ...)` or `(ekeko-n* n ...)` at the connected REPL —
     the same macros the Eclipse plugin's Barista view responds to — and the
     Ekeko panel pops open automatically with the result table. This is the
     primary, REPL-native way to query.
   - Or run **Ekeko: Run Query** (command palette) without a REPL running:
     it reads the query from your active editor's selection, or prompts for
     one, and shows the same table.

   In the results table, one column per query variable: cells that resolved
   to a real AST element (a method, type, statement, ...) render as
   clickable links — click one to open its source file and select exactly
   that range. Other cells (strings, numbers, booleans, `nil`, ...) render
   as plain text.
5. **Loading your own scripts.** Ekeko scripts are just `.clj` files
   anywhere in your open workspace. Open one and run Calva's own **"Load/
   Evaluate Current File (and its Requires/Dependencies)"** command (command
   palette, or `Ctrl+Alt+C Enter`) to load it into the connected REPL —
   functions and vars it defines become callable from the REPL immediately
   afterward. No Ekeko-specific "load script" command is needed for this;
   Calva already covers it for any Clojure file.
6. **Autocomplete and diagnostics for Ekeko symbols in Calva.** The first
   time a Java file is opened, Ekeko writes a `.lsp/config.edn` into the
   workspace pointing `clojure-lsp` (which powers Calva's autocomplete and
   red-squiggle diagnostics) at Ekeko's own `.clj` source and its
   `core.logic`/`qwal` dependencies, none of which are otherwise
   discoverable from a plain Java project (no `deps.edn`/`project.clj`
   names them), then restarts Clojure LSP automatically (a status-bar
   message notes when this happens) so it takes effect immediately — a
   one-time thing per workspace, and low-risk enough not to ask first. If
   symbols still don't resolve right after, run **Calva: Restart Clojure
   LSP** yourself once more; that only happens if Clojure LSP had already
   started (and done its one-time classpath scan) *before* Ekeko's own
   activation could write the file — a startup race between two
   independent extensions, not something either side can fully avoid.

   For this to work, write scripts with an explicit `ns` form rather than
   the `(in-ns 'damp.ekeko)` shorthand shown above: `in-ns` switches
   namespaces at *runtime*, which clj-kondo (a static analyzer) can't
   follow, so symbols brought in that way still show as unresolved even
   though they work fine at the REPL. Prefer:
   ```clojure
   (ns my-script
     (:require [damp.ekeko :refer :all]
               [damp.ekeko.jdt.ast :refer :all]))

   (ekeko [?m] (ast :MethodDeclaration ?m))
   ```
   Add further `damp.ekeko.jdt.*` namespaces (`structure`, `aststructure`,
   `convenience`, `rewrites`) the same way for the relations they define
   (`has`, `child`, and friends). Logic variables (`?m` above) still show
   as unresolved regardless — clj-kondo doesn't know `core.logic`'s
   `fresh`/`ekeko` binds them — that's a purely cosmetic, safe-to-ignore
   warning.

## Architecture

- `src/` — the VS Code extension itself (TypeScript): activation and
  commands (`extension.ts`), REPL start/stop + `.nrepl-port` writing +
  Calva wiring (`repl.ts`), the query-input command (`queryRunner.ts`), the
  results view (`resultsPanel.ts` + `media/results.{js,css}`, a
  `WebviewViewProvider` docked in the bottom Panel area), and the
  `.lsp/config.edn` classpath setup for Calva's autocomplete/diagnostics
  (`lsp.ts`; see "Autocomplete and diagnostics" above).
- `server/` — where the built jdt.ls-side OSGi bundle jar
  (`damp.ekeko.jdtls.jar`) is staged for packaging, plus `lint-libs/`
  (plain, non-nested copies of `core.logic`/`qwal`, which `lsp.ts` also
  points `clojure-lsp` at — the bundle jar only embeds those two as
  *nested* jars on its own OSGi classpath, which `clj-kondo` can't see
  into). Not committed here (see `.gitignore`), produced by
  `scripts/build-server.sh` from the `damp.ekeko.jdtls` Maven module.
- `scripts/build-server.sh` — builds `damp.ekeko.jdtls` and copies its
  output jar into `server/`. Run this (or `npm run build-server`) before
  packaging or testing the extension.
- `spike/` — a standalone compatibility spike validating that `damp.ekeko`'s
  JDT-coupled query relations work against the newer JDT core bundled with
  current `eclipse.jdt.ls`/`redhat.java` releases (Phase 0 of the port; see
  `spike/FINDINGS.md`).

## Relationship to the provided projects

This repository holds the VS Code extension only. The jdt.ls-side OSGi
bundle it contributes (`damp.ekeko.jdtls`, including the delegate command
handlers, the nREPL controller, and this bundle's own
`damp.ekeko.gui`/`EkekoResultsBridge` that push REPL query results here —
see that module's own README) lives in the sibling `damp.ekeko` repository
as its own Maven module, building directly against `damp.ekeko.plugin`'s
own source — see that repository's `GOAL.md` for the full rationale and the
list of changes made there to support this. This repository never modifies
`damp.ekeko` or `eclipse.jdt.ls`; the latter is only built locally (via
`damp.ekeko.jdtls`'s own tooling) to develop and test against the JDT core
jars it needs.

## Building

Requires Node.js/npm, a JDK 21, and Maven (or its wrapper — see
`damp.ekeko.jdtls/install-local-deps.sh`) to build the jdt.ls-side bundle;
`redhat.java` must already be installed once, since the bundle build reuses
JDT jars extracted from it.

```sh
npm install
npm run build-server   # builds damp.ekeko.jdtls and stages its jar in server/
npm run compile        # compiles the extension's TypeScript
npx vsce package --allow-missing-repository   # produces a .vsix
```

Install the resulting `.vsix` as described above to try it.

## Status

All of the goal's four capabilities are implemented and verified end to
end: rebuilding the fact base, the REPL, the results table with
jump-to-source, and loading scripts (via Calva's own file-evaluation
commands — see "Loading your own scripts" above). See `TASKS.md` for the
detailed, phase-by-phase task checklist and verification notes, and
`/home/bram/ekeko/GOAL.md` for the overall project status.
