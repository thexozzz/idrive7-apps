// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * G21 Browser's background part. g21-browserd drove the engine through its DevTools interface; an engine started
 * with that interface says so to every page (navigator.webdriver), and pages that sort browsers by it refuse it
 * (owner, 2026-11-20: Google's sign-in "Ta przeglądarka lub aplikacja może nie być bezpieczna", Crunchyroll's
 * "Coś poszło nie tak"). So the engine runs without it, as a browser a person uses, and this extension is the
 * daemon's way to it: a WebSocket to the daemon (config.json, written by the daemon at each start, has its port and a
 * word only the two know; it is read from the disk at every connecting, because the engine keeps a copy of a
 * background part's scripts and would connect with the port and the word of an earlier start), JSON lines both ways.
 *
 *   daemon -> here   {"id":n,"op":"...", ...}      answered with {"id":n,"ok":true,"r":...} or {"id":n,"ok":false,"err":"..."}
 *   here -> daemon   {"ev":"tab","tab":id,"status":"loading"|"complete","url":"...","title":"..."}
 *                    {"ev":"nav","tab":id,"url":"...","same":true|false}       a page (or a place in it) was reached
 *                    {"ev":"new","tab":id,"opener":id,"url":"..."}            a page opened a window
 *                    {"ev":"gone","tab":id}   {"ev":"fs","tab":id,"on":bool}   {"ev":"edit","tab":id, ...}
 *
 * Input (a finger, the cursor, keys) does not come through here: the engine gets it from its window (g21-wlframe).
 */

let ws = null, alive = null;
const zooms = {};      // the zoom the daemon wants for a tab
// The engine forgets a tab's own zoom when the tab goes to another site, and a zoom set while a page is on its way is
// lost with it: so the tab's zoom is looked at whenever a page arrives and has loaded, and set again when it is not
// the wanted one.
async function keepZoom(tab) {
    const want = zooms[tab];
    if (!want) return;
    try {
        const now = await chrome.tabs.getZoom(tab);
        if (Math.abs(now - want) < 0.01) return;
        await chrome.tabs.setZoomSettings(tab, { mode: 'automatic', scope: 'per-tab' });
        await chrome.tabs.setZoom(tab, want);
    } catch (e) { /* the tab is gone, or on its way: the next look */ }
}
function say(o) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) { /* the next connection */ } }

let connecting = false;
async function connect() {
    if (connecting || (ws && ws.readyState <= 1)) return;
    connecting = true;
    let G21 = null;
    try { G21 = await (await fetch(chrome.runtime.getURL('config.json'), { cache: 'no-store' })).json(); } catch (e) { G21 = null; }
    connecting = false;
    if (!G21 || (ws && ws.readyState <= 1)) { if (!G21) setTimeout(connect, 500); return; }
    try { ws = new WebSocket('ws://127.0.0.1:' + G21.port + '/g21?w=' + G21.word); } catch (e) { setTimeout(connect, 500); return; }
    ws.onopen = async () => {
        const tabs = await chrome.tabs.query({});
        say({ ev: 'hello', version: chrome.runtime.getManifest().version, tabs: tabs.map((t) => ({ tab: t.id, url: t.url || t.pendingUrl || '', title: t.title || '', status: t.status, active: t.active })) });
    };
    ws.onmessage = (m) => { let c = null; try { c = JSON.parse(m.data); } catch (e) { return; } if (c && c.op) run(c).then((r) => say({ id: c.id, ok: true, r: r === undefined ? null : r }), (e) => say({ id: c.id, ok: false, err: String(e && e.message || e) })); };
    ws.onclose = () => { ws = null; setTimeout(connect, 500); };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* closed */ } };
}
// (a background part with nothing to do is put to sleep after 30 s: the line to the daemon keeps it up; and should
// it be put to sleep all the same, or the daemon be gone for a while, an alarm wakes it to connect again)
chrome.alarms.create('g21-line', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => connect());
clearInterval(alive);
alive = setInterval(() => { if (ws && ws.readyState === 1) say({ ev: 'ping' }); else connect(); }, 20000);

// a word to the page's own part (page.js); the top frame unless it says "all"
function page(tab, msg, all) {
    return new Promise((resolve) => {
        try { chrome.tabs.sendMessage(tab, msg, all ? {} : { frameId: 0 }, (r) => { void chrome.runtime.lastError; resolve(r === undefined ? null : r); }); } catch (e) { resolve(null); }
    });
}

