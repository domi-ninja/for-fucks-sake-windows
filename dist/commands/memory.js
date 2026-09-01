#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
async function run(args = process.argv.slice(2), context = {}) {
    if (args.includes('--help') || args.includes('-h')) {
        printUsage();
        return 0;
    }
    const deleteMemories = args.length === 1 && args[0] === 'purge';
    if (args.length > 0 && !deleteMemories) {
        printUsage();
        return 1;
    }
    if (process.platform !== 'win32') {
        console.error('ffs agent memory is only available on Windows.');
        return 1;
    }
    const workspaceStoragePath = context.workspaceStoragePath || getWorkspaceStoragePath();
    const homePath = context.homePath || getHomePath();
    const memoryFiles = [
        ...await findMemoryFiles(workspaceStoragePath),
        ...await findClaudeMemoryFiles(homePath),
        ...await findFilesIfExists(path.join(homePath, '.codex', 'memories')),
    ].sort((left, right) => left.localeCompare(right));
    if (memoryFiles.length === 0) {
        console.log('No supported AI memories found.');
        return 0;
    }
    if (deleteMemories) {
        return await deleteMemoryFiles(memoryFiles);
    }
    let hadError = false;
    for (const memoryFile of memoryFiles) {
        console.log(`\n=== ${memoryFile} ===\n`);
        try {
            const content = await fs.readFile(memoryFile, 'utf8');
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
            await fs.unlink(memoryFile);
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
    return path.join(appDataPath, 'Code', 'User', 'workspaceStorage');
}
function getHomePath() {
    const homePath = process.env.USERPROFILE;
    if (!homePath) {
        throw new Error('USERPROFILE is not set.');
    }
    return homePath;
}
async function findMemoryFiles(workspaceStoragePath) {
    let workspaceEntries;
    try {
        workspaceEntries = await fs.readdir(workspaceStoragePath, { withFileTypes: true });
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    const memoryFiles = [];
    for (const workspaceEntry of workspaceEntries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!workspaceEntry.isDirectory()) {
            continue;
        }
        const memoryPath = path.join(workspaceStoragePath, workspaceEntry.name, 'GitHub.copilot-chat', 'memory-tool', 'memories');
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
async function findClaudeMemoryFiles(homePath) {
    const projectsPath = path.join(homePath, '.claude', 'projects');
    let projectEntries;
    try {
        projectEntries = await fs.readdir(projectsPath, { withFileTypes: true });
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    const memoryFiles = [];
    for (const projectEntry of projectEntries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!projectEntry.isDirectory()) {
            continue;
        }
        const memoryPath = path.join(projectsPath, projectEntry.name, 'memory');
        memoryFiles.push(...await findFilesIfExists(memoryPath));
    }
    return memoryFiles;
}
async function findFilesIfExists(directoryPath) {
    try {
        return await findFiles(directoryPath);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}
async function findFiles(directoryPath) {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const entryPath = path.join(directoryPath, entry.name);
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
        '  ffs agent memory',
        '  ffs agent memory purge',
    ].join('\n'));
}
export { deleteMemoryFiles, findClaudeMemoryFiles, findMemoryFiles, run, };
