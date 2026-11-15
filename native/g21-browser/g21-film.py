#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""g21-film.py - one stream of a film to stdout, for THEiPlay Player (g21-browserd.js starts it as the engine's uid).

  g21-film.py --pyz <ytdlp.pyz> --lease <lease.json> --node <node> --format <yt-dlp format> [--referer <page>]
              [--at <seconds>] [--memo <file>] -- <url>

yt-dlp finds the stream of the page (YouTube and the sites it knows; a plain address of a film file too). A stream
that is one file on a web server is fetched here in ranges of 1 MB (one long request is slowed down by the film's
server after its first seconds: car, 2026-11-15, the sound broke up) and written to stdout; the daemon gives that
pipe to the decoder. With --at, a fragmented MP4 (what YouTube gives) starts at the fragment that holds that second:
its head, then the bytes from that fragment on, found in the file's own index (the sidx box). Any other kind of
stream (HLS ...) is left to yt-dlp's own downloader and starts at its beginning.
--memo: what was found for this address and format is kept there for half an hour, so that a start after a seek
does not ask the site again (and does not load yt-dlp at all).

stderr, for the daemon: "info {json}" (duration, fps, height, title, whether seeking works), "start <seconds>"
(where the stream really begins), and one line per error.
The car's own resolver answers no internet names, so names are asked from the uplink's DNS servers (lease.json),
as the browser's proxy and jap-ridetube-d's fetcher do. Nothing of the film is kept on the disk.
"""
import argparse
import hashlib
import json
import os
import socket
import ssl
import struct
import sys
import time
import types
import urllib.error
import urllib.request

CA = '/var/opt/mgu-python/current/ssl/cacert.pem'
TUBE = ('youtube.com', 'youtu.be', 'youtube-nocookie.com')
CHUNK = 1048576
MEMO_S = 1800


def say(text):
    sys.stderr.write(str(text).replace('\n', ' ')[:600] + '\n')
    sys.stderr.flush()


# ---------------------------------------------------------------- names through the uplink's DNS servers
def dns_servers(lease):
    try:
        with open(lease) as f:
            return [s for s in json.load(f).get('dns', []) if isinstance(s, str)]
    except (OSError, ValueError, AttributeError):
        return []


def name_end(msg, at):
    """the index after a (possibly compressed) name"""
    while True:
        n = msg[at]
        if n >= 0xc0:
            return at + 2
        if n == 0:
            return at + 1
        at += n + 1


def ask_a(host, servers, timeout=3):
    ident = os.urandom(2)
    labels = host.rstrip('.').encode('idna').split(b'.')
    query = ident + struct.pack('>HHHHH', 0x0100, 1, 0, 0, 0) + b''.join(bytes([len(x)]) + x for x in labels) + b'\x00' + struct.pack('>HH', 1, 1)
    why = 'no DNS server'
    for server in servers:
        sock = socket.socket(socket.AF_INET6 if ':' in server else socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.settimeout(timeout)
            sock.sendto(query, (server, 53))
            answer = sock.recv(4096)
            while answer[:2] != ident:
                answer = sock.recv(4096)
            if answer[3] & 15:
                why = '%s: rcode %d' % (server, answer[3] & 15)
                continue
            at = name_end(answer, 12) + 4
            found = []
            for _ in range(struct.unpack_from('>H', answer, 6)[0]):
                at = name_end(answer, at)
                kind, cls, _ttl, size = struct.unpack_from('>HHIH', answer, at)
                at += 10
                if kind == 1 and cls == 1 and size == 4:
                    found.append(socket.inet_ntoa(answer[at:at + 4]))
                at += size
            if found:
                return found
            why = '%s: no address' % server
        except (OSError, IndexError, struct.error) as e:
            why = '%s: %s' % (server, e)
        finally:
            sock.close()
    raise socket.gaierror(socket.EAI_NONAME, '%s: %s' % (host, why))


def is_ip(text):
    for family in (socket.AF_INET, socket.AF_INET6):
        try:
            socket.inet_pton(family, text)
            return True
        except OSError:
            pass
    return False


def use_lease_dns(lease):
    servers = dns_servers(lease)
    if not servers:
        return
    system, known = socket.getaddrinfo, {}

    def getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        name = host.decode() if isinstance(host, bytes) else host
        if not name or name == 'localhost' or is_ip(name) or family == socket.AF_INET6:
            return system(host, port, family, type, proto, flags)
        if name not in known:
            known[name] = ask_a(name, servers)
        return [(socket.AF_INET, type or socket.SOCK_STREAM, proto, '', (ip, int(port or 0))) for ip in known[name]]

    socket.getaddrinfo = getaddrinfo


# ---------------------------------------------------------------- what the site gives (yt-dlp), kept for a while
class Quiet:
    def debug(self, msg):
        pass

    def info(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        say(msg)


def load_ytdlp(pyz):
    sys.path.insert(0, pyz)
    if os.path.isfile(CA) and 'certifi' not in sys.modules:
        # yt-dlp takes its certificates from certifi when it can import it: this one names the car's bundle
        certifi = types.ModuleType('certifi')
        certifi.where = lambda: CA
        certifi.contents = lambda: open(CA, encoding='ascii').read()
        sys.modules['certifi'] = certifi
    import yt_dlp
    return yt_dlp


def ydl_params(a, host):
    params = {'format': a.format, 'cachedir': False, 'logger': Quiet(), 'quiet': True, 'noprogress': True, 'no_warnings': True,
              'noplaylist': True, 'fixup': 'never', 'retries': 10, 'socket_timeout': 30, 'logtostderr': True,
              'outtmpl': {'default': '-'}, 'remote_components': [], 'http_chunk_size': CHUNK}
    if a.node:
        params['js_runtimes'] = {'node': {'path': a.node}}
    if any(host == t or host.endswith('.' + t) for t in TUBE):
        # (as jap-ridetube-d: this client gives H.264 and AAC addresses without a token and without a script to solve)
        params['extractor_args'] = {'youtube': {'player_client': ['visionos']}}
    if a.referer:
        params['http_headers'] = {'Referer': a.referer}
    return params


def memo_key(a):
    return hashlib.sha256((a.url + '\n' + a.format + '\n' + a.referer).encode('utf-8', 'replace')).hexdigest()[:24]


def memo_read(a):
    if not a.memo:
        return None
    try:
        with open(a.memo) as f:
            m = json.load(f)
        rec = m.get(memo_key(a))
        if isinstance(rec, dict) and time.time() - float(rec.get('at', 0)) < MEMO_S and str(rec.get('url', '')).startswith('http'):
            return rec
    except (OSError, ValueError, AttributeError, TypeError):
        pass
    return None


def memo_write(a, rec):
    if not a.memo:
        return
    try:
        try:
            with open(a.memo) as f:
                m = json.load(f)
            if not isinstance(m, dict):
                m = {}
        except (OSError, ValueError):
            m = {}
        now = time.time()
        m = {k: v for k, v in m.items() if isinstance(v, dict) and now - float(v.get('at', 0)) < MEMO_S}
        m[memo_key(a)] = rec
        tmp = a.memo + '.%d' % os.getpid()
        with open(tmp, 'w') as f:
            json.dump(m, f)
        os.replace(tmp, a.memo)
    except (OSError, ValueError, TypeError):
        pass


def find(a, host):
    """the stream's address and what is known of it: from the memo, or asked from the site"""
    rec = memo_read(a)
    if rec:
        return rec, None
    yt_dlp = load_ytdlp(a.pyz)
    ydl = yt_dlp.YoutubeDL(ydl_params(a, host))
    info = ydl.extract_info(a.url, download=False)
    if info and info.get('_type') == 'playlist' and info.get('entries'):
        info = [x for x in info['entries'] if x][0]
    fmt = ((info or {}).get('requested_formats') or [info or {}])[0]
    rec = {'at': time.time(), 'url': str(fmt.get('url') or ''), 'headers': dict(fmt.get('http_headers') or {}),
           'size': int(fmt.get('filesize') or fmt.get('filesize_approx') or 0), 'protocol': str(fmt.get('protocol') or ''),
           'duration': float((info or {}).get('duration') or 0), 'fps': float(fmt.get('fps') or 0), 'height': int(fmt.get('height') or 0),
           'title': str((info or {}).get('title') or '')[:200]}
    if rec['url'].startswith('http') and rec['protocol'] in ('https', 'http'):
        memo_write(a, rec)
    return rec, ydl


