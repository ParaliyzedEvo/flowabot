const Discord = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
const helper = require('./helper.js');

const client = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildEmojisAndStickers
  ]
});

client.on('error', console.error);
const config = require('./config.json');
let guilds = [];

client.on('ready', () => {
    client.guilds.cache.forEach(guild => {
        if(guild.members.me.permissions.has(Discord.PermissionFlagsBits.ManageEmojisAndStickers))
            guilds.push(guild);
    });
    
    if(guilds.length == 0)
        throw "Bot has no servers to upload emotes to";
    
    guilds.forEach((guild, index) => {
        let staticEmojis = guild.emojis.cache.filter(a => !a.animated && !a.deleted && !a.managed).size;
        console.log(index, `${guild.name} - ${staticEmojis} / 50 or more emote slots`);
    });
    
    rl.question('Server to upload the emotes to (server index): ', answer => {
        let index = Number(answer);
        if(isNaN(index))
            throw "Input is not a number";
        if(index < 0 || index >= guilds.length)
            throw "Invalid range, please choose a valid server index";
        
        let guild = guilds[index];
        fs.readdir('./emotes').then(files => {
            let promises = [];
            files.forEach(file => {
                if(path.extname(file) == '.png')
                    promises.push(
                        guild.emojis.create({
                            attachment: `./emotes/${file}`,
                            name: path.basename(file, path.extname(file))
                        })
                    );
            });
            Promise.all(promises).then(() => {
                console.log(`${promises.length} emotes successfully uploaded!`);
                rl.close();
                process.exit(0);
            }).catch(err => {
                throw err;
            });
        }).catch(err => {
            throw err;
        });
    });
});

client.login(config.credentials.bot_token);