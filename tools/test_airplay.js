'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var uplink = require('../apps/g21_airplay/src/uplink');
var mdns = require('../apps/g21_airplay/src/mdns');
var airplay = require('../apps/g21_airplay/src/airplay');

var wifi = {
    device: { kind: 'wifi', name: 'Karolphone' },
    wifi: { link: 'online', ssid: 'Karolphone', ip: '172.20.10.2' },
};
var lease = { interface: 'wlan1', ip: '172.20.10.2', prefix: 28, router: '172.20.10.1' };
var choice = uplink.selectStoreWifi(wifi, lease);
assert.strictEqual(choice.ok, true);
assert.strictEqual(choice.iface, 'wlan1');
assert.strictEqual(choice.ssid, 'Karolphone');

assert.strictEqual(uplink.selectStoreWifi({ device: { kind: 'usb' }, wifi: { link: 'online' } }, lease).reason, 'uplink-not-wifi');
assert.strictEqual(uplink.selectStoreWifi({ device: { kind: 'wifi' }, wifi: { link: 'scanning' } }, lease).reason, 'wifi-down');
assert.strictEqual(uplink.selectStoreWifi(wifi, { interface: 'socnet0', ip: '10.0.0.2', prefix: 24 }).iface, 'socnet0');
assert.strictEqual(uplink.selectStoreWifi(wifi, { interface: 'wlan1;rm', ip: '172.20.10.2', prefix: 28 }).ok, false);

var packet = mdns.buildPacket({ name: 'G21', ip: '172.20.10.2', mac: '02:00:00:00:00:01', port: 7000 });
var text = packet.toString('latin1');
assert.ok(text.indexOf('_airplay') !== -1);
assert.ok(text.indexOf('_tcp') !== -1);
assert.ok(packet.indexOf(Buffer.from([172, 20, 10, 2])) !== -1);

var info = airplay.replyFor('GET /info HTTP/1.1\r\nHost: 172.20.10.2\r\n\r\n', '02:00:00:00:00:01');
assert.ok(info.raw.indexOf('text/x-apple-plist+xml') !== -1);
assert.ok(info.raw.indexOf('02:00:00:00:00:01') !== -1);
var setup = airplay.replyFor('SETUP rtsp://172.20.10.2/stream RTSP/1.0\r\nCSeq: 3\r\n\r\n', '02:00:00:00:00:01');
assert.strictEqual(setup.state, 'streaming');
assert.ok(setup.raw.indexOf('CSeq: 3') !== -1);

var receiver = uplink.readReceiverStatus('running|Karolphone|172.20.10.2');
assert.strictEqual(receiver.mode, 'running');
assert.strictEqual(receiver.ssid, 'Karolphone');
assert.strictEqual(receiver.ip, '172.20.10.2');

var phoneOk = uplink.selectAirplayAnnounce(receiver, choice);
assert.strictEqual(phoneOk.ok, true);
assert.strictEqual(phoneOk.ip, '172.20.10.2');

var mdnsFail = uplink.selectAirplayAnnounce(
    uplink.readReceiverStatus('mdns-brak|Karolphone|172.20.10.2'),
    choice
);
assert.strictEqual(mdnsFail.ok, false);
assert.strictEqual(mdnsFail.reason, 'mdns-brak');