# ---------------------------------------------------------------- the file in ranges
def opener():
    ctx = ssl.create_default_context(cafile=CA) if os.path.isfile(CA) else ssl.create_default_context()
    return urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))


def get_range(op, rec, first, last):
    """bytes first..last (last None: to the end of what the server gives); -> (data, total size or 0)"""
    err = None
    for attempt in range(4):
        try:
            headers = dict(rec.get('headers') or {})
            headers['Range'] = 'bytes=%d-%s' % (first, '' if last is None else last)
            with op.open(urllib.request.Request(rec['url'], headers=headers), timeout=30) as r:
                data = r.read()
                total = 0
                cr = r.headers.get('Content-Range') or ''
                if '/' in cr and cr.rsplit('/', 1)[1].isdigit():
                    total = int(cr.rsplit('/', 1)[1])
                return data, total
        except urllib.error.HTTPError as e:
            if e.code == 416:
                return b'', 0
            err = e
        except (OSError, ValueError) as e:
            err = e
        time.sleep(0.4 * (attempt + 1))
    raise err


def boxes(buf):
    """top-level boxes that are whole in buf: (type, start, end)"""
    at, out = 0, []
    while at + 8 <= len(buf):
        size, kind = struct.unpack_from('>I4s', buf, at)
        head = 8
        if size == 1:
            if at + 16 > len(buf):
                break
            size = struct.unpack_from('>Q', buf, at + 8)[0]
            head = 16
        if size < head or at + size > len(buf):
            out.append((kind, at, None))
            break
        out.append((kind, at, at + size))
        at += size
    return out


