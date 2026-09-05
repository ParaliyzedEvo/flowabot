const helper = require('../helper.js');
const config = require('../config.json');

module.exports = {
    command: 'help',
    argsRequired: 1,
    description: [
        "Get help for a command.",
        "",
        "**List of all commands:** https://github.com/respektive/Paraliyzedevo/blob/master/COMMANDS.md"
    ],
    usage: '<command>',
    example: [
        {
            run: "help pp",
            result: `Returns help on how to use the \`${helper.prefix[0]}pp\` command.`
        }
    ],
    
    options: [
        {
            name: 'command',
            description: 'The command to get help for',
            type: 'string',
            required: true
        }
    ],

    call: obj => {
        let { argv } = obj;
        return helper.commandHelp(argv[1]);
    }
};
