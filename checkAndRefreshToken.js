const fs = require("fs");
const axios = require("axios");
const readline = require("readline");
const { execSync } = require("child_process");
const chalk = require("chalk");

// Path to the config file (same directory)
const CONFIG_FILE = "config.json";

// Load the configuration
let config;
if (fs.existsSync(CONFIG_FILE)) {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
} else {
  console.error("Config file not found!");
  process.exit(1);
}

// Extract Twitch credentials
const {
  twitch_token,
  twitch_client_id,
  twitch_client_secret,
  twitch_refresh_token
} = config.credentials || {};
const TOKEN_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
const TOKEN_REFRESH_URL = "https://id.twitch.tv/oauth2/token";

// Function to prompt user input
const promptUserInput = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
};

// Validate the Twitch token
async function validateToken(token) {
  try {
    const response = await axios.get(TOKEN_VALIDATE_URL, {
      headers: {
        Authorization: `OAuth ${token}`
      },
    });
    console.log(chalk.green("Token is valid."));
    return true;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log(chalk.yellow("Token is invalid or expired."));
      return false;
    }
    console.error(chalk.red("Error validating token:"), error.message);
    process.exit(1);
  }
}

// Refresh the Twitch token
async function refreshToken() {
  // Check if refresh token is missing
  if (!config.credentials.twitch_refresh_token) {
    console.log('Missing Twitch refresh token.');
    const refreshToken = await promptUserInput('Please enter your Twitch Refresh Token: ');
    config.credentials.twitch_refresh_token = refreshToken; // Store it in config
  }

  // Check if client secret is missing
  if (!config.credentials.twitch_client_secret) {
    console.log('Missing Twitch Client Secret.');
    const clientSecret = await promptUserInput('Please enter your Twitch Client Secret: ');
    config.credentials.twitch_client_secret = clientSecret; // Store it in config
  }

  // Ensure both values are available before proceeding
  if (config.credentials.twitch_refresh_token && config.credentials.twitch_client_secret) {
    try {
      const response = await axios.post(TOKEN_REFRESH_URL, null, {
        params: {
          grant_type: 'refresh_token',
          refresh_token: config.credentials.twitch_refresh_token, // Use the value from config
          client_id: config.credentials.twitch_client_id,
          client_secret: config.credentials.twitch_client_secret, // Use the value from config
        },
      });

      // Handle the successful response
      console.log('Token refreshed successfully');
      // Save the new token into config
      config.credentials.twitch_token = response.data.access_token;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Error refreshing token:', error.response ? error.response.data : error.message);
    }
  }
}

// Main async function
async function main() {
  const isValid = await validateToken(twitch_token); // Check if token is valid
  if (!isValid) { // If invalid, ask for client secret and refresh
    await refreshToken();
  }

  // Start the bot
  console.log(chalk.blue("Starting the bot..."));
  try {
    execSync("node index", {
      stdio: "inherit"
    });
  } catch (error) {
    console.error(chalk.red("Error while starting the bot:"), error.message);
    process.exit(1);
  }
}

// Call the main function to kick off the process
main();
