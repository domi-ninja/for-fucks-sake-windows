#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

type Match = {
  launchPath: string;
  resolvedPath: string;
  installPath: string;
};

const DEFAULT_PATH_EXTENSIONS = '.COM;.EXE;.BAT;.CMD';
const SHIM_TARGET_PATTERN = /(?:%dp0%|\$basedir|\$PSScriptRoot)[\\/]*((?:[^"'\r\n]*?)node_modules[\\/][^"'\r\n]+?)["'\s]/;

async function run(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return 0;
  }

  if (args.length !== 1) {
    printUsage();
    return 1;
  }

  const [name] = args;
  const matches = await findMatches(name);

  if (matches.length === 0) {
    console.log(`${name} was not found on PATH.`);
    return 1;
  }

  const [first, ...shadowed] = matches;

  printMatch(first, '');

  if (shadowed.length > 0) {
    console.log('');
    console.log('also on PATH');

    for (const match of shadowed) {
      printMatch(match, '  ');
    }
  }

  return 0;
}

function printMatch(match: Match, indent: string) {
  console.log(`${indent}${match.installPath}`);
  console.log(`${indent}  runs ${match.launchPath}`);

  if (!isSamePath(match.resolvedPath, match.launchPath)) {
    console.log(`${indent}  links to ${match.resolvedPath}`);
  }
}

async function findMatches(name: string) {
  const matches: Match[] = [];
  const seenInstallPaths = new Set<string>();

  for (const directory of getPathDirectories()) {
    for (const candidateName of getCandidateNames(name)) {
      const launchPath = path.join(directory, candidateName);

      if (!await isFile(launchPath)) {
        continue;
      }

      const resolvedPath = await resolveSymlink(launchPath);
      const packagePath = await resolveNodePackagePath(resolvedPath);
      const installPath = packagePath || path.dirname(resolvedPath);
      const key = installPath.toLowerCase();

      if (seenInstallPaths.has(key)) {
        continue;
      }

      seenInstallPaths.add(key);
      matches.push({ launchPath, resolvedPath, installPath });
    }
  }

  return matches;
}

function isSamePath(left: string, right: string) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function getPathDirectories() {
  const pathValue = process.env.PATH || process.env.Path || '';
  const separator = process.platform === 'win32' ? ';' : ':';
  const directories: string[] = [];
  const seen = new Set<string>();

  for (const entry of pathValue.split(separator)) {
    const directory = entry.trim().replace(/^"(.*)"$/, '$1');

    if (!directory) {
      continue;
    }

    const key = process.platform === 'win32' ? directory.toLowerCase() : directory;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    directories.push(directory);
  }

  return directories;
}

function getCandidateNames(name: string) {
  if (process.platform !== 'win32') {
    return [name];
  }

  const extensions = (process.env.PATHEXT || DEFAULT_PATH_EXTENSIONS)
    .split(';')
    .map((extension) => extension.trim())
    .filter((extension) => extension.length > 0);

  if (!extensions.some((extension) => extension.toLowerCase() === '.ps1')) {
    extensions.push('.PS1');
  }

  const nameExtension = path.extname(name);

  if (nameExtension && extensions.some((extension) => extension.toLowerCase() === nameExtension.toLowerCase())) {
    return [name];
  }

  return [...extensions.map((extension) => `${name}${extension.toLowerCase()}`), name];
}

async function isFile(candidatePath: string) {
  try {
    const stats = await fs.stat(candidatePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function resolveSymlink(candidatePath: string) {
  try {
    return await fs.realpath(candidatePath);
  } catch {
    return candidatePath;
  }
}

async function resolveNodePackagePath(executablePath: string) {
  const shimTarget = await readShimTarget(executablePath);

  if (!shimTarget) {
    return undefined;
  }

  const targetPath = path.resolve(path.dirname(executablePath), shimTarget.replace(/\//g, path.sep));
  const packagePath = getNodePackagePath(targetPath);

  if (!packagePath || !await isFile(path.join(packagePath, 'package.json'))) {
    return undefined;
  }

  return packagePath;
}

async function readShimTarget(executablePath: string) {
  const extension = path.extname(executablePath).toLowerCase();

  if (extension && extension !== '.cmd' && extension !== '.bat' && extension !== '.ps1') {
    return undefined;
  }

  let content;

  try {
    content = await fs.readFile(executablePath, 'utf8');
  } catch {
    return undefined;
  }

  if (content.includes('\0')) {
    return undefined;
  }

  return SHIM_TARGET_PATTERN.exec(content)?.[1];
}

function getNodePackagePath(targetPath: string) {
  const segments = targetPath.split(/[\\/]/);
  const moduleIndex = segments.lastIndexOf('node_modules');

  if (moduleIndex === -1) {
    return undefined;
  }

  const nameLength = segments[moduleIndex + 1]?.startsWith('@') ? 2 : 1;
  const packageSegments = segments.slice(0, moduleIndex + 1 + nameLength);

  if (packageSegments.length < moduleIndex + 1 + nameLength) {
    return undefined;
  }

  return packageSegments.join(path.sep);
}

function printUsage() {
  console.log('Usage: ffs which <command>');
}

export {
  findMatches,
  getCandidateNames,
  getNodePackagePath,
  run,
};
