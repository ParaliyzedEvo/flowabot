const config = require('../config.json');

const { Duration } = require('luxon');
const { AppTokenAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');

// An app access token is requested and renewed automatically by twurple, so unlike the
// fixed credentials.twitch_token this never expires while the bot is running.
const authProvider = new AppTokenAuthProvider(
    process.env.TWITCH_CLIENT_ID ?? config.credentials.twitch_client_id,
    process.env.TWITCH_CLIENT_SECRET ?? config.credentials.twitch_client_secret
);

const apiClient = new ApiClient({ authProvider });

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
    configRequired: ['credentials.twitch_client_id', 'credentials.twitch_client_secret'],
    envRequired: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],

    options: [
        {
            name: 'username',
            description: 'Twitch username to check uptime/downtime for',
            type: 'string',
            required: true
        }
    ],

    call: async obj => {
        const { argv } = obj;
        const channel_name = argv[1];

        let user;
        try {
            user = await apiClient.users.getUserByName(channel_name);
        } catch (err) {
            console.error(err);
            throw 'Error fetching user information.';
        }

        if (!user)
            throw 'User not found';

        let stream;
        try {
            stream = await apiClient.streams.getStreamByUserId(user.id);
        } catch (err) {
            console.error(err);
            throw 'Error fetching stream information.';
        }

        if (stream) {
            const uptimeMs = Date.now() - stream.startDate.getTime();
            const duration = Duration.fromMillis(uptimeMs);

            const uptime = uptimeMs > 60 * 60 * 1000
                ? duration.toFormat("h'h 'm'm'")
                : duration.toFormat("m'm'");

            return `${channel_name} has been live for ${uptime}`;
        }

        let videos;
        try {
            ({ data: videos } = await apiClient.videos.getVideosByUser(user.id, { type: 'archive', limit: 1 }));
        } catch (err) {
            console.error(err);
            throw 'Error fetching VOD information.';
        }

        if (videos.length === 0)
            throw `${channel_name} hasn't streamed recently or has VODs disabled.`;

        const downtimeMs = Date.now() - videos[0].creationDate.getTime();
        const duration = Duration.fromMillis(downtimeMs);

        const downtime = downtimeMs < 60 * 1000
            ? duration.toFormat("s's'")
            : downtimeMs < 60 * 60 * 1000
                ? duration.toFormat("m'm'")
                : downtimeMs < 24 * 60 * 60 * 1000
                    ? duration.toFormat("h'h'")
                    : duration.toFormat("d'd' h'h'");

        return `${channel_name} hasn't streamed in ${downtime}`;
    }
};