async function run(c) {
    const tab = Number(c.tab);
    switch (c.op) {
    case 'tabs': return (await chrome.tabs.query({})).map((t) => ({ tab: t.id, url: t.url || t.pendingUrl || '', title: t.title || '', status: t.status, active: t.active }));
    case 'nav': await chrome.tabs.update(tab, { url: String(c.url) }); return null;
    // (the page's own history.back(): the engine's "back" leaves out every page nothing was touched on, and the
    // owner's "wstecz" then jumped over a page that had only been read. Pages without this extension's part in them,
    // the engine's own, are left the engine's way.)
    case 'back': if (!(await page(tab, c))) await chrome.tabs.goBack(tab); return null;
    case 'fwd': if (!(await page(tab, c))) await chrome.tabs.goForward(tab); return null;
    case 'reload': await chrome.tabs.reload(tab); return null;
    case 'new': { const t = await chrome.tabs.create({ url: String(c.url || 'about:blank'), active: c.active !== false }); return t.id; }
    case 'show': await chrome.tabs.update(tab, { active: true }); return null;
    case 'close': try { await chrome.tabs.remove(tab); } catch (e) { /* gone already */ } return null;
    case 'zoom': zooms[tab] = Number(c.z) || 1; await keepZoom(tab); return null;
    // the engine ends as a browser whose windows are closed: in order, with its cookies and the sites' data written
    case 'quit': { const ws = await chrome.windows.getAll(); for (const w of ws) { try { await chrome.windows.remove(w.id); } catch (e) { /* gone */ } } return null; }
    case 'info': { const t = await chrome.tabs.get(tab); return { url: t.url || t.pendingUrl || '', title: t.title || '', status: t.status }; }
    // answered by the page's own part
    case 'state': case 'edit': case 'exitfs': case 'quiet': case 'stop': case 'selectall': case 'why':
        return page(tab, c);
    // (text goes to whichever frame has the field: each frame is asked, the one with the focus does it)
    case 'text': return page(tab, c, true);
    default: throw new Error('no such op: ' + c.op);
    }
}

chrome.tabs.onUpdated.addListener((id, ch, t) => {
    if (ch.status === 'complete') keepZoom(id);
    if (ch.status || ch.url || ch.title !== undefined) say({ ev: 'tab', tab: id, status: t.status, url: t.url || t.pendingUrl || '', title: t.title || '' });
});
chrome.tabs.onCreated.addListener((t) => say({ ev: 'new', tab: t.id, opener: t.openerTabId || 0, url: t.pendingUrl || t.url || '' }));
chrome.tabs.onRemoved.addListener((id) => { delete zooms[id]; say({ ev: 'gone', tab: id }); });
chrome.webNavigation.onCommitted.addListener((d) => {
    if (d.frameId !== 0) return;
    say({ ev: 'nav', tab: d.tabId, url: d.url, same: false });
    keepZoom(d.tabId);
    setTimeout(() => keepZoom(d.tabId), 300);
});
chrome.webNavigation.onHistoryStateUpdated.addListener((d) => { if (d.frameId === 0) say({ ev: 'nav', tab: d.tabId, url: d.url, same: true }); });
chrome.webNavigation.onReferenceFragmentUpdated.addListener((d) => { if (d.frameId === 0) say({ ev: 'nav', tab: d.tabId, url: d.url, same: true }); });
// a page that opens a window through a link: the daemon is told where it wanted to go
chrome.webNavigation.onCreatedNavigationTarget.addListener((d) => say({ ev: 'new', tab: d.tabId, opener: d.sourceTabId, url: d.url }));
// what the page's own part reports by itself (full screen on and off, a text field that got the focus)
chrome.runtime.onMessage.addListener((m, from) => { if (m && m.ev && from && from.tab) say(Object.assign({}, m, { tab: from.tab.id, top: from.frameId === 0 })); });

// nothing is downloaded (the daemon's rule; with DevTools it was Browser.setDownloadBehavior "deny")
if (chrome.downloads) chrome.downloads.onCreated.addListener((d) => { chrome.downloads.cancel(d.id, () => { void chrome.runtime.lastError; chrome.downloads.erase({ id: d.id }, () => { void chrome.runtime.lastError; }); }); say({ ev: 'download', url: String(d.url || '').slice(0, 200) }); });

connect();
