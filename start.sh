#!/bin/sh

cat > config.json << EOF
{
  "prefix": "!!",
  "debug": true,
  "osu_cache_path": "/tmp/osumaps",
  "replay_path": "/tmp/osureplays",
  "maps_path": "/tmp/osumapsets",
  "oppai_path": "$(which oppai)",
  "oppai_old_path": "$(which oppaiold)",
  "ffmpeg_path": "$(which ffmpeg)",
  "pp_path": "/opt/osu-tools/PerformanceCalculator/bin/Debug/net8.0/PerformanceCalculator.dll",
  "beatmap_api": "https://osu.lea.moe",
  "credentials": {
    "bot_token": "${DISCORD_TOKEN}",
    "discord_client_id": "${DISCORD_CLIENT_ID}",
    "osu_api_key": "${OSU_API_KEY}",
    "client_id": "${CLIENT_ID}",
    "client_secret": "${CLIENT_SECRET}",
    "twitch_client_id": "${TWITCH_CLIENT_ID:-}",
    "twitch_token": "${TWITCH_ACCESS_TOKEN:-}",
    "twitch_client_secret": "${TWITCH_CLIENT_SECRET:-}",
    "twitch_refresh_token": "${TWITCH_REFRESH_TOKEN:-}",
    "pexels_key": "${PEXELS_API_KEY:-}",
    "last_fm_key": "${LASTFM_API_KEY:-}"
  },
  "upload_command": "upload"
}
EOF

echo "Config generated successfully!"
echo "Verifying installations..."
echo "ffmpeg: $(which ffmpeg)"
echo "oppai: $(which oppai)"
echo "oppaiold: $(which oppaiold)"
echo "dotnet: $(which dotnet)"
ls -la /opt/osu-tools/PerformanceCalculator/bin/Debug/net8.0/ || echo "Warning: PP calculator path check failed"
echo "Starting Flowabot..."
exec node checkAndRefreshToken.js