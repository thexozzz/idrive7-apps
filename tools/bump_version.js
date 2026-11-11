'use strict';

var path = require('path');
var version = require('./version');

var root = path.join(__dirname, '..');
var appId = process.argv[2];
var level = process.argv[3] || 'patch';
if (!appId) {
    console.error('usage: node tools/bump_version.js <app-id> [patch|minor|major]');
    process.exit(2);
}

var repo = require(path.join(root, 'mgu-repo.json'));
var known = (repo.components || []).some(function (component) { return component.id === appId; });
if (!known) {
    console.error(appId + ' is not listed in mgu-repo.json');
    process.exit(1);
}

try {
    var result = version.bumpApp(path.join(root, 'apps', appId), level);
    console.log(appId + ' ' + result.from + ' -> ' + result.to);
    console.log('Nothing was sent to a head unit. Push this branch, then tap Update in the MGU Store.');
} catch (err) {
    console.error('bump: ' + err.message);
    process.exit(1);
}
