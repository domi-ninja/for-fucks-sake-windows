#!/usr/bin/env node

'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

async function run(args = process.argv.slice(2)) {
  const helpRequested = args.includes('--help') || args.includes('-h');

  if (helpRequested) {
    printUsage();
    return 0;
  }

  if (args.length > 0) {
    console.error(`ffs wt: unknown argument: ${args[0]}`);
    printUsage();
    return 1;
  }

  if (process.platform !== 'win32') {
    console.error('ffs wt is only available on Windows.');
    return 1;
  }

  const scriptPath = path.join(__dirname, '..', 'tools', 'worktree-manager.ps1');
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

function printUsage() {
  console.log('Usage: ffs wt');
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
