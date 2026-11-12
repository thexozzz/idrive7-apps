'use strict';

var spawn = require('child_process').spawnSync;
var path = require('path');

var node = process.execPath;
var tools = [
    path.join(__dirname, 'validate_repo.js'),
    path.join(__dirname, 'test_parked_gate.js'),
    path.join(__dirname, 'test_version.js'),
    path.join(__dirname, 'test_airplay.js'),
    path.join(__dirname, 'test_display.js'),
    path.join(__dirname, 'test_decoder.js'),
    path.join(__dirname, 'test_vnc.js'),
    path.join(__dirname, 'test_session.js'),
    path.join(__dirname, 'test_menu.js'),
    path.join(__dirname, 'test_config_panel.js'),
];

tools.forEach(function (tool) {
    var result = spawn(node, [tool], { stdio: 'inherit' });
    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
});
