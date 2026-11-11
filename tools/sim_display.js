'use strict';

var http = require('http');
var display = require('../apps/g21_airplay/src/display_output');
var settingsFactory = require('../apps/g21_airplay/src/settings_manager');

var log = [];
var settings = settingsFactory.createSettings({ active: 'central' });
var outputs = {};
['central', 'cluster', 'hud'].forEach(function (name) {
    outputs[name] = {
        status: function () { return { available: true }; },
        prepare: function () { return { ok: true }; },
        start: function () { return { ok: true }; },
        stopFrames: function () {},
        frame: function () { return { ok: true }; },
        stop: function () {},
        release: function () {},
    };
});
var manager = display.createDisplayOutputManager({
    settings: settings,
    outputs: outputs,
    log: function (event, name, reason) { log.push({ event: event, name: name, reason: reason }); },
});

var page = '<!doctype html><meta charset="utf-8"><title>Symulator AirPlay, nie samochod</title>'
    + '<style>body{font-family:sans-serif;background:#111;color:#eee} .row{display:flex;gap:12px}'
    + '.pane{border:1px solid #444;padding:12px;width:280px} .on{outline:3px solid #3c6}</style>'
    + '<h1>Symulator trzech podgladow</h1><p>To nie jest ekran MGU i nie jest strumien AirPlay.</p>'
    + '<div class="row"><div class="pane" id="central"><h2>Central Display</h2><p>brak strumienia</p></div>'
    + '<div class="pane" id="cluster"><h2>Instrument Cluster</h2><p>1088 x 480, cel map</p></div>'
    + '<div class="pane" id="hud"><h2>Head-Up Display</h2><p>800 x 480, cel hud</p></div></div>'
    + '<p><button data-out="central">Central</button> <button data-out="cluster">Cluster</button> '
    + '<button data-out="hud">HUD</button> <button id="park">Postoj</button> '
    + '<button id="drive">Jazda</button> <button id="lost">Brak predkosci</button></p><pre id="log"></pre>'
    + '<script>function paint(s){["central","cluster","hud"].forEach(function(id){'
    + 'document.getElementById(id).className="pane"+(s.active===id?" on":"");});'
    + 'document.getElementById("log").textContent=JSON.stringify(s,null,2);}'
    + 'function send(path){fetch(path,{method:"POST"}).then(function(r){return r.json();}).then(paint);}'
    + 'document.body.addEventListener("click",function(ev){var out=ev.target.getAttribute("data-out");'
    + 'if(out)send("/select/"+out); if(ev.target.id)send("/vehicle/"+ev.target.id);});'
    + 'fetch("/state").then(function(r){return r.json();}).then(paint);</script>';

function state() {
    return {
        simulator: true,
        car: false,
        active: manager.active(),
        picture: settings.snapshot().picture,
        log: log.slice(-12),
    };
}

var server = http.createServer(function (req, res) {
    if (req.url === '/' ) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(page);
        return;
    }
    if (req.url === '/state') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(state()));
        return;
    }
    if (req.url.indexOf('/select/') === 0 && req.method === 'POST') {
        var selected = manager.select(req.url.slice(8));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(Object.assign(state(), { result: selected })));
        return;
    }
    if (req.url === '/vehicle/park' && req.method === 'POST') {
        manager.vehicle(0);
    } else if (req.url === '/vehicle/drive' && req.method === 'POST') {
        manager.vehicle(1000);
    } else if (req.url === '/vehicle/lost' && req.method === 'POST') {
        manager.vehicle(null);
    } else {
        res.writeHead(404);
        res.end();
        return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(state()));
});

server.listen(8091, '127.0.0.1', function () {
    console.log('Symulator: http://127.0.0.1:8091  (nie laczy sie z samochodem)');
});
