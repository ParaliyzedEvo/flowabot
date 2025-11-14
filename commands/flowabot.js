const config = require('../config.json');

module.exports = {
    command: 'flowabot',
    description: "Show information about this bot.",
    configRequired: ['prefix'],
    call: obj => {
        let embed = {
            description: "Modular Discord bot with various features including twitch commands and advanced osu! commands.",
            url: "https://github.com/Paraliyzedevo/flowabot",
            color: 12277111,
            footer: {
                icon_url: "https://avatars1.githubusercontent.com/u/107338855?s=64&v=2",
                text: "Paraliyzed_evo"
            },
            thumbnail: {
                url: "https://raw.githubusercontent.com/LeaPhant/flowabot/master/res/logo.png"
            },
            author: {
                name: "flowabot",
                url: "https://github.com/LeaPhant/flowabot"
            },
            fields: [
                {
                    name: "GitHub Repo",
                    value: "https://github.com/LeaPhant/flowabot"
                },
                {
                    name: "mikazuki fork",
                    value: "https://github.com/respektive/flowabot"
                },
                {
                    name: "Paraliyzed_evo's fork",
                    value: "https://github.com/Paraliyzedevo/flowabot"
                },
                {
                    name: "Commands",
                    value: "https://github.com/respektive/Paraliyzedevo/blob/master/COMMANDS.md"
                },
                {
                    name: "Prefix",
                    value: `The command prefix on this server is \`${config.prefix}\`.`
                }
            ]
        };

        return {embeds: [embed]};
    }
};
