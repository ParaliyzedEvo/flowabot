/**
 * Shared command-testing core.
 *
 * Used by:
 *   - test-commands.js     (terminal:  node test-commands.js)
 *   - commands/testall.js  (Discord:   !!testall)
 *
 *
 * A command file can also define its own `testInputs: ['name arg1 arg2']`.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const objectPath = require('object-path');

const COMMANDS_DIR = path.resolve(__dirname, 'commands');
const LOG_DIR = path.resolve(__dirname, 'logs', 'command-tests');
const TEST_CHANNEL_ID = 'flowabot-test-channel';
const TEST_USER_ID = 'flowabot-test-user';

const SIDE_EFFECT_SKIP = {
    'osu-track': 'changes the osu! tracking list',
    'osu-untrack': 'changes the osu! tracking list',
    'ign-set': 'overwrites a stored osu! username'
};

// Never run, regardless of flags.
const ALWAYS_SKIP = {
    'testall': 'would run the whole suite inside itself'
};

// Extra inputs, typed the way you'd type them after the prefix. Use this for
// commands that have no `example` in their file, or where you want more cases.
const EXTRA_INPUTS = {
    query: ['query SELECT 1'],
    flowabot: ['flowabot'],
    np: ['np'],
    scamge: ['scamge'],
    streamin: ['streamin'],
    w: ['w;']
};

// Commands that legitimately take longer than the default per-test timeout (milliseconds).
const TIMEOUT_OVERRIDES = { scamge: 240000, render: 120000 };

// Beatmap seeded for the fake test channel so `with`, `compare`, `render`... have something to work on.
const SEED_LAST_BEATMAP = { beatmap_id: 75, mods: [], acc: 100, fail_percent: 1, rank: 'A' };

/* ------------------------------------------------------------------ helpers */

const sleep = ms => new Promise(r => setTimeout(r, ms));

const clip = (s, n = 90) => {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

const names = mod => [].concat(mod.command ?? []).map(String);

function withTimeout(promise, ms) {
    if (!ms) return Promise.resolve(promise);

    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject(Object.assign(new Error(`timed out after ${ms}ms`), { isTimeout: true }));
        }, ms);
    });

    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function errorInfo(err) {
    if (err instanceof Error)
        return { kind: 'crash', message: `${err.name}: ${err.message}`, full: err.stack ?? String(err) };

    if (typeof err === 'string')
        return { kind: 'rejected', message: err, full: err };

    return {
        kind: 'rejected',
        message: clip(util.inspect(err, { depth: 1, breakLength: Infinity }), 200),
        full: util.inspect(err, { depth: 3 })
    };
}

// What msg.channel.send() resolves to in tests. Commands such as render call methods on it
// (e.g. createMessageComponentCollector), so it needs more than id/edit/delete.
function fakeSentMessage() {
    const collector = {
        on() { return collector; },
        once() { return collector; },
        stop() {},
        removeAllListeners() { return collector; }
    };

    return {
        id: 'flowabot-test-sent-message',
        edit: async () => fakeSentMessage(),
        delete: async () => {},
        react: async () => {},
        reply: async () => fakeSentMessage(),
        createMessageComponentCollector: () => collector,
        createReactionCollector: () => collector,
        awaitMessageComponent: () => new Promise(() => {})
    };
}

function loadCommandModules(dir = COMMANDS_DIR) {
    const loaded = [], broken = [];

    for (const file of fs.readdirSync(dir).sort()) {
        if (path.extname(file) !== '.js') continue;

        try {
            const mod = require(path.resolve(dir, file));
            if (!mod || typeof mod.call !== 'function')
                throw new Error('file does not export a call() function');
            loaded.push({ file, mod });
        } catch (err) {
            broken.push({ file, error: err });
        }
    }

    return { loaded, broken };
}

