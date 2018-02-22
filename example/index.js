
const express = require('express');
const redis = require('redis').createClient();
const app = express();
//const ScriptManager = require("redis-scripts");
const S3StreamThru = require('../lib');
const async = require('async');
const fs = require('fs');
var sm = null;

//redis.on("ready", function (err) {
//    sm = new ScriptManager(redis);
//
//    // Load all Lua scripts in a directory into Redis
//    sm.load("./findorcreate.lua", function (err) {
//        if (err) {
//            console.log("Error " + err);
//            process.exit(1);
//        }
//    });
//});

const findOrCreate = fs.readFileSync(__dirname + '/findorcreate.lua');

let streamThruMiddleware = S3StreamThru({
    path: '/upload',                        // this is the route for the middleware
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
        bucket: process.env.AWS_BUCKET || '****.****.****'
    },
    getPath: function(req) {                    // used to avoid namespace clashes
        return 'upload/' + req.headers.fileuuid + '/';
    },
    getFilename: function(req) {                // recommend using the file upload name to retain the same name on later downloads
        return req.headers.filename;
    },
    getS3Id: function(req, callback) {
        let fileuuid = req.headers.fileuuid;
        let redisKey = 'file_' + fileuuid;
        // NOTE: This MUST be atomic!
        // otherwise you may get 2 parts of the same file arrive concurrently and be assigned different S3 ids. So the whole thing fails to complete
        // can use this lua for an atomic operation hack on a single server installation, or maybe redlock as an option in bigger installations.
        async.retry({times: 200, interval: 1000}, function(callback) {
            console.log('retry block', redisKey);
            redis.eval(findOrCreate, 1, redisKey, function (err, reply) {
                if (err || reply == '') {
                    callback(new Error('retry'));
                    return
                }
                console.log('uploading', redisKey, reply);
                return callback(null, (reply != 'NEW') && JSON.parse(reply));
            });
        }, callback);
    },
    setS3Id: function(req, data, callback) {
        let fileuuid = req.headers.fileuuid;
        let redisKey = 'file_' + fileuuid;
        console.log('set', redisKey, data);
        redis.set(redisKey, JSON.stringify(data), callback);
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