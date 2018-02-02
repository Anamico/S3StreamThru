const async = require('async');
const AWS = require('aws-sdk');

/*

config = {
    path: '/test'                         <- path to listen to for pushing items to s3
    getS3Id: function(req, callback)      <- return the correct s3 id for this file
}

 */
module.exports = function(config) {

    let s3 = config.s3Client || new AWS.s3(config.s3Options);

    //
    // start a new upload, but only if required
    //
    function createNewUpload(req, callback) {
        var params = {
            Bucket: config.s3.bucket,
            Key: config.s3.path + '/' + config.getFilename(req)
        };
        s3.createMultipartUpload(params, function(err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else     console.log(data);           // successful response

            config.setUploadData(req, data, callback);
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
    // assemble the middleware
    //
    function completeUpload(data, callback) {
        var params = {
            Bucket: "examplebucket",
            Key: "bigobject",
            MultipartUpload: {
                Parts: [
                    {
                        ETag: "\"d8c2eafd90c266e19ab9dcacc479f8af\"",
                        PartNumber: 1
                    },
                    {
                        ETag: "\"d8c2eafd90c266e19ab9dcacc479f8af\"",
                        PartNumber: 2
                    }
                ]
            },
            UploadId: "7YPBOJuoFiQ9cz4P3Pe6FIZwO4f7wN93uHsNBEw97pl5eNwzExg0LAT2dUN91cOmrEQHDsP3WA60CEg--"
        };
        s3.completeMultipartUpload(params, function(err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else     console.log(data);           // successful response
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

        if ((req.path != config.path) && (req.)) {
            return next();
        }

        config.log('sending to s3');
        req.setEncoding('utf8');

        async.auto({

            //
            // retrieve the destination s3 file data or create if this is the first part
            //
            uploadData: function(callback) {
                config.getUploadData(req, function(err, data) {
                    if (err) { return callback(err); }
                    if (data) { return callback(null, data); }

                    // no upload data
                    createNewUpload(req, callback);
                });
            },

            //
            // transfer this part straight through to S3
            //
            transfer: ['s3pipe', function(data, callback) {
                req.on('data', function(chunk) {
                    req.rawBody += chunk;

                });

                req.on('end', function() {
                    callback(null, true);
                });

                // todo: req.on('error' ??
            }],

            //
            // record successful part upload
            //
            completedParts: ['transfer', function(data, callback) {

            }],

            //
            // is this the final part? If so, clean up and pass through to the router
            //
            completion: ['success', function(data, callback) {
                if (!data.transfer) { return callback(new Error('transfer failed')); }

                completeUpload(data, callback);
            }]

        }, function(err, result) {
            if (err) {
                return res.status(500).send(JSON.stringify(err));
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

