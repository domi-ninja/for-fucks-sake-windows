#!/usr/bin/env node
import * as az from './commands/az.js';
import * as find from './commands/find.js';
import * as memory from './commands/memory.js';
import * as pathCommand from './commands/path.js';
import * as port from './commands/port.js';
import * as test from './commands/test.js';
import * as unlock from './commands/unlock.js';
import * as which from './commands/which.js';
import * as wt from './commands/wt.js';
import { pathToFileURL } from 'node:url';
const commandDefinitions = [
    { path: ['find'], run: (args, context) => find.run(args, context) },
    { path: ['port'], run: (args) => port.run(args) },
    { path: ['unlock'], run: (args, context) => unlock.run(args, context) },
    { path: ['which'], run: (args) => which.run(args) },
    { path: ['path'], run: () => pathCommand.run() },
    { path: ['dotnet', 'test'], run: (args, context) => test.run(args, context) },
    { path: ['cloud', 'az'], run: (args) => az.run(args) },
    { path: ['agent', 'memory'], run: (args) => memory.run(args) },
    { path: ['agent', 't3', 'worktrees'], run: (args) => wt.run(args) },
];
const commandTree = createCommandTree(commandDefinitions);
async function main(argv = process.argv.slice(2)) {
    const [firstArg] = argv;
    if (!firstArg || firstArg === 'help' || firstArg === '--help' || firstArg === '-h') {
        printHelp();
        return 0;
    }
    const resolved = resolveCommand(commandTree, argv);
    if (!resolved) {
        console.error(`Unknown command: ${argv.join(' ')}`);
        printHelp();
        return 1;
    }
    const commandName = resolved.definition.path.join(' ');
    return await resolved.definition.run(resolved.args, {
        cwd: process.cwd(),
        commandName,
    });
}
function createCommandTree(definitions) {
    const root = { children: new Map() };
    for (const definition of definitions) {
        let node = root;
        for (const segment of definition.path) {
            let child = node.children.get(segment);
            if (!child) {
                child = { children: new Map() };
                node.children.set(segment, child);
            }
            node = child;
        }
        if (node.definition) {
            throw new Error(`Duplicate command path: ${definition.path.join(' ')}`);
        }
        node.definition = definition;
    }
    return root;
}
function resolveCommand(root, args) {
    let node = root;
    let resolved = null;
    for (let index = 0; index < args.length; index += 1) {
        const child = node.children.get(args[index]);
        if (!child) {
            break;
        }
        node = child;
        if (node.definition) {
            resolved = {
                definition: node.definition,
                argumentOffset: index + 1,
            };
        }
    }
    if (!resolved) {
        return null;
    }
    return {
        definition: resolved.definition,
        args: args.slice(resolved.argumentOffset),
    };
}
function printHelp() {
    console.log(renderHelp(process.stdout.isTTY === true));
}
function renderHelp(useFormatting) {
    const heading = (text) => useFormatting
        ? `\x1b[1m${text}\x1b[22m`
        : text;
    return [
        heading('shell'),
        '  find    List the current directory tree',
        '  port [port-to-kill] [second-port-to-kill]    List listeners or kill them by TCP port',
        '  unlock [path]    Keep killing processes that lock a file or folder',
        '  path    Open the ffs PATH variable editor GUI because the Windows built-in one is a dumpster fire',
        '  which <command>    Show where a command on PATH is installed',
        '',
        heading('dotnet'),
        '  dotnet test    Run dotnet tests from the current working directory',
        '',
        heading('cloud'),
        '  cloud az    Check the Azure CLI sign-in and pick the active subscription',
        '',
        heading('agent'),
        '  agent memory [purge]    List and dump all local AI-tool memories. Optionally purge',
        '  agent t3 worktrees    Open the T3 worktree manager GUI',
    ].join('\n');
}
const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
    main()
        .then((exitCode) => {
        process.exitCode = exitCode;
    })
        .catch((error) => {
        console.error(error instanceof Error ? error.stack : error);
        process.exitCode = 1;
    });
}
export { commandDefinitions, createCommandTree, main, renderHelp, resolveCommand, };
