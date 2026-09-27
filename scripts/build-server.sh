#!/usr/bin/env bash
# Builds damp.ekeko.jdtls (the jdt.ls-side OSGi bundle) and copies the
# resulting jar into server/, where package.json's contributes.javaExtensions
# expects it. Run this before packaging/testing the extension; the jar
# itself isn't committed to this repo (see .gitignore) since it's a build
# artifact of damp.ekeko, not source.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JDTLS_BUNDLE_DIR="$SCRIPT_DIR/../../damp.ekeko/damp.ekeko.jdtls"
SERVER_DIR="$SCRIPT_DIR/../server"

if [ ! -d "$JDTLS_BUNDLE_DIR" ]; then
  echo "Expected damp.ekeko.jdtls at $JDTLS_BUNDLE_DIR but it's not there." >&2
  exit 1
fi

MVN="$SCRIPT_DIR/../../eclipse.jdt.ls/mvnw"
if [ ! -x "$MVN" ]; then
  echo "Falling back to 'mvn' on PATH (eclipse.jdt.ls Maven wrapper not found at $MVN)." >&2
  MVN="mvn"
fi

cd "$JDTLS_BUNDLE_DIR"
"$MVN" -f pom.xml verify

BUILT_JAR="$(ls target/damp.ekeko.jdtls-*.jar | grep -v sources | head -1)"
if [ -z "$BUILT_JAR" ]; then
  echo "Build succeeded but no output jar found under $JDTLS_BUNDLE_DIR/target/" >&2
  exit 1
fi

mkdir -p "$SERVER_DIR"
cp "$BUILT_JAR" "$SERVER_DIR/damp.ekeko.jdtls.jar"
echo "Copied $(basename "$BUILT_JAR") to $SERVER_DIR/damp.ekeko.jdtls.jar"

# Plain (non-nested-in-a-jar) copies of core.logic/qwal, whose macros
# damp.ekeko's own macros expand into -- staged separately from the OSGi
# bundle jar above (which only embeds them as nested jars on its own
# Bundle-ClassPath) so clj-kondo/clojure-lsp can point a :classpath at
# real files and resolve Ekeko/core.logic symbols for autocomplete and
# diagnostics (src/lsp.ts writes .lsp/config.edn pointing here).
LINT_LIBS_DIR="$JDTLS_BUNDLE_DIR/target/lint-libs"
if [ -d "$LINT_LIBS_DIR" ]; then
  rm -rf "$SERVER_DIR/lint-libs"
  mkdir -p "$SERVER_DIR/lint-libs"
  cp "$LINT_LIBS_DIR"/*.jar "$SERVER_DIR/lint-libs/"
  echo "Copied $(ls "$LINT_LIBS_DIR"/*.jar | wc -l) lint-classpath jar(s) to $SERVER_DIR/lint-libs/"
else
  echo "Warning: $LINT_LIBS_DIR not found; clj-kondo/clojure-lsp classpath setup will be incomplete." >&2
fi
