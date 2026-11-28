const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pipeline } = require('stream/promises');

const helper = require('../helper.js');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// BetterTTV's search API now rejects anonymous requests (401/403), so this command
// searches 7TV instead. The command name stays "bttv".
const SEARCH_QUERY = `query ($q: String!) {
    emotes(query: $q, limit: 50, page: 1) {
        items {
            id
            name
            animated
            owner { display_name }
            host { url files { name format } }
        }
    }
}`;

// Pick an image file Discord can display (never AVIF), preferring 3x: GIF/WebP when animated, PNG/WebP when static.
function pickFile(emote) {
    const usable = (emote.host?.files ?? [])
        .map(file => file.name)
        .filter(name => /\.(gif|png|webp)$/i.test(name));

    const preferred = emote.animated ? ['3x.gif', '3x.webp'] : ['3x.png', '3x.webp'];

    return preferred.find(name => usable.includes(name))
        ?? usable.find(name => name.startsWith('3x'))
        ?? usable[0];
}

module.exports = {
    command: 'bttv',
    description: "Show an emote by name. BTTV's search API now requires a login, so emotes come from <https://7tv.app/>.",
    argsRequired: 1,
    usage: '<emote name>',
    example: {
        run: 'bttv WoweeHOP',
        result: 'Returns the emote that best matches WoweeHOP'
    },

    options: [
        {
            name: 'emote',
            description: 'Name of the emote to display',
            type: 'string',
            required: true
        }
    ],

    call: async obj => {
        const { argv } = obj;
        const q = argv[1].toLowerCase();

        let items;

        try {
            const response = await axios.post('https://7tv.io/v3/gql', {
                query: SEARCH_QUERY,
                variables: { q }
            }, {
                headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json' },
                timeout: 15000
            });

            if (response.data.errors?.length)
                throw new Error(response.data.errors[0].message);

            items = response.data.data.emotes.items;
        } catch (err) {
            helper.error(err);
            throw "Couldn't search for emotes right now. 💀";
        }

        if (!items || items.length === 0)
            throw `Emote ${q} not found.`;

        // Prefer an exact name match, otherwise the top search result.
        const emote = items.find(item => item.name.toLowerCase() === q) ?? items[0];

        const fileName = pickFile(emote);
        if (!fileName)
            throw `Emote ${emote.name} has no image I can show.`;

        const extension = path.extname(fileName).slice(1).toLowerCase();
        const baseUrl = emote.host.url.startsWith('//') ? `https:${emote.host.url}` : emote.host.url;
        const safeName = emote.name.replace(/[^\w.-]/g, '_');
        const file = path.resolve(os.tmpdir(), `emote_${safeName}_${helper.getRandomArbitrary(1000, 9999)}.${extension}`);

        try {
            const image = await axios.get(`${baseUrl}/${fileName}`, {
                responseType: 'stream',
                headers: { 'User-Agent': USER_AGENT },
                timeout: 15000
            });

            await pipeline(image.data, fs.createWriteStream(file));
        } catch (err) {
            helper.error(err);
            fs.promises.rm(file, { force: true }).catch(() => {});
            throw "Couldn't download the emote. 😔";
        }

        return {
            embeds: [{
                title: emote.name,
                url: `https://7tv.app/emotes/${emote.id}`,
                image: {
                    url: `attachment://emote.${extension}`
                },
                footer: {
                    text: `Submitted by ${emote.owner?.display_name ?? 'unknown'}`
                }
            }],
            files: [{ attachment: file, name: `emote.${extension}` }],
            remove_path: file
        };
    }
};