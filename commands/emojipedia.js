const axios = require('axios');

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
        const { argv, msg } = obj;
        const emoji = argv.slice(1).join('').trim();
        
        if (!emoji) {
            return Promise.reject("Please provide an emoji to look up.");
        }

        try {
            const codepoints = Array.from(emoji).map(char => 
                char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
            );
            
            const codepointDisplay = codepoints.map(cp => `U+${cp}`).join(' ');
            
            const embed = {
                title: `${emoji} Emoji Information`,
                description: [
                    `**Unicode:** ${codepointDisplay}`,
                    ``,
                    `**Platform Designs:**`,
                    `• Native Discord: ${emoji}`,
                    `• [Twemoji PNG](https://twemoji.maxcdn.com/v/latest/72x72/${codepoints[0].toLowerCase()}.png)`,
                    `• [OpenMoji SVG](https://openmoji.org/data/color/svg/${codepoints[0]}.svg)`,
                    `• [All Platforms](https://emojipedia.org/${encodeURIComponent(emoji)})`
                ].join('\n'),
                color: 0x3498db
            };

            console.log('Sending embed:', JSON.stringify(embed, null, 2));

            await msg.channel.send({ embeds: [embed] });
            return Promise.resolve();

        } catch (error) {
            console.error('Error in emojipedia command:', error);
            try {
                await msg.channel.send({
                    content: `Emoji: ${emoji}\nView designs: https://emojipedia.org/${encodeURIComponent(emoji)}`
                });
                return Promise.resolve();
            } catch (fallbackError) {
                console.error('Even simple fallback failed:', fallbackError);
                return Promise.reject("Unable to send emoji information.");
            }
        }
    }
}