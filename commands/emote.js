const emoji = require('node-emoji');
const helper = require('../helper.js');

module.exports = {
    command: ['emote', 'e'],
    description: "Print one or multiple emotes the bot can use in chat.",
    usage: '<emote 1> [emote 2] [emote n]',
    example: {
        run: 'e SourPls',
        result: 'Returns SourPls emote.'
    },
    argsRequired: 1,

    options: [
        {
            name: 'emote1',
            description: 'The first emote to print',
            type: 'string',
            required: true
        },
        {
            name: 'emote2',
            description: 'The second emote to print',
            type: 'string',
            required: false
        },
        {
            name: 'emote3',
            description: 'The third emote to print',
            type: 'string',
            required: false
        }
    ],
    
    call: obj => {
        let { msg, argv, client } = obj;

        let emotes = argv.slice(1);
        let output = "";

        emotes.forEach(emoteName => {
            let emote;

            if(emoteName.startsWith("<:") && emoteName.split(":").length > 1)
                emoteName = emoteName.split(":")[1];

            if(msg.channel.type == 'text')
                emote = helper.emote(emoteName, msg.guild, client);
            else
                emote = helper.emote(emoteName, null, client);

            if(!emote && emoji.has(emoteName))
                emote = emoji.find(emoteName).emoji;

            if(emote)
                output += emote.toString();
            else
                output += " " + emoteName;
        });

        if(output.length == 0)
            output = "No emote found";

        return output;
    }
};
