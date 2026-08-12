#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_INTERVAL_MILLISECONDS = void 0;
exports.parseArgs = parseArgs;
exports.run = run;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const koffi = require('koffi');
const DEFAULT_INTERVAL_MILLISECONDS = 1000;
exports.DEFAULT_INTERVAL_MILLISECONDS = DEFAULT_INTERVAL_MILLISECONDS;
const CCH_RM_MAX_APP_NAME = 255;
const CCH_RM_MAX_SVC_NAME = 63;
const CCH_RM_SESSION_KEY = 32;
const ERROR_MORE_DATA = 234;
const ERROR_SUCCESS = 0;
const RESTART_MANAGER_BATCH_SIZE = 128;
const FILETIME = koffi.struct('FILETIME', {
    dwLowDateTime: 'uint32_t',
    dwHighDateTime: 'uint32_t',
});
const RM_UNIQUE_PROCESS = koffi.struct('RM_UNIQUE_PROCESS', {
    dwProcessId: 'uint32_t',
    ProcessStartTime: FILETIME,
});
const RM_PROCESS_INFO = koffi.struct('RM_PROCESS_INFO', {
    Process: RM_UNIQUE_PROCESS,
    strAppName: koffi.array('char16_t', CCH_RM_MAX_APP_NAME + 1, 'String'),
    strServiceShortName: koffi.array('char16_t', CCH_RM_MAX_SVC_NAME + 1, 'String'),
    ApplicationType: 'uint32_t',
    AppStatus: 'uint32_t',
    TSSessionId: 'uint32_t',
    bRestartable: 'int32_t',
});
const PROCESS_INFO_SIZE = koffi.sizeof(RM_PROCESS_INFO);
const PROCESS_ID_OFFSET = koffi.offsetof(RM_PROCESS_INFO, 'Process') + koffi.offsetof(RM_UNIQUE_PROCESS, 'dwProcessId');
const APP_NAME_OFFSET = koffi.offsetof(RM_PROCESS_INFO, 'strAppName');
const SERVICE_SHORT_NAME_OFFSET = koffi.offsetof(RM_PROCESS_INFO, 'strServiceShortName');
let restartManager = null;
async function run(args = process.argv.slice(2), context = {}) {
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
        console.error('ffs unlock is only available on Windows.');
        return 1;
    }
    const cwd = context.cwd || process.cwd();
    const targetPath = path.resolve(cwd, parsed.targetPath || '');
    if (!parsed.once) {
        console.log(`Watching ${targetPath} for locking processes. Press Ctrl+C to stop.`);
    }
    while (true) {
        const resourcePaths = getResourcePaths(targetPath);
        const lockingProcesses = getLockingProcessInfo(resourcePaths);
        if (lockingProcesses.length === 0) {
            if (parsed.once) {
                console.log(`No locking processes found for ${targetPath}.`);
                return 0;
            }
            await delay(parsed.intervalMilliseconds);
            continue;
        }
        const success = stopLockingProcesses(lockingProcesses);
        if (parsed.once) {
            return success ? 0 : 1;
        }
        await delay(parsed.intervalMilliseconds);
    }
}
function parseArgs(args) {
    const parsed = {
        help: false,
        intervalMilliseconds: DEFAULT_INTERVAL_MILLISECONDS,
        once: false,
        targetPath: null,
    };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--help' || arg === '-h') {
            parsed.help = true;
            continue;
        }
        if (arg === '--once') {
            parsed.once = true;
            continue;
        }
        if (arg === '--interval' || arg === '--interval-ms') {
            index += 1;
            if (index >= args.length) {
                return { ...parsed, error: `${arg} requires a value.` };
            }
            const intervalMilliseconds = parseIntervalMilliseconds(args[index]);
            if (!intervalMilliseconds) {
                return { ...parsed, error: `${arg} must be a positive integer.` };
            }
            parsed.intervalMilliseconds = intervalMilliseconds;
            continue;
        }
        if (arg.startsWith('--interval=')) {
            const intervalMilliseconds = parseIntervalMilliseconds(arg.slice('--interval='.length));
            if (!intervalMilliseconds) {
                return { ...parsed, error: '--interval must be a positive integer.' };
            }
            parsed.intervalMilliseconds = intervalMilliseconds;
            continue;
        }
        if (arg.startsWith('--')) {
            return { ...parsed, error: `Unknown option: ${arg}` };
        }
        if (parsed.targetPath) {
            return { ...parsed, error: 'ffs unlock accepts exactly one file or folder path.' };
        }
        parsed.targetPath = arg;
    }
    if (!parsed.targetPath && !parsed.help) {
        return { ...parsed, error: 'ffs unlock requires a file or folder path.' };
    }
    return parsed;
}
function parseIntervalMilliseconds(value) {
    if (!/^\d+$/.test(value)) {
        return null;
    }
    const intervalMilliseconds = Number(value);
    return Number.isSafeInteger(intervalMilliseconds) && intervalMilliseconds > 0
        ? intervalMilliseconds
        : null;
}
function getResourcePaths(targetPath) {
    const stats = fs.statSync(targetPath);
    if (stats.isFile()) {
        return [targetPath];
    }
    if (!stats.isDirectory()) {
        throw new Error(`Target is not a file or folder: ${targetPath}`);
    }
    const resourcePaths = [targetPath];
    const pendingDirectories = [targetPath];
    while (pendingDirectories.length > 0) {
        const directory = pendingDirectories.pop();
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const entryPath = path.join(directory, entry.name);
            resourcePaths.push(entryPath);
            if (entry.isDirectory() && !entry.isSymbolicLink()) {
                pendingDirectories.push(entryPath);
            }
        }
    }
    return resourcePaths;
}
function getLockingProcessInfo(resourcePaths) {
    const processesById = new Map();
    for (let index = 0; index < resourcePaths.length; index += RESTART_MANAGER_BATCH_SIZE) {
        const batch = resourcePaths.slice(index, index + RESTART_MANAGER_BATCH_SIZE);
        try {
            addLockingProcessInfo(processesById, getLockingProcessesForBatch(batch));
            continue;
        }
        catch (error) {
            if (batch.length === 1) {
                console.warn(`Skipping Restart Manager query for ${batch[0]}: ${formatError(error)}`);
                continue;
            }
        }
        for (const resourcePath of batch) {
            try {
                addLockingProcessInfo(processesById, getLockingProcessesForBatch([resourcePath]));
            }
            catch (error) {
                console.warn(`Skipping Restart Manager query for ${resourcePath}: ${formatError(error)}`);
            }
        }
    }
    return [...processesById.values()].sort((left, right) => left.processId - right.processId);
}
function addLockingProcessInfo(processesById, processes) {
    for (const processInfo of processes) {
        processesById.set(processInfo.processId, processInfo);
    }
}
function getLockingProcessesForBatch(resourcePaths) {
    if (resourcePaths.length === 0) {
        return [];
    }
    const rm = getRestartManager();
    const sessionHandleBuffer = Buffer.alloc(4);
    const sessionKeyBuffer = Buffer.alloc((CCH_RM_SESSION_KEY + 1) * 2);
    let result = rm.RmStartSession(sessionHandleBuffer, 0, sessionKeyBuffer);
    throwIfFailed(result, 'RmStartSession');
    const sessionHandle = sessionHandleBuffer.readUInt32LE(0);
    try {
        result = rm.RmRegisterResources(sessionHandle, resourcePaths.length, resourcePaths, 0, null, 0, null);
        throwIfFailed(result, 'RmRegisterResources');
        const processInfoNeededBuffer = Buffer.alloc(4);
        const processInfoCountBuffer = Buffer.alloc(4);
        const rebootReasonsBuffer = Buffer.alloc(4);
        result = rm.RmGetList(sessionHandle, processInfoNeededBuffer, processInfoCountBuffer, null, rebootReasonsBuffer);
        if (result === ERROR_SUCCESS) {
            return [];
        }
        if (result !== ERROR_MORE_DATA) {
            throwIfFailed(result, 'RmGetList');
        }
        const processInfoNeeded = processInfoNeededBuffer.readUInt32LE(0);
        processInfoCountBuffer.writeUInt32LE(processInfoNeeded, 0);
        const processInfoBuffer = Buffer.alloc(PROCESS_INFO_SIZE * processInfoNeeded);
        result = rm.RmGetList(sessionHandle, processInfoNeededBuffer, processInfoCountBuffer, processInfoBuffer, rebootReasonsBuffer);
        throwIfFailed(result, 'RmGetList');
        const processInfoCount = processInfoCountBuffer.readUInt32LE(0);
        const lockingProcesses = [];
        for (let index = 0; index < processInfoCount; index += 1) {
            lockingProcesses.push(readProcessInfo(processInfoBuffer, index * PROCESS_INFO_SIZE));
        }
        return lockingProcesses;
    }
    finally {
        rm.RmEndSession(sessionHandle);
    }
}
function readProcessInfo(buffer, offset) {
    return {
        appName: readNullTerminatedUtf16(buffer, offset + APP_NAME_OFFSET, CCH_RM_MAX_APP_NAME + 1),
        processId: buffer.readUInt32LE(offset + PROCESS_ID_OFFSET),
        serviceShortName: readNullTerminatedUtf16(buffer, offset + SERVICE_SHORT_NAME_OFFSET, CCH_RM_MAX_SVC_NAME + 1),
    };
}
function readNullTerminatedUtf16(buffer, offset, maxCharacters) {
    const limit = offset + maxCharacters * 2;
    let end = offset;
    while (end < limit && buffer.readUInt16LE(end) !== 0) {
        end += 2;
    }
    return buffer.toString('utf16le', offset, end);
}
function stopLockingProcesses(lockingProcesses) {
    let hadError = false;
    for (const processInfo of lockingProcesses) {
        if (processInfo.processId === process.pid) {
            continue;
        }
        try {
            const displayName = processInfo.appName || processInfo.serviceShortName || 'process';
            console.log(`Killing ${displayName} (${processInfo.processId})`);
            process.kill(processInfo.processId, 'SIGKILL');
        }
        catch (error) {
            if (error.code === 'ESRCH') {
                continue;
            }
            hadError = true;
            console.error(formatError(error));
        }
    }
    return !hadError;
}
function getRestartManager() {
    restartManager ??= loadRestartManager();
    return restartManager;
}
function loadRestartManager() {
    const rstrtmgr = koffi.load('rstrtmgr.dll');
    return {
        RmStartSession: rstrtmgr.func('uint32_t __stdcall RmStartSession(uint32_t *pSessionHandle, uint32_t dwSessionFlags, char16_t *strSessionKey)'),
        RmRegisterResources: rstrtmgr.func('uint32_t __stdcall RmRegisterResources(uint32_t dwSessionHandle, uint32_t nFiles, const char16_t **rgsFileNames, uint32_t nApplications, RM_UNIQUE_PROCESS *rgApplications, uint32_t nServices, const char16_t **rgsServiceNames)'),
        RmGetList: rstrtmgr.func('uint32_t __stdcall RmGetList(uint32_t dwSessionHandle, uint32_t *pnProcInfoNeeded, uint32_t *pnProcInfo, RM_PROCESS_INFO *rgAffectedApps, uint32_t *lpdwRebootReasons)'),
        RmEndSession: rstrtmgr.func('uint32_t __stdcall RmEndSession(uint32_t dwSessionHandle)'),
    };
}
function throwIfFailed(result, operation) {
    if (result !== ERROR_SUCCESS) {
        throw new Error(`${operation} failed with Windows error ${result}`);
    }
}
function delay(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}
function formatError(error) {
    return error instanceof Error ? error.message : String(error);
}
function printUsage() {
    console.log([
        'Usage: ffs unlock [--once] [--interval <milliseconds>] <file-or-folder>',
        '',
        'Options:',
        '  --once                       Kill current locking processes and exit',
        '  --interval <milliseconds>    Poll interval while watching (default: 1000)',
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
