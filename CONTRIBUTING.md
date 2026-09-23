# Contributing

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

## Building

Requires Node.js/npm, a JDK 21, and Maven to build the jdt.ls-side bundle.
```sh
npm install
npm run build-server   # builds damp.ekeko.jdtls and stages its jar in server/
npm run compile        # compiles the extension's TypeScript
npx vsce package --allow-missing-repository   # produces a .vsix
```

Install the resulting `.vsix` as described above to try it.

