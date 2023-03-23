import * as fs from "fs";
import * as readline from "readline";
import { google } from "googleapis";

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = 'token.json';
const REMOVAL_MODIFIED_TIME = '2022-09-30';

async function run() {
    const cred = await getCredentials();
    
    if (!cred) {
        return;
    }

    const auth = await authorize(cred);

    if (!auth) {
        return;
    }

    const drive = google.drive({ version: 'v3', auth });
    const files = await listFiles(drive);

    for (const file of files) {
        await processFile(drive, file);
    }
}

function getCredentials() {
    return new Promise(resolve => {
        fs.readFile('credentials.json', (err, content) => {
            if (err) {
                console.log('Error loading client secret file:', err);
                resolve(null);
            } else {
                resolve(JSON.parse(content));
            }
        });
    });
}

function authorize(cred) {
    const { client_secret, client_id, redirect_uris } = cred.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    return new Promise(resolve => {
        fs.readFile(TOKEN_PATH, async (err, token) => {
            if (err) {
                const accessToken = await getAccessToken(oAuth2Client);

                if (!accessToken) {
                    resolve(null);
                } else {
                    oAuth2Client.setCredentials(accessToken);
                    resolve(oAuth2Client);
                }
            } else {
                oAuth2Client.setCredentials(JSON.parse(token));
                resolve(oAuth2Client);
            }
        });
    });
}

async function getAccessToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('Authorize this app by visiting this url:', authUrl);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => {
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            oAuth2Client.getToken(code, (err, token) => {
                if (err) {
                    console.error('Error retrieving access token', err);
                    resolve(null);
                } else {
                    fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                        if (err) {
                            console.error(err);
                            resolve(null);
                        } else {
                            console.log('Token stored to', TOKEN_PATH);
                            resolve(token);
                        }
                    });
                }
            });
        });
    });
}

async function listFiles(drive) {
    let token = '';
    let list = [];

    while (true) {
        const { pageToken, files } = await getFiles(drive, token);
        token = pageToken;
        list.push(...files);

        if (!token) {
            break;
        }
    }

    return list;
}

async function getFiles(drive, pageToken) {
    return new Promise(resolve => {
        drive.files.list({
            corpora: 'user',
            pageSize: 10,
            q: "name contains '.royal'",
            pageToken: pageToken ? pageToken : '',
            fields: 'nextPageToken, files(*)',
        }, (err, res) => {
            if (err) {
                console.log('The API returned an error: ' + err);
                resolve({
                    pageToken: null,
                    files: [],
                });
            } else {
                resolve({
                    pageToken: res.data.nextPageToken,
                    files: res.data.files,
                });
            }
        });
    });
}

async function processFile(drive, file) {
    const fileId = file.id;
    const response = await drive.revisions.list({ fileId });
    const revisions = response.data.revisions;

    for (const revision of revisions) {
        if (!revision.modifiedTime.includes(REMOVAL_MODIFIED_TIME)) {
            continue;
        }

        drive.revisions.delete({
            fileId,
            revisionId: revision.id,
        })
            .then(() => {
                console.log(`Revision removed: ${file.name}`);
            })
            .catch((err) => {
                console.log(`Execute error: ${err}, File name: ${file.name}, Revision time: ${revision.modifiedTime}`);
            });
    }
}

run();
