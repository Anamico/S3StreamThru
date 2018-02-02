
const express = require('express');
const redis = require('redis').createClient();
const app = express();

const S3StreamThru = require('../lib');

let streamThruMiddleware = S3StreamThru({
    path: '/upload',
    s3Options: {
        accessKeyId: process.env.AWS_ACCESS_KEY || "******************",
        secretAccessKey: process.env.AWS_SECRET_KEY || "**********************",
        region: 'us-east-1'
    },
    s3: {
        bucket: process.env.AWS_BUCKET || '****.****.****',
        path: '/'
    },
    getFileName: function() {
        return 'test.png';
    },
    getS3Id: function(req, callback) {
        let fileUUID = req.header.fileUUID;
        redis.get(fileUUID, function (err, reply) {
            if (err || !reply) { return callback(err, reply); }
            console.log(reply);
            return callback(null, JSON.parse(reply));
        });
    },
    setS3Id: function(req, data, callback) {
        let fileUUID = req.header.fileUUID;
        redis.set(fileUUID, JSON.stringify(data), callback);
    },
    log: console.log
});

app.use(streamThruMiddleware);

app.get('/', (req, res) => res.send('Hello World!'));

app.get('/upload', (req, res) => {
    res.send('Chunk Upload Success!');
});


app.listen(3000, () => console.log('Example app listening on port 3000!\nPOST an image to /uppload to try it out'));