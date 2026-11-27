const { Collection } = require('discord.js');
const config = require('../config.json');
const helper = require('../helper.js');
const tester = require('../commandtester.js');

// Who may run this: anyone listed in BOT_OWNER_ID (env) / owner_id (config.json), comma separated,
// or a server administrator. Nobody else, and not in DMs unless they are an owner.
const owners = String(process.env.BOT_OWNER_ID ?? config.owner_id ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);

module.exports = {
    command: ['testall', 'testcommands'],
    description: [
        "Run every command with its example input and report which ones error.",
        "",
        "Errors are logged and the run continues. Add `all` to include state-changing commands, `send` to post each output in this channel."
    ],
    usage: '[filter words] [all] [send]',
    example: [
        { run: 'testall', result: 'Tests every command and attaches a full report.' },
        { run: 'testall osu rosu', result: 'Only tests commands whose name contains "osu" or "rosu".' },
        { run: 'testall send', result: 'Also posts each command\'s output here to check Discord accepts it.' }
    ],

    options: [
        {
            name: 'args',
            description: 'Filter words. Add "all" for state-changing commands, "send" to post each output.',
            type: 'string',
            required: false
        }
    ],

    call: async obj => {
        const { msg, argv, client, user_ign, last_beatmap, last_message } = obj;

        const isOwner = owners.includes(msg.author.id);
        const isAdmin = !!msg.member?.permissions?.has('Administrator');
        if (!isOwner && !isAdmin)
            throw "Only the bot owner or a server administrator can run this.";

        // Prefix mode gives separate words, slash mode gives the whole option as one string.
        const words = argv.slice(1).flatMap(a => String(a).split(/\s+/)).filter(Boolean);
        const includeAll = words.some(w => w.toLowerCase() === 'all');
        const send = words.some(w => w.toLowerCase() === 'send');
        const filters = words.filter(w => !['all', 'send'].includes(w.toLowerCase()));

        const realChannel = msg.channel;

        // Run commands against a fake channel id so test data never ends up in real channel state,
        // and capture direct channel.send() calls instead of posting them.
        const makeMsg = input => {
            const sent = [];
            const channel = new Proxy(realChannel ?? {}, {
                get(target, prop) {
                    if (prop === 'id') return tester.TEST_CHANNEL_ID;
                    if (prop === 'send')
                        return async payload => { sent.push(payload); return tester.fakeSentMessage(); };
                    const value = target[prop];
                    return typeof value === 'function' ? value.bind(target) : value;
                }
            });

            return {
                sent,
                msg: {
                    id: msg.id,
                    content: helper.prefix[0] + input,
                    author: msg.author,
                    member: msg.member,
                    guild: msg.guild,
                    channel,
                    attachments: new Collection(),
                    reference: null,
                    client: msg.client
                }
            };
        };

        let progress = null;
        try {
            progress = await realChannel?.send('Running command tests…');
        } catch { /* ignore */ }

        let done = 0, lastEdit = 0;
        const onResult = r => {
            done++;
            if (!progress || Date.now() - lastEdit < 4000) return;
            lastEdit = Date.now();
            progress.edit(`Running command tests… ${done} done (last: \`${r.command}\` ${r.status})`).catch(() => {});
        };

        const run = await tester.runTests({
            config, client,
            filters, includeAll,
            makeMsg, user_ign, last_beatmap, last_message,
            timeoutMs: 20000,
            maxTotalMs: 12 * 60 * 1000, // stay inside Discord's 15 minute slash-command window
            deliver: send ? payload => realChannel.send(payload) : undefined,
            onResult
        });

        if (progress) progress.delete().catch(() => {});

        const { logPath } = tester.writeReports(run, { mode: 'discord' });

        if (run.results.length === 0)
            return 'No commands matched that filter.';

        return {
            content: tester.formatDiscordSummary(run),
            files: [{ attachment: logPath, name: 'command-test-report.txt' }]
        };
    }
};