function unavailableReasons(mod, { config, client }) {
    const reasons = [];
    const arr = v => v === undefined ? [] : Array.isArray(v) ? v : [v];

    const envRequired = arr(mod.envRequired);
    arr(mod.configRequired).forEach((configPath, i) => {
        const envName = envRequired[i];
        if (envName && process.env[envName]) return;

        if (!objectPath.has(config, configPath))
            reasons.push(`config option ${configPath} not set`);
        else {
            const value = objectPath.get(config, configPath);
            if (value != null && value.length === 0)
                reasons.push(`config option ${configPath} is empty`);
        }
    });

    arr(mod.folderRequired).forEach(folder => {
        if (!fs.existsSync(path.resolve(__dirname, folder)))
            reasons.push(`required folder ${folder} does not exist`);
    });

    // Only checkable when a real Discord client is available (not in terminal mode).
    if (mod.intentRequired && client?.options?.intents) {
        const { IntentsBitField } = require('discord.js');
        const have = new IntentsBitField(client.options.intents).toArray();
        arr(mod.intentRequired).forEach(intent => {
            if (!have.includes(intent)) reasons.push(`required intent ${intent} not given`);
        });
    }

    return reasons;
}

function buildInputs(mod) {
    const name = names(mod)[0];
    const examples = [].concat(mod.example ?? [])
        .map(ex => typeof ex === 'string' ? ex : ex?.run)
        .filter(Boolean);

    let inputs = [...[].concat(mod.testInputs ?? []), ...examples, ...(EXTRA_INPUTS[name] ?? [])]
        .map(s => s.trim())
        .filter(Boolean);

    inputs = [...new Set(inputs)];

    let auto = false;
    if (inputs.length === 0) {
        auto = true;
        const filler = Array(mod.argsRequired ?? 0).fill('test');
        inputs = [[name, ...filler].join(' ')];
    }

    return { inputs, auto };
}

function planTests({ modules, filters = [], includeAll = false, config, client }) {
    const { loaded, broken } = modules ?? loadCommandModules();
    const lowered = filters.map(f => f.toLowerCase());

    const matches = (mod, file) => lowered.length === 0 || lowered.some(f =>
        names(mod).some(n => n.toLowerCase().includes(f)) || file.toLowerCase().includes(f));

    const cases = [], skipped = [], brokenMatched = [];

    for (const { file, mod } of loaded) {
        if (!matches(mod, file)) continue;

        const name = names(mod)[0] ?? file;
        const skipReason = ALWAYS_SKIP[name]
            ? `never run: ${ALWAYS_SKIP[name]}`
            : (!includeAll && SIDE_EFFECT_SKIP[name])
                ? `skipped by default: ${SIDE_EFFECT_SKIP[name]} (use "all" to include)`
                : unavailableReasons(mod, { config, client }).join('; ') || null;

        if (skipReason) {
            skipped.push({ command: name, file, reason: skipReason });
            continue;
        }

        const { inputs, auto } = buildInputs(mod);
        inputs.forEach(input => cases.push({ mod, file, command: name, input, auto }));
    }

    for (const b of broken) {
        if (lowered.length === 0 || lowered.some(f => b.file.toLowerCase().includes(f)))
            brokenMatched.push(b);
    }

    return { cases, skipped, broken: brokenMatched };
}

