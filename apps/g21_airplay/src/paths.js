'use strict';

function pick(name, fallback) {
    var value = process.env[name];
    if (value && value.length) {
        return value;
    }
    return fallback;
}

function sessionPaths() {
    return {
        allow: pick('G21_SESSION_ALLOW', '/run/g21-session/allow'),
        name: pick('G21_SESSION_NAME', '/run/g21-session/name'),
        target: pick('G21_SESSION_TARGET', '/run/g21-session/target'),
        output: pick('G21_SESSION_OUTPUT', '/run/g21-session/output'),
        airplayAuth: pick('G21_SESSION_AIRPLAY_AUTH', '/run/g21-session/airplay-auth'),
        airplaySize: pick('G21_SESSION_AIRPLAY_SIZE', '/run/g21-session/airplay-size'),
        secret: pick('G21_SESSION_SECRET', '/run/g21-session/secret'),
        cert: pick('G21_SESSION_CERT', '/run/g21-session/cert'),
        desktopStatus: pick('G21_DESKTOP_STATUS', '/run/g21-desktop.status'),
        offers: pick('G21_DESKTOP_OFFERS', '/run/g21-desktop/offers'),
        accept: pick('G21_SESSION_ACCEPT', '/run/g21-session/accept'),
        frameSock: pick('G21_FRAME_SOCK', '/run/g21-desktop/frame.sock'),
        inputSock: pick('G21_INPUT_SOCK', '/run/g21-desktop/input.sock'),
        inputLog: pick('G21_INPUT_LOG', '/run/g21-session/input.log'),
        receiverStatus: pick('G21_RECEIVER_STATUS', '/run/g21-airplay.status'),
    };
}

module.exports = {
    sessionPaths: sessionPaths,
};
