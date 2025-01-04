const fs = require("fs");
const axios = require("axios");
const readline = require("readline");

// Path to the config file (same directory)
const CONFIG_FILE = "config.json";

// Load the configuration
let config;
if (fs.existsSync(CONFIG_FILE)) {
  config = require(`./${CONFIG_FILE}`);
} else {
  console.error("Config file not found!");
  process.exit(1);
}

const { twitch_token, twitch_client_id, twitch_refresh_token } = config.credentials;
const TOKEN_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
const TOKEN_REFRESH_URL = "https://id.twitch.tv/oauth2/token";

// Function to prompt user input
const promptUserInput = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => rl.question(query, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
};

// Validate the Twitch token
async function validateToken(token) {
  try {
    const response = await axios.get(TOKEN_VALIDATE_URL, {
      headers: { Authorization: `OAuth ${token}` },
    });
    console.log("Token is valid.");
    return true;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log("Token is invalid or expired.");
      return false;
    }
    console.error("Error validating token:", error.message);
    process.exit(1);
  }
}

// Refresh the Twitch token
async function refreshToken() {
  console.log(`You can get your client secret from one of your exsiting apps here: ${chalk.blueBright('https://dev.twitch.tv/console/apps')}`);
  const clientSecret = await promptUserInput("Enter your Twitch Client Secret: ");
  try {
    const response = await axios.post(TOKEN_REFRESH_URL, null, {
      params: {
        grant_type: "refresh_token",
        refresh_token: twitch_refresh_token,
        client_id: twitch_client_id,
        client_secret: clientSecret,
      },
    });

    const newToken = response.data.access_token;

    // Update the configuration file with the new token
    config.credentials.twitch_token = newToken;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log("Token refreshed and saved to config.");
  } catch (error) {
    console.error("Error refreshing token:", error.message);
    process.exit(1);
  }
}

(async function main() {
  const isValid = await validateToken(twitch_token); // Check if token is valid
  if (!isValid) { // If invalid, ask for client secret and refresh
    await refreshToken();
  }
  process.exit(0); // Exit after process is complete
})();
