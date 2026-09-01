#!/usr/bin/env node
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
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
            resolve(typeof exitCode === 'number' ? exitCode : 1);
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
export { findSolution, run, };
