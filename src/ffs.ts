#!/usr/bin/env node

import * as az from './commands/az.js';
import * as find from './commands/find.js';
import * as memory from './commands/memory.js';
import * as pathCommand from './commands/path.js';
import * as port from './commands/port.js';
import * as test from './commands/test.js';
import * as unlock from './commands/unlock.js';
import * as wt from './commands/wt.js';
import { pathToFileURL } from 'node:url';

type CommandContext = {
  commandName: string;
  cwd: string;
};

type Command = (args: string[], context: CommandContext) => number | Promise<number>;

const commands = new Map<string, Command>([
  ['az', (args) => az.run(args)],
  ['find', (args, context) => find.run(args, context)],
  ['memory', (args) => memory.run(args)],
  ['path', () => pathCommand.run()],
  ['port', (args) => port.run(args)],
  ['test', (args, context) => test.run(args, context)],
  ['unlock', (args, context) => unlock.run(args, context)],
  ['wt', (args) => wt.run(args)],
]);

async function main(argv = process.argv.slice(2)) {
  const [commandName, ...commandArgs] = argv;

  if (!commandName || commandName === 'help' || commandName === '--help' || commandName === '-h') {
    printHelp();
    return 0;
  }

  const command = commands.get(commandName);

  if (!command) {
    console.error(`Unknown command: ${commandName}`);
    printHelp();
    return 1;
  }

  return await command(commandArgs, {
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
    '  memory  List and dump all local AI-tool memories',
    '  path    Open the ffs Path editor GUI',
    '  port    List listeners or kill them by TCP port',
    '  test    Run dotnet tests from the current working directory',
    '  unlock  Keep killing processes that lock a file or folder',
    '  wt      Open the T3 worktree manager GUI',
  ].join('\n'));
}

const entryPath = process.argv[1];

if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.stack : error);
      process.exitCode = 1;
    });
}

export {
  main,
};