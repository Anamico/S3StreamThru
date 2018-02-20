
const express = require('express');
const redis = require('redis').createClient();
const app = express();

const S3StreamThru = require('../lib');

let streamThruMiddleware = S3StreamThru({
    path: '/upload',
    s3Options: {
        accessKeyId: process.env.AWS_ACCESS_KEY || "******************",
        secretAccessKey: process.env.AWS_SECRET_KEY || "**********************",
        region: 'us-east-1',
        http: {
            timeout: 240
        },
        timeout: 240
    },
    s3: {
        bucket: process.env.AWS_BUCKET || '****.****.****',
        path: 'upload/'
    },
    getFilename: function(req) {
        return req.headers.filename;
    },
    getS3Id: function(req, callback) {
        let fileuuid = req.headers.fileuuid;
        redis.get(fileuuid, function (err, reply) {
            if (err || !reply) { return callback(err, reply); }
            console.log('uploading', fileuuid, reply);
            return callback(null, JSON.parse(reply));
        });
    },
    setS3Id: function(req, data, callback) {
        let fileuuid = req.headers.fileuuid;
        redis.set('file_' + fileuuid, JSON.stringify(data), callback);
    },
    partEtag: function(req, callback) {
        let fileuuid = req.headers.fileuuid;
        let redisKey = 'parts_' + fileuuid;
        redis.hget(redisKey, req.headers.part || 1, function(err, eTag) {
            if (err) {
                return callback(err);
            }
            return callback(err, eTag);
        });
    },
    partCompleted: function(req, eTag, callback) {
        let fileuuid = req.headers.fileuuid;
        let redisKey = 'parts_' + fileuuid;
        redis.hset(redisKey, req.headers.part || 1, eTag, function(err, response) {
            if (err) {
                return callback(err);
            }
            redis.hgetall(redisKey, function(err, parts) {
                let status = {
                    expecting: parseInt(req.headers.totalparts),
                    parts: parts
                };
                return callback(err, status);
            })
        });
    },
    cleanup: function(req, callback) {
        let fileuuid = req.headers.fileuuid;
        redis.del('file_' + fileuuid);
        redis.del('parts_' + fileuuid);
        return callback && callback(null);
    },
    log: console.log
});

app.use(streamThruMiddleware);

app.get('/', (req, res) => res.send('POST a file to http://localhost:3000/upload!'));

app.post('/upload', (req, res) => {
    // clean up
    console.log('received file');
    res.status(200).json({
        message: 'Chunk Upload Success!',
        fileUUID: req.headers.fileuuid,
        s3Path: req.s3Path
    });
});


app.listen(3000, () => console.log('Example app running.\n\nPOST an image to http://localhost:3000/upload to try it out'));