function checkPayload(payload, label = 'response') {
    const problems = [];

    if (typeof payload === 'string') {
        if (payload.length > 2000) problems.push(`${label}: text is ${payload.length} chars (Discord max 2000)`);
        return problems;
    }
    if (!payload || typeof payload !== 'object') return problems;

    if (typeof payload.content === 'string' && payload.content.length > 2000)
        problems.push(`${label}: content is ${payload.content.length} chars (Discord max 2000)`);

    const embeds = payload.embeds ?? [];
    if (embeds.length > 10) problems.push(`${label}: ${embeds.length} embeds (max 10)`);

    let totalChars = 0;
    embeds.forEach((embed, i) => {
        const e = embed?.data ?? embed ?? {};
        const where = `${label}: embeds[${i}]`;
        const len = (s) => (typeof s === 'string' ? s.length : 0);

        if (len(e.title) > 256) problems.push(`${where}.title is ${len(e.title)} chars (max 256)`);
        if (len(e.description) > 4096) problems.push(`${where}.description is ${len(e.description)} chars (max 4096)`);
        if (len(e.footer?.text) > 2048) problems.push(`${where}.footer.text too long (max 2048)`);
        if (len(e.author?.name) > 256) problems.push(`${where}.author.name too long (max 256)`);

        totalChars += len(e.title) + len(e.description) + len(e.footer?.text) + len(e.author?.name);

        const fields = e.fields ?? [];
        if (fields.length > 25) problems.push(`${where} has ${fields.length} fields (max 25)`);

        fields.forEach((f, j) => {
            if (f?.name == null || f.name === '') problems.push(`${where}.fields[${j}].name is empty`);
            if (f?.value == null || f.value === '') problems.push(`${where}.fields[${j}].value is empty`);
            if (len(f?.name) > 256) problems.push(`${where}.fields[${j}].name too long (max 256)`);
            if (len(f?.value) > 1024) problems.push(`${where}.fields[${j}].value is ${len(f.value)} chars (max 1024)`);
            totalChars += len(f?.name) + len(f?.value);
        });
    });

    if (totalChars > 6000) problems.push(`${label}: embeds total ${totalChars} chars (max 6000)`);

    if ((payload.files?.length ?? 0) > 10) problems.push(`${label}: ${payload.files.length} files (max 10)`);

    const empty = !payload.content && embeds.length === 0
        && !(payload.files?.length) && !(payload.components?.length) && !(payload.stickers?.length);
    if (empty) problems.push(`${label}: no content, embeds or files (Discord rejects empty messages)`);

    return problems;
}

function summarizeResponse(response, sent) {
    const parts = [];

    if (response == null || response === '') {
        if (sent.length === 0) return 'no response';
    } else if (typeof response === 'string') {
        parts.push(`text: ${clip(response)}`);
    } else if (typeof response === 'object') {
        if (response.content) parts.push(`text: ${clip(response.content)}`);

        const embeds = response.embeds ?? [];
        if (embeds.length) {
            const first = embeds[0]?.data ?? embeds[0] ?? {};
            const title = first.title || first.author?.name || first.description;
            parts.push(`${embeds.length} embed${embeds.length > 1 ? 's' : ''}${title ? ` (${clip(title, 40)})` : ''}`);
        }

        const files = response.files ?? [];
        if (files.length) {
            const fileNames = files.map(f => f?.name ?? (typeof f === 'string' ? path.basename(f) : 'file')).join(', ');
            parts.push(`${files.length} file${files.length > 1 ? 's' : ''} (${clip(fileNames, 40)})`);
        }

        if (parts.length === 0) parts.push(`object {${Object.keys(response).join(', ')}}`);
    }

    if (sent.length) parts.push(`${sent.length} direct channel.send call${sent.length > 1 ? 's' : ''}`);

    return parts.join(' | ');
}

function looksLikeUsageHelp(response) {
    const fields = response?.embeds?.[0]?.fields ?? response?.embeds?.[0]?.data?.fields;
    if (!Array.isArray(fields)) return false;
    return /^Command/.test(fields[0]?.name ?? '') && fields.some(f => f.name === 'Usage' || f.name === 'Description');
}

