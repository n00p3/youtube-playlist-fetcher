var fs = require('fs');
var readline = require('readline');
var {google} = require('googleapis');
var OAuth2 = google.auth.OAuth2;
const opn = require('opn')
const config = require('./config');
const path = require('path');
const youtubeDl = require('youtube-dl');

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/youtube-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'youtube-nodejs-quickstart.json';

// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
    if (err) {
        console.log('Error loading client secret file: ' + err);
        return;
    }
    // Authorize a client with the loaded credentials, then call the YouTube API.
    authorize(JSON.parse(content), getChannel);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function (err, token) {
        if (err) {
            getNewToken(oauth2Client, callback);
        } else {
            oauth2Client.credentials = JSON.parse(token);
            callback(oauth2Client);
        }
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    opn(authUrl)
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function (code) {
        rl.close();
        oauth2Client.getToken(code, function (err, token) {
            if (err) {
                console.log('Error while trying to retrieve access token', err);
                return;
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client);
        });
    });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) throw err;
        console.log('Token stored to ' + TOKEN_PATH);
    });
}

/**
 * Filters playlists to download based on config parameter `playlistIds`.
 * @param ytPlaylists {[{id: string, title: string, description: string}]}
 * @returns {[{id: string, title: string, description: string}]}
 */
function filterPlaylists(ytPlaylists) {
    const filtered = ytPlaylists.filter(it => config.playlistIds.includes(it.id))
    if (config.playlistIds.length === 0) {
        console.log('`playlistIds` is empty. Downloading every playlist.');
        return ytPlaylists;
    }
    console.log(`Passed ${ytPlaylists.length} playlists of which ${filtered.length} are marked for download.`);
    return filtered;
}

function getPlaylists(auth) {
    var service = google.youtube('v3');
    return new Promise((resolve, reject) => {
        service.playlists.list({
            auth: auth,
            part: 'snippet,contentDetails',
            mine: true,
            // forUsername: 'GoogleDevelopers'
        }, (err, ok) => {
            if (err) {
                reject(err)
            } else {
                resolve(ok.data.items.map(it => {
                    return {
                        id: it.id,
                        title: it.snippet.title,
                        description: it.snippet.description,
                    }
                }))
            }
        })
    })
}

/**
 * @param playlist {{ title: string, id: string}}
 * @param video {{ title: string, description: string, videoId: string }}
 * @param auth
 * @returns {Promise}
 */
function downloadVideo(playlist, video, auth) {
    let downloaded = 0;
    const p = path.join(
        config.outputPath,
        `${playlist.title} ${playlist.id}`,
        `${video.title} ${video.videoId}`
    )

    if (fs.existsSync(path.join(
        config.outputPath,
        `${playlist.title} ${playlist.id}`,
        `${video.title} ${video.videoId}`
        ))) {
        console.log(`Video ${video.title} is already downloaded, skipping.`);
        return new Promise(() => {});
    }

    fs.writeFileSync(p + '.txt', video.description)

    return new Promise((resolve, reject) => {
        const videoDl = youtubeDl(`https://www.youtube.com/watch?v=${video.videoId}`)

        videoDl.on('info', function(info) {
            console.log('Download started')
            console.log('filename: ' + info._filename)

            // info.size will be the amount to download, add
            let total = info.size + downloaded
            console.log('size: ' + total)

            if (downloaded > 0) {
                // size will be the amount already downloaded
                console.log('resuming from: ' + downloaded)

                // display the remaining bytes to download
                console.log('remaining bytes: ' + info.size)
            }
        })

        if (!fs.existsSync(path.dirname(p)))
            fs.mkdirSync(path.dirname(p))

        videoDl.pipe(fs.createWriteStream(p), { flags: 'a' });

        videoDl.on('end', () => {
            console.log(`${video.title} downloaded.`)
            resolve()
        })
    })
}

/**
 * @param playlist {{id: string, title: string}}
 * @param videos {[{videoId: string, title: string, description: string}]}
 * @param auth
 */
async function playlistDownloaderHandler(playlist, videos, auth) {
    setTimeout(async () => {
        if (videos.length > 0) {
            await downloadVideo(playlist, videos[0], auth)
            await playlistDownloaderHandler(playlist, videos.slice(1), auth)
        }
    }, config.downloadTimeout * 1000)
}

/**
 * @param playlistId
 * @param auth
 * @param pageToken
 * @param outArr {function(err, ok)}
 */
function getPlaylistVideosHandler(playlistId, auth, pageToken, outArr, callback) {
    const service = google.youtube('v3');
    service.playlistItems.list({
        auth: auth,
        part: 'snippet,contentDetails',
        mine: true,
        playlistId,
        maxResults: 50,
        pageToken,
    }, (err, ok) => {
        if (err)
            callback(err, null)
        else {
            outArr = outArr.concat(ok.data.items)
            if (Object.keys(ok.data).includes('nextPageToken')) {
                return getPlaylistVideosHandler(playlistId, auth, ok.data.nextPageToken, outArr, callback)
            } else {
                callback(null, outArr)
            }
        }
    })
}

function getPlaylistVideos(playlist, auth) {
    new Promise((resolve, reject) => {
        getPlaylistVideosHandler(playlist.id, auth, null, [], (err, out) => {
            console.log(out)
            const parsed = []

            out.map(it => {
                parsed.push({
                    title: it.snippet.title,
                    description: it.snippet.description,
                    videoId: it.contentDetails.videoId,
                })
            })

            playlistDownloaderHandler(playlist, parsed, auth)

            resolve(out)
        })
    })
}

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getChannel(auth) {
    var service = google.youtube('v3');
    service.channels.list({
        auth: auth,
        part: 'snippet,contentDetails,statistics',
        mine: true,
        // forUsername: 'GoogleDevelopers'
    }, function (err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        var channels = response.data.items;
        if (channels.length === 0) {
            console.log('No channel found.');
        } else {
            console.log('This channel\'s ID is %s. Its title is \'%s\', and ' +
                'it has %s views.',
                channels[0].id,
                channels[0].snippet.title,
                channels[0].statistics.viewCount);
            // getPlaylists(auth)
            //     .then(n => {
            //         // console.log(n)
            //         const filtered = filterPlaylists(n)
            //         playlistDownloaderHandler(filtered)
            //     }).catch(e => console.error(e))
            getPlaylistVideos({ id: '', title: 'test' }, auth)
        }
    });
}

