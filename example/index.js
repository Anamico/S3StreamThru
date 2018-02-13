
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
    getFilename: function(req) {
        return req.headers.filename;
    },
    getS3Id: function(req, callback) {
        let fileuuid = req.headers.fileuuid;
        redis.get(fileuuid, function (err, reply) {
            if (err || !reply) { return callback(err, reply); }
            console.log(reply);
            return callback(null, JSON.parse(reply));
        });
    },
    setS3Id: function(req, data, callback) {
        let fileuuid = req.headers.fileuuid;
        redis.set('file_' + fileuuid, JSON.stringify(data), callback);
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
    log: console.log
});

app.use(streamThruMiddleware);

app.get('/', (req, res) => res.send('POST a file to http://localhost:3000/upload!'));

app.post('/upload', (req, res) => {
    // clean up
    let fileuuid = req.headers.fileuuid;
    redis.del('file_' + fileuuid);
    redis.del('parts_' + fileuuid);
    res.send('Chunk Upload Success!', req.headers.fileuuid, ' -> ', req.s3Path);
});


app.listen(3000, () => console.log('Example app running.\n\nPOST an image to http://localhost:3000/upload to try it out'));