async function runCase(testCase, ctx) {
    const { mod, file, command, input, auto } = testCase;
    const { makeMsg, client, user_ign, last_beatmap, last_message, deliver } = ctx;
    // Some commands (scamge, render) are legitimately slow, so give them a longer limit than the default.
    const timeoutMs = ctx.timeoutMs ? Math.max(ctx.timeoutMs, TIMEOUT_OVERRIDES[command] ?? 0) : 0;

    const argv = input.split(' ');
    const { msg, sent } = makeMsg(input);

    const result = { command, file, input, auto, status: 'PASS', kind: null, detail: '', full: '', ms: 0 };
    const started = Date.now();

    try {
        let response = await withTimeout(
            Promise.resolve().then(() => mod.call({ msg, argv, client, user_ign, last_beatmap, last_message })),
            timeoutMs
        );

        let editPromise, replacePromise, removePath;

        if (response && typeof response === 'object') {
            ({ edit_promise: editPromise, replace_promise: replacePromise, remove_path: removePath } = response);
            response = { ...response };
            delete response.edit_promise;
            delete response.replace_promise;
            delete response.remove_path;
        }

        const [editResult, replaceResult] = await withTimeout(Promise.all([editPromise, replacePromise]), timeoutMs);

        const cleanup = [removePath, replaceResult?.remove_path].filter(Boolean);
        cleanup.forEach(p => fs.promises.rm(p, { recursive: true, force: true }).catch(() => {}));

        const problems = [
            ...checkPayload(response, 'response'),
            ...(editResult ? checkPayload(editResult, 'edit') : []),
            ...(replaceResult ? checkPayload(replaceResult, 'replace') : [])
        ];

        result.summary = summarizeResponse(response, sent);

        if (problems.length) {
            result.status = 'FAIL';
            result.kind = 'payload';
            result.detail = `invalid Discord payload: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`;
            result.full = problems.join('\n');
        } else if ((response == null || response === '') && sent.length === 0 && !editResult && !replaceResult) {
            result.status = 'WARN';
            result.detail = 'command returned nothing';
        } else if (command !== 'help' && looksLikeUsageHelp(response)) {
            result.status = 'WARN';
            result.detail = 'returned its usage/help embed (input rejected?)';
        } else {
            result.detail = result.summary;
        }

        if (deliver && response && result.status !== 'FAIL') {
            try {
                await withTimeout(deliver(response), timeoutMs);
            } catch (err) {
                const info = errorInfo(err);
                result.status = 'FAIL';
                result.kind = 'send';
                result.detail = `Discord rejected the message: ${clip(info.message, 160)}`;
                result.full = info.full;
            }
        }
    } catch (err) {
        const info = errorInfo(err);

        if (err?.isTimeout && sent.length > 0) {
            result.status = 'WARN';
            result.detail = `${err.message}, but it already sent ${sent.length} message(s) via channel.send `
                + `(never resolves, or just slow; as a slash command it would hang on "thinking...")`;
        } else if (err?.isTimeout) {
            result.status = 'TIMEOUT';
            result.detail = err.message;
        } else {
            result.status = 'FAIL';
            result.kind = info.kind;
            result.detail = `${info.kind === 'crash' ? 'crash' : 'rejected'}: ${clip(info.message, 200)}`;
        }
        result.full = info.full;
    }

    result.ms = Date.now() - started;
    return result;
}

// index.js calls process.exit() on uncaughtException. While tests run we swap
// those listeners out so a stray async error inside one command can't kill the
// whole run (or the bot), then put them back afterwards.
function installProcessGuards(onError) {
    const saved = {
        uncaughtException: process.listeners('uncaughtException'),
        unhandledRejection: process.listeners('unhandledRejection')
    };

    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    process.on('uncaughtException', onError);
    process.on('unhandledRejection', onError);

    return () => {
        process.removeListener('uncaughtException', onError);
        process.removeListener('unhandledRejection', onError);
        saved.uncaughtException.forEach(l => process.on('uncaughtException', l));
        saved.unhandledRejection.forEach(l => process.on('unhandledRejection', l));
    };
}