var script = fs.readFileSync(path.join(__dirname, '..', 'native', 'g21-airplay-open', 'g21-airplay-open'), 'utf8');
assert.ok(script.indexOf('-n "$shown"') !== -1);
assert.ok(script.indexOf('name=G21') !== -1);
assert.ok(script.indexOf('session-off') !== -1);
assert.ok(script.indexOf('-nh') !== -1);
assert.ok(script.indexOf('-pin') !== -1);
assert.ok(script.indexOf('-d 1') !== -1);
assert.ok(script.indexOf('/run/g21-airplay/pin') !== -1);
assert.ok(script.indexOf('CLIENT MUST NOW ENTER PIN') !== -1);
assert.ok(script.indexOf(': > "$PINFILE"') === -1);
assert.ok(script.indexOf('fakesink async=false') !== -1);
assert.ok(script.indexOf('-vs waylandsink') === -1);
assert.ok(script.indexOf('udp dport 5353 accept') !== -1);
assert.ok(script.indexOf('tcp dport 7400-7499 accept') !== -1);
assert.ok(script.indexOf('udp dport 7400-7499 accept') !== -1);
assert.ok(script.indexOf('740[01]') !== -1);
assert.ok(script.indexOf('WAYLAND_DISPLAY') !== -1);
assert.ok(script.indexOf('GST_PLUGIN_PATH') !== -1);
assert.ok(script.indexOf('-p 7400') !== -1);
assert.ok(script.indexOf('tcp dport 7000 accept') === -1);
assert.ok(script.indexOf('tcp dport 1235 accept') !== -1);
assert.ok(script.indexOf('ensure_mdns') !== -1);
assert.ok(script.indexOf('have_system_mdns') !== -1);
assert.ok(script.indexOf('stop_bundled_avahi') !== -1);
assert.ok(script.indexOf('clear_mice_if_needed') !== -1);
assert.ok(script.indexOf('ux_port_listening') !== -1);
assert.ok(script.indexOf('g21-detach') !== -1);
assert.ok(script.indexOf('setsid sh -c') === -1);
assert.ok(script.indexOf('-as 0') === -1);
assert.ok(script.indexOf('alsasink device=smartx:CarPlayMain') !== -1);
assert.ok(script.indexOf('ALSA_PLUGIN_DIR') !== -1);
assert.ok(script.indexOf('-as alsasink') === -1);
assert.ok(script.indexOf('chmod 666 "$DESKTOP"') !== -1);
assert.ok(script.indexOf('chmod 666 "$DESKTOP" "$REPORT"') !== -1);
assert.ok(script.indexOf('ensure_tailscale_socks5') !== -1);
assert.ok(script.indexOf('127.0.0.2') !== -1);
var rdpSrc = fs.readFileSync(path.join(__dirname, '..', 'native', 'g21-airplay-open', 'g21-rdp.c'), 'utf8');
assert.ok(rdpSrc.indexOf('freerdp_settings_set_string') !== -1);
assert.ok(rdpSrc.indexOf('apply_tailscale_socks5') !== -1);
assert.ok(rdpSrc.indexOf('strncpy(instance->settings->ServerHostname') === -1);
assert.ok(script.indexOf('avahi-daemon') !== -1);
assert.ok(script.indexOf('--daemonize=no') === -1);
assert.ok(script.indexOf('enable-dbus=yes') !== -1);
assert.ok(script.indexOf('Failed to find user') === -1);
assert.ok(script.indexOf('phone-is-ap') === -1);
assert.ok(script.indexOf('join-car-wifi') === -1);
assert.ok(script.indexOf('socnet') === -1);
assert.ok(script.indexOf('\r') === -1);

