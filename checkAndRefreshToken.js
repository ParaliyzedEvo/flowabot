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
const { twitch_token, twitch_client_id, twitch_refresh_token } = config.credentials || {};
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
      headers: { Authorization: `OAuth ${token}` },
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
  console.log(
    `You can get your client secret from one of your existing apps here: ${chalk.blueBright(
      "https://dev.twitch.tv/console/apps"
    )}`
  );
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
    console.log(chalk.green("Token refreshed and saved to config."));
  } catch (error) {
    console.error(chalk.red("Error refreshing token:"), error.message);
    process.exit(1);
  }
}

// Main function
(async function main() {
  if (!twitch_client_id || !twitch_token || !twitch_refresh_token) {
    console.log(chalk.yellow("Missing Twitch credentials. Skipping token validation and starting the bot..."));
    try {
      execSync("node index", { stdio: "inherit" });
    } catch (error) {
      console.error(chalk.red("Error while starting the bot:"), error.message);
      process.exit(1);
    }
    return;
  }

  const isValid = await validateToken(twitch_token); // Check if token is valid
  if (!isValid) { // If invalid, ask for client secret and refresh
    await refreshToken();
  }

  // Start the bot
  console.log(chalk.blue("Starting the bot..."));
  try {
    execSync("node index", { stdio: "inherit" });
  } catch (error) {
    console.error(chalk.red("Error while starting the bot:"), error.message);
    process.exit(1);
  }
})();
