#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
const CONFIG_FILE_NAME = '.ffsfindignore';
const DEFAULT_IGNORE_PATTERNS = [
    '^\\./(?:.*/)?\\.[^/]+(?:/|$)',
    '^\\./(?:.*/)?(?:node_modules|bower_components|jspm_packages)(?:/|$)',
    '^\\./(?:.*/)?(?:build|coverage|dist|obj|out|target)(?:/|$)',
    '^\\./(?:.*/)?(?:__pycache__|tmp|temp)(?:/|$)',
];
async function run(args = process.argv.slice(2), context = {}) {
    if (args.length > 0) {
        console.error('Usage: ffs find');
        return 1;
    }
    const cwd = context.cwd || process.cwd();
    let ignoreRegexes;
    try {
        ignoreRegexes = loadIgnoreRegexes(cwd);
    }
    catch (error) {
        console.error(formatError(error));
        return 1;
    }
    let hadError = false;
    for (const entryPath of walk(cwd)) {
        console.log(formatFindPath(cwd, entryPath));
    }
    return hadError ? 1 : 0;
    function* walk(entryPath) {
        const findPath = formatFindPath(cwd, entryPath);
        if (findPath !== '.' && isIgnored(findPath, ignoreRegexes)) {
            return;
        }
        yield entryPath;
        let stats;
        try {
            stats = fs.lstatSync(entryPath);
        }
        catch (error) {
            hadError = true;
            console.error(`ffs find: ${formatFindPath(cwd, entryPath)}: ${formatError(error)}`);
            return;
        }
        if (!stats.isDirectory() || stats.isSymbolicLink()) {
            return;
        }
        let children;
        try {
            children = fs.readdirSync(entryPath, { withFileTypes: true });
        }
        catch (error) {
            hadError = true;
            console.error(`ffs find: ${formatFindPath(cwd, entryPath)}: ${formatError(error)}`);
            return;
        }
        for (const child of children) {
            yield* walk(path.join(entryPath, child.name));
        }
    }
}
function loadIgnoreRegexes(cwd) {
    const patternSources = [...DEFAULT_IGNORE_PATTERNS];
    const configPath = findConfigPath(cwd);
    if (configPath) {
        patternSources.push(...readConfigPatterns(configPath));
    }
    return patternSources.map((patternSource) => compileIgnoreRegex(patternSource, configPath));
}
function findConfigPath(startPath) {
    let currentPath = fs.realpathSync(startPath);
    while (true) {
        const configPath = path.join(currentPath, CONFIG_FILE_NAME);
        if (fs.existsSync(configPath)) {
            return configPath;
        }
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            return null;
        }
        currentPath = parentPath;
    }
}
function readConfigPatterns(configPath) {
    return fs
        .readFileSync(configPath, 'utf8')
        .split(/\r?\n/)
        .map((line, index) => ({
        lineNumber: index + 1,
        patternSource: line.trim(),
    }))
        .filter(({ patternSource }) => patternSource !== '' && !patternSource.startsWith('#'));
}
function compileIgnoreRegex(pattern, configPath) {
    const patternSource = typeof pattern === 'string' ? pattern : pattern.patternSource;
    try {
        return new RegExp(patternSource, 'i');
    }
    catch (error) {
        if (configPath && pattern && typeof pattern === 'object') {
            throw new Error(`${configPath}:${pattern.lineNumber}: invalid ignore regex: ${formatError(error)}`);
        }
        throw error;
    }
}
function isIgnored(findPath, ignoreRegexes) {
    return ignoreRegexes.some((ignoreRegex) => ignoreRegex.test(findPath));
}
function formatFindPath(rootPath, entryPath) {
    const relativePath = path.relative(rootPath, entryPath);
    if (relativePath === '') {
        return '.';
    }
    return `./${relativePath.split(path.sep).join('/')}`;
}
function formatError(error) {
    return error instanceof Error ? error.message : String(error);
}
export { DEFAULT_IGNORE_PATTERNS, CONFIG_FILE_NAME, formatFindPath, isIgnored, loadIgnoreRegexes, run, };
