#!/usr/bin/env node
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline';
const SAFE_ARGUMENT_PATTERN = /^[A-Za-z0-9._@:-]+$/;
const VIEWPORT_SIZE = 12;
const ESC = String.fromCharCode(27);
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_BELOW = `${ESC}[0J`;
const INVERSE = `${ESC}[7m`;
const RESET = `${ESC}[0m`;
function cursorUp(lineCount) {
    return `${ESC}[${lineCount}A`;
}
async function run(args = process.argv.slice(2), context = {}) {
    let options;
    try {
        options = parseArgs(args);
    }
    catch (error) {
        console.error(formatError(error));
        printUsage();
        return 1;
    }
    if (options.help) {
        printUsage();
        return 0;
    }
    const azRunner = context.runAz || runAz;
    const edgeLocator = context.findEdge || findEdge;
    const configuredAccount = await readConfiguredAccount(azRunner);
    let account = configuredAccount && await hasValidAccessToken(azRunner)
        ? configuredAccount
        : null;
    if (options.statusOnly) {
        printStatus(account);
        return account ? 0 : 1;
    }
    if (!account || options.forceLogin || options.tenant) {
        if (account) {
            console.log(`Signed in as ${account.user.name}, signing in again.`);
        }
        else if (configuredAccount) {
            console.log(`Sign-in expired for ${configuredAccount.user.name}.`);
        }
        else {
            console.log('Not signed in.');
        }
        const loginTenant = options.tenant || (configuredAccount && configuredAccount.tenantId);
        if (!options.tenant && loginTenant) {
            console.log(`Reauthenticating tenant ${loginTenant}.`);
        }
        const loginExitCode = await login(loginTenant, azRunner, edgeLocator);
        if (loginExitCode !== 0) {
            return loginExitCode;
        }
        account = await readActiveAccount(azRunner);
        if (!account) {
            console.error('ffs az: login did not produce an active account.');
            return 1;
        }
    }
    printStatus(account);
    const subscriptions = await readSubscriptions(options.tenant, azRunner);
    if (subscriptions.length === 0) {
        console.error(options.tenant
            ? `ffs az: no enabled subscriptions found in tenant ${options.tenant}.`
            : 'ffs az: no enabled subscriptions found.');
        return 1;
    }
    const activeIndex = Math.max(subscriptions.findIndex((subscription) => subscription.id === account.id), 0);
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error('ffs az: no interactive terminal, cannot show the account picker.');
        printSubscriptions(subscriptions, activeIndex);
        return 1;
    }
    const selectedIndex = await selectFromList(subscriptions, {
        title: 'Select subscription (type to filter, enter to select, esc to cancel)',
        initialIndex: activeIndex,
        format: formatSubscription,
    });
    if (selectedIndex === null) {
        console.log('Cancelled.');
        return 1;
    }
    const selected = subscriptions[selectedIndex];
    if (selected.id === account.id) {
        console.log(`Already using ${selected.name}.`);
        return 0;
    }
    const setExitCode = await azRunner(['account', 'set', '--subscription', selected.id]);
    if (setExitCode !== 0) {
        return setExitCode;
    }
    console.log(`Now using ${selected.name} (${selected.id}) in tenant ${selected.tenantId}.`);
    return 0;
}
function parseArgs(args) {
    const options = {
        help: false,
        statusOnly: false,
        forceLogin: false,
        tenant: null,
    };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--help' || arg === '-h') {
            options.help = true;
        }
        else if (arg === '--status') {
            options.statusOnly = true;
        }
        else if (arg === '--login') {
            options.forceLogin = true;
        }
        else if (arg === '--tenant') {
            index += 1;
            options.tenant = args[index];
            if (!options.tenant || !SAFE_ARGUMENT_PATTERN.test(options.tenant)) {
                throw new Error(`ffs az: invalid tenant: ${options.tenant ?? '(missing)'}`);
            }
        }
        else {
            throw new Error(`ffs az: unknown argument: ${arg}`);
        }
    }
    return options;
}
function printUsage() {
    console.log([
        'Usage: ffs az [--tenant <tenant>] [--login] [--status]',
        '',
        '  (no args)  Verify the sign-in, then pick the active subscription',
        '  --tenant   Sign in to and filter subscriptions by this tenant',
        '  --login    Sign in again even when the current token still works',
        '  --status   Print the current account and exit',
    ].join('\n'));
}
function printStatus(account) {
    if (!account) {
        console.log('Not signed in.');
        return;
    }
    console.log(`Signed in as ${account.user.name}`);
    console.log(`  subscription  ${account.name} (${account.id})`);
    console.log(`  tenant        ${account.tenantId}`);
}
function printSubscriptions(subscriptions, activeIndex) {
    subscriptions.forEach((subscription, index) => {
        console.error(`${index === activeIndex ? '*' : ' '} ${formatSubscription(subscription)}`);
    });
}
function formatSubscription(subscription) {
    return `${subscription.name}  ${subscription.tenantId}`;
}
async function readConfiguredAccount(azRunner = runAz) {
    const shown = await azRunner(['account', 'show', '--output', 'json'], { capture: true });
    if (shown.exitCode !== 0) {
        return null;
    }
    let account;
    try {
        account = JSON.parse(shown.stdout);
    }
    catch {
        return null;
    }
    return parseAccount(account);
}
async function hasValidAccessToken(azRunner = runAz) {
    const token = await azRunner(['account', 'get-access-token', '--output', 'none'], { capture: true });
    return token.exitCode === 0;
}
async function readActiveAccount(azRunner = runAz) {
    const account = await readConfiguredAccount(azRunner);
    if (!account || !await hasValidAccessToken(azRunner)) {
        return null;
    }
    return account;
}
async function readSubscriptions(tenant, azRunner = runAz) {
    const listed = await azRunner(['account', 'list', '--output', 'json'], { capture: true });
    if (listed.exitCode !== 0) {
        process.stderr.write(listed.stderr);
        return [];
    }
    let subscriptions;
    try {
        subscriptions = JSON.parse(listed.stdout);
    }
    catch {
        return [];
    }
    if (!Array.isArray(subscriptions)) {
        return [];
    }
    return subscriptions
        .filter(isAzSubscription)
        .filter((subscription) => subscription.state === 'Enabled')
        .filter((subscription) => !tenant || matchesTenant(subscription, tenant))
        .sort((left, right) => left.name.localeCompare(right.name));
}
function matchesTenant(subscription, tenant) {
    const wanted = tenant.toLowerCase();
    return (String(subscription.tenantId).toLowerCase() === wanted ||
        String(subscription.tenantDefaultDomain || '').toLowerCase() === wanted ||
        String(subscription.tenantDisplayName || '').toLowerCase() === wanted);
}
async function login(tenant, azRunner = runAz, edgeLocator = findEdge) {
    const loginArgs = ['login', '--output', 'none'];
    if (tenant) {
        loginArgs.push('--tenant', tenant);
    }
    const edgePath = edgeLocator();
    if (!edgePath) {
        console.log('Microsoft Edge not found, using the default browser.');
        return await azRunner(loginArgs);
    }
    console.log('Opening Microsoft Edge to sign in.');
    return await azRunner(loginArgs, { env: edgeBrowserEnv(edgePath) });
}
// The Azure CLI opens the sign-in page through Python's webbrowser module, which
// prefers the BROWSER command. Putting Edge on PATH keeps BROWSER free of the
// spaces in "Program Files" that the module does not quote.
function edgeBrowserEnv(edgePath) {
    return {
        ...process.env,
        BROWSER: path.basename(edgePath),
        PATH: `${path.dirname(edgePath)}${path.delimiter}${process.env.PATH || ''}`,
    };
}
function findEdge() {
    if (process.platform !== 'win32') {
        return null;
    }
    const roots = [
        process.env['ProgramFiles(x86)'],
        process.env.ProgramFiles,
        process.env.LOCALAPPDATA,
    ];
    for (const root of roots) {
        if (!root) {
            continue;
        }
        const edgePath = path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
        if (fs.existsSync(edgePath)) {
            return edgePath;
        }
    }
    return null;
}
function runAz(args, { capture = false, env = process.env } = {}) {
    return new Promise((resolve, reject) => {
        // az ships as az.cmd on Windows, which needs a shell. Every argument here is
        // a literal, a GUID, or a tenant checked against SAFE_ARGUMENT_PATTERN, so
        // cmd.exe has nothing to re-interpret.
        const isWindows = process.platform === 'win32';
        const command = isWindows ? process.env.ComSpec || 'cmd.exe' : 'az';
        const commandArgs = isWindows ? ['/d', '/s', '/c', 'az', ...args] : args;
        const child = spawn(command, commandArgs, {
            env,
            stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        if (capture) {
            if (!child.stdout || !child.stderr) {
                reject(new Error('ffs az: could not capture Azure CLI output.'));
                return;
            }
            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', (chunk) => {
                stdout += chunk;
            });
            child.stderr.on('data', (chunk) => {
                stderr += chunk;
            });
        }
        child.once('error', (error) => {
            reject(new Error(`ffs az: could not run the Azure CLI: ${error.message}`));
        });
        child.once('close', (exitCode) => {
            const resolvedExitCode = typeof exitCode === 'number' ? exitCode : 1;
            resolve(capture ? { exitCode: resolvedExitCode, stdout, stderr } : resolvedExitCode);
        });
    });
}
function selectFromList(items, { title, initialIndex = 0, format }) {
    return new Promise((resolve) => {
        const output = process.stdout;
        const input = process.stdin;
        let filter = '';
        let matches = items.map((_item, index) => index);
        let cursor = Math.max(matches.indexOf(initialIndex), 0);
        let offset = 0;
        let renderedLines = 0;
        const wasRaw = input.isRaw;
        readline.emitKeypressEvents(input);
        input.setRawMode(true);
        input.resume();
        output.write(HIDE_CURSOR);
        input.on('keypress', onKeypress);
        render();
        function onKeypress(sequence, key) {
            if (!key) {
                return;
            }
            if (key.ctrl && key.name === 'c') {
                finish(null);
                return;
            }
            if (key.name === 'escape') {
                finish(null);
                return;
            }
            if (key.name === 'return' || key.name === 'enter') {
                finish(matches.length > 0 ? matches[cursor] : null);
                return;
            }
            if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
                move(-1);
                return;
            }
            if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
                move(1);
                return;
            }
            if (key.name === 'pageup') {
                move(-VIEWPORT_SIZE);
                return;
            }
            if (key.name === 'pagedown') {
                move(VIEWPORT_SIZE);
                return;
            }
            if (key.name === 'backspace') {
                setFilter(filter.slice(0, -1));
                return;
            }
            if (sequence && !key.ctrl && !key.meta && sequence.length === 1 && sequence >= ' ') {
                setFilter(filter + sequence);
            }
        }
        function move(delta) {
            if (matches.length === 0) {
                return;
            }
            cursor = Math.min(Math.max(cursor + delta, 0), matches.length - 1);
            render();
        }
        function setFilter(nextFilter) {
            filter = nextFilter;
            const needle = filter.toLowerCase();
            matches = items
                .map((_item, index) => index)
                .filter((index) => format(items[index]).toLowerCase().includes(needle));
            cursor = 0;
            offset = 0;
            render();
        }
        function render() {
            if (cursor < offset) {
                offset = cursor;
            }
            else if (cursor >= offset + VIEWPORT_SIZE) {
                offset = cursor - VIEWPORT_SIZE + 1;
            }
            const lines = [`${title}`, `> ${filter}`];
            if (matches.length === 0) {
                lines.push('  (no matches)');
            }
            for (const index of matches.slice(offset, offset + VIEWPORT_SIZE)) {
                const isSelected = matches[cursor] === index;
                const marker = isSelected ? '>' : ' ';
                const text = `${marker} ${format(items[index])}`;
                lines.push(isSelected ? `${INVERSE}${text}${RESET}` : text);
            }
            if (matches.length > offset + VIEWPORT_SIZE) {
                lines.push(`  ... ${matches.length - offset - VIEWPORT_SIZE} more`);
            }
            if (renderedLines > 0) {
                output.write(cursorUp(renderedLines));
            }
            output.write(CLEAR_BELOW);
            output.write(`${lines.join('\n')}\n`);
            renderedLines = lines.length;
        }
        function finish(selectedIndex) {
            input.off('keypress', onKeypress);
            input.setRawMode(Boolean(wasRaw));
            input.pause();
            if (renderedLines > 0) {
                output.write(cursorUp(renderedLines));
                output.write(CLEAR_BELOW);
            }
            output.write(SHOW_CURSOR);
            resolve(selectedIndex);
        }
    });
}
function parseAccount(value) {
    if (!isRecord(value)
        || typeof value.id !== 'string'
        || typeof value.name !== 'string'
        || typeof value.tenantId !== 'string') {
        return null;
    }
    const userName = isRecord(value.user) && typeof value.user.name === 'string'
        ? value.user.name
        : 'unknown';
    return {
        id: value.id,
        name: value.name,
        tenantId: value.tenantId,
        user: { name: userName },
    };
}
function isAzSubscription(value) {
    return isRecord(value)
        && typeof value.id === 'string'
        && typeof value.name === 'string'
        && typeof value.state === 'string'
        && typeof value.tenantId === 'string'
        && (value.tenantDefaultDomain === undefined || typeof value.tenantDefaultDomain === 'string')
        && (value.tenantDisplayName === undefined || typeof value.tenantDisplayName === 'string');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function formatError(error) {
    return error instanceof Error ? error.message : String(error);
}
export { formatSubscription, hasValidAccessToken, login, matchesTenant, parseArgs, readActiveAccount, readConfiguredAccount, run, selectFromList, };
