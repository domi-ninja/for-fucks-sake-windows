#!/usr/bin/env node

'use strict';

const path = require('node:path');

const commands = new Map([
  ['az', path.join(__dirname, '..', 'commands', 'az.cjs')],
  ['find', path.join(__dirname, '..', 'commands', 'find.cjs')],
  ['path', path.join(__dirname, '..', 'commands', 'path.cjs')],
  ['port', path.join(__dirname, '..', 'commands', 'port.cjs')],
  ['test', path.join(__dirname, '..', 'commands', 'test.cjs')],
  ['unlock', path.join(__dirname, '..', 'commands', 'unlock.cjs')],
  ['wt', path.join(__dirname, '..', 'commands', 'wt.cjs')],
]);

async function main(argv = process.argv.slice(2)) {
  const [commandName, ...commandArgs] = argv;

  if (!commandName || commandName === 'help' || commandName === '--help' || commandName === '-h') {
    printHelp();
    return 0;
  }

  const commandPath = commands.get(commandName);

  if (!commandPath) {
    console.error(`Unknown command: ${commandName}`);
    printHelp();
    return 1;
  }

  const command = require(commandPath);

  if (typeof command.run !== 'function') {
    console.error(`Command "${commandName}" does not export a run() function.`);
    return 1;
  }

  return await command.run(commandArgs, {
    cwd: process.cwd(),
    commandName,
  });
}

function printHelp() {
  console.log([
    'Usage: ffs <command> [args]',
    '',
    'Commands:',
    '  az      Check the Azure CLI sign-in and pick the active subscription',
    '  find    List the current directory tree',
    '  path    Open the ffs Path editor GUI',
    '  port    List listeners or kill them by TCP port',
    '  test    Run dotnet tests from the current working directory',
    '  unlock  Keep killing processes that lock a file or folder',
    '  wt      Open the T3 worktree manager GUI',
  ].join('\n'));
}

if (require.main === module) {
  main()
    .then((exitCode) => {
      process.exitCode = Number.isInteger(exitCode) ? exitCode : 0;
    })
    .catch((error) => {
      console.error(error && error.stack ? error.stack : error);
      process.exitCode = 1;
    });
}

module.exports = {
  main,
};
