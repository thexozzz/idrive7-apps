'use strict';

var fs = require('fs');

function writeSecret(file, secret) {
    var fd = fs.openSync(file, 'w', 384);
    try {
        fs.writeSync(fd, String(secret), null, 'utf8');
    } finally {
        fs.closeSync(fd);
    }
}

function readSecret(file) {
    try {
        return fs.readFileSync(file, 'utf8');
    } catch (err) {
        return '';
    }
}

function removeSecret(file) {
    try {
        fs.unlinkSync(file);
    } catch (err) {
        return;
    }
}

module.exports = {
    writeSecret: writeSecret,
    readSecret: readSecret,
    removeSecret: removeSecret,
};
