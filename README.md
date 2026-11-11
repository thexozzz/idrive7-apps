# Środowisko aplikacji MGU dla BMW G21 2020

Lokalne środowisko do pisania aplikacji iDrive 7. Samochód instaluje je sam w MGU Store z gałęzi tego repozytorium. Stąd nic nie jest wgrywane na MGU.

## Instalacja i aktualizacja

W Store: Add source, adres `thexozzz/idrive7-apps`, kanał **gałąź** `test` (nie Releases). Na liście są `g21_hello` 0.1.0 i `g21_airplay` 0.1.0. Install buduje paczkę na jednostce z jej własnego `oap-sdk`. Aplikacja AirPlay wymaga też źródła `robertnisipeanu/idrive-apps`, skąd Store bierze `cluster-render` 0.5.4.

Aktualizacja nie wchodzi sama. Nowy numer wersji:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\bump.ps1 -App g21_hello -Level patch
```

Potem zwykły push tej gałęzi. W samochodzie: Installed, G21 Hello, Update. Ten sam numer przy nowym commicie Store pokazuje jako rewizję (krótki sha). Zostawienie Update bez kliknięcia zostawia starą wersję. Remove zdejmuje aplikację.

Puste wydanie GitHub nie jest używane. Kanał Releases w Store szuka gotowych paczek, a te zawierałyby SDK.

Źródła, na których oparto układ: [cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps) `8681f50c8843`, [robertnisipeanu/mgu-store](https://github.com/robertnisipeanu/mgu-store) `e883efb4616d`, [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps) `a559f69ebc8c`, [eroobeeroo/idrive7-cluster-info](https://github.com/eroobeeroo/idrive7-cluster-info) `10cefda018e5`. Rozdział faktów i hipotez jest w [docs/README.md](docs/README.md).

## Układ

| Ścieżka | Rola |
|---|---|
| `apps/g21_hello/` | szablon pakietu źródłowego ID7, usuwalny ze Store |
| `apps/g21_airplay/` | ekran stanu AirPlay na Wi-Fi MGU Store |
| `third_party/UxPlay/` | źródła odbiornika UxPlay 1.73.7, GPL-3.0 |
| `mgu-repo.json` | lista, którą Store czyta z gałęzi albo tagu |
| `lib/parked-gate.js` | HUD tylko po prawdziwej próbce prędkości do 3 km/h |
| `docs/apps/iphone-mirror.md` | plan lustra iPhone’a, bez kodu strumienia |
| `scripts/bump.ps1` | podnosi numer wersji, który Store pokaże jako aktualizację |
| `scripts/` | odczyt SSH, test, plan gałęzi, instrukcja usunięcia |
| `AGENTS.md` | zasady zmian, testów i dokumentacji |

## Polecenia

Node.js 18 lub nowszy.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test.ps1
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
powershell -ExecutionPolicy Bypass -File scripts\publish.ps1
powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1
```

`publish.ps1` zapisuje `dist/publish-plan.json` i niczego nie wysyła. Parametr zapisu na samochód jest odrzucany. Diagnostyka SSH jest tylko do odczytu i startuje po podaniu klucza leżącego poza tym katalogiem:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\diagnose.ps1 -Identity C:\ścieżka\poza\repo\klucz
```

Nie uruchamiaj jej, dopóki osobno nie zatwierdzisz połączenia z samochodem.

Szczegóły kanału Store są w [docs/03-publikacja.md](docs/03-publikacja.md).
