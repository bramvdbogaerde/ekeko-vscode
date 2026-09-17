# Ekeko for VS Code

A VS Code extension bringing Ekeko — a Clojure/core.logic-based
logic-programming query engine over Java ASTs — from its original Eclipse
plugin form into VS Code.

Ekeko's query engine runs as an OSGi bundle installed directly into the JDT
Language Server process started by the
[Language Support for Java](https://marketplace.visualstudio.com/items?itemName=redhat.java)
(`redhat.java`) extension, giving it full, direct access to Eclipse JDT's AST
and binding APIs (`org.eclipse.jdt.core`) — the same access it had as a native
Eclipse plugin. An interactive Clojure REPL (nREPL) will be started inside
that same process; connecting to it with the
[Calva](https://marketplace.visualstudio.com/items?itemName=betterthantomorrow.calva)
extension will let you query the currently loaded Java project interactively.
Query results that resolve to real code elements will be shown in a results
table and be clickable to jump straight to the source location.

## Status

Early development. See `TASKS.md` in this directory for the current task
checklist. Currently working: the extension installs, contributes its bundle
into a running jdt.ls process, and the `Ekeko: Rebuild Model` command runs
end to end. The REPL, results table, and script-loading features aren't
built yet.

## Architecture

- `src/` — the VS Code extension itself (TypeScript): activation and
  commands, with a results-table webview and REPL wiring to follow.
- `server/` — where the built jdt.ls-side OSGi bundle jar
  (`damp.ekeko.jdtls.jar`) is staged for packaging; not committed here (see
  `.gitignore`), produced by `scripts/build-server.sh` from the
  `damp.ekeko.jdtls` Maven module.
- `scripts/build-server.sh` — builds `damp.ekeko.jdtls` and copies its
  output jar into `server/`. Run this (or `npm run build-server`) before
  packaging or testing the extension.
- `spike/` — a standalone compatibility spike validating that `damp.ekeko`'s
  JDT-coupled query relations work against the newer JDT core bundled with
  current `eclipse.jdt.ls`/`redhat.java` releases.

## Relationship to the provided projects

This repository holds the VS Code extension only. The jdt.ls-side OSGi
bundle it contributes (`damp.ekeko.jdtls`) lives in the sibling `damp.ekeko`
repository as its own Maven module, building directly against
`damp.ekeko.plugin`'s own source — see that repository's `GOAL.md` for the
full rationale and the list of changes made there to support this. This
repository never modifies `damp.ekeko` or `eclipse.jdt.ls`; the latter is
only built locally (via `damp.ekeko.jdtls`'s own tooling) to develop and
test against the JDT core jars it needs.

## Building and testing locally

```sh
npm install
npm run build-server   # builds damp.ekeko.jdtls and stages its jar in server/
npm run compile        # compiles the extension's TypeScript
npx vsce package       # produces a .vsix
```

Install the resulting `.vsix` in VS Code (or VSCodium) alongside `redhat.java`
to try it.
