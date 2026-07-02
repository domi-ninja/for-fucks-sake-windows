#!/usr/bin/env node

'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

async function run(args = process.argv.slice(2), context = {}) {
  const repoRoot = fs.realpathSync(context.cwd || process.cwd());
  const solutionPath = findSolution(repoRoot);
  const artifactsPath = path.join(repoRoot, '.artifacts', 'test');

  fs.mkdirSync(artifactsPath, { recursive: true });

  const dotnetArgs = [
    'test',
    solutionPath,
    '--artifacts-path',
    artifactsPath,
    ...args,
  ];

  const child = spawn('dotnet', dotnetArgs, {
    cwd: repoRoot,
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

function findSolution(repoRoot) {
  const solutionNames = fs
    .readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.slnx?$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => {
      const leftIsSlnx = left.toLowerCase().endsWith('.slnx');
      const rightIsSlnx = right.toLowerCase().endsWith('.slnx');

      if (leftIsSlnx === rightIsSlnx) {
        return left.localeCompare(right);
      }

      return leftIsSlnx ? -1 : 1;
    });

  if (solutionNames.length === 0) {
    throw new Error(`No .slnx or .sln file found in ${repoRoot}`);
  }

  if (solutionNames.length > 1) {
    throw new Error(`Multiple solution files found in ${repoRoot}: ${solutionNames.join(', ')}`);
  }

  return path.join(repoRoot, solutionNames[0]);
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
  findSolution,
  run,
};