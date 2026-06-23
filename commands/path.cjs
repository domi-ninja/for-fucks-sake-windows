#!/usr/bin/env node

'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

async function run() {
  if (process.platform !== 'win32') {
    console.error('ffs path is only available on Windows.');
    return 1;
  }

  const scriptPath = path.join(__dirname, '..', 'tools', 'path-editor.ps1');
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

  return await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode) => {
      resolve(Number.isInteger(exitCode) ? exitCode : 1);
    });
  });
}

if (require.main === module) {
  run()
    .then((exitCode) => {
      process.exitCode = Number.isInteger(exitCode) ? exitCode : 0;
    })
    .catch((error) => {
      console.error(error && error.stack ? error.stack : error);
      process.exitCode = 1;
    });
}

module.exports = {
  run,
};