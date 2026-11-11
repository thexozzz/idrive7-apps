'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var version = require('./version');

assert.strictEqual(version.nextVersion('0.1.0', 'patch'), '0.1.1');
assert.strictEqual(version.nextVersion('0.1.1', 'minor'), '0.2.0');
assert.strictEqual(version.nextVersion('0.2.0', 'major'), '1.0.0');

var promoted = version.promoteUnreleased('# App\n\n## Unreleased\n\n- First note\n', '0.1.1');
assert.ok(promoted.indexOf('## Unreleased\n\n## 0.1.1\n\n- First note\n') !== -1);

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgu-version-'));
var packageDir = path.join(dir, 'package');
fs.mkdirSync(path.join(packageDir, 'rhmiData'), { recursive: true });
function write(file, json) {
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}
write(path.join(dir, 'mgu-app.json'), { version: '0.1.0' });
write(path.join(packageDir, 'package.json'), { version: '0.1.0' });
write(path.join(packageDir, 'npm-shrinkwrap.json'), { version: '0.1.0' });
write(path.join(packageDir, 'rhmiData', 'application.json'), { application: { version: '0.1.0' } });
fs.writeFileSync(path.join(packageDir, 'CHANGELOG.md'), '# App\n\n## Unreleased\n\n- Note\n\n## 0.1.0\n\n- Baseline\n');

assert.strictEqual(version.assertConsistent(dir), '0.1.0');
var bumped = version.bumpApp(dir, 'patch');
assert.deepStrictEqual(bumped, { from: '0.1.0', to: '0.1.1' });
assert.strictEqual(version.assertConsistent(dir), '0.1.1');
assert.throws(function () { version.bumpApp(dir, 'patch'); }, /Unreleased is empty/);

fs.rmSync(dir, { recursive: true, force: true });
console.log('version: bump keeps the package, changelog and screen description on one number');
