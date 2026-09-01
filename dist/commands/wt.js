#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
async function run(args = process.argv.slice(2)) {
    const helpRequested = args.includes('--help') || args.includes('-h');
    if (helpRequested) {
        printUsage();
        return 0;
    }
    if (args.length > 0) {
        console.error(`ffs agent t3 worktrees: unknown argument: ${args[0]}`);
        printUsage();
        return 1;
    }
    if (process.platform !== 'win32') {
        console.error('ffs agent t3 worktrees is only available on Windows.');
        return 1;
    }
    const scriptPath = fileURLToPath(new URL('../../tools/worktree-manager.ps1', import.meta.url));
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
            resolve(typeof exitCode === 'number' ? exitCode : 1);
        });
    });
}
function printUsage() {
    console.log('Usage: ffs agent t3 worktrees');
}
export { run, };
