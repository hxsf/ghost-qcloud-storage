'use strict'
var COS = require('cos-nodejs-sdk-v5')
var BaseAdapter = require('ghost-storage-base')
var fs = require('fs')
var PassThrough = require('stream').PassThrough
var debug = require('debug')('COS:index')
var config = require('../../../../config')
var utils = require('../../../../utils')

class MyCustomAdapter extends BaseAdapter {
    constructor(options) {
        super()
        var { AppId, SecretId, SecretKey, Bucket, Region } = options
        if (!(AppId  && SecretId  && SecretKey  && Bucket  && Region)) {
            throw new Error('AppId, SecretId, SecretKey, Bucket, Region must be not null')
        }
        this.cos = new COS({ AppId, SecretId, SecretKey })
        this.bucket_info = { Bucket, Region }
        this.storagePath = config.getContentPath('images') || 'ghost'
        this.origin = options.domain || (Bucket + '.file.myqcloud.com')
        debug('origin', this.origin)
    }

    exists(filename, targetDir) {
        targetDir = targetDir || this.getTargetDir(this.storagePath)
        var filePath = (targetDir || this.storagePath) + '/' + filename
        debug('exists', filePath)
        var params = {
            Bucket : this.bucket_info.Bucket,
            Region : this.bucket_info.Region,
            Key : filePath,
        }
        return new Promise((reslove, reject) => {
            this.cos.headObject(params, function(err, data) {
                debug('headObject', err, data)
                if(err) {
                    reslove(false)
                } else {
                    reslove(true)
                }
            })
        })
    }

    save(image, targetDir) {
        targetDir = targetDir || this.getTargetDir(this.storagePath)
        debug('save', image, targetDir)
        return this.getUniqueFileName(image, targetDir).then((filename) => {
            debug('filename', filename)
            var state = fs.statSync(image.path)
            var params = {
                Bucket : this.bucket_info.Bucket,
                Region : this.bucket_info.Region,
                Key : filename,
                ContentLength : state.size,
                Body: fs.createReadStream(image.path),
            }
            return new Promise((reslove, reject) => {
                this.cos.putObject(params, (err, data) => {
                    if(err) {
                        reject(err)
                    } else {
                        reslove(this.origin + '/' + filename)
                    }
                })
            })
        })
    }

    serve() {
        return function (req, res, next) {
            next()
        }
    }

    delete(fileName, targetDir) {
        return Promise.reject('not implemented')
    }

    read(options) {
        options = options || {}
        options.path = (options.path || '').replace(/\/$|\\$/, '')
        var targetPath = utils.url.urlJoin('/', this.storagePath, options.path)
        return new Promise((reslove, reject) => {
            var st = new PassThrough()
            st.once('error', reject)
            var on_end = function () {
                reslove(st.read())
            }
            st.once('end', on_end)
            var params = {
                Bucket : this.bucket_info.Bucket,
                Region : this.bucket_info.Region,
                Key : targetPath,
                Output : st,
            }
            this.cos.getObject(params, (err, data) => {
                if (err) {
                    st.removeListeners('error', reject)
                    st.removeListeners('end', on_end)
                    reject(err)
                }
            })
        })
    }
}

module.exports = MyCustomAdapter