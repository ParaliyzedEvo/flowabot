if(require('semver').lt(process.version, '14.14.0'))
	throw "flowabot only runs on Node.js 14.14.0 or higher";

process.on('uncaughtException', function(err){
    console.error(err.stack);
});

const { Client, GatewayIntentBits, IntentsBitField, Partials, ApplicationCommandOptionType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const objectPath = require("object-path");
const chalk = require('chalk');

const osu = require('./osu.js');
const helper = require('./helper.js');

const OPTION_TYPE_MAP = {
    string: ApplicationCommandOptionType.String,
    integer: ApplicationCommandOptionType.Integer,
    number: ApplicationCommandOptionType.Number,
    boolean: ApplicationCommandOptionType.Boolean,
    user: ApplicationCommandOptionType.User,
    channel: ApplicationCommandOptionType.Channel
};

function buildSlashCommands(commandList){
    return commandList
        .filter(c => Array.isArray(c.options))
        .map(c => {
            const name = (Array.isArray(c.command) ? c.command[0] : c.command).toLowerCase();
            return {
                name,
                description: (Array.isArray(c.description) ? c.description.join('\n') : (c.description || name)).slice(0, 100),
                options: c.options.map(opt => ({
                    name: opt.name.toLowerCase(),
                    description: opt.description.slice(0, 100),
                    type: OPTION_TYPE_MAP[opt.type] ?? ApplicationCommandOptionType.String,
                    required: !!opt.required
                }))
            };
        });
}

function handleCommandResponse(promise, channelLike){
    return Promise.resolve(promise).then(response => {
        if(!response) return;

        let edit_promise, replace_promise, remove_path, content;

        if(typeof response === 'object' && 'edit_promise' in response){
            ({edit_promise} = response);
            delete response.edit_promise;
        }
        if(typeof response === 'object' && 'replace_promise' in response){
            ({replace_promise} = response);
            delete response.replace_promise;
        }
        if(typeof response === 'object' && 'remove_path' in response){
            ({remove_path} = response);
            delete response.remove_path;
        }
        if(typeof response === 'object' && 'content' in response){
            ({content} = response);
            delete response.content;
        }
        if(content)
            response.content = content;

        let message_promise = channelLike.send(response);

        message_promise.catch(err => {
            channelLike.sendError(`Couldn't run command: **${err}**`);
        });

        return Promise.all([message_promise, edit_promise, replace_promise]).then(responses => {
            let message = responses[0];
            let edit_result = responses[1];
            let replace_result = responses[2];

            if(edit_result)
                message.edit(edit_result).catch(helper.error);

            if(replace_result){
                channelLike.followUp(replace_result)
                    .catch(err => channelLike.sendError(`Couldn't run command: **${err}**`))
                    .finally(() => {
                        message.delete().catch(() => {});

                        if(typeof replace_result === 'object' && 'remove_path' in replace_result){
                            ({remove_path} = replace_result);
                            delete replace_result.remove_path;
                        }
                        if(remove_path)
                            fs.rm(remove_path, { recursive: true }).catch(helper.error);
                    });
            }

            if(remove_path)
                fs.rm(remove_path, { recursive: true }).catch(helper.error);
        });
    }).catch(err => {
        if(typeof err === 'object')
            channelLike.sendError(err);
        else
            channelLike.sendError(`Couldn't run command: **${err}**`);

        helper.error(err);
    });
}

const intents = process.env.DISCORD_INTENTS 
    ? process.env.DISCORD_INTENTS.split(',').map(i => GatewayIntentBits[i]) 
    : Object.values(GatewayIntentBits);

const client = new Client({ intents, partials: Object.values(Partials) });

client.on('error', helper.error);

process.on('uncaughtException', (err) => {
    helper.error(err)
    process.exit(0)
});

const config = require('./config.json');

let user_ign = {};

if(helper.getItem('user_ign')){
	user_ign = JSON.parse(helper.getItem('user_ign'));
}else{
	helper.setItem("user_ign", JSON.stringify(user_ign));
}

let last_beatmap = {};

if(helper.getItem('last_beatmap')){
	last_beatmap = JSON.parse(helper.getItem('last_beatmap'));
}else{
	helper.setItem('last_beatmap', JSON.stringify(last_beatmap));
}

let last_message = {}

if(helper.getItem('last_message')){
	last_message = JSON.parse(helper.getItem('last_message'));
}else{
	helper.setItem('last_message', JSON.stringify(last_message));
}

if((process.env.OSU_CLIENT_ID ?? config.credentials.client_id)
    && (process.env.OSU_CLIENT_SECRET ?? config.credentials.client_secret))
    osu.init(client, process.env.OSU_CLIENT_ID ?? config.credentials.client_id, process.env.OSU_CLIENT_SECRET ?? config.credentials.client_secret, last_beatmap);

function checkCommand(msg, command){
    if(!msg.content.startsWith(helper.prefix))
        return false;

	if(msg.author.bot && msg.webhookId == null)
		return false;

    let argv = msg.content.split(' ');

    let command_match = false;

    let msg_check = msg.content.toLowerCase().substr(helper.prefix.length).trim();

    let commands = command.command;

    let startswith = false;

    if(command.startsWith)
        startswith = true;

    if(!Array.isArray(commands))
        commands = [commands];

    for(let i = 0; i < commands.length; i++){
        let command_check = commands[i].toLowerCase().trim();
        if(startswith){
            if(msg_check.startsWith(command_check))
                command_match = true;
        }else{
            if(msg_check.startsWith(command_check + ' ')
            || msg_check == command_check)
                command_match = true;
        }
    }

    if(command_match){
        let hasPermission = true;

        if(command.permsRequired && msg.member != null)
            hasPermission = command.permsRequired.length == 0 || command.permsRequired.some(perm => msg.member.permissions.has(perm));

        if(!hasPermission)
            return 'Insufficient permissions for running this command.';

        if(command.argsRequired !== undefined && argv.length <= command.argsRequired)
            return helper.commandHelp(command.command);

        return true;
    }

    return false;
}

let commands = [];
let commands_path = path.resolve(__dirname, 'commands');
    
async function loadCommands(){
    const items = await fs.readdir(commands_path);
    items.forEach(item => {
        if(path.extname(item) == '.js'){
            let command = require(path.resolve(commands_path, item));

            command.filename = path.resolve(commands_path, item);

            let available = true;
            let unavailability_reason = [];

            if(command.folderRequired !== undefined && command.folderRequired.length > 0){
                let { folderRequired } = command;

                if(!Array.isArray(command.folderRequired))
                    folderRequired = [folderRequired];

                folderRequired.forEach(async folder => {
                    if(await helper.fileExists(path.resolve(__dirname, folder)) == false)
                        available = false;
                        unavailability_reason.push(`required folder ${folder} does not exist`);
                });
            }

            if(command.configRequired !== undefined && command.configRequired.length > 0){
                let { configRequired } = command;

                if(!Array.isArray(command.configRequired))
                    configRequired = [configRequired];

                let { envRequired } = command;

                if (!Array.isArray(command.envRequired))
                    envRequired = [envRequired];

                configRequired.forEach((config_path, index) => {
                    if (process.env[envRequired[index]] != null 
                        && process.env[envRequired[index]].length > 0)
                        return;

                    if(!objectPath.has(config, config_path)){
                        available = false;
                        unavailability_reason.push(`required config option ${config_path} not set`);
                    }else if(objectPath.get(config, config_path).length == 0){
                        available = false;
                        unavailability_reason.push(`required config option ${config_path} is empty`);
                    }
                });
            }

            if(command.emoteRequired !== undefined && command.emoteRequired.length > 0){
                let { emoteRequired } = command;

                if(!Array.isArray(command.emoteRequired))
                    emoteRequired = [emoteRequired];

                emoteRequired.forEach(emote_name => {
                    let emote = helper.emote(emote_name, null, client);
                    if(!emote){
                        available = false;
                        unavailability_reason.push(`required emote ${emote_name} is missing`);
                    }
                });
            }

            if (command.intentRequired) {
                let { intentRequired } = command;

                if(!Array.isArray(command.intentRequired))
                    intentRequired = [intentRequired];

                const intents = new IntentsBitField(client.options.intents).toArray();

                for (const intent of intentRequired) {
                    if (intents.includes(intent)) continue;

                    available = false;
                    unavailability_reason.push(`required intent ${intent} not given`);
                }
            }

            if(available){
                commands.push(command);
			}else{
				if(!Array.isArray(command.command))
					command.command = [command.command];

				console.log('');
				console.log(chalk.yellow(`${helper.prefix}${command.command[0]} was not enabled:`));
				unavailability_reason.forEach(reason => {
					console.log(chalk.yellow(reason));
				});
			}
        }
    });

    helper.init(commands);
}

let handlers = [];
let handlers_path = path.resolve(__dirname, 'handlers');

async function loadHandlers(){
    const items = await fs.readdir(handlers_path);
    items.forEach(item => {
        if(path.extname(item) == '.js'){
            let handler = require(path.resolve(handlers_path, item));
            handlers.push(handler);
        }
    });
}

function onMessage(msg){
	// remove bridged escape characters
	if(msg.webhookID != null)
		msg.content = msg.content.replace(/\\(?!\\)/g, '');

    let argv = msg.content.split(' ');

    argv[0] = argv[0].substr(helper.prefix.length);

    if(msg.guild && Array.isArray(config.blacklist) && config.blacklist.includes(msg.guild.id)){
        if(helper.debug)
            helper.log(`Ignored command in blacklisted server: ${msg.guild.id} (${msg.guild.name})`);
        return;
    }

    if(helper.debug)
        helper.log(msg.author.username, ':', msg.content);

    commands.forEach(command => {
        let check_command = checkCommand(msg, command);

        if(check_command === true){
            if(command.call && typeof command.call === 'function'){
                let promise = command.call({
                    msg,
                    argv,
                    client,
                    user_ign,
                    last_beatmap,
                    last_message
                });

                handleCommandResponse(promise, {
                    send: payload => msg.channel.send(payload),
                    sendError: payload => msg.channel.send(payload),
                    followUp: payload => msg.channel.send(payload)
                });
            }
        }else if(check_command !== false){
            msg.channel.send(check_command);
        }
    });

    handlers.forEach(handler => {
        if(handler.message && typeof handler.message === 'function'){
            handler.message({
                msg,
                argv,
                client,
                user_ign,
                last_beatmap,
                last_message
            });
        }
    });
}

client.on('messageCreate', onMessage);

async function onInteraction(interaction){
    if(!interaction.isChatInputCommand())
        return;

    if(interaction.guild && Array.isArray(config.blacklist) && config.blacklist.includes(interaction.guild.id)){
        return interaction.reply({ content: "This command isn't available in this server.", ephemeral: true });
    }

    const command = commands.find(c => {
        let names = Array.isArray(c.command) ? c.command : [c.command];
        return names.map(n => n.toLowerCase()).includes(interaction.commandName);
    });

    if(!command)
        return;

    if(command.permsRequired && interaction.member){
        let hasPermission = command.permsRequired.length === 0
            || command.permsRequired.some(perm => interaction.member.permissions.has(perm));

        if(!hasPermission)
            return interaction.reply({ content: 'Insufficient permissions for running this command.', ephemeral: true });
    }

    let argv = [interaction.commandName];

    (command.options || []).forEach(opt => {
        let val;
        switch(opt.type){
            case 'integer': val = interaction.options.getInteger(opt.name); break;
            case 'number':  val = interaction.options.getNumber(opt.name); break;
            case 'boolean': val = interaction.options.getBoolean(opt.name); break;
            case 'user': {
                let u = interaction.options.getUser(opt.name);
                val = u ? `<@${u.id}>` : null;
                break;
            }
            case 'channel': {
                let ch = interaction.options.getChannel(opt.name);
                val = ch ? `<#${ch.id}>` : null;
                break;
            }
            default: val = interaction.options.getString(opt.name);
        }
        argv.push(val === null || val === undefined ? '' : String(val));
    });

    await interaction.deferReply();

    const fakeMsg = {
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        channel: interaction.channel
    };

    let promise = command.call({
        msg: fakeMsg,
        argv,
        client,
        user_ign,
        last_beatmap,
        last_message
    });

    handleCommandResponse(promise, {
        send: payload => interaction.editReply(payload),
        sendError: payload => interaction.editReply(payload).catch(() => interaction.followUp(payload)),
        followUp: payload => interaction.followUp(payload)
    });
}

client.on('interactionCreate', onInteraction);

async function syncSlashCommandsForGuild(guild){
    const slashData = buildSlashCommands(commands);
    const isBlacklisted = Array.isArray(config.blacklist) && config.blacklist.includes(guild.id);
    const desired = isBlacklisted ? [] : slashData;

    const ownNames = new Set(
        commands.flatMap(c => Array.isArray(c.command) ? c.command : [c.command])
            .map(n => n.toLowerCase())
    );

    try {
        const existing = await guild.commands.fetch();

        for(const [id, cmd] of existing){
            if(ownNames.has(cmd.name) && !desired.find(d => d.name === cmd.name)){
                try { await guild.commands.delete(id); }
                catch(err){ helper.error(`Failed to delete ${cmd.name}:`, err); }
            }
        }

        for(const cmdData of desired){
            const match = existing.find(c => c.name === cmdData.name);
            try {
                if(match)
                    await guild.commands.edit(match.id, cmdData);
                else
                    await guild.commands.create(cmdData);
            }catch(err){
                helper.error(`Failed to sync command ${cmdData.name}:`, err);
            }
        }
    }catch(err){
        helper.error(err);
    }
}

async function syncAllSlashCommands(){
    if(process.env.DISCORD_GUILD_ID){
        // dev mode: only sync the one test guild
        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
        if(guild) await syncSlashCommandsForGuild(guild);
        return;
    }

    for(const guild of client.guilds.cache.values()){
        await syncSlashCommandsForGuild(guild);
    }
}

client.on('guildCreate', guild => {
    syncSlashCommandsForGuild(guild).catch(helper.error);
});

client.on('clientReady', async () => {
	helper.log('flowabot is ready');

	try {
		await syncAllSlashCommands();
		helper.log(`Synced slash commands across ${client.guilds.cache.size} guild(s).`);
	}catch(err){
		helper.error(err);
	}

	if(process.env.DISCORD_CLIENT_ID ?? config.credentials.discord_client_id)
		helper.log(
			`Invite bot to server: ${chalk.blueBright('https://discord.com/api/oauth2/authorize?client_id='
			+ (process.env.DISCORD_CLIENT_ID ?? config.credentials.discord_client_id) + '&permissions=8&scope=bot')}`);
});

(async () => {
    try {
        await loadCommands();
        await loadHandlers();
    }catch(err){
        helper.error(err);
        throw "Unable to read commands/handlers folder";
    }

    client.login(process.env.DISCORD_BOT_TOKEN ?? config.credentials.bot_token).catch(err => {
        console.error('');
        console.error(chalk.redBright("Couldn't log into Discord. Wrong bot token?"));
        console.error('');
        console.error(err);
        process.exit();
    });
})();