// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * G21 Browser's part in every page (in the extension's own world: the page's scripts do not see it and nothing of
 * the page is changed). It answers the daemon's questions about the page and does the few things the daemon did
 * through DevTools before: see sw.js.
 */
(function () {
    'use strict';
    var top = window === window.top;
    var TEXT = ['text', 'search', 'url', 'email', 'tel', 'password', 'number'];

    function field() {
        var e = document.activeElement, t, k = '', y;
        if (!e || e === document.body) return null;
        t = e.tagName;
        if (t === 'TEXTAREA' || e.isContentEditable) k = 'text';
        else if (t === 'INPUT') { y = (e.type || 'text').toLowerCase(); if (TEXT.indexOf(y) >= 0) k = y; }
        return k ? { el: e, kind: k } : null;
    }
    // the text field that has the focus, as the app's keyboard wants to know it (the daemon's EDIT_PROBE)
    function edit(x, y) {
        var f = field(), e, r, sub = false, n = 0, els, i, q, form;
        if (!f) return '';
        e = f.el;
        r = e.getBoundingClientRect();
        if (e.tagName === 'INPUT') {
            form = e.form;
            if (f.kind === 'search') sub = true;
            else if (form) {
                els = form.elements;
                for (i = 0; i < els.length; i++) { q = els[i]; if (q.tagName === 'INPUT' && TEXT.indexOf((q.type || 'text').toLowerCase()) >= 0 && q.offsetParent !== null) n++; }
                sub = n === 1;
            }
        }
        return JSON.stringify({
            kind: f.kind, value: f.kind === 'password' ? '' : String(e.isContentEditable ? (e.innerText || '') : (e.value || '')).slice(0, 256),
            inside: x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8, submit: sub, multi: e.tagName === 'TEXTAREA' || !!e.isContentEditable
        });
    }
    function selectAll() { var e = document.activeElement; if (e && e.select) e.select(); else document.execCommand('selectAll'); }
    function state() {
        var nav = window.navigation;
        return { ready: document.readyState, fs: !!document.fullscreenElement, back: nav ? !!nav.canGoBack : history.length > 1, fwd: nav ? !!nav.canGoForward : false, url: location.href, title: document.title };
    }

    chrome.runtime.onMessage.addListener(function (m, from, reply) {
        if (!m || !m.op) return;
        if (m.op === 'text') {
            // (asked of every frame: the one whose field has the focus puts the text in)
            if (!document.hasFocus() || !field()) return;
            if (m.replace) selectAll();
            if (m.s) document.execCommand('insertText', false, String(m.s));
            else if (m.replace) document.execCommand('delete');
            reply(true);
            return;
        }
        if (!top) return;
        if (m.op === 'state') reply(state());
        else if (m.op === 'edit') reply(edit(Number(m.x) || 0, Number(m.y) || 0));
        else if (m.op === 'selectall') { selectAll(); reply(true); }
        else if (m.op === 'exitfs') { try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); } catch (e) { /* not in full screen */ } reply(true); }
        else if (m.op === 'stop') { window.stop(); reply(true); }
        else if (m.op === 'quiet') {
            // the page is left behind another one: its films stop, it leaves full screen
            try { document.querySelectorAll('video,audio').forEach(function (x) { try { x.pause(); } catch (e) { /* not playing */ } }); if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { /* nothing to quiet */ }
            reply(true);
        } else if (m.op === 'why') reply('');
    });

    function tell(o) { try { chrome.runtime.sendMessage(o, function () { void chrome.runtime.lastError; }); } catch (e) { /* the extension was started again */ } }
    document.addEventListener('fullscreenchange', function () { if (top) tell({ ev: 'fs', on: !!document.fullscreenElement }); });
})();
