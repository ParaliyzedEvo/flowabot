const { EmbedBuilder } = require('discord.js');

module.exports = {
    command: 'emojipedia',
    description: "Look up what an emoji looks like on all platforms.",
    argsRequired: 1,
    usage: '<emoji>',
    example: {
        run: "emojipedia 🤔",
        result: "Returns thinking emoji information."
    },
    call: async (obj) => {
        const { argv } = obj;
        const emoji = argv.slice(1).join('').trim();
        
        if (!emoji) {
            return Promise.reject("Please provide an emoji to look up.");
        }

        try {
            // Get Unicode codepoints
            const codepoints = Array.from(emoji).map(char => 
                char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
            );
            
            const codepointDisplay = codepoints.map(cp => `U+${cp}`).join(' ');
            const joinedCodepoints = codepoints.join('-').toLowerCase();
            
            // Create embed using EmbedBuilder
            const embed = new EmbedBuilder()
                .setTitle(`${emoji} Emoji Information`)
                .setDescription([
                    `**Unicode:** ${codepointDisplay}`,
                    ``,
                    `**Platform Designs:**`,
                    `• Native Discord: ${emoji}`,
                    `• [View on Emojipedia](https://emojipedia.org/${encodeURIComponent(emoji)})`,
                ].join('\n'))
                .setThumbnail(`https://em-content.zobj.net/thumbs/160/twitter/348/${joinedCodepoints}.png`)
                .setColor(0x3498db);

            return Promise.resolve({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error in emojipedia command:', error);
            return Promise.reject(`Unable to process emoji. Try: https://emojipedia.org/${encodeURIComponent(emoji)}`);
        }
    }
};