const axios = require('axios');

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { fork } = require('child_process');
const config = require('../config.json');
const { calculate_ur } = require("./ur_processor");

async function calculateUr(options) {
    try {
        // Validate critical inputs
        if (!options.score_id) {
            throw new Error("Missing required property: score_id.");
        }
        if (!config.replay_path) {
            throw new Error("Missing configuration for replay_path.");
        }

        // Construct the replayPath
        const replayPath = path.resolve(config.replay_path, `${options.score_id}.osr`);
        console.log("replayPath:", replayPath);

        await fs.mkdir(config.replay_path, { recursive: true });

        let replayExists = await fs.stat(replayPath).then(() => true, () => false);
        if (!replayExists) {
            const response = await axios.get(
                `https://osu.ppy.sh/api/v2/scores/${options.score_id}/download`,
                {
                    responseType: "arraybuffer",
                    headers: {
                        Authorization: `Bearer ${options.access_token}`,
                    },
                }
            );

            if (!response || response.status !== 200) {
                throw new Error("Failed to download replay data.");
            }

            const replayRaw = response.data;
            await fs.writeFile(replayPath, replayRaw, { encoding: "binary" });
        }

        // Additional processing...
    } catch (error) {
        console.error("Error in calculateUr:", error);
        throw error;
    }
}

module.exports = {
    get_ur: calculateUr
};
