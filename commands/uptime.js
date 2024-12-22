const axios = require('axios');
const { DateTime, Duration } = require('luxon');

const config = require('../config.json');

const twitchHelix = axios.create({
    baseURL: 'https://api.twitch.tv/helix',
    headers: {
        'Authorization': `Bearer ${config.credentials.twitch_token}`,
        'Client-ID': config.credentials.twitch_client_id
    }
});

module.exports = {
    command: ['uptime', 'downtime'],
    description: "Check how long a Twitch channel has been live or how long it's been offline.",
    argsRequired: 1,
    usage: '<twitch username>',
    example: [
        {
            run: "uptime distortion2",
            result: "Returns distortion2's uptime or downtime."
        },
        {
            run: "downtime ninja",
            result: "Returns ninja's uptime or downtime."
        }
    ],
    configRequired: ['credentials.twitch_client_id', 'credentials.twitch_token'],
    call: obj => {
        return new Promise((resolve, reject) => {
            const { argv } = obj;
            const channel_name = argv[1];

            // Fetch user information
            twitchHelix.get(`/users`, {
                params: { login: channel_name }
            }).then(userResponse => {
                const users = userResponse.data.data;

                if (users.length === 0) {
                    reject('User not found');
                    return;
                }

                const user_id = users[0].id;

                // Check if the channel is live
                twitchHelix.get(`/streams`, {
                    params: { user_id }
                }).then(streamResponse => {
                    const streams = streamResponse.data.data;

                    if (streams.length > 0) {
                        // Channel is live
                        const stream = streams[0];
                        const uptimeMs = Date.now() - new Date(stream.started_at).getTime();
                        const duration = Duration.fromMillis(uptimeMs);

                        const uptime = uptimeMs > 60 * 60 * 1000
                            ? duration.toFormat("h'h 'm'm'")
                            : duration.toFormat("m'm'");

                        resolve(`${channel_name} has been live for ${uptime}`);
                    } else {
                        // Channel is offline, fetch the latest VOD
                        twitchHelix.get(`/videos`, {
                            params: { user_id, type: 'archive', first: 1 }
                        }).then(videoResponse => {
                            const videos = videoResponse.data.data;

                            if (videos.length > 0) {
                                const vod = videos[0];
                                const downtimeMs = Date.now() - new Date(vod.created_at).getTime();
                                const duration = Duration.fromMillis(downtimeMs);

                                const downtime = downtimeMs < 60 * 1000
                                    ? duration.toFormat("s's'")
                                    : downtimeMs < 60 * 60 * 1000
                                        ? duration.toFormat("m'm'")
                                        : downtimeMs < 24 * 60 * 60 * 1000
                                            ? duration.toFormat("h'h'")
                                            : duration.toFormat("d'd' h'h'");

                                resolve(`${channel_name} hasn't streamed in ${downtime}`);
                            } else {
                                reject(`${channel_name} hasn't streamed recently or has VODs disabled.`);
                            }
                        }).catch(err => {
                            console.error(err);
                            reject('Error fetching VOD information.');
                        });
                    }
                }).catch(err => {
                    console.error(err);
                    reject('Error fetching stream information.');
                });
            }).catch(err => {
                console.error(err);
                reject('Error fetching user information.');
            });
        });
    }
};