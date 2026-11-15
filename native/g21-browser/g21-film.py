#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""g21-film.py - one stream of a film to stdout, for THEiPlay Player (g21-browserd.js starts it as the engine's uid).

  g21-film.py --pyz <ytdlp.pyz> --lease <lease.json> --node <node> --format <yt-dlp format> [--referer <page>] -- <url>

yt-dlp finds the stream of the page (YouTube and the sites it knows; a plain address of a film file too) and
writes it to stdout as it downloads; the daemon gives that pipe to the decoder. Nothing is kept on the disk.
The car's own resolver answers no internet names, so names are asked from the uplink's DNS servers (lease.json),
as the browser's proxy and jap-ridetube-d's fetcher do.
"""
import argparse
import json
import os
import socket
import struct
import sys
import types

CA = '/var/opt/mgu-python/current/ssl/cacert.pem'
TUBE = ('youtube.com', 'youtu.be', 'youtube-nocookie.com')


def say(text):
    sys.stderr.write(str(text).replace('\n', ' ')[:300] + '\n')
    sys.stderr.flush()


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


class Quiet:
    def debug(self, msg):
        pass

    def info(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        say(msg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pyz', required=True)
    ap.add_argument('--lease', default='/run/mgu-uplink/lease.json')
    ap.add_argument('--node', default='')
    ap.add_argument('--format', required=True)
    ap.add_argument('--referer', default='')
    ap.add_argument('url')
    a = ap.parse_args()
    if not a.url.lower().startswith(('http://', 'https://')):
        say('not a web address')
        return 2
    use_lease_dns(a.lease)
    sys.path.insert(0, a.pyz)
    if os.path.isfile(CA) and 'certifi' not in sys.modules:
        # yt-dlp takes its certificates from certifi when it can import it: this one names the car's bundle
        certifi = types.ModuleType('certifi')
        certifi.where = lambda: CA
        certifi.contents = lambda: open(CA, encoding='ascii').read()
        sys.modules['certifi'] = certifi
    import yt_dlp
    host = ''
    try:
        from urllib.parse import urlsplit
        host = (urlsplit(a.url).hostname or '').lower()
    except ValueError:
        host = ''
    params = {'format': a.format, 'cachedir': False, 'logger': Quiet(), 'quiet': True, 'noprogress': True, 'no_warnings': True,
              'noplaylist': True, 'fixup': 'never', 'retries': 10, 'socket_timeout': 30, 'logtostderr': True,
              'outtmpl': {'default': '-'}, 'remote_components': [],
              # One long request is slowed down by the film's server after its first seconds (car, 2026-11-15: the sound
              # of a YouTube film arrived at a fraction of its speed and broke up); short ranges each come at full speed.
              'http_chunk_size': 1048576}
    if a.node:
        params['js_runtimes'] = {'node': {'path': a.node}}
    if any(host == t or host.endswith('.' + t) for t in TUBE):
        # (as jap-ridetube-d: this client gives H.264 and AAC addresses without a token and without a script to solve)
        params['extractor_args'] = {'youtube': {'player_client': ['visionos']}}
    if a.referer:
        params['http_headers'] = {'Referer': a.referer}
    try:
        with yt_dlp.YoutubeDL(params) as ydl:
            return int(ydl.download([a.url]) or 0)
    except BrokenPipeError:
        return 0
    except Exception as e:  # pylint: disable=broad-except
        say('%s: %s' % (type(e).__name__, e))
        return 1


if __name__ == '__main__':
    sys.exit(main())
