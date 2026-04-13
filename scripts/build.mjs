import { spawn } from 'node:child_process';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      shell: false,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with code ${code ?? 'n/a'} signal ${signal ?? 'n/a'}`));
    });
  });
}

async function main() {
  await run('npm', ['run', 'desktop:build']);

  const prefix = process.env.GR4_PREFIX_PATH || process.env.GR4_PREFIX;
  if (prefix) {
    await run('node', ['scripts/install-desktop.mjs', '--prefix', prefix]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