def seek_point(buf, sidx_at, sidx_end, second):
    """-> (byte offset of the fragment that holds `second`, the second it begins at)"""
    version = buf[sidx_at + 8]
    at = sidx_at + 12
    _ref_id, timescale = struct.unpack_from('>II', buf, at)
    at += 8
    if version == 0:
        earliest, first_offset = struct.unpack_from('>II', buf, at)
        at += 8
    else:
        earliest, first_offset = struct.unpack_from('>QQ', buf, at)
        at += 16
    count = struct.unpack_from('>H', buf, at + 2)[0]
    at += 4
    offset, t = sidx_end + first_offset, earliest
    for _ in range(count):
        ref, duration, _sap = struct.unpack_from('>III', buf, at)
        at += 12
        if ref & 0x80000000:      # an index of indexes: not what a film file has
            break
        if (t + duration) / float(timescale) > second:
            break
        offset += ref & 0x7fffffff
        t += duration
    return offset, t / float(timescale)


def stream(rec, second, out):
    op = opener()
    first, total = 0, int(rec.get('size') or 0)
    begins = 0.0
    if second > 0:
        head = b''
        while len(head) < 4 * CHUNK:
            more, tot = get_range(op, rec, len(head), len(head) + 262143)
            total = total or tot
            if not more:
                break
            head += more
            bx = boxes(head)
            sidx = [b for b in bx if b[0] == b'sidx']
            if sidx and sidx[0][2] is not None:
                offset, begins = seek_point(head, sidx[0][1], sidx[0][2], second)
                out.write(head[:sidx[0][1]])      # the file's head: what the decoder needs to read any fragment
                first = offset
                break
            if any(b[0] in (b'moof', b'mdat') for b in bx):
                break                              # no index before the first fragment: from the beginning
        if not first:
            begins = 0.0
    say('start %.3f' % begins)
    while True:
        last = first + CHUNK - 1
        if total:
            if first >= total:
                break
            last = min(last, total - 1)
        data, tot = get_range(op, rec, first, last)
        total = total or tot
        if not data:
            break
        out.write(data)
        out.flush()
        first += len(data)
        if len(data) < CHUNK and not total:
            break


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pyz', required=True)
    ap.add_argument('--lease', default='/run/mgu-uplink/lease.json')
    ap.add_argument('--node', default='')
    ap.add_argument('--format', required=True)
    ap.add_argument('--referer', default='')
    ap.add_argument('--at', type=float, default=0.0)
    ap.add_argument('--memo', default='')
    ap.add_argument('url')
    a = ap.parse_args()
    if not a.url.lower().startswith(('http://', 'https://')):
        say('not a web address')
        return 2
    use_lease_dns(a.lease)
    host = ''
    try:
        from urllib.parse import urlsplit
        host = (urlsplit(a.url).hostname or '').lower()
    except ValueError:
        host = ''
    try:
        rec, ydl = find(a, host)
        plain = rec['url'].startswith('http') and rec.get('protocol') in ('https', 'http')
        say('info ' + json.dumps({'duration': rec.get('duration') or 0, 'fps': rec.get('fps') or 0, 'height': rec.get('height') or 0,
                                  'title': rec.get('title') or '', 'seek': bool(plain)}))
        if plain:
            stream(rec, max(0.0, a.at), sys.stdout.buffer)
            return 0
        say('start 0.000')
        if ydl is None:
            ydl = load_ytdlp(a.pyz).YoutubeDL(ydl_params(a, host))
        return int(ydl.download([a.url]) or 0)
    except BrokenPipeError:
        return 0
    except Exception as e:  # pylint: disable=broad-except
        say('%s: %s' % (type(e).__name__, e))
        return 1


if __name__ == '__main__':
    sys.exit(main())
