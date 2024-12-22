const axios = require('axios');
const config = require('../config.json');

const twitchHelix = axios.create({
    baseURL: 'https://api.twitch.tv/helix',
    headers: {
        'Authorization': `Bearer ${config.credentials.twitch_token}`,
        'Client-ID': config.credentials.twitch_client_id
    }
});

module.exports = {
    command: 'viewers',
    description: "See how many people are watching a Twitch channel.",
    argsRequired: 1,
    usage: '<twitch username>',
    example: {
        run: "viewers distortion2",
        result: "Returns how many viewers distortion2 currently has (if they're live)."
    },
    configRequired: ['credentials.twitch_client_id', 'credentials.twitch_token'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv } = obj;
            let channel_name = argv[1];

            // Fetch stream information
            twitchHelix.get(`/streams`, {
                params: { user_login: channel_name }
            }).then(response => {
                const streams = response.data.data;

                if (streams.length > 0) {
                    const stream = streams[0];
                    const viewers = stream.viewer_count;
                    const game = stream.game_name;
                    const title = stream.title;
                    const startTime = stream.started_at;

                    const uptimeMs = Date.now() - new Date(startTime).getTime();
                    const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
                    const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));

                    const uptime = `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;

                    resolve({
                        embed: {
                            color: 6570404,
                            author: {
                                name: channel_name,
                                icon_url: "https://cdn.discordapp.com/attachments/572429763700981780/572429816851202059/GlitchBadge_Purple_64px.png"
                            },
                            title: title,
                            description: `**Game**: ${game}\n**Viewers**: ${viewers}\n**Uptime**: ${uptime}`,
                        }
                    });
                } else {
                    reject(`${channel_name} is currently not live.`);
                }
            }).catch(err => {
                console.error(err);
                reject('Error fetching stream information.');
            });
        });
    }
};
