#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function run() {
  if (process.platform !== 'win32') {
    console.error('ffs path is only available on Windows.');
    return 1;
  }

  const scriptPath = fileURLToPath(new URL('../../tools/path-editor.ps1', import.meta.url));
  const child = spawn('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-STA',
    '-File',
    scriptPath,
  ], {
    stdio: 'inherit',
    windowsHide: false,
  });

  return await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode) => {
      resolve(typeof exitCode === 'number' ? exitCode : 1);
    });
  });
}

export {
  run,
};