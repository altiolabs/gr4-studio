import fs from 'node:fs/promises';
import path from 'node:path';

function parsePrefix(argv) {
  const prefixIndex = argv.indexOf('--prefix');
  if (prefixIndex !== -1 && argv[prefixIndex + 1]) {
    return argv[prefixIndex + 1];
  }

  const equalsArg = argv.find((arg) => arg.startsWith('--prefix='));
  if (equalsArg) {
    return equalsArg.slice('--prefix='.length);
  }

  return process.env.PREFIX || process.env.GR4_STUDIO_PREFIX;
}

async function main() {
  const prefix = parsePrefix(process.argv.slice(2));
  if (!prefix) {
    throw new Error('Missing prefix. Pass --prefix <path> or set PREFIX.');
  }

  const projectRoot = process.cwd();
  const distDir = path.join(projectRoot, 'dist');
  const appDir = path.join(prefix, 'share', 'gr4-studio');
  const binDir = path.join(prefix, 'bin');

  await fs.access(distDir);
  await fs.rm(appDir, { recursive: true, force: true });
  await fs.mkdir(appDir, { recursive: true });
  await fs.mkdir(binDir, { recursive: true });

  await fs.cp(distDir, appDir, { recursive: true, force: true });
  await fs.cp(path.join(projectRoot, 'desktop'), path.join(appDir, 'desktop'), { recursive: true, force: true });

  await fs.writeFile(
    path.join(appDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'gr4-studio',
        productName: 'gr4-studio',
        private: true,
        type: 'module',
        main: 'desktop/main.mjs',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const launcher = [
    '#!/bin/sh',
    'set -eu',
    '',
    'PREFIX="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"',
    'APP_DIR="$PREFIX/share/gr4-studio"',
    'WORKSPACE_ROOT="$(CDPATH= cd -- "$PREFIX/.." && pwd)"',
    'SOURCE_ELECTRON="$WORKSPACE_ROOT/src/gr4-studio/node_modules/.bin/electron"',
    'REMOTE_EXPLICIT_URL="${GR4_STUDIO_CONTROL_PLANE_BASE_URL:-}"',
    'BACKEND_URL="http://127.0.0.1:8080"',
    'REMOTE_REQUESTED="0"',
    '',
    'for arg in "$@"; do',
    '  case "$arg" in',
    '    --remote|--remote=*) REMOTE_REQUESTED="1" ;;',
    '    --local) REMOTE_REQUESTED="0" ;;',
    '  esac',
    'done',
    '',
    'if [ -n "$REMOTE_EXPLICIT_URL" ]; then',
    '  REMOTE_REQUESTED="1"',
    'fi',
    '',
    'export PATH="$PREFIX/bin:${PATH:-}"',
    'export CMAKE_PREFIX_PATH="$PREFIX${CMAKE_PREFIX_PATH:+:${CMAKE_PREFIX_PATH}}"',
    'export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig:$PREFIX/lib64/pkgconfig:$PREFIX/share/pkgconfig${PKG_CONFIG_PATH:+:${PKG_CONFIG_PATH}}"',
    'export LD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"',
    'export DYLD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64${DYLD_LIBRARY_PATH:+:${DYLD_LIBRARY_PATH}}"',
    'export PYTHONPATH="$PREFIX/lib/python3/site-packages${PYTHONPATH:+:${PYTHONPATH}}"',
    'export GNURADIO4_PLUGIN_DIRECTORIES="$PREFIX/lib${GNURADIO4_PLUGIN_DIRECTORIES:+:${GNURADIO4_PLUGIN_DIRECTORIES}}"',
    'export GR4_STUDIO_PREFIX="$PREFIX"',
    'export GR4_STUDIO_BACKEND_MODE="local"',
    '',
    'BACKEND_LOG_DIR="$PREFIX/var/logs"',
    'BACKEND_LOG_FILE="$BACKEND_LOG_DIR/gr4cp_server.log"',
    'mkdir -p "$BACKEND_LOG_DIR"',
    '',
    'BACKEND_PID=""',
    'ELECTRON_PID=""',
    '',
    'cleanup() {',
    '  if [ -n "$ELECTRON_PID" ] && kill -0 "$ELECTRON_PID" >/dev/null 2>&1; then',
    '    kill "$ELECTRON_PID" >/dev/null 2>&1 || true',
    '    wait "$ELECTRON_PID" >/dev/null 2>&1 || true',
    '  fi',
    '  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then',
    '    kill "$BACKEND_PID" >/dev/null 2>&1 || true',
    '    wait "$BACKEND_PID" >/dev/null 2>&1 || true',
    '  fi',
    '}',
    'on_int() {',
    '  cleanup',
    '  exit 130',
    '}',
    'on_term() {',
    '  cleanup',
    '  exit 143',
    '}',
    'trap cleanup EXIT',
    'trap on_int INT',
    'trap on_term TERM',
    '',
    'if [ -n "$REMOTE_EXPLICIT_URL" ]; then',
    '  export GR4_STUDIO_CONTROL_PLANE_BASE_URL="$REMOTE_EXPLICIT_URL"',
    '  export GR4_STUDIO_BACKEND_MODE="remote"',
    'fi',
    '',
    'launch_electron() {',
    '  if [ -n "${GR4_STUDIO_ELECTRON_BIN:-}" ]; then',
    '    "$GR4_STUDIO_ELECTRON_BIN" "$APP_DIR" "$@" &',
    '    ELECTRON_PID="$!"',
    '    wait "$ELECTRON_PID"',
    '    return "$?"',
    '  fi',
    '',
    '  if [ -x "$SOURCE_ELECTRON" ]; then',
    '    "$SOURCE_ELECTRON" "$APP_DIR" "$@" &',
    '    ELECTRON_PID="$!"',
    '    wait "$ELECTRON_PID"',
    '    return "$?"',
    '  fi',
    '',
    '  npx --yes electron@35.6.0 "$APP_DIR" "$@" &',
    '  ELECTRON_PID="$!"',
    '  wait "$ELECTRON_PID"',
    '  return "$?"',
    '}',
    '',
    'if [ "$REMOTE_REQUESTED" = "0" ]; then',
    '  if ! command -v gr4cp_server >/dev/null 2>&1; then',
    '    echo "gr4cp_server not found on PATH" >&2',
    '    exit 127',
    '  fi',
    '',
    '  gr4cp_server >"$BACKEND_LOG_FILE" 2>&1 &',
    '  BACKEND_PID="$!"',
    '  export GR4_STUDIO_BACKEND_MODE="local"',
    '  export GR4_STUDIO_CONTROL_PLANE_BASE_URL="$BACKEND_URL"',
    '  echo "[gr4-studio] Using local backend $GR4_STUDIO_CONTROL_PLANE_BASE_URL" >&2',
    'else',
    '  echo "[gr4-studio] Using remote backend $GR4_STUDIO_CONTROL_PLANE_BASE_URL" >&2',
    'fi',
    '',
    'launch_electron "$@"',
    '',
  ].join('\n');

  const launcherPath = path.join(binDir, 'gr4-studio');
  await fs.writeFile(launcherPath, launcher, 'utf8');
  await fs.chmod(launcherPath, 0o755);

  console.log(`Installed desktop launcher to ${launcherPath}`);
  console.log(`Installed frontend assets to ${appDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
