# S3StreamThru

Middleware for express that basically acts like express body parser. However it does the following:

## Why?

This was created out of a need to elegantly and easily cater for background iOS and Android uploads to S3 for
many different types of web services and BAAS and SAAS products.

## What Does it Do?

* Opens up a stream to send data in chunks directly through to an S3 file
* Handles multipart uploads
* Handles success/error responses from S3
* Only passes the query through to express downstream (router) on successfully comnpleting the upload of all parts and obtaining a final complete file reference in S3

So essentially this library provides:
* minimal processing overhead
* minimal memory footprint
* automatically manages multi-part uploads

## How to use it

```sh
npm install --save S3StreamThru
```

and import during your express configuration:

```js
const S3StreamThru = require('S3StreamThru');
```

Then you need to configure the middleware by providing persistence and S3 configuration methods and settings to the middleware:

```js
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
        let fileUUID = req.header[''];
        redis.get(fileUUID, function (err, reply) {
            if (err || !reply) { return callback(err, reply); }
            console.log(reply);
            return callback(null, JSON.parse(reply));
        });
    },
    setS3Id: function(req, callback) {
        let fileUUID = req.header[''];
        redis.set(fileUUID, JSON.stringify(data), callback);
    },
    log: console.log
});
```

And finally install the middleware:

```js
app.use(streamThruMiddleware);
```

See the example for a working demonstration (you need to supply your own AWS credentials and S3 bucket / key).