async function runTests(options) {
    const {
        modules, filters = [], includeAll = false, config, client,
        makeMsg, user_ign = {}, last_beatmap = {}, last_message = {},
        timeoutMs = 30000, settleMs = 250, maxTotalMs = 0,
        deliver, onResult, captureLogs = true
    } = options;

    const plan = planTests({ modules, filters, includeAll, config, client });
    const results = [];
    const orphanErrors = [];
    const startedAt = new Date();
    const t0 = Date.now();

    const push = result => {
        results.push(result);
        try { onResult?.(result, results.length); } catch { /* progress callbacks must never break the run */ }
    };

    plan.broken.forEach(b => {
        const info = errorInfo(b.error);
        push({ command: b.file.replace(/\.js$/, ''), file: b.file, input: '(failed to load)', status: 'FAIL', kind: 'load',
            detail: `failed to load: ${clip(info.message, 200)}`, full: info.full, ms: 0 });
    });

    plan.skipped.forEach(s => {
        push({ command: s.command, file: s.file, input: '', status: 'SKIP', detail: s.reason, ms: 0 });
    });

    let current = null;
    const restoreGuards = installProcessGuards(err => (current ? current.asyncErrors : orphanErrors).push(err));

    // Commands report problems through helper.log / helper.error, which can dump huge objects
    // (axios errors, ...). Capture that output per test instead of printing it.
    let restoreLogs = () => {};
    if (captureLogs) {
        try {
            const helper = require('./helper.js');
            const original = { log: helper.log, error: helper.error };
            const grab = level => (...params) => {
                const text = params.map(p => typeof p === 'string' ? p : util.inspect(p, { depth: 1, breakLength: 120 })).join(' ');
                current?.logs.push(`[helper.${level}] ${text.length > 1500 ? text.slice(0, 1500) + '…' : text}`);
            };
            helper.log = grab('log');
            helper.error = grab('error');
            const originalConsole = { error: console.error, warn: console.warn };
            console.error = grab('console.error');
            console.warn = grab('console.warn');
            restoreLogs = () => {
                helper.log = original.log;
                helper.error = original.error;
                console.error = originalConsole.error;
                console.warn = originalConsole.warn;
            };
        } catch { /* helper unavailable: nothing to capture */ }
    }

    const hadSeed = TEST_CHANNEL_ID in last_beatmap;
    last_beatmap[TEST_CHANNEL_ID] = { ...SEED_LAST_BEATMAP };

    try {
        for (const testCase of plan.cases) {
            if (maxTotalMs && Date.now() - t0 > maxTotalMs) {
                push({ command: testCase.command, file: testCase.file, input: testCase.input, status: 'SKIP',
                    detail: 'time budget exhausted before this test ran', ms: 0 });
                continue;
            }

            current = { asyncErrors: [], logs: [] };
            const ignBefore = JSON.stringify(user_ign);

            const result = await runCase(testCase, {
                makeMsg, client, user_ign, last_beatmap, last_message, timeoutMs, deliver
            });

            if (settleMs) await sleep(settleMs);

            // A command that changed stored usernames (ign-set) must not affect later tests.
            if (JSON.stringify(user_ign) !== ignBefore) {
                Object.keys(user_ign).forEach(k => delete user_ign[k]);
                Object.assign(user_ign, JSON.parse(ignBefore));
            }

            if (current.logs.length) result.logs = current.logs;

            if (current.asyncErrors.length) {
                const info = errorInfo(current.asyncErrors[0]);
                const note = `uncaught async error (would have crashed the bot): ${clip(info.message, 160)}`;
                result.full = [result.full, info.full].filter(Boolean).join('\n\n');
                if (result.status === 'PASS' || result.status === 'WARN') {
                    result.status = 'FAIL';
                    result.kind = 'uncaught';
                    result.detail = note;
                } else {
                    result.detail += ` | also: ${note}`;
                }
            }

            current = null;
            push(result);
        }
    } finally {
        current = null;
        await sleep(settleMs);
        restoreGuards();
        restoreLogs();

        // Don't leave test data in the persisted state.
        if (!hadSeed) delete last_beatmap[TEST_CHANNEL_ID];
        delete last_message[TEST_CHANNEL_ID];
        delete user_ign[TEST_USER_ID];
        try {
            const helper = require('./helper.js');
            helper.setItem('last_beatmap', JSON.stringify(last_beatmap));
            helper.setItem('last_message', JSON.stringify(last_message));
            helper.setItem('user_ign', JSON.stringify(user_ign));
        } catch { /* storage cleanup is best-effort */ }
    }

    const counts = { PASS: 0, WARN: 0, FAIL: 0, TIMEOUT: 0, SKIP: 0 };
    results.forEach(r => counts[r.status]++);
    const bugs = results.filter(r => r.status === 'FAIL' && r.kind !== 'rejected').length;

    return { results, counts, bugs, orphanErrors: orphanErrors.map(errorInfo), startedAt, durationMs: Date.now() - t0 };
}

