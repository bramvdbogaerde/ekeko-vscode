#!/usr/bin/env bash
# Copies the JDT core jar (and its runtime dependencies) bundled with the
# currently installed redhat.java (Language Support for Java) VS
# Code/VSCodium extension into spike/lib/, so the compatibility spike runs
# against the exact JDT core version our extension will actually run
# against at runtime (rather than eclipse.jdt.ls's own from-source build,
# which tracks a rolling target and may be a slightly different snapshot).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
mkdir -p "$LIB_DIR"

SEARCH_DIRS=()
for d in "$HOME/.vscode-oss/extensions" "$HOME/.vscode/extensions"; do
  [ -d "$d" ] && SEARCH_DIRS+=("$d")
done
EXT_DIR=""
if [ "${#SEARCH_DIRS[@]}" -gt 0 ]; then
  EXT_DIR="$(find "${SEARCH_DIRS[@]}" -maxdepth 1 -iname 'redhat.java-*' 2>/dev/null | sort -V | tail -1)"
fi
if [ -z "$EXT_DIR" ]; then
  echo "Could not find an installed redhat.java extension under ~/.vscode-oss or ~/.vscode." >&2
  echo "Install it first, e.g.: codium --install-extension redhat.java" >&2
  exit 1
fi

PLUGINS_DIR="$EXT_DIR/server/plugins"
echo "Using redhat.java server plugins from: $PLUGINS_DIR"

NEEDED_PATTERNS=(
  "org.eclipse.jdt.core_*.jar"
  "org.eclipse.jdt.core.compiler.batch_*.jar"
  "org.eclipse.core.resources_*.jar"
  "org.eclipse.core.runtime_*.jar"
  "org.eclipse.core.filesystem_*.jar"
  "org.eclipse.core.jobs_*.jar"
  "org.eclipse.core.contenttype_*.jar"
  "org.eclipse.equinox.common_*.jar"
  "org.eclipse.equinox.preferences_*.jar"
  "org.eclipse.osgi_*.jar"
  "org.eclipse.text_*.jar"
  "org.osgi.service.prefs_*.jar"
)

for pattern in "${NEEDED_PATTERNS[@]}"; do
  match="$(find "$PLUGINS_DIR" -maxdepth 1 -iname "$pattern" | head -1)"
  if [ -z "$match" ]; then
    echo "WARNING: no jar matching $pattern found in $PLUGINS_DIR" >&2
    continue
  fi
  cp "$match" "$LIB_DIR/"
  echo "Copied $(basename "$match")"
done

echo "Done. Jars staged in $LIB_DIR (gitignored, not committed)."
