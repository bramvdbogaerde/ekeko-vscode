# Ekeko for VS Code

A VS Code extension porting [Ekeko](../damp.ekeko) — a Clojure/core.logic-based
logic-programming query engine over Java ASTs — from its original Eclipse
plugin form to VS Code.

Ekeko's query engine runs as an OSGi bundle installed directly into the JDT
Language Server process started by the
[Language Support for Java](https://marketplace.visualstudio.com/items?itemName=redhat.java)
(`redhat.java`) extension, giving it full, direct access to Eclipse JDT's AST
and binding APIs (`org.eclipse.jdt.core`) — the same access it had as a native
Eclipse plugin. An interactive Clojure REPL (nREPL) is started inside that
same process; connect to it with the
[Calva](https://marketplace.visualstudio.com/items?itemName=betterthantomorrow.calva)
extension to query the currently loaded Java project interactively. Query
results that resolve to real code elements are shown in a results table and
are clickable to jump straight to the source location.

## Status

Early development — see `/home/bram/ekeko/GOAL.md` for the overall goal and
`TASKS.md` in this directory for the current task checklist. Not yet usable.

## Architecture

See the plan this project follows for full details. In short:

- `ekeko-jdtls-bundle/` — the Java/Clojure OSGi bundle that gets loaded into
  the running JDT Language Server. Hosts the Ekeko query engine (vendored and
  adapted from `damp.ekeko`), the nREPL server, and the LSP delegate command
  handlers our VS Code extension talks to.
- `src/` — the VS Code extension itself (TypeScript): activation, commands,
  the results-table webview, and REPL wiring.
- `spike/` — a standalone compatibility spike (Phase 0) validating that
  `damp.ekeko`'s JDT-coupled query relations still work against the newer JDT
  core bundled with `eclipse.jdt.ls`.

## Relationship to the provided projects

This repository is new and separate from `damp.ekeko` and `eclipse.jdt.ls`
(both siblings of this directory). Neither is modified by this project;
`damp.ekeko` source files that are needed are vendor-copied into
`ekeko-jdtls-bundle/vendor/` (with adaptations noted in code comments where
non-trivial), and `eclipse.jdt.ls` is only built locally to obtain the JDT
core jars to develop and test against.
