// Robust build script for electron-builder with verbose logging and fallbacks
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function log(stage, msg) {
  const ts = new Date().toISOString().split('T')[1].replace('Z','');
  console.log(`[build:${stage}] ${ts} ${msg}`);
}

async function exists(p) {
  return fs.promises.access(p, fs.constants.F_OK).then(()=>true).catch(()=>false);
}

/**
 * Run a command with spawn and provide Windows-friendly fallbacks on error (EINVAL etc).
 * Returns a Promise that resolves on exit code 0, rejects otherwise.
 */
function runCommand(command, args = [], options = {}) {
  const env = options.env || process.env;
  return new Promise((resolve, reject) => {
    let triedFallback = false;

    const spawnChild = (cmd, cmdArgs, spawnOpts) => {
      log('exec', `spawning: ${cmd} ${cmdArgs.join(' ')}`);
      let child;
      try {
        child = spawn(cmd, cmdArgs, spawnOpts);
      } catch (err) {
        return { error: err };
      }

      child.on('error', (err) => {
        // If first attempt failed, try fallback
        if (!triedFallback) {
          triedFallback = true;
          log('exec', `spawn error (${err.message}), attempting fallback`);
          // Windows: use cmd.exe /c to run the command
          if (process.platform === 'win32') {
            try {
              const fallback = spawn('cmd.exe', ['/c', cmd, ...cmdArgs], { stdio: 'inherit', env });
              fallback.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} failed (${code})`)));
              fallback.on('error', (e) => reject(e));
            } catch (e) {
              reject(e);
            }
          } else {
            // POSIX: retry with shell:true
            try {
              const fallback = spawn(cmd, cmdArgs, { stdio: 'inherit', shell: true, env });
              fallback.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} failed (${code})`)));
              fallback.on('error', (e) => reject(e));
            } catch (e) {
              reject(e);
            }
          }
        } else {
          reject(err);
        }
      });

      child.on('exit', (code) => {
        if (code === 0) return resolve();
        return reject(new Error(`${cmd} exited with code ${code}`));
      });

      return { child };
    };

    // First attempt: no shell, inherit stdio
    const attempt = spawnChild(command, args, { stdio: 'inherit', shell: false, env });
    if (attempt && attempt.error) {
      // spawn threw synchronously, try fallback immediately
      triedFallback = true;
      const err = attempt.error;
      log('exec', `spawn threw: ${err.message}, attempting fallback`);
      if (process.platform === 'win32') {
        try {
          const fallback = spawn('cmd.exe', ['/c', command, ...args], { stdio: 'inherit', env });
          fallback.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)));
          fallback.on('error', (e) => reject(e));
        } catch (e) { reject(e); }
      } else {
        try {
          const fallback = spawn(command, args, { stdio: 'inherit', shell: true, env });
          fallback.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)));
          fallback.on('error', (e) => reject(e));
        } catch (e) { reject(e); }
      }
    }
  });
}

async function main() {
  const cwd = process.cwd();
  log('start', `CWD: ${cwd}`);

  // Ensure node_modules present
  const nm = path.join(cwd, 'node_modules');
  const hasNM = await exists(nm);
    if (!hasNM) {
      log('deps', 'node_modules missing, running npm install ...');
      // Use runCommand for better Windows handling
      await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install']);
    } else {
      log('deps', 'node_modules found, skipping install');
    }

  // Clean dist folder but keep it existing
  const dist = path.join(cwd, 'dist');
  if (await exists(dist)) {
    log('clean', 'Cleaning dist ...');
    for (const f of await fs.promises.readdir(dist)) {
      await fs.promises.rm(path.join(dist, f), { recursive: true, force: true });
    }
  } else {
    await fs.promises.mkdir(dist, { recursive: true });
  }

  // Run electron-builder (prefer local binary, fallback to npx)
  log('builder', 'Starting electron-builder ...');
  const passArgs = process.argv.slice(2);
  const localBin = process.platform === 'win32'
    ? path.join(cwd, 'node_modules', '.bin', 'electron-builder.cmd')
    : path.join(cwd, 'node_modules', '.bin', 'electron-builder');
  const hasLocal = await exists(localBin);

  // Default to current platform target if none provided
  const hasTargetArg = passArgs.some(a => /^--(win|mac|linux)/.test(a));
  const args = hasTargetArg ? passArgs : [];
  if (!hasTargetArg) {
    if (process.platform === 'win32') args.push('--win');
    else if (process.platform === 'darwin') args.push('--mac');
    else args.push('--linux');
  }

  // Helpful env for mirrors and consistent logs
  const env = {
    ...process.env,
    npm_config_loglevel: process.env.npm_config_loglevel || 'info',
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
    electron_mirror: process.env.electron_mirror || 'https://npmmirror.com/mirrors/electron/',
    SASS_BINARY_SITE: process.env.SASS_BINARY_SITE || 'https://npmmirror.com/mirrors/node-sass/',
  };

  // Execute builder using runCommand which handles platform fallbacks
  if (hasLocal) {
    log('builder', `local ${localBin} ${args.join(' ')}`);
    await runCommand(localBin, args, { env });
  } else {
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const npxArgs = ['electron-builder', ...args];
    log('builder', `npx ${npxCmd} ${npxArgs.join(' ')}`);
    await runCommand(npxCmd, npxArgs, { env });
  }

  // Verify outputs
  log('verify', 'Checking dist outputs ...');
  const items = await fs.promises.readdir(dist).catch(()=>[]);
  if (!items.length) {
    throw new Error('dist is empty after build. Please check builder logs above.');
  }
  for (const it of items) {
    log('artifact', it);
  }
  log('done', 'Build finished successfully.');
}

main().catch(err => {
  console.error('[build:error]', err.stack || err.message);
  process.exit(1);
});
