'use strict';

var assert = require('assert');
var net = require('net');
var vncFactory = require('../apps/g21_airplay/src/vnc_client.js');

function listen() {
    return new Promise(function (resolve) {
        var server = net.createServer(function (socket) {
            var buf = Buffer.alloc(0);
            var step = 0;
            socket.write('RFB 003.008\n');
            socket.on('data', function (chunk) {
                buf = Buffer.concat([buf, chunk]);
                if (step === 0 && buf.length >= 12) {
                    socket.write(Buffer.from([1, 1]));
                    buf = buf.slice(12);
                    step = 1;
                }
                if (step === 1 && buf.length >= 1) {
                    socket.write(Buffer.alloc(4));
                    buf = buf.slice(1);
                    step = 2;
                }
                if (step === 2 && buf.length >= 1) {
                    var init = Buffer.alloc(24);
                    init.writeUInt16BE(2, 0);
                    init.writeUInt16BE(2, 2);
                    init.writeUInt32BE(4, 20);
                    socket.write(init);
                    socket.write('test');
                    buf = buf.slice(1);
                    step = 3;
                }
                if (step === 3 && buf.length >= 42) {
                    var update = Buffer.alloc(16 + 16);
                    update[0] = 0;
                    update.writeUInt16BE(1, 2);
                    update.writeUInt16BE(2, 8);
                    update.writeUInt16BE(2, 10);
                    update.writeInt32BE(0, 12);
                    var pixel;
                    for (pixel = 0; pixel < 16; pixel++) {
                        update[16 + pixel] = 9;
                    }
                    socket.write(update);
                    buf = buf.slice(42);
                    step = 4;
                }
                if (step === 4 && buf.length >= 6 && buf[0] === 5) {
                    socket.end();
                }
            });
        });
        server.listen(0, '127.0.0.1', function () {
            resolve(server);
        });
    });
}

listen().then(function (server) {
    var frames = 0;
    var client = vncFactory.createVncClient({
        onFrame: function (frame) {
            frames += 1;
            assert.strictEqual(frame.w, 2);
            assert.strictEqual(frame.h, 2);
            assert.strictEqual(frame.bgra[0], 9);
        },
    });
    return client.connect('127.0.0.1', server.address().port, {}).then(function (result) {
        assert.strictEqual(result.ok, true);
        return new Promise(function (resolve) {
            var tries = 0;
            var timer = setInterval(function () {
                tries += 1;
                if (frames > 0 || tries > 20) {
                    clearInterval(timer);
                    resolve();
                }
            }, 25);
        });
    }).then(function () {
        assert.strictEqual(frames, 1);
        assert.strictEqual(client.getStatus().state, 'connected');
        assert.strictEqual(client.sendMouseMove(1, 1).ok, true);
        client.dispose();
        server.close();
        console.log('test_vnc: ok');
    });
}).catch(function (err) {
    console.error(err);
    process.exit(1);
});
