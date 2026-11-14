# Architektura renderowania

## Trzy drogi rysowania na tym G21

| Droga | Gdzie | Stan | Źródło |
|---|---|---|---|
| **RHMI** (opis ekranu, rysuje HMI BMW / RAMSES) | środek | **BROKEN** dla tekstu: listy `LT_State_Wide`, `LT_Button_*`, `LT_Speller` otwierają się puste; `openEntryState` → `INVALID_UUID` | `docs/hipotezy.md` H17–H18, `.cursor/rules/mgu-screen.mdc` |
| **Renderer GPU społeczności** (`mgu-render`, gniazdo `/run/mgu-renderd/renderd.sock`, potem `/run/mgu-render/render.sock`) | środek | **VERIFIED** (menu widoczne, log `menu-ready 1920x720 native`) | `menu_draw.js`, `idrive7-apps/kit/renderd/PROTOCOL.md` |
| **cluster-render** (`/dev/shm/cluster-render/render.sock`, ramki `u32 len | u8 type | body`, `J`/`F`/`M`) | KOMBI `map` 0x100 1088×480, `panel` 0x203 1920×720, HUD `hud` 0x323 800×480 | **VERIFIED** dla małych obrazów (napis 360×80 `shown`) | `cluster_render_client.js`, `idrive-apps/native/cluster-render/PROTOCOL.md`, log |
| Wayland bezpośrednio (`g21-present` / `waylandsink`) | środek | **BROKEN**: czarna warstwa nad menu, nie używać dla środka | `docs/AIRPLAY_RENDER_PIPELINE.md` |

X11 brak. Standardowy kompozytor desktopowy brak; jest ivi/Winston BMW. EGL/GLES2 używa sam renderer (proces root), nie aplikacja. — VERIFIED/ASSUMPTION jak w MGU_ENVIRONMENT.md.

## Jak aplikacja dostaje powierzchnię (środek)

`menu_draw.js:connect()` → `HELLO "g21_airplay\0proto=mgu-render/1"` → renderer `X_READY` (flaga dotyku) → aplikacja `X_MODE 1` (tryb **layer**: własna powierzchnia ivi nad HMI) → `READY w,h` (1920×720) → `PLACE` cały ekran → `SHOW` → `FRAME` (CLEAR + RECT + tekst) → renderer `TICK` po narysowaniu (aplikacja trzyma jedną klatkę w locie, timeout 250 ms). `CLAIM` cały ekran = przechwycenie dotyku. — VERIFIED (kod `menu_draw.js` `take()`, `flushFrame()`, `sendPlace()`; log).

Zasady potwierdzone na aucie (`mgu-screen.mdc`): pełnoekranowy `PLACE` (pole 104,88 nic nie rysowało); renderer chowa aplikację po ~3 s ciszy → klatka co ≤1 s; po wyjściu zrywać gniazdo dopiero po `changeVisibility false`; `X_STATE false` zaraz po `READY` fałszywy.

Tryb **embed** (`X_MODE 2`, szablon `LT_State_A4A_WelcomeApp`) istnieje w rendererze, ale nie jest używany. — VERIFIED (PROTOCOL.md), PLANNED/nieużywane.

## Przepływ klatki AirPlay (środek)

```
iPhone H.264 ──TCP/UDP 7400-7402──► uxplay.bin (GStreamer 1.14)
  appsrc → queue → h264parse → avdec_h264 (CPU) → tee
     ├─► videoconvert → videoscale → fakesink async=false   (gałąź zbędna, zużywa CPU)
     └─► queue(1, leaky) → videoconvert → I420 → appsink g21yuv
             g21_new_sample(): memcpy wierszy do bloba "G21Y"+w,h  [kopia 1]
             fwrite /run/g21-airplay/latest.yuv.tmp → rename          [kopia 2, tmpfs]
main.js _videoTimer co 16 ms: statSync, readFileSync (≤640×400)       [kopia 3]
  video_router.push() → mirror_video.push(): fs.writeSync do slotu    [kopia 4]
     /dev/shm/mgu-video-g21airplay (MGVF, 4 sloty I420)
renderer: op VIDEO + op 19, czyta slot co 5 ms, upload na GPU          [kopia 5]
```

