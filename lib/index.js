const async = require('async');
const AWS = require('aws-sdk');
const through2 = require('through2');

/*

config = {
    path: '/test'                         <- path to listen to for pushing items to s3
    getS3Id: function(req, callback)      <- return the correct s3 id for this file
}

 */
module.exports = function(config) {

    let s3 = config.s3Client || new AWS.S3(config.s3Options);

    //
    // start a new upload, but only if required
    //
    function createNewUpload(req, callback) {
        var params = {
            Bucket: config.s3.bucket,
            Key: config.s3.path + config.getFilename(req)
        };
        s3.createMultipartUpload(params, function(err, s3data) {
            if (err) {
                config.log(err, err.stack);
                return callback(err);
            }

            config.log('s3 data', s3data);

            config.setS3Id(req, s3data, function(err, response) {
                return callback(err, s3data);
            });
            /*
             data = {
             Bucket: "examplebucket",
             Key: "largeobject",
             UploadId: "ibZBv_75gd9r8lH_gqXatLdxMVpAlj6ZQjEs.OwyF3953YdwbcQnMA2BLGn8Lx12fQNICtMw5KyteFeHw.Sjng--"
             }
             */
        });
    }

    //
    // upload a part
    //
    function uploadPart(req, data, callback) {
        let s3data = data.s3data;
        const bodyPipe = through2((data, enc, cb) => { cb(null, data); });

        var params = {
            Body: bodyPipe,
            Bucket: s3data.Bucket,
            Key: s3data.Key,
            PartNumber: req.headers.part || 1,
            UploadId: s3data.UploadId,
            ContentLength: req.headers.contentlength,
            ContentMD5: req.headers.ContentMD5
        };

        s3.uploadPart(params, function(err, data) {
            if (err) {
                console.log(err, err.stack);
                return callback(err);
            }

            console.log('uploadPart response', data);           // successful response
            /*
             data = {
             ETag: "\"d8c2eafd90c266e19ab9dcacc479f8af\""
             }
             */
            return callback(null, data.ETag);
        });

        req.pipe(bodyPipe);

        // todo: req.on('error' ??
    }

    //
    // assemble the middleware
    //
    function completeUpload(req, data, callback) {
        let s3data = data.s3data;
        let status = data.status;
        parts = Object.keys(status.parts).map(function(key) {
            let eTag = status.parts[key];
            return {
                PartNumber: parseInt(key),
                ETag: '\"' + eTag + '\"'
            }
        }).sort((a, b) => a.PartNumber > b.PartNumber);
        console.log('completed parts', parts);
        var params = {
            Bucket: s3data.Bucket,
            Key: s3data.Key,
            MultipartUpload: {
                Parts: parts
            },
            UploadId: s3data.UploadId
        };
        s3.completeMultipartUpload(params, function(err, data) {
            if (err) {
                console.log(err, err.stack);
                return callback(err);
            }

            console.log(data);           // successful response
            req.s3data = data;

            callback(err, true);
            /*
             data = {
                 Bucket: "acexamplebucket",
                 ETag: "\"4d9031c7644d8081c2829f4ea23c55f7-2\"",
                 Key: "bigobject",
                 Location: "https://examplebucket.s3.amazonaws.com/bigobject"
             }
             */
        });
    }




    //
    // assemble the middleware
    //
    var middleware = function (req, res, next) {

        if ((req.path != config.path) || (req.method != "POST")) {
            config.log('ignoring non post, non path request')
            return next();
        }

        config.log('sending to s3');
        req.setEncoding('utf8');

        async.auto({

            //
            // retrieve the destination s3 file data or create if this is the first part
            //
            s3data: function(callback) {
                config.getS3Id(req, function(err, data) {
                    if (err) { return callback(err); }
                    if (data) { return callback(null, data); }

                    // no upload data
                    createNewUpload(req, callback);
                });
            },

            //
            // transfer this part straight through to S3
            //
            eTag: ['s3data', uploadPart.bind(this, req)],

            //
            // record successful part upload
            //
            status: ['eTag', function(data, callback) {
                config.partCompleted(req, data.eTag, callback);
            }],

            //
            // is this the final part? If so, clean up and pass through to the router
            //
            completion: ['status', function(data, callback) {
                let status = data.status;
                config.log('status', status);
                let completedCount = Object.keys(status.parts).length;
                if (completedCount >= status.expecting) {
                    return completeUpload(req, data, callback);
                }
                return callback(null);
            }]

        }, function(err, result) {
            if (err) {
                return res.status(500).send(JSON.stringify(err));
            }
            if (!result.completion) {
                return res.status(200).end();
            }
            next();
        });



    };
    return middleware;
};


// client.set("string key", "string val", redis.print);

// client.get("missingkey", function(err, reply) {
//      reply is null when the key is missing
//      console.log(reply);
// });

