# G21 Hello

Szablon aplikacji iDrive 7 dla MGU Store. Pokazuje jedną etykietę na centralnym wyświetlaczu. Nie czyta sterowników i nie rysuje na HUD.

Jednostka buduje pakiet z `mgu-app.json`. W repozytorium nie ma `javascript/app.js` ani `oap-sdk`. Usunięcie: Store → Installed → Remove (`release.json` ma `uninstallable: true`).

Identyfikator stanu RHMI `24107` oraz kompletność krótkiego `uiDescription.json` nie były sprawdzone na samochodzie. Szczegóły: `docs/04-renderery.md` i hipotezy H4, H5.

Ikona kafelka: `package/rhmiData/variantGroups/Common/images/hello_icon.png`, 140×140.
