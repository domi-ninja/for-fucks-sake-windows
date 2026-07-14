#!/usr/bin/env node

'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const DEFAULT_INTERVAL_MILLISECONDS = 1000;

async function run(args = process.argv.slice(2), context = {}) {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage();
    return 0;
  }

  if (parsed.error) {
    console.error(parsed.error);
    printUsage();
    return 1;
  }

  if (process.platform !== 'win32') {
    console.error('ffs unlock is only available on Windows.');
    return 1;
  }

  const cwd = context.cwd || process.cwd();
  const targetPath = path.resolve(cwd, parsed.targetPath);
  const scriptPath = path.join(__dirname, '..', 'tools', 'unlock.ps1');
  const powershellArgs = [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-TargetPath',
    targetPath,
    '-IntervalMilliseconds',
    String(parsed.intervalMilliseconds),
  ];

  if (parsed.once) {
    powershellArgs.push('-Once');
  }

  const child = spawn('powershell.exe', powershellArgs, {
    cwd,
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

function parseArgs(args) {
  const parsed = {
    help: false,
    intervalMilliseconds: DEFAULT_INTERVAL_MILLISECONDS,
    once: false,
    targetPath: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--once') {
      parsed.once = true;
      continue;
    }

    if (arg === '--interval' || arg === '--interval-ms') {
      index += 1;
      if (index >= args.length) {
        return { error: `${arg} requires a value.` };
      }

      const intervalMilliseconds = parseIntervalMilliseconds(args[index]);
      if (!intervalMilliseconds) {
        return { error: `${arg} must be a positive integer.` };
      }

      parsed.intervalMilliseconds = intervalMilliseconds;
      continue;
    }

    if (arg.startsWith('--interval=')) {
      const intervalMilliseconds = parseIntervalMilliseconds(arg.slice('--interval='.length));
      if (!intervalMilliseconds) {
        return { error: '--interval must be a positive integer.' };
      }

      parsed.intervalMilliseconds = intervalMilliseconds;
      continue;
    }

    if (arg.startsWith('--')) {
      return { error: `Unknown option: ${arg}` };
    }

    if (parsed.targetPath) {
      return { error: 'ffs unlock accepts exactly one file or folder path.' };
    }

    parsed.targetPath = arg;
  }

  if (!parsed.targetPath && !parsed.help) {
    return { error: 'ffs unlock requires a file or folder path.' };
  }

  return parsed;
}

function parseIntervalMilliseconds(value) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const intervalMilliseconds = Number(value);
  return Number.isSafeInteger(intervalMilliseconds) && intervalMilliseconds > 0
    ? intervalMilliseconds
    : null;
}

function printUsage() {
  console.log([
    'Usage: ffs unlock [--once] [--interval <milliseconds>] <file-or-folder>',
    '',
    'Options:',
    '  --once                       Kill current locking processes and exit',
    '  --interval <milliseconds>    Poll interval while watching (default: 1000)',
  ].join('\n'));
}

if (require.main === module) {
  run(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = Number.isInteger(exitCode) ? exitCode : 0;
    })
    .catch((error) => {
      console.error(error && error.stack ? error.stack : error);
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_INTERVAL_MILLISECONDS,
  parseArgs,
  run,
};