Źródła: `third_party/UxPlay/renderers/video_renderer.c` (l. ~300–345, 465–535), `main.js:_startVideoTimer` (~l. 1227), `_takeFrame` (~l. 4410), `mirror_video.js`, `kit/renderd/PROTOCOL.md` „Video”. Status: kod VERIFIED; działanie na aucie UNVERIFIED.

Dla KOMBI/HUD dochodzi: `video_decoder.scaleI420()` + `toAtlas()` w JS (pętle per piksel, CPU) → bufor → gniazdo cluster-render [kopie 5–6] → upload w cluster-render. Atlas YUV 4:2:0, szerokość %4, wysokość parzysta, ≤1920×720.

**Sprzętowa akceleracja**: dekodowanie programowe (brak vaapi w `LIBS.txt`) — VERIFIED dla paczki; skalowanie/kompozycja na GPU w rendererze — ASSUMPTION (PROTOCOL.md).

## Pamięć

- Aplikacja: limit ~192 MB (`memoryThresholdKB 196608`). Kiedyś przekroczony przez BGRA 1920×720 co 50 ms (`MEMORY_LIMIT_REACHED`). — VERIFIED.
- Klatka 600×400 I420 = 360 KB; `/dev/shm/mgu-video-g21airplay` = 64 B + 4×360 KB ≈ 1,4 MB. Renderer liczy w×h×3 na wideo, limit 12 MiB/aplikację, 32 MiB łącznie. — VERIFIED (kod, PROTOCOL.md).
- Klatki >640×400 są ignorowane w `_takeFrame` (zostaje ostatnia dobra). UxPlay żąda `-s 600x400 -fps 24` (nadpisywane przez `/run/g21-session/airplay-size`). — VERIFIED.
- Node: `readFileSync` co klatkę alokuje nowy Buffer → presja GC. — ASSUMPTION (wydajność).

## Rozdzielczość i skalowanie

Środek 1920×720, okno AirPlay domyślnie 640×360 (16:9, letterbox), pełny ekran opcjonalnie; skalowanie robi renderer (op 19 z prostokątem). KOMBI `map` 1088×480 (kieszeń między zegarami), `panel` 1920×720 (cały KOMBI — **zakrywa fabryczne wskazania BC**), HUD 800×480. — VERIFIED (kod/README cluster-render).

## Przełączanie aplikacji i zwalnianie zasobów

- Renderer pokazuje warstwę tylko gdy aplikacja jest „z przodu” (bramka `RemoteHmiApplication ROOT_APP`), dotyk poza `CLAIM` → `CLOSED` i ukrycie. — VERIFIED (PROTOCOL.md).
- Po wyjściu: `DROP_VIDEO`, zerwanie gniazda; plik `/dev/shm/mgu-video-*` powinien zniknąć (test ręczny w `docs/AIRPLAY_RENDER_PIPELINE.md`). Warstwy cluster-render znikają z połączeniem. — kod VERIFIED, zachowanie UNVERIFIED.
- Popupy BMW na KOMBI/HUD: cluster-render oddaje slot (`yield`, `hud_yield_slots`); adapter ustawia `contend 1` dla `panel`. — VERIFIED (kod), skutki UNVERIFIED.

## Ograniczenia narzucone przez BMW

Brak RHMI-tekstu, brak dostępu do GPU z procesu OAP, limit pamięci/CPU OAP, read-only rootfs, Node 8, komunikaty bezpieczeństwa BMW mają pierwszeństwo na KOMBI/HUD (cluster-render yield), dwa crashe = deinstalacja. Kamera/wideo BMW (`yield_surfaces`) chowa warstwy renderera.
