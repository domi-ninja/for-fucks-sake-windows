#!/usr/bin/env node

'use strict';

const path = require('node:path');

const commands = new Map([
  ['find', path.join(__dirname, '..', 'commands', 'find.cjs')],
  ['path', path.join(__dirname, '..', 'commands', 'path.cjs')],
  ['test', path.join(__dirname, '..', 'commands', 'test.cjs')],
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
    '  find    List the current directory tree',
    '  path    Open the ffs Path editor GUI',
    '  test    Run dotnet tests from the current working directory',
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
