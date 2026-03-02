import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

let emulatorProcess = null;
let startedByUs = false;

async function isEmulatorRunning() {
  try {
    await fetch('http://127.0.0.1:5001');
    return true;
  } catch {
    return false;
  }
}

export async function setup() {
  if (await isEmulatorRunning()) {
    console.log('[test] Emulators already running, skipping startup');
    return;
  }

  console.log('[test] Starting Firebase emulators...');
  emulatorProcess = spawn(
    'firebase',
    ['emulators:start', '--only', 'auth,firestore,functions'],
    {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  startedByUs = true;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Firebase emulators did not start within 90s'));
    }, 90000);

    emulatorProcess.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(`[emulator] ${text}`);
      if (text.includes('All emulators ready!')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    emulatorProcess.stderr.on('data', (data) => {
      process.stderr.write(`[emulator] ${data}`);
    });

    emulatorProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    emulatorProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Emulator process exited with code ${code}`));
      }
    });
  });

  console.log('[test] Emulators ready');
}

export async function teardown() {
  if (startedByUs && emulatorProcess) {
    console.log('[test] Stopping emulators...');
    emulatorProcess.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 2000));
  }
}
