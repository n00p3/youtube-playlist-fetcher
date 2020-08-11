const os = require('os')

module.exports = {
    /**
     * Your YouTube Data APIv3 key.
     * You can generate it at https://console.developers.google.com/
     * BTW: you also need to download `client_secret.json'.
     */
    apiKey: 'YOUR API KEY',

    /**
     * Your channelId.
     */
    channelId: 'YOUR CHANNEL ID',

    /**
     * List of YouTube playlists you want to sync.
     * Leave empty to sync all.
     */
    playlistIds: [''],

    /**
     * Path where files will be saved.
     */
    outputPath: `${os.homedir()}/Movies/youtube-playlist-fetcher`,

    /**
     * Timeout (in seconds) between downloads to avoid ban.
     */
    downloadTimeout: 10,
}