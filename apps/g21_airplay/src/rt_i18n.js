'use strict';
// Local display translation only. Never use this on signal names, IDs or stored settings.
// THEiPlay: the kit's locale.json (English, no strings) inlined: the Store linker takes only .js modules.
const locale = { language: 'en', strings: {} };
const dict = locale.strings || {};
const language = locale.language || 'en';
const localizedValues = new Set(Object.values(dict));
const cache = new Map();
function getLanguage() { return language; }
// Plural forms live in the locale catalogs: "fault|faults<TAB>ошибка|ошибки|ошибок".
// The key is the English text for 1 and for many, exactly as English shows it (both the same
// when English does not change, e.g. "items|items"). Without a row the English form is returned
// and the drawn line goes through t() as before, so catalogs without plural rows (zh-CN) render unchanged.
// The rule picks the form index; Node 8 on the car has no Intl.PluralRules.
const PLURAL_RULES = {
    en: (n) => (n === 1 ? 0 : 1),
    ru: (n) => { // one | few | many
        const mod100 = Math.abs(n) % 100, mod10 = mod100 % 10;
        if (mod100 >= 11 && mod100 <= 14) return 2;
        if (mod10 === 1) return 0;
        return mod10 >= 2 && mod10 <= 4 ? 1 : 2;
    },
    'zh-CN': () => 0,
};
function plural(n, one, other, lang) {
    const key = one + '|' + other, lng = lang || language;
    const translated = lng !== 'en' && Object.prototype.hasOwnProperty.call(dict, key) && (!lang || lang === language);
    if (!translated) return n === 1 ? one : other;
    const forms = dict[key].split('|'), rule = PLURAL_RULES[lng] || PLURAL_RULES.en;
    return forms[Math.min(rule(n), forms.length - 1)];
}
const folded = Object.create(null);
Object.keys(dict).forEach((key) => { folded[key.toLowerCase()] = dict[key]; });
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrases = Object.keys(dict).filter((s) => s.length >= 4 && s.indexOf('|') < 0).sort((a, b) => b.length - a.length);
const pattern = new RegExp('(^|[^A-Za-z0-9_./])(' + phrases.map(escape).join('|') + ')(?=$|[^A-Za-z0-9_./])', 'gi');
function t(value) {
    const s = String(value == null ? '' : value);
    if (language === 'en') return ui(s);        // (THEiPlay: its own language over the kit's English)
    if (!/[A-Za-z]/.test(s)) return s; // numeric telemetry / already translated labels: hot path
    if (s.trim() === 'rpm') return s; // preserve the physical unit; uppercase RPM headings may translate
    if (cache.has(s)) return cache.get(s);
    const key = s.trim();
    if (localizedValues.has(key)) return s;
    let out;
    if (Object.prototype.hasOwnProperty.call(dict, key)) {
        out = s.slice(0, s.indexOf(key)) + dict[key] + s.slice(s.indexOf(key) + key.length);
    } else if (Object.prototype.hasOwnProperty.call(folded, key.toLowerCase())) {
        out = s.slice(0, s.indexOf(key)) + folded[key.toLowerCase()] + s.slice(s.indexOf(key) + key.length);
    } else {
        // Short words need context: "min 70" is a minimum, "12 min" is minutes.
        out = language === 'zh-CN' ? s.replace(/\bmin(?=\s+-?\d)/g, '最小').replace(/\bmax(?=\s+-?\d)/g, '最大')
            .replace(/\bAVG(?=\s+[+-]?\d)/g, '平均').replace(/\bACC\b/g, '加速') :
            language === 'ru' ? s.replace(/\bmin(?=\s+-?\d)/g, 'мин.').replace(/\bmax(?=\s+-?\d)/g, 'макс.')
                .replace(/\bAVG(?=\s+[+-]?\d)/g, 'СРЕД.').replace(/\bACC\b/g, 'РАЗГОН') : s;
        out = out.replace(pattern, (_, before, word) => before + (dict[word] || folded[word.toLowerCase()]));
    }
    if (cache.size >= 2048) cache.clear();
    cache.set(s, out);
    return out;
}
// ---------------------------------------------------------------- THEiPlay: the YouTube screen in Polish
// THEiPlay's menu is Polish (English with its "Język" switch); the YouTube screen (rt_view.js, the
// settings sheet) was written in English. ui() gives its words in THEiPlay's language: an exact
// phrase from PL, or one of PL_RULES for phrases with a number or a name in them. Text it does not
// know (a video's title, a channel) comes back as it is. Every text the recorder draws passes here.
const PL = {
    'Search': 'Szukaj', 'Home': 'Główna', 'Subs': 'Subskr.', 'Subscriptions': 'Subskrypcje', 'Watch later': 'Na później',
    'Results': 'Wyniki', 'Playing': 'Teraz', 'Now playing': 'Teraz odtwarzane', 'NOW PLAYING': 'TERAZ ODTWARZANE', 'Player': 'Odtwarzacz',
    'Music': 'Muzyka', 'News': 'Wiadomości', 'Cars': 'Motoryzacja', 'Podcasts': 'Podcasty', 'Comedy': 'Komedia', 'Trailers': 'Zwiastuny',
    'Search videos': 'Szukaj filmów', 'Find a channel': 'Znajdź kanał', 'Channels': 'Kanały', 'All channels': 'Wszystkie kanały', 'none': 'brak',
    'Search again': 'Szukaj ponownie', 'Search channels': 'Szukaj kanałów', 'A letter, or a word': 'Litera albo słowo',
    'Loading...': 'Wczytuję…', 'Videos': 'Filmy', 'Recommended': 'Polecane', 'Continue watching': 'Oglądaj dalej',
    'The RideTube service (jap-ridetube-d) is not running': 'Usługa YouTube w aucie nie działa',
    'The RideTube service is not running': 'Usługa YouTube w aucie nie działa',
    'Install the RideTube service (jap-ridetube-d) from the MGU Store': 'Zainstaluj narzędzie YouTube z MGU Store',
    'No answer from the RideTube service': 'Usługa YouTube nie odpowiada',
    'Search, or pick a recent search below': 'Szukaj albo wybierz ostatnie wyszukiwanie poniżej',
    'Pause': 'Pauza', 'Play': 'Odtwórz', 'Sign in': 'Zaloguj', 'Sign out': 'Wyloguj', 'Press again to sign out': 'Naciśnij jeszcze raz, żeby wylogować',
    'Pick a channel in Subscriptions': 'Wybierz kanał w Subskrypcjach',
    'The video service is not reachable - check the car\'s internet connection': 'Brak połączenia z YouTube – sprawdź internet w aucie',
    'No videos on this channel': 'Brak filmów na tym kanale', 'Show this channel': 'Pokaż ten kanał', 'Hide this channel': 'Ukryj ten kanał',
    'Hidden from Home, Subscriptions, Search': 'Ukryty na Głównej, w Subskrypcjach i w Szukaj',
    'From Home, Subscriptions and Search': 'Z Głównej, Subskrypcji i Szukaj',
    'Try again from Search': 'Spróbuj ponownie w Szukaj', 'Search (bar button) to find videos': 'Wybierz Szukaj, żeby znaleźć filmy', 'Try other words': 'Spróbuj innych słów',
    'Signing in needs a newer jap-ridetube-d tool on the car': 'Logowanie wymaga nowszego narzędzia YouTube w aucie',
    'Nothing in Watch later': 'Lista „Na później” jest pusta', 'No videos here yet': 'Nie ma tu jeszcze filmów',
    'Videos you save for later show here': 'Tu pojawią się filmy zapisane na później',
    'Tap here to get a sign-in code': 'Dotknij tutaj, żeby dostać kod logowania', 'Sign in (menu) to get a sign-in code': 'Wybierz Zaloguj, żeby dostać kod logowania',
    'Your Home, Subscriptions and Watch later, on the car': 'Twoja Główna, Subskrypcje i Na później w aucie',
    'Getting a sign-in code...': 'Pobieram kod logowania…', 'Enter this code on your phone': 'Wpisz ten kod na telefonie',
    'The account stays on the car; this app never sees a password': 'Konto zostaje w aucie; aplikacja nie widzi hasła',
    'playback stopped': 'odtwarzanie zatrzymane', 'Finished': 'Koniec', 'Pick a video on Home or Search': 'Wybierz film na Głównej albo w Szukaj',
    'Video stops while driving - the sound plays on': 'Podczas jazdy obraz znika – dźwięk gra dalej',
    'The picture needs the GPU renderer (mgu-render) - the sound plays': 'Obraz wymaga renderera GPU (mgu-render) – dźwięk gra',
    'Starting the picture...': 'Uruchamiam obraz…', 'RideTube': 'YouTube',
    'Podcast mode · driving': 'Tryb podcastu · jazda', 'Video returns when parked': 'Obraz wróci na postoju',
    'On phone': 'Na telefonie', 'Continue on your phone': 'Oglądaj dalej na telefonie',
    'Quality': 'Jakość', 'Unzoom': 'Pomniejsz', 'Zoom': 'Powiększ', 'Try again': 'Spróbuj ponownie',
    'sponsor': 'sponsor', 'self-promotion': 'autopromocja', 'subscribe reminder': 'prośba o subskrypcję', 'like & subscribe reminder': 'prośba o subskrypcję',
    'intro': 'czołówka', 'end cards': 'plansze końcowe', 'non-music part': 'część bez muzyki', 'segment': 'fragment', 'the channel': 'kanał',
    // the settings sheet
    'Settings': 'Ustawienia', 'Back': 'Wstecz', 'Done': 'Gotowe', 'Close': 'Zamknij', 'Off': 'Wyłączone', 'Never': 'Nigdy',
    'Skip': 'Pomijaj', 'Show a Skip button': 'Pokaż przycisk Pomiń',
    'Fill the screen (crops the video; off: black side bars)': 'Wypełnij ekran (przycina obraz; wyłączone: czarne pasy po bokach)',
    'Video while driving - at your own risk, only for a car coded for video in motion (passengers); takes effect once parked':
        'Obraz podczas jazdy – na własne ryzyko, tylko w aucie zakodowanym na wideo w ruchu (pasażerowie); działa od następnego postoju',
    'Show members-only videos': 'Pokazuj filmy tylko dla wspierających',
    'SponsorBlock: Sponsors': 'SponsorBlock: sponsorzy', 'SponsorBlock: Self-promotion': 'SponsorBlock: autopromocja',
    'SponsorBlock: Like & subscribe reminders': 'SponsorBlock: prośby o łapkę i subskrypcję', 'SponsorBlock: Intros': 'SponsorBlock: czołówki',
    'SponsorBlock: End cards and credits': 'SponsorBlock: plansze końcowe i napisy',
    'SponsorBlock: Non-music parts of music videos': 'SponsorBlock: części bez muzyki w teledyskach',
    'Parked: pause when the 12 V battery is under': 'Postój: pauza, gdy akumulator 12 V spadnie poniżej',
    'Picture on the centre screen (off: the cluster / HUD only, a smaller picture)': 'Obraz na środkowym ekranie (wyłączone: tylko zegary i HUD, mniejszy obraz)',
    'Also on the cluster (gauges)': 'Także na zegarach', 'Also on the HUD': 'Także na HUD',
    'YouTube account': 'Konto YouTube', 'Signed in - press to sign out': 'Zalogowano – naciśnij, żeby wylogować',
};
// 1 film, 2 filmy, 5 filmów
const plForm = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return n === 1 ? one : (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14) ? few : many);
};
const inner = (s) => (Object.prototype.hasOwnProperty.call(PL, s) ? PL[s] : s);
const PL_RULES = [
    [/^Preparing (\d+) %: ([\s\S]*)$/, (m) => 'Przygotowuję ' + m[1] + ' %: ' + m[2]],
    [/^Preparing\.\.\. (\d+) %$/, (m) => 'Przygotowuję… ' + m[1] + ' %'],
    [/^Paused: ([\s\S]*)$/, (m) => 'Pauza: ' + m[1]],
    [/^Playing: ([\s\S]*)$/, (m) => 'Odtwarzam: ' + m[1]],
    [/^Search: ([\s\S]*)$/, (m) => 'Szukaj: ' + inner(m[1])],
    [/^Error: ([\s\S]*)$/, (m) => 'Błąd: ' + inner(m[1])],
    [/^No connection - trying again \((\d+)\)\.\.\.$/, (m) => 'Brak połączenia – próbuję ponownie (' + m[1] + ')…'],
    [/^12 V battery at (\d+) % - paused\. Start the car to keep watching$/, (m) => 'Akumulator 12 V: ' + m[1] + ' % – pauza. Uruchom auto, żeby oglądać dalej'],
    [/^12 V battery at (\d+) % - it pauses at (\d+) %$/, (m) => 'Akumulator 12 V: ' + m[1] + ' % – pauza przy ' + m[2] + ' %'],
    [/^(\d+) subscriptions, A-Z$/, (m) => m[1] + ' ' + plForm(+m[1], 'subskrypcja', 'subskrypcje', 'subskrypcji') + ', A–Z'],
    [/^(\d+) subscriptions$/, (m) => m[1] + ' ' + plForm(+m[1], 'subskrypcja', 'subskrypcje', 'subskrypcji')],
    [/^Channels starting with “([\s\S]*)”$/, (m) => 'Kanały na „' + m[1] + '”'],
    [/^Channels matching “([\s\S]*)”$/, (m) => 'Kanały pasujące do „' + m[1] + '”'],
    [/^(\d+) channels?$/, (m) => m[1] + ' ' + plForm(+m[1], 'kanał', 'kanały', 'kanałów')],
    [/^(\d+) videos$/, (m) => m[1] + ' ' + plForm(+m[1], 'film', 'filmy', 'filmów')],
    [/^Loading ([\s\S]*)\.\.\.$/, (m) => 'Wczytuję: ' + inner(m[1]) + '…'],
    [/^Searching "([\s\S]*)"\.\.\.$/, (m) => 'Szukam „' + m[1] + '”…'],
    [/^Nothing found for "([\s\S]*)"$/, (m) => 'Nic nie znaleziono dla „' + m[1] + '”'],
    [/^Results for “([\s\S]*)”$/, (m) => 'Wyniki dla „' + m[1] + '”'],
    [/^Sign-in is not available \(([\s\S]*)\) - tap to try again$/, (m) => 'Logowanie niedostępne (' + m[1] + ') – dotknij, żeby spróbować ponownie'],
    [/^Scan the code, or go to ([\s\S]*)$/, (m) => 'Zeskanuj kod albo wejdź na ' + m[1]],
    [/^Scan with the camera to go on from ([\s\S]*)$/, (m) => 'Zeskanuj aparatem, żeby oglądać dalej od ' + m[1]],
    [/^Up next {2}· {2}([\s\S]*)$/, (m) => 'Następny  ·  ' + m[1]],
    [/^Up next in (\d+) s: ([\s\S]*)$/, (m) => 'Następny za ' + m[1] + ' s: ' + m[2]],
    // (only the SponsorBlock names: a video may be called "Skip ...")
    [/^Skip (sponsor|self-promotion|subscribe reminder|intro|end cards|non-music part|segment)$/, (m) => 'Pomiń: ' + inner(m[1])],
    [/^Skipped ([^·]*) · ([\s\S]*)$/, (m) => 'Pominięto: ' + inner(m[1]) + ' · ' + m[2]],
    [/^Version (\d[\w.\-]*)$/, (m) => 'Wersja ' + m[1]],
    [/^([\s\S]*) \(default\)$/, (m) => inner(m[1]) + ' (domyślnie)'],
];
// THEiPlay's own words on the YouTube screen, for its English setting
const EN_FROM_PL = {
    'Wyświetl na zegarach': 'Show on the cluster', 'Wyświetl na HUD': 'Show on the HUD', 'włączone': 'on', 'wyłączone': 'off',
    'Wyłącz': 'Close', 'Jakość: menu THEiPlay': 'Quality: THEiPlay menu', 'Jakość obrazu (menu THEiPlay)': 'Picture quality (THEiPlay menu)',
};
let uiLanguage = 'pl';      // THEiPlay starts in Polish; its "Język" switch calls setUiLanguage
const uiCache = new Map();
function setUiLanguage(lang) { uiLanguage = lang === 'en' ? 'en' : 'pl'; uiCache.clear(); }
function getUiLanguage() { return uiLanguage; }
function ui(value) {
    const s = String(value == null ? '' : value);
    if (uiLanguage !== 'pl') return Object.prototype.hasOwnProperty.call(EN_FROM_PL, s) ? EN_FROM_PL[s] : s;
    if (s.length < 3 || !/[A-Za-z]{2}/.test(s)) return s;
    let out = uiCache.get(s);
    if (out !== undefined) return out;
    out = null;
    if (Object.prototype.hasOwnProperty.call(PL, s)) out = PL[s];
    else for (let i = 0; i < PL_RULES.length && out === null; i++) { const m = PL_RULES[i][0].exec(s); if (m) out = PL_RULES[i][1](m); }
    if (out === null) out = s;
    if (uiCache.size >= 4096) uiCache.clear();
    uiCache.set(s, out);
    return out;
}
module.exports = { t, plural, PLURAL_RULES, dict, getLanguage, ui, setUiLanguage, getUiLanguage };
