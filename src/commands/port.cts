#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type ParsedArgs = {
  help: boolean;
  ports: number[];
  error?: string;
};

type ListeningProcess = {
  name: string;
  processId: number;
  ports: number[];
};

async function run(args = process.argv.slice(2)) {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage();
    return 0;
  }

  if (parsed.error) {
    console.error(parsed.error);
    printUsage();
    return 1;
  }

  if (process.platform !== 'win32') {
    console.error('ffs port is only available on Windows.');
    return 1;
  }

  const listeningProcesses = await findListeningProcesses(parsed.ports);

  if (parsed.ports.length === 0) {
    if (listeningProcesses.length === 0) {
      console.log('No processes are listening on TCP ports.');
      return 0;
    }

    for (const processInfo of listeningProcesses) {
      const portLabel = processInfo.ports.length === 1 ? 'port' : 'ports';
      const displayName = processInfo.name || 'process';
      console.log(`${displayName} (${processInfo.processId}) listening on TCP ${portLabel} ${processInfo.ports.join(', ')}.`);
    }

    return 0;
  }

  const listeningPorts = new Set(listeningProcesses.flatMap((processInfo) => processInfo.ports));

  for (const port of parsed.ports) {
    if (!listeningPorts.has(port)) {
      console.log(`No process is listening on TCP port ${port}.`);
    }
  }

  let hadError = false;

  for (const processInfo of listeningProcesses) {
    const portLabel = processInfo.ports.length === 1 ? 'port' : 'ports';
    const displayName = processInfo.name || 'process';

    try {
      process.kill(processInfo.processId, 'SIGKILL');
      console.log(`Killed ${displayName} (${processInfo.processId}) listening on TCP ${portLabel} ${processInfo.ports.join(', ')}.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        console.log(`${displayName} (${processInfo.processId}) stopped before it could be killed.`);
        continue;
      }

      hadError = true;
      console.error(`Could not kill ${displayName} (${processInfo.processId}): ${formatError(error)}`);
    }
  }

  return hadError ? 1 : 0;
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    help: false,
    ports: [],
  };
  const seenPorts = new Set<number>();

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (!/^\d+$/.test(arg)) {
      return { ...parsed, error: `Invalid port: ${arg}. Ports must be integers from 1 to 65535.` };
    }

    const port = Number(arg);

    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
      return { ...parsed, error: `Invalid port: ${arg}. Ports must be integers from 1 to 65535.` };
    }

    if (!seenPorts.has(port)) {
      seenPorts.add(port);
      parsed.ports.push(port);
    }
  }

  return parsed;
}

async function findListeningProcesses(ports: number[]) {
  const powershellStatements = [
    `$ports = @(${ports.join(',')})`,
    '$connections = Get-NetTCPConnection -State Listen -ErrorAction Stop',
  ];

  if (ports.length > 0) {
    powershellStatements.push('$connections = $connections | Where-Object { $ports -contains [int]$_.LocalPort }');
  }

  const powershellScript = [
    ...powershellStatements,
    'foreach ($connection in $connections) {',
    '  $name = (Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue).ProcessName',
    '  [Console]::Out.WriteLine("$($connection.LocalPort)`t$($connection.OwningProcess)`t$name")',
    '}',
  ].join('\n');
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    powershellScript,
  ], {
    encoding: 'utf8',
    windowsHide: true,
  });

  return parseListeningProcesses(stdout);
}

function parseListeningProcesses(output: string) {
  const processesById = new Map<number, { name: string; processId: number; ports: Set<number> }>();

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const [portValue, processIdValue, name = ''] = line.split('\t');
    const port = Number(portValue);
    const processId = Number(processIdValue);

    if (!Number.isInteger(port) || !Number.isInteger(processId)) {
      throw new Error(`Could not parse listening process: ${line}`);
    }

    const processInfo = processesById.get(processId) || {
      name,
      processId,
      ports: new Set<number>(),
    };

    processInfo.ports.add(port);
    processesById.set(processId, processInfo);
  }

  return [...processesById.values()]
    .map<ListeningProcess>((processInfo) => ({
      ...processInfo,
      ports: [...processInfo.ports].sort((left, right) => left - right),
    }))
    .sort((left, right) => left.processId - right.processId);
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function printUsage() {
  console.log('Usage: ffs port [port ...]');
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

export {
  parseArgs,
  parseListeningProcesses,
  run,
};
