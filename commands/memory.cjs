#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMemoryFiles = deleteMemoryFiles;
exports.findMemoryFiles = findMemoryFiles;
exports.run = run;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
async function run(args = process.argv.slice(2), context = {}) {
    if (args.includes('--help') || args.includes('-h')) {
        printUsage();
        return 0;
    }
    const deleteMemories = args.length === 1 && args[0] === 'sucks';
    if (args.length > 0 && !deleteMemories) {
        printUsage();
        return 1;
    }
    if (process.platform !== 'win32') {
        console.error('ffs memory is only available on Windows.');
        return 1;
    }
    const workspaceStoragePath = context.workspaceStoragePath || getWorkspaceStoragePath();
    const memoryFiles = await findMemoryFiles(workspaceStoragePath);
    if (memoryFiles.length === 0) {
        console.log(`No Copilot memories found under ${workspaceStoragePath}.`);
        return 0;
    }
    if (deleteMemories) {
        return await deleteMemoryFiles(memoryFiles);
    }
    let hadError = false;
    for (const memoryFile of memoryFiles) {
        console.log(`\n=== ${memoryFile} ===\n`);
        try {
            const content = await node_fs_1.promises.readFile(memoryFile, 'utf8');
            process.stdout.write(content);
            if (!content.endsWith('\n')) {
                process.stdout.write('\n');
            }
        }
        catch (error) {
            hadError = true;
            console.error(`Could not read ${memoryFile}: ${formatError(error)}`);
        }
    }
    return hadError ? 1 : 0;
}
async function deleteMemoryFiles(memoryFiles) {
    let hadError = false;
    for (const memoryFile of memoryFiles) {
        try {
            await node_fs_1.promises.unlink(memoryFile);
            console.log(`Deleted ${memoryFile}`);
        }
        catch (error) {
            hadError = true;
            console.error(`Could not delete ${memoryFile}: ${formatError(error)}`);
        }
    }
    return hadError ? 1 : 0;
}
function getWorkspaceStoragePath() {
    const appDataPath = process.env.APPDATA;
    if (!appDataPath) {
        throw new Error('APPDATA is not set.');
    }
    return node_path_1.default.join(appDataPath, 'Code', 'User', 'workspaceStorage');
}
async function findMemoryFiles(workspaceStoragePath) {
    const workspaceEntries = await node_fs_1.promises.readdir(workspaceStoragePath, { withFileTypes: true });
    const memoryFiles = [];
    for (const workspaceEntry of workspaceEntries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!workspaceEntry.isDirectory()) {
            continue;
        }
        const memoryPath = node_path_1.default.join(workspaceStoragePath, workspaceEntry.name, 'GitHub.copilot-chat', 'memory-tool', 'memories');
        try {
            memoryFiles.push(...await findFiles(memoryPath));
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    return memoryFiles;
}
async function findFiles(directoryPath) {
    const entries = await node_fs_1.promises.readdir(directoryPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const entryPath = node_path_1.default.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...await findFiles(entryPath));
        }
        else if (entry.isFile()) {
            files.push(entryPath);
        }
    }
    return files;
}
function formatError(error) {
    return error instanceof Error ? error.message : String(error);
}
function printUsage() {
    console.log([
        'Usage:',
        '  ffs memory',
        '  ffs memory sucks',
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
