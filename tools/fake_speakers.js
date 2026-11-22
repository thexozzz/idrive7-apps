'use strict';
// Stands in for native/g21-audio/speakers.js in tests: claim / release / recover are written to
// G21_FAKE_SPEAKERS_LOG, nothing is asked of an audio manager.
var EventEmitter = require('events');
var fs = require('fs');
var util = require('util');
function Speakers() { EventEmitter.call(this); }
util.inherits(Speakers, EventEmitter);
function note(t) { try { fs.appendFileSync(process.env.G21_FAKE_SPEAKERS_LOG, t + '\n'); } catch (e) { /* no file */ } }
// (G21_FAKE_SPEAKERS_LOSE names a file: when it appears, another source "took the speakers")
Speakers.prototype.claim = function () {
    var self = this, f = process.env.G21_FAKE_SPEAKERS_LOSE;
    if (f && !this.watch) this.watch = setInterval(function () { if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch (e) { /* gone */ } note('lost'); self.emit('lost'); } }, 50);
    note('claim'); return new Promise(function (r) { setTimeout(function () { r('null'); }, 50); }); };
// (G21_FAKE_SPEAKERS_STATE names a file with the state of "our connection"; none: connected)
Speakers.prototype.state = function () { var v = 'CS_CONNECTED'; try { v = fs.readFileSync(process.env.G21_FAKE_SPEAKERS_STATE, 'utf8').trim(); } catch (e) { /* no file */ } return Promise.resolve(v); };
Speakers.prototype.release = function () { note('release'); return Promise.resolve(); };
Speakers.prototype.recover = function () { note('recover'); return Promise.resolve(); };
module.exports = { Speakers: Speakers, DEVICE: 'null' };
