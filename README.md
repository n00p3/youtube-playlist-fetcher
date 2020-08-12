# youtube-playlist-fetcher
Reeeee youtube removed another video from my playlist

This script downloads all playlists from your YouTube account, even the private ones.

## How to use
* Generate YouTube Data API v3 at https://console.developers.google.com/
* Paste your Api Key and channel id into `config.js`
* Download your client secret from Google Console, rename it to `client_secret.json` and paste into the root directory of this project
* `yarn install && node index.js`
* On first run you will need to grant permissions (browser window should open, just follow instructions) it's one time operation.

You can add it to crontab or something.
