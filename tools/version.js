'use strict';

var fs = require('fs');
var path = require('path');

function nextVersion(current, level) {
    var parts = String(current).split('.');
    if (parts.length !== 3 || parts.some(function (part) { return !/^\d+$/.test(part); })) {
        throw new Error('version must be x.y.z, got ' + current);
    }
    var major = Number(parts[0]);
    var minor = Number(parts[1]);
    var patch = Number(parts[2]);
    if (level === 'patch') {
        patch += 1;
    } else if (level === 'minor') {
        minor += 1;
        patch = 0;
    } else if (level === 'major') {
        major += 1;
        minor = 0;
        patch = 0;
    } else {
        throw new Error('level must be patch, minor or major');
    }
    return major + '.' + minor + '.' + patch;
}

function versionTargets(appDir) {
    return [
        {
            file: path.join(appDir, 'mgu-app.json'),
            read: function (json) { return json.version; },
            write: function (json, version) { json.version = version; },
        },
        {
            file: path.join(appDir, 'package', 'package.json'),
            read: function (json) { return json.version; },
            write: function (json, version) { json.version = version; },
        },
        {
            file: path.join(appDir, 'package', 'npm-shrinkwrap.json'),
            read: function (json) { return json.version; },
            write: function (json, version) { json.version = version; },
        },
        {
            file: path.join(appDir, 'package', 'rhmiData', 'application.json'),
            read: function (json) { return json.application && json.application.version; },
            write: function (json, version) { json.application.version = version; },
        },
    ];
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, json) {
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}

function collectedVersions(appDir) {
    return versionTargets(appDir).map(function (target) {
        return { file: target.file, version: target.read(readJson(target.file)) };
    });
}

function assertConsistent(appDir) {
    var found = collectedVersions(appDir);
    var version = found[0].version;
    found.forEach(function (item) {
        if (item.version !== version) {
            throw new Error('version ' + item.version + ' in ' + item.file + ' disagrees with ' + version);
        }
    });
    var changelog = fs.readFileSync(path.join(appDir, 'package', 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
    if (changelog.indexOf('## ' + version + '\n') === -1) {
        throw new Error('CHANGELOG has no heading for ' + version);
    }
    if (changelog.indexOf('## Unreleased\n') === -1) {
        throw new Error('CHANGELOG has no ## Unreleased');
    }
    return version;
}

function promoteUnreleased(text, version) {
    var src = text.replace(/\r\n/g, '\n');
    var marker = '## Unreleased\n';
    var at = src.indexOf(marker);
    if (at === -1) {
        throw new Error('CHANGELOG has no ## Unreleased');
    }
    var after = src.slice(at + marker.length);
    var next = after.search(/\n## /);
    var body = next === -1 ? after : after.slice(0, next);
    var rest = next === -1 ? '' : after.slice(next);
    if (!body.replace(/\s/g, '')) {
        throw new Error('CHANGELOG Unreleased is empty');
    }
    return src.slice(0, at) + '## Unreleased\n\n## ' + version + '\n\n' + body.trim() + '\n' + rest;
}

function bumpApp(appDir, level) {
    var current = assertConsistent(appDir);
    var version = nextVersion(current, level);
    var changelogPath = path.join(appDir, 'package', 'CHANGELOG.md');
    var changelog = promoteUnreleased(fs.readFileSync(changelogPath, 'utf8'), version);
    versionTargets(appDir).forEach(function (target) {
        var json = readJson(target.file);
        target.write(json, version);
        writeJson(target.file, json);
    });
    fs.writeFileSync(changelogPath, changelog);
    return { from: current, to: version };
}

module.exports = {
    nextVersion: nextVersion,
    assertConsistent: assertConsistent,
    promoteUnreleased: promoteUnreleased,
    bumpApp: bumpApp,
};
