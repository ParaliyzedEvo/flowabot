(async () => {
    const readline = require('readline-sync');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
	    const util = require('util');
    const chalk = require('chalk');
	    const { execFile } = require('child_process');
	    const execPromiseFile = util.promisify(execFile);

    const Discord = require('discord.js');
    const axios = require('axios');

    let config = {}, default_value, value, valid_key;

    if(fs.existsSync('./config.json'))
        config = require('./config.json');

    console.log('');
    console.log('-----------------------------------------------');
    console.log('Welcome to the flowabot configuration wizard 🧙‍');
    console.log('-----------------------------------------------');
    console.log('');
    console.log(chalk.yellow('If you press enter without entering anything it will choose the default value in the [brackets]‍'));

    default_value = '!';

    if(config.prefix)
        default_value = config.prefix;

    console.log('');
    value = readline.question(`Command prefix [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.prefix = value;


    default_value = 'yes';

    if(config.debug)
        default_value = config.debug ? 'yes' : 'no';

    console.log('');
    value = readline.question(`Enable debug messages (yes/no) [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.debug = value == 'yes';


    default_value = path.resolve(os.tmpdir(), 'osumaps');

    if(config.osu_cache_path)
        default_value = config.osu_cache_path;

    console.log('');
    value = readline.question(`Path where to cache .osu files [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.osu_cache_path = value;
	
	
		default_value = path.resolve(os.tmpdir(), 'osureplays');
    if(config.replay_path)
        default_value = config.replay_path;
	
    console.log('');
    value = readline.question(`Path where to cache .osr replay files [${chalk.green(default_value)}]: `);
	
    if(!value)
        value = default_value;
	
    config.replay_path = value;
	
	
	default_value = path.resolve(os.tmpdir(), 'osumapsets');
	
    if(config.maps_path)
        default_value = config.maps_path;
	
    console.log('');
    value = readline.question(`Path where to cache mapsets [${chalk.green(default_value)}]: `);
	
    if(!value)
        value = default_value;
	
    config.maps_path = value;
	
	default_value = path.resolve('/usr', 'bin', 'oppai');;
	
    if(config.oppai_path)
        default_value = config.oppai_path;
	
    console.log('');
    value = readline.question(`Path to oppai [${chalk.green(default_value)}]: `);
	
    if(!value)
        value = default_value;
	
    config.oppai_path = value;
	
	
	default_value = 'none';
	
    if(config.ffmpeg_path)
        default_value = config.ffmpeg_path;
	
    console.log('');
	    console.log(`(Optional) To speed up renders you may supply a custom FFmpeg binary, e.g. your system's by writing ${chalk.green("'ffmpeg'")}, otherwise a prebuilt is used.`);
    value = readline.question(`Custom FFmpeg binary path [${chalk.green(default_value)}]: `);
	
    if(!value)
        value = default_value;
	
    config.ffmpeg_path = value == 'none' ? "" : value;


    default_value = 'none';

    if(config.pp_path)
        default_value = config.pp_path;

    console.log('');
    console.log(`(Optional) To enable the ${config.prefix}pp command you need to supply a path to PerformanceCalculator.dll.
    To get it you need to compile ${chalk.blue('https://github.com/ppy/osu-tools')}.`);
    value = readline.question(`Path to PerformanceCalculator.dll [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.pp_path = value == 'none' ? "" : value;


    default_value = 'https://osu.lea.moe';

    if(config.beatmap_api)
        default_value = config.beatmap_api;

    console.log('');
    console.log("(Optional) Here you could supply your own beatmap api for star rating values, just leave this as-is cause it's unfortunately not open-source yet.");
    value = readline.question(`Beatmap API [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.beatmap_api = value;


    if(!('credentials' in config))
        config.credentials = {};


    default_value = 'none';

    if(config.credentials.bot_token)
        default_value = config.credentials.bot_token;

    do{
        console.log('');
        console.log(`(Required) A Discord bot token is required. You can create a bot here to receive one: ${chalk.blueBright('https://discord.com/developers/applications/')}.`);
        value = readline.question(`Discord bot token [${chalk.green(default_value)}]: `);

        if(!value)
            value = default_value;

        let client = new Discord.Client();

        valid_key = true;

        try{
            await client.login(value);
        }catch(e){
            valid_key = false;
        }

        if(valid_key)
            console.log(chalk.greenBright("Valid Discord bot token!"));
        else
            console.log(chalk.redBright("Invalid Discord bot token!"));
    }while(value == 'none' || !valid_key);

    config.credentials.bot_token = value;


    default_value = 'none';

    if(config.credentials.discord_client_id)
        default_value = config.credentials.discord_client_id;

    console.log('');
    console.log(`(Optional) Providing a Discord client ID will allow the bot to generate an invite link for you. It's not needed if you want to do it manually.`);
    value = readline.question(`Discord client ID [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.credentials.discord_client_id = value == 'none' ? "" : value;


    default_value = 'none';

    if(config.credentials.osu_api_key)
        default_value = config.credentials.osu_api_key;

    do{
        console.log('');
        console.log(`(Optional) An osu!api key is needed for the osu! commands to work. You can get one here: ${chalk.blueBright('https://osu.ppy.sh/p/api')}.`);
        value = readline.question(`osu!api key [${chalk.green(default_value)}]: `);

        if(!value)
            value = default_value;

        valid_key = true;

        if(value != 'none'){
            try{
                let result = await axios.get('https://osu.ppy.sh/api/get_beatmaps', { params: { limit: 1, k: value } });

                if(result.data.length == 0)
                    valid_key = false;
            }catch(e){
                valid_key = false;
            }

            if(valid_key)
                console.log(chalk.greenBright("Valid osu!api key!"));
            else
                console.log(chalk.redBright("Invalid osu!api key!"));
        }
    }while(!valid_key && value != 'none');

    config.credentials.osu_api_key = value == 'none' ? "" : value;

    default_value = 'none';
default_value2 = 'none';

if (config.credentials.client_id)
    default_value = config.credentials.client_id;

if (config.credentials.client_secret)
    default_value2 = config.credentials.client_secret;

do {
    console.log('');
    console.log(`(Optional) An osu! client id is needed for the osu! commands to work. You can get one here: ${chalk.blueBright('https://osu.ppy.sh/home/account/edit#oauth')}, at the bottom of the page`);
    value = readline.question(`oauth2 client id [${chalk.green(default_value)}]: `);

    if (!value)
        value = default_value;

    console.log('');
    console.log(`(Optional) An osu! client secret is needed for the osu! commands to work. You can get one here: ${chalk.blueBright('https://osu.ppy.sh/home/account/edit#oauth')}, at the bottom of the page`);
    value2 = readline.question(`oauth2 client secret [${chalk.green(default_value2)}]: `);

    if (!value2)
        value2 = default_value2;

    valid_key = true;

    if (value !== 'none' && value2 !== 'none') {
        try {
            const response = await axios.post('https://osu.ppy.sh/oauth/token', {
                client_id: value,
                client_secret: value2,
                grant_type: 'client_credentials',
                scope: 'public',
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            if (response.data && response.data.access_token) {
                console.log(chalk.greenBright("Valid osu! OAuth2 client id/secret!"));
            } else {
                valid_key = false;
                console.log(chalk.redBright("Invalid osu! OAuth2 client id/secret! No access token received."));
            }
        } catch (e) {
            valid_key = false;
            console.log(chalk.redBright("Invalid osu! OAuth2 client id/secret! Error occurred."));
        }
    }
} while (!valid_key && value !== 'none' && value2 !== 'none');

config.credentials.client_id = value === 'none' ? "" : value;
config.credentials.client_secret = value2 === 'none' ? "" : value2;
	
default_value = 'none';

do {
    let response;
    let valid_key = true;

    console.log('');
    console.log(`(Optional) An upload command for renders exceeding Discord's size limit, substitute {path} for the file path to upload, e.g. curl -X POST -F "file=@{path}" https://example.com/upload. The output of the command will get posted as the command response.`);
    value = readline.question(`Command: [${chalk.green(default_value)}]: `);

    if (!value) {
        value = default_value;
    }

    if (value !== 'none') {
        try {
            const [cmd, ...args] = value.split(' ');
            const resolvedPath = path.resolve(__dirname, 'README.md');
            const finalArgs = args.map(arg => arg.replace('{path}', resolvedPath));
            response = await execPromiseFile(cmd, finalArgs);
            if (response?.stderr) {
                throw new Error(response.stderr);
            }
        } catch (e) {
            valid_key = false;
            console.log(chalk.redBright("Upload command failed!"));
            console.error(`Error: ${e.message || e}`);
        }

        if (valid_key) {
            console.log(chalk.greenBright("Upload command success!"));
            console.log(`Output: ${response.stdout}`);
        }
    } else {
        break;
    }
} while (!valid_key);

config.upload_command = value === 'none' ? "" : value;

let valid_client_id = false;
let valid_token = false;
let valid_client_secret = false;

default_value = 'none';

if (config.credentials.twitch_client_id) {
    default_value = config.credentials.twitch_client_id;
}

do {
    console.log('');
    console.log(`(Optional) A Twitch Client ID is needed for the Twitch commands to work. You can get one here: ${chalk.blueBright('https://dev.twitch.tv/console/apps')}.`);
    let client_id = readline.question(`Twitch Client ID [${chalk.green(default_value)}]: `);

    if (!client_id) client_id = default_value;

    config.credentials.twitch_client_id = client_id === 'none' ? '' : client_id;

    console.log('');
    console.log(`(Optional) A Twitch OAuth Token is needed for the Twitch commands to work. You can generate one here: ${chalk.blueBright('https://twitchtokengenerator.com/')}.`);
    let token = readline.question(`Twitch OAuth Token [${chalk.green(config.credentials.twitch_token || 'none')}]: `);

    if (!token) token = config.credentials.twitch_token || 'none';

    config.credentials.twitch_token = token === 'none' ? '' : token;
    
    console.log('');
    console.log(`(Optional) A Twitch Client Secret is needed to refresh your token. You can generate one here: ${chalk.blueBright('https://dev.twitch.tv/console/apps')}.`);
    let client_secret = readline.question(`Twitch Client Secret [${chalk.green(config.credentials.twitch_client_secret || 'none')}]: `);

    if (!client_secret) client_secret = config.credentials.twitch_client_secret || 'none';

    config.credentials.twitch_client_secret = client_secret === 'none' ? '' : client_secret;

    if (!config.credentials.twitch_client_id) {
        valid_client_id = true;
    } else {
        try {
            await axios.get('https://api.twitch.tv/helix/streams', {
                headers: {
                    'Client-ID': config.credentials.twitch_client_id,
                    'Authorization': `Bearer ${config.credentials.twitch_token}`,
                },
            });
            valid_client_id = true;
            console.log(chalk.greenBright('Valid Twitch Client ID!'));
        } catch (e) {
            valid_client_id = false;
            console.log(chalk.redBright('Invalid Twitch Client ID!'));
        }
    }

    if (!config.credentials.twitch_token || !config.credentials.twitch_client_id) {
        valid_token = true;
    } else {
        try {
            const response = await axios.get('https://api.twitch.tv/helix/streams', {
                headers: {
                    'Client-ID': config.credentials.twitch_client_id,
                    'Authorization': `Bearer ${config.credentials.twitch_token}`,
                },
            });

            if (response.data && response.data.data.length > 0) {
                valid_token = true;
                console.log(chalk.greenBright('Valid Twitch OAuth Token!'));
            }
        } catch (e) {
            valid_token = false;
            console.log(chalk.redBright('Invalid Twitch OAuth Token!'));
        }
    }

    if (!config.credentials.twitch_client_id || !config.credentials.twitch_client_secret) {
        valid_client_secret = true;
    } else {
        try {
            const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                params: {
                    client_id: config.credentials.twitch_client_id,
                    client_secret: config.credentials.twitch_client_secret,
                    grant_type: 'client_credentials',
                },
            });
            valid_client_secret = true;
            console.log(chalk.greenBright('Valid Twitch Client Secret!'));
        } catch (e) {
            valid_client_secret = false;
            console.log(chalk.redBright('Invalid Twitch Client Secret!'));
        }
    }

} while (!valid_client_id || !valid_token || !valid_client_secret);

	
	default_value = 'none';

    if(config.credentials.twitch_refresh_token)
        default_value = config.credentials.twitch_refresh_token;

    console.log('');
    console.log(`(Optional) Providing a Twitch refresh token will allow the bot to automatically refresh your twitch token for you. It's not needed if you want to do it manually.`);
    value = readline.question(`Twitch refresh token [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.credentials.twitch_refresh_token = value == 'none' ? "" : value;

    default_value = 'none';

    if(config.credentials.pexels_key)
        default_value = config.credentials.pexels_key;

    do{
        console.log('');
        console.log(`(Optional) A Pexels API Key is needed for the ${config.prefix}flowa command to work. You can get one here: ${chalk.blueBright('https://www.pexels.com/api/new/')}.`);
        value = readline.question(`Pexels API Key [${chalk.green(default_value)}]: `);

        if(!value)
            value = default_value;

        valid_key = true;

        if(value != 'none'){
            try{
                await axios.get('https://api.pexels.com/v1/curated', { headers: { 'Authorization': value } });
            }catch(e){
                valid_key = false;
            }

            if(valid_key)
                console.log(chalk.greenBright("Valid Pexels API Key!"));
            else
                console.log(chalk.redBright("Invalid Pexels API Key!"));
        }
    }while(!valid_key && value != 'none');

    config.credentials.pexels_key = value == 'none' ? "" : value;


    default_value = 'none';

    if(config.credentials.last_fm_key)
        default_value = config.credentials.last_fm_key;

    do{
        console.log('');
        console.log(`(Optional) A Last.fm API Key is needed for the Last.fm commands to work. You can get one here: ${chalk.blueBright('https://www.last.fm/api/account/create')}.`);
        value = readline.question(`Last.fm API Key [${chalk.green(default_value)}]: `);

        if(!value)
            value = default_value;

        valid_key = true;

        if(value != 'none'){
            try{
                await axios.get('http://ws.audioscrobbler.com/2.0/', { params: { method: 'chart.gettopartists', api_key: value } });
            }catch(e){
                valid_key = false;
            }

            if(valid_key)
                console.log(chalk.greenBright("Valid Last.fm API Key!"));
            else
                console.log(chalk.redBright("Invalid Last.fm API Key!"));
        }
    }while(!valid_key && value != 'none');

    config.credentials.last_fm_key = value == 'none' ? "" : value;

    console.log('');

    try{
        fs.writeFileSync('./config.json', JSON.stringify(config, false, 2));
        console.log(chalk.greenBright('Config file has been written successfully!'));
    }catch(e){
        console.error(e);
        console.error(chalk.redBright("Couldn't write config file"));
    }

    process.exit();
})();
