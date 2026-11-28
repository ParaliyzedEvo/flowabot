#!/usr/bin/env node
/**
 * Run every flowabot command against its example input from the terminal.
 * Errors are logged and the run continues.
 *
 *   node test-commands.js                 run all commands (safe ones)
 *   node test-commands.js osu rosu        only commands whose name/file contains these words
 *   node test-commands.js --all           also run state-changing ones (osu-track, ign-set, ...)
 *   node test-commands.js --list          show what would run, don't run anything
 *   node test-commands.js --timeout 60    per-test timeout in seconds (default 30)
 *   node test-commands.js --verbose       print the bot's own helper.log/helper.error output live (default: saved in the report)
 *   node test-commands.js --user NAME     osu! username used by commands called with no username
 *
 * A text + JSON report is written to logs/command-tests/.
 * Exit code is 1 if anything FAILed or timed out, otherwise 0.
 */

const fs = require('fs');

if (!fs.existsSync('./config.json')) {
    console.error('config.json not found. Run `npm run config` first.');
    process.exit(1);
}

const { Collection } = require('discord.js');
const config = require('./config.json');
const helper = require('./helper.js');
const osu = require('./osu.js');
const tester = require('./commandtester.js');
const argv = process.argv.slice(2);
const flags = { all: false, list: false, verbose: false, timeout: 30, user: process.env.TEST_OSU_USER ?? 'Paraliyzed_evo', filters: [] };

for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') flags.all = true;
    else if (a === '--list') flags.list = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a === '--timeout') flags.timeout = Number(argv[++i]) || 30;
    else if (a === '--user') flags.user = argv[++i];
    else if (a === '-h' || a === '--help') {
        console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*\*?\n?/, '').replace(/^ \* ?/gm, ''));
        process.exit(0);
    } else flags.filters.push(a);
}

const makeCache = () => new Collection();

// Just enough of a Discord client for commands/osu.js that touch emojis, channels or guilds.
const mockClient = {
    user: { id: 'flowabot-test-bot', username: 'flowabot-test' },
    channels: { cache: makeCache() },
    guilds: { cache: makeCache() },
    emojis: { cache: makeCache() },
    application: {
        emojis: {
            cache: makeCache(),
            fetch: async () => makeCache(),
            create: async () => { throw new Error('mock client: cannot create emojis'); },
            edit: async () => { throw new Error('mock client: cannot edit emojis'); }
        }
    }
};

const guild = { id: 'flowabot-test-guild', name: 'Test Guild', members: { cache: makeCache() }, emojis: { cache: makeCache() } };

const member = {
    id: tester.TEST_USER_ID,
    nickname: null,
    presence: null,
    permissions: { has: () => true },
    setNickname: async () => {}
};

const author = {
    id: tester.TEST_USER_ID,
    username: 'flowabot-tester',
    bot: false,
    avatarURL: () => null,
    displayAvatarURL: () => null
};

function makeMsg(input) {
    const sent = [];
    const msg = {
        id: 'flowabot-test-message',
        content: helper.prefix[0] + input,
        author, member, guild,
        attachments: makeCache(),
        reference: null,
        channel: {
            id: tester.TEST_CHANNEL_ID,
            type: 0,
            send: async payload => { sent.push(payload); return tester.fakeSentMessage(); },
            messages: { fetch: async () => { throw new Error('mock channel: no message history'); } }
        }
    };
    return { msg, sent };
}

(async () => {
    const modules = tester.loadCommandModules();
    helper.init(modules.loaded.map(l => l.mod)); // helper.commandHelp() needs the list

    if (flags.list) {
        const plan = tester.planTests({ modules, filters: flags.filters, includeAll: flags.all, config });
        plan.cases.forEach(c => console.log(`${c.command.padEnd(16)} ${helper.prefix[0]}${c.input}${c.auto ? '   (auto-generated)' : ''}`));
        plan.skipped.forEach(s => console.log(`${s.command.padEnd(16)} SKIP: ${s.reason}`));
        plan.broken.forEach(b => console.log(`${b.file.padEnd(16)} FAILED TO LOAD: ${b.error?.message ?? b.error}`));
        console.log(`\n${plan.cases.length} tests, ${plan.skipped.length} skipped, ${plan.broken.length} failed to load`);
        process.exit(0);
    }

    const parse = key => { try { return JSON.parse(helper.getItem(key) ?? '{}'); } catch { return {}; } };
    const user_ign = parse('user_ign');
    const last_beatmap = parse('last_beatmap');
    const last_message = parse('last_message');
    user_ign[tester.TEST_USER_ID] = flags.user;

    const clientId = process.env.OSU_CLIENT_ID ?? config.credentials?.client_id;
    const clientSecret = process.env.OSU_CLIENT_SECRET ?? config.credentials?.client_secret;

    if (clientId && clientSecret) {
        try {
            await osu.init(mockClient, clientId, clientSecret, last_beatmap);
        } catch (err) {
            console.error('osu! API init failed, osu! commands will fail:', err?.message ?? err);
        }
    }

    const color = process.stdout.isTTY;
    console.log(`Testing commands (timeout ${flags.timeout}s per test, osu! user "${flags.user}")\n`);

    const run = await tester.runTests({
        modules, config, client: mockClient,
        filters: flags.filters, includeAll: flags.all,
        makeMsg, user_ign, last_beatmap, last_message,
        timeoutMs: flags.timeout * 1000,
        captureLogs: !flags.verbose,
        onResult: r => console.log(tester.formatLine(r, color))
    });

    const { logPath, jsonPath } = tester.writeReports(run, { mode: 'terminal' });

    console.log('\n' + tester.formatSummaryLine(run));
    console.log(`Report: ${logPath}\nJSON:   ${jsonPath}`);

    // Exit explicitly: osu.js schedules timers and the mysql pool would keep the process alive.
    process.exit(run.counts.FAIL + run.counts.TIMEOUT > 0 ? 1 : 0);
})().catch(err => {
    console.error('test runner crashed:', err);
    process.exit(2);
});
