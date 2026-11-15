'use strict';
// Stands in for native/g21-audio/speakers.js in tests: claim / release / recover are written to
// G21_FAKE_SPEAKERS_LOG, nothing is asked of an audio manager.
var EventEmitter = require('events');
var fs = require('fs');
var util = require('util');
function Speakers() { EventEmitter.call(this); }
util.inherits(Speakers, EventEmitter);
function note(t) { try { fs.appendFileSync(process.env.G21_FAKE_SPEAKERS_LOG, t + '\n'); } catch (e) { /* no file */ } }
Speakers.prototype.claim = function () { note('claim'); return new Promise(function (r) { setTimeout(function () { r('null'); }, 50); }); };
Speakers.prototype.release = function () { note('release'); return Promise.resolve(); };
Speakers.prototype.recover = function () { note('recover'); return Promise.resolve(); };
module.exports = { Speakers: Speakers, DEVICE: 'null' };