var component = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'native', 'g21-airplay-open', 'component.json'), 'utf8'));
assert.strictEqual(component.version, '0.1.48');
// YouTube frames for the cluster/HUD: the tool makes ytdec's 0600 file readable,
// only that file, never through a link, every loop.
assert.ok(script.indexOf('share_youtube_frames') !== -1);
assert.ok(script.indexOf('chmod 0644 "$f"') !== -1);
assert.ok(script.indexOf('[ -L "$f" ]') !== -1);
assert.ok(/apply\(\) \{\n    ensure_dirs\n    share_youtube_frames/.test(script));
assert.ok(script.indexOf('-s "$vsize"') !== -1);
assert.ok(script.indexOf('vsize=600x400') !== -1);
assert.ok(script.indexOf('1920x1080') === -1);
assert.ok(script.indexOf('-fps 24') !== -1);
assert.ok(script.indexOf('-fps 40') === -1);
assert.ok(script.indexOf('G21_BIND_IP') !== -1);
assert.ok(script.indexOf('g21-bind-wlan.so') !== -1);
assert.ok(script.indexOf('publish-addresses=yes') !== -1);
assert.ok(script.indexOf('hosts-file=') === -1);
assert.ok(script.indexOf('ip route replace "$net"') !== -1);
assert.ok(script.indexOf('224.0.0.251/32') !== -1);
assert.ok(script.indexOf('priority -50') !== -1);
assert.ok(script.indexOf('clear_uplink_airplay_rules') !== -1);
assert.ok(script.indexOf('nft insert rule inet mgu_uplink output') !== -1);
assert.ok(script.indexOf('nft insert rule inet mgu_uplink input') !== -1);
assert.ok(script.indexOf('nft insert rule ip filter input') !== -1);
assert.ok(script.indexOf('clear_tagged_rules ip filter input') !== -1);
assert.ok(script.indexOf('comment \\"g21-airplay\\"') !== -1 || script.indexOf('comment \\\"g21-airplay\\\"') !== -1 || script.indexOf('g21-airplay') !== -1);
assert.ok(script.indexOf('recover_avahi_pid') !== -1);
assert.ok(script.indexOf('our_uxplay_pids') !== -1);
assert.ok(script.indexOf('avahi-daemon: running') !== -1);
assert.ok(script.indexOf('systemctl start avahi-daemon') === -1);
assert.ok(component.files.some(function (item) { return item.path === 'g21-detach'; }));
assert.ok(script.indexOf('desk "running|rdp|"') === -1);
assert.ok(script.indexOf('tool_lib_path') !== -1);
assert.ok(script.indexOf('frame_sock_free') !== -1);
assert.ok(script.indexOf('sleep 1') !== -1);
assert.ok(script.indexOf('ln -sfn libdns_sd.so.1') !== -1);
assert.ok(script.indexOf('Prefer BMW mdnsd') === -1);
assert.ok(script.indexOf('kDNSServiceErr_Unknown') !== -1);
var uxWrap = fs.readFileSync(path.join(__dirname, '..', 'native', 'g21-airplay-open', 'uxplay'), 'utf8');
assert.ok(uxWrap.indexOf('libdns_sd.so.1') !== -1);
assert.ok(uxWrap.indexOf('$dir/lib:/usr/lib:/lib') !== -1);
assert.ok(script.indexOf('SESSION_DIR/output') !== -1);
assert.ok(component.files.some(function (item) { return item.path === 'lib/libgstnet-1.0.so.0'; }));
assert.ok(component.files.some(function (item) { return item.path === 'lib/libgstrtp-1.0.so.0'; }));
assert.ok(component.files.some(function (item) { return item.path === 'lib/libgstmpegts-1.0.so.0'; }));
assert.ok(script.indexOf('container_id=') !== -1);
assert.ok(script.indexOf('VerMgmt=0x0202') === -1);
assert.ok(script.indexOf('\ngroup=avahi\n') === -1);
assert.ok(script.indexOf('\nuser=avahi\n') === -1);
assert.ok(script.indexOf('--no-drop-root') !== -1);
assert.ok(script.indexOf(' -fs ') === -1);
assert.ok(script.indexOf('fakesink async=false') !== -1);
assert.ok(script.indexOf('start_present') !== -1);
assert.ok(script.indexOf('G21_YUV') !== -1);
assert.ok(component.files.some(function (item) { return item.path === 'avahi-daemon'; }));
assert.ok(component.files.some(function (item) { return item.path === 'run-elf'; }));
assert.ok(component.files.some(function (item) { return item.path === 'gst-plugin-scanner.bin'; }));
assert.ok(component.files.some(function (item) { return item.path === 'lib/libavahi-core.so.7'; }));
assert.ok(component.files.every(function (item) { return item.path.indexOf('\\') === -1; }));
assert.ok(script.indexOf('run-elf') !== -1);
assert.ok(script.indexOf('ensure_avahi_account') !== -1);
assert.ok(script.indexOf('ensure_avahi_dbus') !== -1);
assert.ok(script.indexOf('mount --bind') !== -1);
assert.ok(script.indexOf('avahi:x:189:189:') !== -1);

console.log('airplay: bundled avahi libdns_sd; UxPlay via g21-detach');
