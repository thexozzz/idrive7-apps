#!/bin/sh
# tools/car-media-probe.sh - what BMW's head unit says about its media sources, for the question "can THEiPlay be a
# source of the factory Media menu, with its own title and cover?" (docs/10-integracja-media-bmw.md).
# READS ONLY: it lists and prints files of the head unit. It starts nothing, connects no audio source, changes
# nothing. Run by the owner, on the car, when it is in the network:
#   ssh root@<car> sh < tools/car-media-probe.sh > media-probe.txt
G=/usr/lib/oap-mainapp/src-gen
echo "== interface descriptions that speak of media, entertainment, audio, cover, metadata"
ls $G 2>/dev/null | grep -i 'media\|entertain\|audio\|am_\|cover\|meta\|source\|tuner\|player' 
echo "== the SOME/IP catalogue: services with such names"
grep -o '"[^"]*\(edia\|ntertain\|udio\|over\|ource\)[^"]*"' /etc/oap/someip/someip-interfaces.json 2>/dev/null | sort -u | head -200
for f in de_bmw_infotainment_entertainment_mediaplayer_MediaPlayer.json; do
  echo "== $f: methods, attributes, events (names only)"
  tr ',{' '\n\n' < $G/$f 2>/dev/null | grep -o '"name" *: *"[^"]*"' | sort -u | head -300
  echo "== $f: instances named in it"
  grep -o '"instance[^"]*" *: *"[^"]*"' $G/$f 2>/dev/null | sort -u | head -40
done
echo "== every instance name of the MediaPlayer that an installed app or the HMI uses"
grep -rho "OapGenericMedia\|'[A-Za-z]*Media[A-Za-z]*'" /usr/lib/oap-mainapp/src 2>/dev/null | sort | uniq -c | sort -rn | head -40
echo "== the audio manager's sources as configured (names and ids)"
for f in /etc/audiomanager/*.xml /etc/audiomanager/*.json /etc/am/*.xml /usr/share/audiomanager/*; do [ -f "$f" ] && { echo "-- $f"; grep -io 'source[^>]\{0,200\}' "$f" | head -80; }; done 2>/dev/null
echo "== D-Bus: is there a session or system bus with a media name (names only)"
ls /run/dbus 2>/dev/null; grep -rl 'mpris\|MediaPlayer2' /usr/share/dbus-1 /etc/dbus-1 2>/dev/null | head
echo "== done"
