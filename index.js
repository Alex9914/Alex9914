const axios = require('axios');
const sharp = require('sharp');
const { Octokit } = require('@octokit/core')

const crypto = require("crypto");
const FormData = require('form-data');

const TOKEN = process.env.token;
const EMAILS = process.env.emails?.split(",") ?? [];

const octokit = new Octokit({
    auth: process.env.ghPat
})

function hashEmail(email) {
    return crypto.createHash("sha256").update(email).digest("hex");
}

const hashedEmails = EMAILS.map(hashEmail);

async function run() {
    try {
        // delete old
        const lastId = process.env.lastId;
        const lastUrl = process.env.lastUrl;

        if (lastId && lastUrl) {
            console.log(`Deleting old pfp: ${lastId}, ${lastUrl}`);

            await axios.delete(`https://api.gravatar.com/v3/me/avatars/${lastId}`, {
                headers: { Authorization: `Bearer ${TOKEN}` }
            }).catch(_ => console.log("Old pfp already deleted."));
        }

        // get imgUrl
        const imgUrl = (await axios.get('https://nekos.best/api/v2/neko')).data.results[0].url;
        const imageBuffer = (await axios.get(imgUrl, { responseType: 'arraybuffer' })).data;

        // get general place of head
        const croppedBuffer = await sharp(imageBuffer)
            .resize(800, 800, {
                position: 'north',
            })
            .jpeg({ quality: 90 })
            .toBuffer();

        // try and crop as close to the head as possible
        const croppedBuffer2 = await sharp(croppedBuffer)
            .resize(800, 800, {
                strategy: 'attention'
            })
            .jpeg({ quality: 90 })
            .toBuffer();

        // upload to gravatar
        const form = new FormData();
        form.append('image', croppedBuffer2, {
            filename: 'img.png',
            contentType: 'image/png'
        });

        const uploadRes = await axios.post('https://api.gravatar.com/v3/me/avatars', form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${TOKEN}`,
                'Accept': 'application/json'
            }
        });

        const imgId = uploadRes.data["image_id"];
        console.log(`Uploaded new pfp: ${imgId}, ${imgUrl}`);

        // change all emails to use new pfp
        for (const emailHash of hashedEmails) {
            await axios.post(`https://api.gravatar.com/v3/me/avatars/${imgId}/email`, {
                email_hash: emailHash
            },
            {
                headers: {
                    'Authorization': `Bearer ${TOKEN}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
        };

        // cache new pfp data
        await octokit.request('PATCH /repos/{owner}/{repo}/actions/variables/{name}', {
            owner: 'Alex9914',
            repo: 'Alex9914',
            name: 'PFP_DATA',
            value: JSON.stringify({
                "lastId": imgId,
                "lastUrl": imgUrl
            }),
            headers: {
                'X-GitHub-Api-Version': '2026-03-10'
            }
        })
    } catch (err) {
        console.error(err.response?.data || err.message);
        process.exit(1);
    }
}

run();