const async = require('async');
const AWS = require('aws-sdk');
//const through2 = require('through2');

/*

config = {
    path: '/test'                         <- path to listen to for pushing items to s3
    getS3Id: function(req, callback)      <- return the correct s3 id for this file
}

 */
module.exports = function(config) {

    let s3 = config.s3Client || new AWS.S3(config.s3Options);

    //
    // find or start the multipart file upload
    //
    function createNewUpload(req, callback) {
        var params = {
            Bucket: config.s3.bucket,
            Key: (config.getPath(req) || '') + config.getFilename(req)
        };
        s3.createMultipartUpload(params, function(err, s3data) {
            if (err) {
                config.log(err, err.stack);
                return callback(err);
            }

            config.log('s3 data', JSON.stringify(s3data));

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
        var accum = 0;
        //const bodyPipe = through2({ /*encoding: 'utf8',*/ decodeStrings: false }, (data, enc, cb) => {
        //    accum = accum + data.length;
        //    console.log('chunk ', req.headers.part, data.length, accum);
        //    cb(null, data);
        //});

        var params = {
            Body: req,
            Bucket: s3data.Bucket,
            Key: s3data.Key,
            PartNumber: req.headers.part || 1,
            UploadId: s3data.UploadId,
            ContentLength: req.headers.contentlength,
            ContentMD5: req.headers.ContentMD5
        };

        console.log('uploadPart ', req.headers.part);
        s3.uploadPart(params, function(err, data) {
            if (err) {
                console.log(err, err.stack);
                return callback(err);
            }

            //bodyPipe.end();

            console.log('uploadPart response', req.headers.part, JSON.stringify(data));           // successful response
            /*
             data = {
             ETag: "\"d8c2eafd90c266e19ab9dcacc479f8af\""
             }
             */
            return callback(null, data.ETag /*.replace(/"/g, '')*/);
        });

        //req.setEncoding('utf8');
        req.on('finish', function() {
            console.log('***** pipe finished ******');
        });

        // todo: req.on('error' ??
    }

    //
    // assemble the middleware
    //
    function completedAllParts(req, data, callback) {
        let s3data = data.s3data;
        let status = data.status;
        parts = Object.keys(status.parts).map(function(key) {
            let eTag = status.parts[key];
            return {
                PartNumber: parseInt(key),
                ETag: eTag
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

            callback(null);
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
            eTag: ['s3data', function(data, callback) {
                config.partEtag(req, function(err, eTag) {
                    if (err) { return callback(err); }
                    if (eTag) { return callback(null, eTag); }
                    uploadPart(req, data, callback);
                });
            }],

            //
            // record successful part upload
            //
            status: ['eTag', function(data, callback) {
                console.log('status');
                config.partCompleted(req, data.eTag, callback);
            }]

            //
            // is this the final part? If so, clean up and pass through to the router
            //
            //completion: ['status', function(data, callback) {
            //    let status = data.status;
            //    let completedCount = Object.keys(status.parts).length;
            //    config.log('completed', completedCount, 'of', status.expecting, status);
            //    if (completedCount == status.expecting) {
            //        return completedAllParts(req, data, callback);
            //    }
            //    return callback(null, false);
            //}]

        }, function(err, result) {
            if (err) {
                console.log('abort part');
                return res.status(500).send(JSON.stringify(err));
            }

            let status = result.status;
            let completedCount = Object.keys(status.parts).length;
            config.log('completed', req.headers.part, ' (', completedCount, 'of', status.expecting, ') ', status);
            if (completedCount < status.expecting) {
                return res.status(200).end();
            }

            completedAllParts(req, result, function(err) {
                if (err) {
                    return res.status(500).end();
                }
                config.cleanup(req);
                console.log('next');
                next();
            });
        });

    };
    return middleware;
};


// client.set("string key", "string val", redis.print);

// client.get("missingkey", function(err, reply) {
//      reply is null when the key is missing
//      console.log(reply);
// });