const COLORS = { PASS: '32', WARN: '33', FAIL: '31', TIMEOUT: '35', SKIP: '90' };
const paint = (status, text, color) => color ? `\x1b[${COLORS[status]}m${text}\x1b[0m` : text;

function formatLine(r, color = false) {
    const tag = paint(r.status, r.status.padEnd(7), color);
    const name = r.command.padEnd(14).slice(0, 14);
    const input = clip(r.input || '-', 42).padEnd(42);
    const time = `${r.ms}ms`.padStart(7);
    return `${tag} ${name} ${input} ${time}  ${r.detail}`;
}

function formatSummaryLine(run) {
    const c = run.counts;
    const fail = run.bugs === undefined ? `FAIL ${c.FAIL}`
        : `FAIL ${c.FAIL} (${run.bugs} crash/invalid, ${c.FAIL - run.bugs} error-message)`;
    return `PASS ${c.PASS} · WARN ${c.WARN} · ${fail} · TIMEOUT ${c.TIMEOUT} · SKIP ${c.SKIP}`
        + `  (${(run.durationMs / 1000).toFixed(1)}s)`;
}

function formatText(run, { mode = 'terminal' } = {}) {
    const lines = [];
    lines.push(`flowabot command test — ${run.startedAt.toISOString()}`);
    lines.push(`mode: ${mode}`);
    lines.push(formatSummaryLine(run));
    lines.push('');

    run.results.forEach(r => lines.push(formatLine(r)));

    const bad = run.results.filter(r => ['FAIL', 'TIMEOUT', 'WARN'].includes(r.status) && (r.full || r.logs));
    if (bad.length) {
        lines.push('', '='.repeat(80), 'DETAILS', '='.repeat(80));
        bad.forEach(r => {
            lines.push('', `[${r.status}] ${r.command} — ${r.input}`);
            if (r.full) lines.push(r.full);
            if (r.logs) lines.push('-- captured helper output --', ...r.logs);
        });
    }

    if (run.orphanErrors.length) {
        lines.push('', '='.repeat(80), 'UNCAUGHT ERRORS OUTSIDE A TEST (e.g. from a command that timed out earlier)', '='.repeat(80));
        run.orphanErrors.forEach(e => lines.push('', e.full));
    }

    return lines.join('\n');
}

function writeReports(run, { mode = 'terminal' } = {}) {
    fs.mkdirSync(LOG_DIR, { recursive: true });

    const stamp = run.startedAt.toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(LOG_DIR, `${stamp}.log`);
    const jsonPath = path.join(LOG_DIR, `${stamp}.json`);

    fs.writeFileSync(logPath, formatText(run, { mode }));
    fs.writeFileSync(jsonPath, JSON.stringify({
        startedAt: run.startedAt, durationMs: run.durationMs, counts: run.counts, results: run.results,
        orphanErrors: run.orphanErrors
    }, null, 2));

    return { logPath, jsonPath };
}

// Short version that fits in a Discord message (max 2000 chars).
function formatDiscordSummary(run, limit = 1800) {
    const head = formatSummaryLine(run);
    const problems = run.results.filter(r => ['FAIL', 'TIMEOUT', 'WARN'].includes(r.status));

    const lines = problems.map(r => `${r.status.padEnd(7)} ${r.command}: ${clip(r.detail, 110)}`);

    let body = '', shown = 0;
    for (const line of lines) {
        if ((body + line + '\n').length > limit - head.length - 120) break;
        body += line + '\n';
        shown++;
    }
    if (shown < lines.length) body += `…and ${lines.length - shown} more (see attached report)\n`;

    return `**Command test finished**\n\`\`\`\n${head}\n${body ? '\n' + body : ''}\`\`\``;
}

module.exports = {
    TEST_CHANNEL_ID, TEST_USER_ID,
    loadCommandModules, planTests, runTests, fakeSentMessage,
    formatLine, formatSummaryLine, formatText, formatDiscordSummary, writeReports
};
