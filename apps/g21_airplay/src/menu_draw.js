'use strict';

/*
 * Draws the AirPlay menu as rectangles on the head unit's GPU renderer.
 * The RHMI list on this unit opens and stays blank. Working screens paint
 * with the renderd command stream: HELLO, PLACE, SHOW, then a FRAME of
 * CLEAR and RECT. This file speaks that stream. It does not use the kit.
 */

var net = require('net');
var fs = require('fs');
var knobKeyboard = require('./knob_keyboard.js');
var qr = require('./qr.js');

var HELLO = 1;
var PLACE = 2;
var SHOW = 3;
var ATLAS = 4;
var FRAME = 7;
var VIDEO = 13;
var DROP_VIDEO = 14;
var MIRROR_FILE = '/dev/shm/mgu-video-g21airplay';
var youtubeFilePath = '/dev/shm/mgu-video-ridetube';
var WEB_FILE = '/dev/shm/mgu-video-g21browser';
var GRAB = 10;
var READY = 101;
var TICK = 102;
var CCU = 105;
var X_GRAB = 0x4d520002;
var X_READY = 0x4d520101;
var X_STATE = 0x4d520102;
var X_CCU = 0x4d520103;
var X_MODE = 0x4d520001;
var X_MODE_LAYER = 1;
var CLAIM = 9;
var TOUCH = 105;
var CLOSED = 106;

var INK = 0xF7F2EAFF;
var HINT = 0xC4B5A4FF;
var MUTED = 0x8C7D6CFF;
var BAR = 0x2A2118FF;
var CARD = 0x16120EFF;
var CARD_HI = 0x2C241CFF;
var PAGE = 0x090807FF;
var PAGE_TOP = 0x120E0BFF;
var PAGE_BAND = 0x1A1410FF;
var ACCENT = 0xE6A15CFF;
var RED = 0xE23B3BFF;
var RED_CARD = 0x4A1616FF;
var ACCENT_DIM = 0x7A4A22FF;
var ACCENT_GLOW = 0x3A2414FF;
var LINE = 0x3A3026FF;
// shaded surfaces (top, bottom) and the tints the rows use
var PAGE_A = 0x100D0AFF;
var PAGE_B = 0x070605FF;
var HEAD_A = 0x1C1612FF;
var HEAD_B = 0x110E0BFF;
var ROW_A = 0x1C1713FF;
var ROW_B = 0x14100DFF;
var ROW_HI_A = 0x3A2D20FF;
var ROW_HI_B = 0x251D16FF;
var WELL = 0x2B231BFF;
var RED_A = 0x5C1D1DFF;
var RED_B = 0x3C1313FF;
var SOFT = 0xE9DFD2FF;
var uiLang = 'pl';
var EN = {
    'lustro iPhone': 'iPhone mirror',
    'Napis': 'Caption',
    'Ustawienia': 'Settings',
    'Jakość obrazu': 'Picture quality',
    'Ekran centralny': 'Centre screen',
    'Zegary i HUD': 'Cluster and HUD',
    'Wyłącz aplikację': 'Close app',
    'niska': 'low',
    'średnia': 'medium',
    'wysoka': 'high',
    'bardzo wysoka': 'very high',
    'maksymalna': 'maximum',
    'wybrana': 'selected',
    'Renderowanie': 'Rendering',
    'Programowe': 'Software',
    'YouTube': 'YouTube',
    'RideTube': 'RideTube',
    'zegary i HUD': 'gauges and HUD',
    'odtwarzanie': 'playing',
    'brak filmu': 'no video',
    'Pozycja': 'Position',
    'wspólne okno': 'shared window',
    'Rozciągnięcie': 'Stretch',
    'Wspólne': 'Shared',
    'Indywidualnie': 'Each screen',
    'jedna pozycja na wszystkie': 'one place for all',
    'każdy ekran osobno': 'each screen alone',
    'tylko ten ekran': 'this screen only',
    'okno, nie rozdzielczość': 'window, not the stream',
    'pozycja': 'position',
    'Czcionka': 'Font',
    'Wielkość': 'Size',
    'Kolor': 'Colour',
    'Pixel': 'Pixel',
    'Gruby': 'Bold',
    'Wysoki': 'Tall',
    'Biały': 'White',
    'Pomarańcz': 'Orange',
    'Czerwony': 'Red',
    'Żółty': 'Yellow',
    'Niebieski': 'Blue',
    'tekst na ekranach': 'text on the screens',
    'włącz lustro': 'start mirror',
    'Ekrany': 'Screens',
    'Zaloguj się do YouTube': 'Sign in to YouTube',
    'Zalogowano': 'Signed in',
    'konto w aucie': 'account on the car',
    'kod na telefonie': 'code on the phone',
    'naciśnij jeszcze raz, żeby wylogować': 'press again to sign out',
    'Przeglądaj': 'Browse',
    'po zalogowaniu': 'after sign-in',
    'Home, subskrypcje, do obejrzenia': 'Home, subscriptions, watch later',
    'Subskrypcje': 'Subscriptions',
    'Do obejrzenia': 'Watch later',
    'Wyniki': 'Results',
    'Teraz': 'Now playing',
    'Pobieram kod logowania': 'Getting a sign-in code',
    'Wpisz ten kod na telefonie': 'Enter this code on your phone',
    'Nowy kod': 'New code',
    'jeszcze raz': 'try again',
    'środek': 'centre',
    'zablokowane, 24 kl/s': 'locked, 24 fps',
    'Nazwa': 'Name',
    'Kod': 'Code',
    'bez kodu': 'no code',
    'Wstecz': 'Back',
    'strona główna': 'home',
    'Środek': 'Centre',
    'opcje tego ekranu': 'this screen',
    'Zegary': 'Gauges',
    'mapa albo cały panel': 'map or full panel',
    'Włącz': 'On',
    'wyłączony': 'off',
    'wylaczony': 'off',
    'włączony': 'on',
    'włączony na Start': 'on when you press Start',
    'Gdzie rysować': 'Where to draw',
    'mapa: kieszeń, wskazówki zostają': 'map: pocket, gauges stay',
    'Poziomo': 'Across',
    'Pionowo': 'Down',
    'klik, potem pokrętło': 'tap, then turn the knob',
    'Rozmiar': 'Size',
    'klik, rozciąga 600x400': 'tap, scales 600x400',
    'Wyśrodkuj': 'Centre it',
    'na środek': 'to the middle',
    'na srodek': 'to the middle',
    'ekrany': 'screens',
    'Tekst': 'Text',
    'własny napis': 'your own text',
    'OK: następny ekran': 'OK: next screen',
    'ukryty': 'hidden',
    'Zakończ': 'Stop',
    'Koniec streamu': 'end the stream',
    'Mapa: kieszeń, wskazówki zostają': 'Map: pocket, gauges stay',
    'Panel: całe zegary, zasłania BC': 'Panel: full gauges, hides the dials',
    'włączony, mapa: kieszeń': 'on, map: pocket',
    'wyłączony, mapa: kieszeń': 'off, map: pocket',
    'włączony, panel: całe zegary': 'on, full gauges',
    'wyłączony, panel: całe zegary': 'off, full gauges',
    'wybierz ekran': 'pick a screen',
    'sukces': 'ok',
    'iPhone laczy': 'iPhone connecting',
    'brak odbiornika': 'no receiver',
    'brak dns': 'no dns',
    'odbiornik spadl': 'receiver stopped',
    'brak wifi': 'no wifi',
    'czekam na iPhone': 'waiting for iPhone',
    'blad lustra': 'mirror error',
    'wstecz': 'back',
    'w gore': 'up',
    'dalej': 'more',
    'strzalki, potem wybierz': 'arrows, then select',
    'Gdzie pokazać': 'Where to show',
    'kliknij kafelek': 'tap a tile',
    'wlaczone': 'on',
    'wylaczone': 'off',
    'Gotowe': 'Done',
    'Pełny ekran': 'Full screen',
    'Wyjdź z trybu pełnoekranowego': 'Exit full screen',
    'Otwórz YouTube': 'Open YouTube',
    'Pozycja': 'Position',
    'Start': 'Start',
    'Stop': 'Stop',
    'AirPlay > Ekrany': 'AirPlay > Screens',
    'AirPlay > Ekrany > Środek': 'AirPlay > Screens > Centre',
    'AirPlay > Ekrany > Zegary': 'AirPlay > Screens > Gauges',
    'AirPlay > Ekrany > HUD': 'AirPlay > Screens > HUD',
    'AirPlay > Ekrany > Opcje': 'AirPlay > Screens > Options',
    'AirPlay > Ekrany > Okno': 'AirPlay > Screens > Window',
    'AirPlay > Lustro': 'AirPlay > Mirror',
    'Dodaj': 'Add',
    'Edytuj': 'Edit',
    'Usun': 'Delete',
    'Nowy profil': 'New profile',
    'Skasuj profil': 'Delete profile',
    'Koniec sesji': 'End session',
    'Menu glowne': 'Main menu',
    'Polacz': 'Connect',
    'wybierz ekran': 'pick a screen',
    // 0.1.135: Polish with its marks, and the words of the new look
    'połączono': 'connected',
    'iPhone łączy': 'iPhone connecting',
    'odbiornik spadł': 'receiver stopped',
    'błąd lustra': 'mirror error',
    'włączone': 'on',
    'wyłączone': 'off',
    'pokrętło albo dotyk': 'knob or touch',
    'pokrętło albo – i + zmienia, klik zapisuje': 'the knob or – and + change it, a press saves',
    'pokrętło zmienia, klik zapisuje': 'the knob changes it, a press saves',
    'całość': 'whole',
    'szer.': 'width',
    'wys.': 'height',
    'na żywo': 'live',
    'wybierz pozycję, rozmiar, wysokość albo szerokość': 'pick position, size, height or width',
    'zapisane': 'saved',
    'Zapisz': 'Save',
    'Anuluj': 'Cancel',
    'Wysokość': 'Height',
    'Szerokość': 'Width',
    'podgląd': 'preview',
    'wielkość': 'size',
    'rozmiar': 'size',
    'Okno': 'Window',
    'kod: wpisz go na iPhonie': 'code: enter it on the iPhone',
    'czekam na klatkę': 'waiting for a frame',
    'lustro': 'mirror',
    'spacja': 'space',
    'usuń': 'delete',
    'anuluj': 'cancel',
    'wpisz tekst': 'type here',
    'pokrętło: obrót lub wychylenie wybiera  ·  naciśnij: wpisz  ·  przytrzymaj literę: polskie znaki': 'knob: turn or tilt to pick  ·  press: type  ·  hold a letter: Polish letters',
    'Szukaj': 'Search',
    'Zaloguj się': 'Sign in',
    'Konto zostaje w aucie': 'The account stays on the car',
    'Logowanie niedostępne': 'Sign-in is not available',
    'dotknij, żeby spróbować ponownie': 'tap to try again',
    'Spróbuj ponownie': 'Try again',
    'Logowanie wymaga nowszej usługi w aucie': 'Signing in needs a newer service on the car',
    'Wczytuję…': 'Loading…',
    'Nic nie znaleziono': 'Nothing found',
    'Usługa YouTube w aucie nie działa': 'The YouTube service on the car is not running',
    'AirPlay działa': 'AirPlay is on',
    'AirPlay wyłączony': 'AirPlay is off',
    'AirPlay startuje': 'AirPlay is starting',
    'AirPlay zatrzymany': 'AirPlay stopped',
    'gotowe do lustra': 'ready to mirror',
    'czekam na kod': 'waiting for the code',
    'wybierz AirPlay albo YouTube': 'pick AirPlay or YouTube',
    'tylko postój': 'only when parked',
    'iPhone połączony': 'iPhone connected',
    'Kod AirPlay': 'AirPlay code',
    'wpisz go na iPhonie': 'enter it on the iPhone',
    'Połącz iPhone': 'Connect the iPhone',
    'otwórz Centrum sterowania': 'open Control Centre',
    'dotknij AirPlay przy odtwarzaczu': 'tap AirPlay by the player',
    'wybierz Klonowanie ekranu': 'pick Screen Mirroring',
    'wybierz': 'pick',
    'iPhone i auto w jednej sieci Wi-Fi': 'the iPhone and the car on one Wi-Fi',
    'czeka na iPhone': 'waiting for the iPhone',
    'zła nazwa': 'bad name',
    'napis': 'caption',
    'Hasło': 'Password',
    'Przeglądarka': 'Browser',
    'strony internetowe': 'web pages',
    'Wpisz adres albo szukaj': 'Type an address or search',
    'Uruchamiam przeglądarkę': 'Starting the browser',
    'Pobieram silnik przeglądarki': 'Downloading the browser engine',
    'jednorazowo, około 100 MB': 'once, about 100 MB',
    'Sprawdzam i rozpakowuję silnik': 'Checking and unpacking the engine',
    'nie udało się pobrać silnika: sprawdź internet w aucie': 'the engine could not be downloaded: check the car\'s internet',
    'Brak narzędzia Przeglądarka': 'The Browser tool is missing',
    'zainstaluj je w MGU Store': 'install it from MGU Store',
    'Brak obrazu strony': 'No page picture',
    'renderer bez warstwy wideo': 'the renderer has no video layer',
    'dotknij odśwież, aby spróbować ponownie': 'tap reload to try again',
    'Strona startowa': 'Start page',
    'Adres': 'Address',
    'silnik nie wystartował': 'the engine did not start',
    'silnik się zatrzymał: odśwież': 'the engine stopped: reload',
    'strona zużyła za dużo pamięci': 'the page used too much memory',
    'strona przestała działać: odśwież': 'the page stopped working: reload',
    'zły adres': 'bad address'
};

function tr(text) {
    var s = text == null ? '' : String(text);
    if (uiLang !== 'en' || !s) {
        return s;
    }
    if (EN[s]) {
        return EN[s];
    }
    if (s.indexOf('okno ') === 0) {
        return 'window ' + s.slice(5);
    }
    if (s.indexOf('błąd ') === 0) {
        return 'error ' + s.slice(5);
    }
    if (s.indexOf('kod ') === 0) {
        return 'code ' + s.slice(4);
    }
    return s;
}
var CHIP = 0x100D0AFF;
var ICON_FG = 0xE7D7C4FF;
var ICON_ACCENT = 0xF0C48AFF;
// Margins left clear inside a full-screen surface. On this car a PLACE of only
// this box drew nothing. The back column and title strip stay unpainted so iDrive
// can take them.
var CONTENT = { x: 104, y: 88, w: 1796, h: 632 };

// 16x16 1-bit icons for option tiles (RECT-only renderer).
var ICONS = {
    airplay: [
        '0000000000000000',
        '0001111111111000',
        '0010000000000100',
        '0100000000000010',
        '0100000000000010',
        '0100000000000010',
        '0100000000000010',
        '0100001110000010',
        '0100011111000010',
        '0010011111000100',
        '0001001110010000',
        '0000100100100000',
        '0000010001000000',
        '0000001010000000',
        '0000000100000000',
        '0000000000000000'
    ],
    desktop: [
        '0000000000000000',
        '0011111111111100',
        '0100000000000010',
        '0100111111110010',
        '0100100000010010',
        '0100100000010010',
        '0100100000010010',
        '0100100000010010',
        '0100111111110010',
        '0100000000000010',
        '0011111111111100',
        '0000011111100000',
        '0000011111100000',
        '0001111111111000',
        '0000000000000000',
        '0000000000000000'
    ],
    grid: [
        '0000000000000000',
        '0011101110111000',
        '0011101110111000',
        '0011101110111000',
        '0000000000000000',
        '0011101110111000',
        '0011101110111000',
        '0011101110111000',
        '0000000000000000',
        '0011101110111000',
        '0011101110111000',
        '0011101110111000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    play: [
        '0000000000000000',
        '0000110000000000',
        '0000111100000000',
        '0000111111000000',
        '0000111111110000',
        '0000111111111000',
        '0000111111111100',
        '0000111111111000',
        '0000111111110000',
        '0000111111000000',
        '0000111100000000',
        '0000110000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    stop: [
        '0000000000000000',
        '0000000000000000',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    tag: [
        '0000000000000000',
        '0000011111100000',
        '0000110000110000',
        '0001100000011000',
        '0011000000001100',
        '0110000000000110',
        '0110000001100110',
        '0110000001100110',
        '0110000000000110',
        '0011000000001100',
        '0001100000011000',
        '0000110000110000',
        '0000011111100000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    wifi: [
        '0000000000000000',
        '0000011111100000',
        '0001111111111000',
        '0011000000001100',
        '0110001111000110',
        '0000111111110000',
        '0001100000110000',
        '0000011111100000',
        '0000110000110000',
        '0000001111000000',
        '0000000100000000',
        '0000001110000000',
        '0000000100000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    back: [
        '0000000000000000',
        '0000001000000000',
        '0000011000000000',
        '0000111000000000',
        '0001111111111000',
        '0011111111111000',
        '0111111111111000',
        '0011111111111000',
        '0001111111111000',
        '0000111000000000',
        '0000011000000000',
        '0000001000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    host: [
        '0000000000000000',
        '0011111111111100',
        '0100000000000010',
        '0101110111011100',
        '0100000000000010',
        '0011111111111100',
        '0011111111111100',
        '0100000000000010',
        '0101110111011100',
        '0100000000000010',
        '0011111111111100',
        '0000010000100000',
        '0000011111100000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    user: [
        '0000000000000000',
        '0000011111100000',
        '0000111111110000',
        '0000111111110000',
        '0000011111100000',
        '0000001111000000',
        '0000011111100000',
        '0001111111111000',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0001111111111000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    gear: [
        '0000000000000000',
        '0000001111000000',
        '0010011111100100',
        '0111111001111110',
        '0011110000111100',
        '0111001111001110',
        '0110011111100110',
        '0110011111100110',
        '0111001111001110',
        '0011110000111100',
        '0111111001111110',
        '0010011111100100',
        '0000001111000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    lock: [
        '0000000000000000',
        '0000011111100000',
        '0000110000110000',
        '0000100000010000',
        '0000100000010000',
        '0011111111111100',
        '0011111111111100',
        '0011110011111100',
        '0011110011111100',
        '0011110011111100',
        '0011111111111100',
        '0011111111111100',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    unlock: [
        '0000000000000000',
        '0000011111100000',
        '0000110000110000',
        '0000000000010000',
        '0000000000010000',
        '0011111111111100',
        '0011111111111100',
        '0011110011111100',
        '0011110011111100',
        '0011110011111100',
        '0011111111111100',
        '0011111111111100',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ]
};

var FONT = {
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    '>': ['00001', '00010', '00100', '01000', '00100', '00010', '00001'],
    '<': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'],
    '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
    '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
    '*': ['00000', '10101', '01110', '00100', '01110', '10101', '00000'],
    ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
    'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    'M': ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
    'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    'V': ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
    'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
    'X': ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
    'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    'a': ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
    'b': ['10000', '10000', '11110', '10001', '10001', '10001', '11110'],
    'c': ['00000', '00000', '01110', '10000', '10000', '10000', '01110'],
    'd': ['00001', '00001', '01111', '10001', '10001', '10001', '01111'],
    'e': ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
    'f': ['00111', '00100', '01110', '00100', '00100', '00100', '00100'],
    'g': ['00000', '00000', '01111', '10001', '01111', '00001', '01110'],
    'h': ['10000', '10000', '11110', '10001', '10001', '10001', '10001'],
    'i': ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
    'j': ['00010', '00000', '00110', '00010', '00010', '10010', '01100'],
    'k': ['10000', '10010', '10100', '11000', '10100', '10010', '10001'],
    'l': ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
    'm': ['00000', '00000', '11010', '10101', '10101', '10001', '10001'],
    'n': ['00000', '00000', '11001', '10101', '10011', '10001', '10001'],
    'o': ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
    'p': ['00000', '00000', '11110', '10001', '11110', '10000', '10000'],
    'q': ['00000', '00000', '01111', '10001', '01111', '00001', '00001'],
    'r': ['00000', '00000', '10110', '11000', '10000', '10000', '10000'],
    's': ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
    't': ['00100', '00100', '11111', '00100', '00100', '00100', '00011'],
    'u': ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
    'v': ['00000', '00000', '10001', '10001', '10001', '01010', '00100'],
    'w': ['00000', '00000', '10001', '10001', '10101', '10101', '01010'],
    'x': ['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
    'y': ['00000', '00000', '10001', '10001', '01111', '00001', '01110'],
    'z': ['00000', '00000', '11111', '00010', '00100', '01000', '11111'],
    'ą': ['00000', '01110', '00001', '01111', '10001', '01110', '00110'],
    'ć': ['00010', '00100', '01110', '10000', '10000', '10000', '01110'],
    'ę': ['00000', '01110', '10001', '11111', '10000', '01110', '00110'],
    'ł': ['00100', '00100', '11111', '00100', '00100', '00100', '01110'],
    'ń': ['00010', '00100', '11001', '10101', '10011', '10001', '10001'],
    'ó': ['00010', '00100', '01110', '10001', '10001', '10001', '01110'],
    'ś': ['00010', '00100', '01111', '10000', '01110', '00001', '11110'],
    'ź': ['00010', '00100', '11111', '00010', '00100', '01000', '11111'],
    'ż': ['00100', '00000', '11111', '00010', '00100', '01000', '11111'],
    'Ą': ['01110', '10001', '11111', '10001', '10001', '10001', '00110'],
    'Ć': ['00010', '00100', '01111', '10000', '10000', '10000', '01111'],
    'Ę': ['11111', '10000', '11110', '10000', '10000', '11111', '00110'],
    'Ł': ['10000', '10000', '11111', '10000', '10000', '10000', '11111'],
    'Ń': ['00010', '00100', '11001', '10101', '10011', '10001', '10001'],
    'Ó': ['00010', '00100', '01110', '10001', '10001', '10001', '01110'],
    'Ś': ['00010', '00100', '01111', '10000', '01110', '00001', '11110'],
    'Ź': ['00010', '00100', '11111', '00010', '00100', '01000', '11111'],
    'Ż': ['00100', '00000', '11111', '00010', '00100', '01000', '11111']
};

var ROOT_ITEMS = [
    { name: 'airplay', title: 'AirPlay', hint: 'lustro iPhone', icon: 'airplay' },
    { name: 'youtube', title: 'YouTube', hint: '', icon: 'play' },
    { name: 'label-toggle', title: 'Napis', hint: 'tekst na ekranach', icon: 'tag' },
    { name: 'lang-toggle', title: 'Język', hint: 'polski', icon: 'tag' },
    { name: 'settings', title: 'Ustawienia', hint: 'GPU', icon: 'gear' },
    { name: 'position', title: 'Pozycja', hint: 'wspólne okno', icon: 'grid' },
    { name: 'browser', title: 'Przeglądarka', hint: 'strony internetowe', icon: 'globe' }
];

var AIRPLAY_ITEMS = [
    { name: 'air-toggle', title: 'Start', hint: 'włącz lustro', icon: 'play' },
    { name: 'air-screen', title: 'Ekrany', hint: 'środek', icon: 'desktop' },
    { name: 'air-quality', title: 'Jakość obrazu', hint: '600x400, 400x240', icon: 'desktop' },
    { name: 'air-name', title: 'Nazwa', hint: 'THEiPlay', icon: 'tag' },
    { name: 'air-pin', title: 'Kod', hint: 'bez kodu', icon: 'unlock' },
    { name: 'air-sound', title: 'AirPlay Sound', hint: 'wyłączone: obraz i dźwięk', icon: 'play' },
    { name: 'air-back', title: 'Wstecz', hint: 'strona główna', icon: 'back' }
];

var AIR_OUT_ITEMS = [
    { name: 'air-out-central', title: 'Środek', hint: 'opcje tego ekranu', icon: 'desktop' },
    { name: 'air-out-cluster', title: 'Zegary', hint: 'mapa albo cały panel', icon: 'grid' },
    { name: 'air-out-hud', title: 'HUD', hint: 'opcje tego ekranu', icon: 'tag' },
    { name: 'air-out-back', title: 'Wstecz', hint: 'AirPlay', icon: 'back' }
];

function screenOptions(name) {
    var items = [
        { name: 'air-box-power', title: 'Włącz', hint: 'wyłączony', icon: 'play' }
    ];
    if (name === 'cluster') {
        items.push({
            name: 'air-box-place',
            title: 'Gdzie rysować',
            hint: 'mapa: kieszeń, wskazówki zostają',
            icon: 'grid'
        });
    }
    items.push(
        { name: 'air-box-back', title: 'Wstecz', hint: 'ekrany', icon: 'back' }
    );
    return items;
}

var AIR_BOX_ITEMS = screenOptions('central');

function positionOptions() {
    return [
        { name: 'pos-x', title: 'Poziomo', hint: 'klik, potem pokrętło', icon: 'grid', adjust: true },
        { name: 'pos-y', title: 'Pionowo', hint: 'klik, potem pokrętło', icon: 'grid', adjust: true },
        { name: 'pos-size', title: 'Rozciągnięcie', hint: 'okno, nie rozdzielczość', icon: 'desktop', adjust: true },
        { name: 'pos-center', title: 'Wyśrodkuj', hint: 'na środek', icon: 'grid' },
        { name: 'pos-back', title: 'Wstecz', hint: 'pozycja', icon: 'back' }
    ];
}

function positionPage(mode, screen) {
    var shared = mode !== 'each';
    var focus = screen === 'cluster' || screen === 'hud' ? screen : 'central';
    var items = [
        { name: 'pos-shared', title: 'Wspólne', hint: 'jedna pozycja na wszystkie', icon: 'grid', on: shared },
        { name: 'pos-each', title: 'Indywidualnie', hint: 'każdy ekran osobno', icon: 'desktop', on: !shared }
    ];
    if (!shared) {
        items.push(
            { name: 'pos-out-central', title: 'Środek', hint: 'tylko ten ekran', icon: 'desktop', on: focus === 'central' },
            { name: 'pos-out-cluster', title: 'Zegary', hint: 'tylko ten ekran', icon: 'grid', on: focus === 'cluster' },
            { name: 'pos-out-hud', title: 'HUD', hint: 'tylko ten ekran', icon: 'tag', on: focus === 'hud' }
        );
    }
    positionOptions().forEach(function (item) {
        if (item.name !== 'pos-back') {
            items.push(item);
        }
    });
    items.push({ name: 'pos-out-back', title: 'Wstecz', hint: 'strona główna', icon: 'back' });
    return items;
}

var POS_OUT_ITEMS = positionPage('shared');

var POS_EACH_ITEMS = [
    { name: 'pos-out-central', title: 'Środek', hint: 'tylko ten ekran', icon: 'desktop' },
    { name: 'pos-out-cluster', title: 'Zegary', hint: 'tylko ten ekran', icon: 'grid' },
    { name: 'pos-out-hud', title: 'HUD', hint: 'tylko ten ekran', icon: 'tag' },
    { name: 'pos-each-back', title: 'Wstecz', hint: 'pozycja', icon: 'back' }
];

var LABEL_ITEMS = [
    { name: 'label-on', title: 'Napis', hint: 'ukryty', icon: 'tag' },
    { name: 'label-text', title: 'Tekst', hint: 'własny napis', icon: 'tag' },
    { name: 'label-where', title: 'Środek', hint: 'OK: następny ekran', icon: 'desktop' },
    { name: 'label-font', title: 'Czcionka', hint: 'Pixel', icon: 'tag' },
    { name: 'label-size', title: 'Wielkość', hint: '4', icon: 'desktop', adjust: true },
    { name: 'label-color', title: 'Kolor', hint: 'Biały', icon: 'tag' },
    { name: 'label-back', title: 'Wstecz', hint: 'THEiPlay', icon: 'back' }
];

var YOUTUBE_ITEMS = [
    { name: 'yt-where', title: 'Ekrany', hint: 'środek, zegary, HUD', icon: 'desktop' },
    { name: 'yt-login', title: 'Zaloguj się do YouTube', hint: 'kod na telefonie', icon: 'tag' },
    { name: 'yt-browse', title: 'Przeglądaj', hint: 'po zalogowaniu', icon: 'play' },
    { name: 'yt-back', title: 'Wstecz', hint: 'strona główna', icon: 'back' }
];

var YT_LOGIN_ITEMS = [
    { name: 'yt-login-code', title: 'Pobieram kod logowania', hint: 'google.com/device', icon: 'tag' },
    { name: 'yt-login-retry', title: 'Nowy kod', hint: 'jeszcze raz', icon: 'play' },
    { name: 'yt-login-back', title: 'Wstecz', hint: 'YouTube', icon: 'back' }
];

var YT_BROWSE_ITEMS = [
    { name: 'yt-feed-home', title: 'Home', hint: 'YouTube', icon: 'grid', on: true },
    { name: 'yt-feed-subs', title: 'Subskrypcje', hint: 'YouTube', icon: 'grid' },
    { name: 'yt-feed-wl', title: 'Do obejrzenia', hint: 'YouTube', icon: 'tag' },
    { name: 'yt-search', title: 'Szukaj', hint: 'tytuł filmu', icon: 'tag' },
    { name: 'yt-browse-back', title: 'Wstecz', hint: 'YouTube', icon: 'back' }
];

var SETTINGS_ITEMS = [
    { name: 'set-render', title: 'Renderowanie', hint: 'GPU', icon: 'desktop' },
    { name: 'set-back', title: 'Wstecz', hint: 'strona główna', icon: 'back' }
];

var STREAM_ITEMS = [
    { name: 'stream-end', title: 'Zakończ', hint: 'Koniec streamu', icon: 'stop' }
];

// Picture quality: two profiles, the centre screen (mgu-render) and the
// cluster + HUD (cluster-render). Each list item shows its current size.
function qualityItems(central, kombi) {
    return [
        { name: 'q-central', title: 'Ekran centralny', hint: central || '600x400', icon: 'desktop' },
        { name: 'q-kombi', title: 'Zegary i HUD', hint: kombi || '400x240', icon: 'grid' },
        { name: 'q-back', title: 'Wstecz', hint: 'AirPlay', icon: 'back' }
    ];
}

function qualityOptions(kind, list, current, names) {
    var prefix = kind === 'kombi' ? 'qk-' : 'qc-';
    var items = (list || []).map(function (value) {
        var label = names && names[value] ? names[value] : '';
        return {
            name: prefix + value,
            title: value,
            hint: value === current ? (label ? label + ', wybrana' : 'wybrana') : label,
            icon: kind === 'kombi' ? 'grid' : 'desktop',
            on: value === current
        };
    });
    items.push({ name: prefix + 'back', title: 'Wstecz', hint: 'Jakość obrazu', icon: 'back' });
    return items;
}

var QUALITY_ITEMS = qualityItems('600x400', '400x240');

var ITEMS = ROOT_ITEMS;
var SCREENS = {
    root: ROOT_ITEMS,
    airplay: AIRPLAY_ITEMS,
    'air-out': AIR_OUT_ITEMS,
    'air-box': AIR_BOX_ITEMS,
    label: LABEL_ITEMS,
    settings: SETTINGS_ITEMS,
    youtube: YOUTUBE_ITEMS,
    'yt-login': YT_LOGIN_ITEMS,
    'yt-browse': YT_BROWSE_ITEMS,
    'pos-out': POS_OUT_ITEMS,
    'pos-each': POS_EACH_ITEMS,
    'pos-box': positionOptions(),
    quality: QUALITY_ITEMS,
    'quality-central': qualityOptions('central', ['600x400'], '600x400'),
    'quality-kombi': qualityOptions('kombi', ['240x144', '240x180', '320x192', '400x240', '480x288', '600x360'], '400x240'),
    stream: STREAM_ITEMS
};

function message(type, payload) {
    var len = payload ? payload.length : 0;
    var pad = (4 - (len & 3)) & 3;
    var out = Buffer.alloc(8 + len + pad);
    out.writeUInt32LE(type >>> 0, 0);
    out.writeUInt32LE(len + pad, 4);
    if (len) {
        payload.copy(out, 8);
    }
    return out;
}

function u32(value) {
    var b = Buffer.alloc(4);
    b.writeUInt32LE(value >>> 0, 0);
    return b;
}

// ---------------------------------------------------------------- drawing
// Until 0.1.134 a frame was CLEAR and RECT only: text was a 5x7 pixel font, one RECT per lit
// pixel (2000 to 3800 rects, 50 to 90 kB a frame). The renderer draws more (kit/renderd
// PROTOCOL.md: RRECT, CARD, RSTROKE, LINE, ARC, QUAD, GLYPHS from an uploaded glyph atlas), and
// the YouTube screen (rt_view.js) has drawn with those on the car since 0.1.122. The menu records
// the same ops with the same recorder and the same Ubuntu atlases: one look for both screens,
// real letters with Polish marks, and a frame of 100 to 250 ops (3 to 8 kB).
var record = require('./rt_record.js');
var rtFonts = require('./rt_fonts.js');
var HAVE_FONTS = (function () {
    try {
        return !!rtFonts.get('label', 24, 'a');
    } catch (err) {
        return false;
    }
}());
var CAP_H = 0.72;   // Ubuntu: a capital's height in em

// The callers still size text by the pixel font's "scale" (a glyph was 7 * scale px tall).
// This gives the atlas size whose capitals are about as tall, so every layout holds.
function fontPx(scale) {
    return Math.round(scale * 9.6);
}

function fontFor(scale, text) {
    if (scale >= 8 && /^[0-9 ]*$/.test(String(text))) {
        return 'light';     // the AirPlay code: thin large digits
    }
    return scale >= 4 ? 'bold' : 'label';
}

function FrameBuilder() {
    this.rec = new record.Recorder(1920, 720);
    this.rects = 0;     // drawing ops in the frame (named in the rect-only days; the log and tests read it)
}

FrameBuilder.prototype.clear = function (color) {
    this.rec.clear(color >>> 0);
};

FrameBuilder.prototype.video = function (x, y, w, h, id) {
    if (!(w > 0) || !(h > 0)) {
        return;
    }
    this.rec.video(id || 1, x, y, w, h, 0);
};

FrameBuilder.prototype.rect = function (x, y, w, h, color) {
    if (!(w > 0) || !(h > 0)) {
        return;
    }
    this.rec.fillRect(x, y, w, h, color >>> 0);
    this.rects += 1;
};

/** rounded rectangle, radius r */
FrameBuilder.prototype.round = function (x, y, w, h, r, color) {
    if (!(w > 0) || !(h > 0)) {
        return;
    }
    this.rec.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)), color >>> 0);
    this.rects += 1;
};

/** rounded outline, lw px wide, inside the box */
FrameBuilder.prototype.stroke = function (x, y, w, h, r, lw, color) {
    if (!(w > 0) || !(h > 0)) {
        return;
    }
    this.rec.strokeRoundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)), lw, color >>> 0);
    this.rects += 1;
};

/**
 * A card: a rounded rectangle in the colour between top and bottom. (Not the renderer's CARD op,
 * a rounded rectangle shaded top to bottom: the YouTube screen never draws one, so it is not
 * proven on the car's renderer. Every op used here is one that screen draws on the car.)
 */
FrameBuilder.prototype.card = function (x, y, w, h, r, top, bottom) {
    var mix = function (shift) {
        return ((((top >>> shift) & 255) + ((bottom >>> shift) & 255)) >> 1) << shift;
    };
    this.round(x, y, w, h, r, (mix(24) | mix(16) | mix(8) | 0xFF) >>> 0);
};

/** rectangle shaded top to bottom */
FrameBuilder.prototype.grad = function (x, y, w, h, top, bottom) {
    if (!(w > 0) || !(h > 0)) {
        return;
    }
    this.rec.gradientRect(x, y, w, h, [[0, top >>> 0], [1, bottom >>> 0]]);
    this.rects += 1;
};

FrameBuilder.prototype.line = function (xa, ya, xb, yb, lw, color) {
    this.rec.line(xa, ya, xb, yb, lw, color >>> 0);
    this.rects += 1;
};

/** ring segment, degrees clockwise from 12 o'clock */
FrameBuilder.prototype.arc = function (cx, cy, r0, r1, a0, a1, color, round) {
    this.rec.arc(cx, cy, r0, r1, a0, a1, color >>> 0, round ? { round: true } : null);
    this.rects += 1;
};

FrameBuilder.prototype.circle = function (cx, cy, r, color) {
    this.rec.arc(cx, cy, 0, r, 0, 360, color >>> 0, null);
    this.rects += 1;
};

/** filled convex shape of three or four points */
FrameBuilder.prototype.quad = function (pts, color) {
    var p = pts.length === 3 ? [pts[0], pts[1], pts[2], [(pts[2][0] + pts[0][0]) / 2, (pts[2][1] + pts[0][1]) / 2]] : pts;
    this.rec.quad(p, color >>> 0);
    this.rects += 1;
};

FrameBuilder.prototype.pill = function (x, y, w, h, color) {
    this.round(x, y, w, h, Math.floor(Math.min(h / 2, w / 2, 28)), color);
};

// The 5x7 pixel font, one RECT per lit pixel: the caption ("Napis", font Pixel) keeps this
// look on the centre screen, and everything falls back to it when the atlases are missing.
FrameBuilder.prototype.pixelText = function (str, x, y, scale, color) {
    var pen = x;
    var text = String(str);
    var i;
    var row;
    var col;
    var glyph;
    var run;
    for (i = 0; i < text.length; i += 1) {
        glyph = FONT[text.charAt(i)] || FONT[' '];
        for (row = 0; row < glyph.length; row += 1) {
            col = 0;
            while (col < glyph[row].length) {
                if (glyph[row].charAt(col) !== '1') {
                    col += 1;
                } else {
                    run = col;
                    while (run < glyph[row].length && glyph[row].charAt(run) === '1') {
                        run += 1;
                    }
                    this.rect(pen + col * scale, y + row * scale, (run - col) * scale, scale, color);
                    col = run;
                }
            }
        }
        pen += 6 * scale;
    }
};

// y is the top of the old pixel cell (7 * scale px tall); the capitals are centred in it.
FrameBuilder.prototype.text = function (str, x, y, scale, color, font) {
    var text = String(str);
    var px;
    if (!text) {
        return;
    }
    if (!HAVE_FONTS) {
        this.pixelText(text, x, y, scale, color);
        return;
    }
    px = fontPx(scale);
    this.rec.text(text, x, Math.round(y + 3.5 * scale + px * CAP_H / 2), px, color >>> 0,
        { raw: true, literal: true, font: font || fontFor(scale, text) });
    this.rects += 1;
};

FrameBuilder.prototype.textWidth = function (str, scale, font) {
    var text = String(str || '');
    if (!HAVE_FONTS) {
        return text.length * 6 * scale;
    }
    return Math.ceil(this.rec.textWidth(text, fontPx(scale), { raw: true, literal: true, font: font || fontFor(scale, text) }));
};

/** text cut to maxW px, with "…" when cut */
FrameBuilder.prototype.fit = function (str, scale, maxW, font) {
    var s = String(str || '');
    if (this.textWidth(s, scale, font) <= maxW) {
        return s;
    }
    while (s.length > 1 && this.textWidth(s + '…', scale, font) > maxW) {
        s = s.slice(0, -1);
    }
    return s.replace(/\s+$/, '') + '…';
};

// Icons: drawn with lines and arcs on a 16 x 16 grid, u px per cell (the option rows use 3: 48 px).
var VECTOR_ICONS = {
    globe: function (d, x, y, u, c) {
        d.arc(x + 8 * u, y + 8 * u, 5.2 * u, 6.5 * u, 0, 360, c);
        d.line(x + 2 * u, y + 8 * u, x + 14 * u, y + 8 * u, 1.2 * u, c);
        d.line(x + 8 * u, y + 2 * u, x + 8 * u, y + 14 * u, 1.2 * u, c);
        d.arc(x + 13.4 * u, y + 8 * u, 7.6 * u, 8.8 * u, 228, 312, c);
        d.arc(x + 2.6 * u, y + 8 * u, 7.6 * u, 8.8 * u, 48, 132, c);
    },
    airplay: function (d, x, y, u, c) {
        var w = 1.5 * u;
        d.line(x + 2.2 * u, y + 3 * u, x + 13.8 * u, y + 3 * u, w, c);
        d.line(x + 2.2 * u, y + 3 * u, x + 2.2 * u, y + 10.4 * u, w, c);
        d.line(x + 13.8 * u, y + 3 * u, x + 13.8 * u, y + 10.4 * u, w, c);
        d.line(x + 2.2 * u, y + 10.4 * u, x + 4.2 * u, y + 10.4 * u, w, c);
        d.line(x + 11.8 * u, y + 10.4 * u, x + 13.8 * u, y + 10.4 * u, w, c);
        d.quad([[x + 8 * u, y + 8.4 * u], [x + 12.2 * u, y + 13.8 * u], [x + 3.8 * u, y + 13.8 * u]], c);
    },
    desktop: function (d, x, y, u, c) {
        d.stroke(x + 1.5 * u, y + 2.2 * u, 13 * u, 8.8 * u, 1.8 * u, 1.5 * u, c);
        d.line(x + 8 * u, y + 11.4 * u, x + 8 * u, y + 13.2 * u, 1.5 * u, c);
        d.line(x + 5 * u, y + 13.7 * u, x + 11 * u, y + 13.7 * u, 1.5 * u, c);
    },
    grid: function (d, x, y, u, c) {
        var i;
        var j;
        for (i = 0; i < 3; i += 1) {
            for (j = 0; j < 3; j += 1) {
                d.round(x + (2.1 + i * 4.3) * u, y + (2.1 + j * 4.3) * u, 3.2 * u, 3.2 * u, 0.9 * u, c);
            }
        }
    },
    play: function (d, x, y, u, c) {
        d.quad([[x + 4.6 * u, y + 2.6 * u], [x + 13.4 * u, y + 8 * u], [x + 4.6 * u, y + 13.4 * u]], c);
    },
    stop: function (d, x, y, u, c) {
        d.round(x + 3.6 * u, y + 3.6 * u, 8.8 * u, 8.8 * u, 1.8 * u, c);
    },
    tag: function (d, x, y, u, c) {
        var w = 1.5 * u;
        d.line(x + 2.4 * u, y + 3.2 * u, x + 9 * u, y + 3.2 * u, w, c);
        d.line(x + 9 * u, y + 3.2 * u, x + 13.8 * u, y + 8 * u, w, c);
        d.line(x + 13.8 * u, y + 8 * u, x + 9 * u, y + 12.8 * u, w, c);
        d.line(x + 9 * u, y + 12.8 * u, x + 2.4 * u, y + 12.8 * u, w, c);
        d.line(x + 2.4 * u, y + 12.8 * u, x + 2.4 * u, y + 3.2 * u, w, c);
        d.circle(x + 5.6 * u, y + 8 * u, 1.3 * u, c);
    },
    wifi: function (d, x, y, u, c) {
        d.arc(x + 8 * u, y + 12.6 * u, 9.2 * u, 10.7 * u, -45, 45, c, true);
        d.arc(x + 8 * u, y + 12.6 * u, 5.9 * u, 7.4 * u, -45, 45, c, true);
        d.arc(x + 8 * u, y + 12.6 * u, 2.6 * u, 4.1 * u, -45, 45, c, true);
        d.circle(x + 8 * u, y + 12.6 * u, 1.2 * u, c);
    },
    back: function (d, x, y, u, c) {
        var w = 1.6 * u;
        d.line(x + 12.6 * u, y + 8 * u, x + 3.6 * u, y + 8 * u, w, c);
        d.line(x + 3.6 * u, y + 8 * u, x + 7.6 * u, y + 4 * u, w, c);
        d.line(x + 3.6 * u, y + 8 * u, x + 7.6 * u, y + 12 * u, w, c);
    },
    host: function (d, x, y, u, c) {
        d.stroke(x + 2 * u, y + 2.4 * u, 12 * u, 4.8 * u, 1.3 * u, 1.4 * u, c);
        d.stroke(x + 2 * u, y + 8.8 * u, 12 * u, 4.8 * u, 1.3 * u, 1.4 * u, c);
        d.circle(x + 4.8 * u, y + 4.8 * u, 0.8 * u, c);
        d.circle(x + 4.8 * u, y + 11.2 * u, 0.8 * u, c);
    },
    user: function (d, x, y, u, c) {
        d.circle(x + 8 * u, y + 5.4 * u, 2.9 * u, c);
        d.arc(x + 8 * u, y + 15.2 * u, 4.6 * u, 6.2 * u, -78, 78, c, true);
    },
    gear: function (d, x, y, u, c) {
        var k;
        var a;
        d.arc(x + 8 * u, y + 8 * u, 2.5 * u, 4.5 * u, 0, 360, c, false);
        for (k = 0; k < 8; k += 1) {
            a = k * Math.PI / 4;
            d.line(x + (8 + Math.sin(a) * 4.6) * u, y + (8 - Math.cos(a) * 4.6) * u,
                x + (8 + Math.sin(a) * 6.1) * u, y + (8 - Math.cos(a) * 6.1) * u, 1.9 * u, c);
        }
    },
    lock: function (d, x, y, u, c) {
        d.round(x + 3.4 * u, y + 7.2 * u, 9.2 * u, 6.8 * u, 1.6 * u, c);
        d.arc(x + 8 * u, y + 7.4 * u, 2.4 * u, 3.9 * u, -90, 90, c, false);
    },
    unlock: function (d, x, y, u, c) {
        d.round(x + 3.4 * u, y + 7.2 * u, 9.2 * u, 6.8 * u, 1.6 * u, c);
        d.arc(x + 8 * u, y + 6 * u, 2.4 * u, 3.9 * u, -90, 62, c, true);
        d.line(x + 4.85 * u, y + 6 * u, x + 4.85 * u, y + 7.6 * u, 1.5 * u, c);
    }
};

FrameBuilder.prototype.icon = function (name, x, y, px, color) {
    var u = px || 3;
    (VECTOR_ICONS[name] || VECTOR_ICONS.play)(this, x, y, u, color);
};

FrameBuilder.prototype.iconSize = function (px) {
    return 16 * (px || 3);
};

FrameBuilder.prototype.bytes = function () {
    var w = this.rec.words();
    return Buffer.from(w.buffer.slice(w.byteOffset, w.byteOffset + w.byteLength));
};

/** ids of the glyph atlases the frame's text needs (sent once per connection before it) */
FrameBuilder.prototype.atlases = function () {
    return Array.from(this.rec.atlases);
};

/** the FRAME message of a drawing; its .atlases names the glyph atlases to upload first */
function packFrame(draw) {
    var out = message(FRAME, draw.bytes());
    out.atlases = draw.atlases();
    return out;
}

// A chevron: the tip points n / e / s / w, s px from its middle to an end.
function chevron(draw, dir, cx, cy, s, lw, color) {
    if (dir === 'w' || dir === 'e') {
        var k = dir === 'w' ? -1 : 1;
        draw.line(cx - k * s * 0.5, cy - s, cx + k * s * 0.5, cy, lw, color);
        draw.line(cx + k * s * 0.5, cy, cx - k * s * 0.5, cy + s, lw, color);
        return;
    }
    var m = dir === 'n' ? -1 : 1;
    draw.line(cx - s, cy - m * s * 0.5, cx, cy + m * s * 0.5, lw, color);
    draw.line(cx, cy + m * s * 0.5, cx + s, cy - m * s * 0.5, lw, color);
}

// A check mark in a box of side s at x, y.
function checkMark(draw, x, y, s, lw, color) {
    draw.line(x + s * 0.2, y + s * 0.52, x + s * 0.42, y + s * 0.74, lw, color);
    draw.line(x + s * 0.42, y + s * 0.74, x + s * 0.82, y + s * 0.28, lw, color);
}

// The power sign: a ring open at the top and a bar through the gap.
function powerSign(draw, cx, cy, r, lw, color) {
    draw.arc(cx, cy, r - lw, r, 35, 325, color, true);
    draw.line(cx, cy - r - 1, cx, cy - r * 0.15, lw, color);
}

function pageBox(width, height) {
    var boxW = width - CONTENT.x - 20;
    var boxH = height - CONTENT.y;
    var ox = 0;
    var oy = 0;
    if (boxW >= 800 && boxH >= 400) {
        ox = CONTENT.x;
        oy = CONTENT.y;
    } else {
        boxW = width;
        boxH = height;
    }
    return { ox: ox, oy: oy, boxW: boxW, boxH: boxH };
}

function menuLayout(items, selected, width, height, detail, heading, previewSpace) {
    var page = pageBox(width, height);
    var count = items.length || 1;
    var headerH = 68;
    var footerH = 96;
    var home = count <= 2 && page.boxW > 900;
    var gap = home ? 28 : 12;
    var bubbles = [];
    var i;
    var x;
    var y;
    var rowW;
    var rowH;
    var first = 0;
    if (home) {
        rowW = Math.min(560, Math.floor((page.boxW - 180 - gap) / count));
        rowH = 300;
        x = page.ox + Math.floor((page.boxW - (count * rowW + (count - 1) * gap)) / 2);
        y = page.oy + Math.floor((page.boxH - rowH) / 2) + 10;
        for (i = 0; i < items.length; i += 1) {
            bubbles.push({
                x: x,
                y: y,
                w: rowW,
                h: rowH,
                hitX: x,
                hitY: y,
                hitW: rowW,
                hitH: rowH,
                scale: 5,
                iconPx: 4,
                home: true,
                index: i,
                selected: i === selected
            });
            x += rowW + gap;
        }
    } else {
        rowH = 92;
        rowW = Math.min(920, page.boxW - 180);
        if (previewSpace && (heading === 'Okno' || heading === 'Pozycja' || heading === 'Wspólne' || heading === 'Środek' || heading === 'Zegary' || heading === 'HUD')) {
            rowW = Math.min(620, page.boxW - 700);
            if (rowW < 480) {
                rowW = 480;
            }
        }
        x = page.ox + 48;
        y = page.oy + headerH + 12;
        var pitch = rowH + gap;
        var pin = 0;
        var p;
        if (items[0] && items[0].name === 'pos-shared' && items[1] && items[1].name === 'pos-each') {
            pin = 2;
        }
        for (p = 0; p < pin; p += 1) {
            bubbles.push({
                x: x,
                y: y,
                w: rowW,
                h: rowH,
                hitX: x,
                hitY: y,
                hitW: rowW,
                hitH: rowH,
                scale: 4,
                iconPx: 3,
                home: false,
                index: p,
                selected: p === selected
            });
            y += pitch;
        }
        var listTop = y;
        var listBottom = page.oy + page.boxH - footerH - 12;
        var visible = Math.floor((listBottom - listTop) / pitch);
        var first = pin;
        var shown;
        var rest = items.length - pin;
        if (visible < 1) {
            visible = 1;
        }
        if (rest > visible) {
            if (selected < pin) {
                first = pin;
            } else {
                first = selected - Math.floor((visible - 1) / 2);
                if (first < pin) {
                    first = pin;
                }
                if (first > items.length - visible) {
                    first = items.length - visible;
                }
            }
        } else {
            visible = rest;
        }
        shown = 0;
        for (i = first; i < items.length && shown < visible; i += 1) {
            bubbles.push({
                x: x,
                y: y,
                w: rowW,
                h: rowH,
                hitX: x,
                hitY: y,
                hitW: rowW,
                hitH: rowH,
                scale: 4,
                iconPx: 3,
                home: false,
                index: i,
                selected: i === selected
            });
            y += pitch;
            shown += 1;
        }
    }
    return {
        ox: page.ox,
        oy: page.oy,
        boxW: page.boxW,
        boxH: page.boxH,
        gap: gap,
        bubbles: bubbles,
        heading: heading || '',
        detail: detail || '',
        hintY: page.oy + page.boxH - 46,
        statusY: page.oy + page.boxH - 22,
        headerH: headerH,
        first: first,
        pinned: pin || 0,
        count: items.length
    };
}

function defaultWindowPreview() {
    return {
        x: 640,
        y: 180,
        w: 640,
        h: 360,
        limitW: 1920,
        limitH: 720,
        label: 'Okno',
        sliders: [
            { key: 'air-box-x', label: 'Poziomo', value: 640, min: 0, max: 1280, on: false },
            { key: 'air-box-y', label: 'Pionowo', value: 180, min: 0, max: 360, on: false },
            { key: 'air-box-size', label: 'Rozmiar', value: 640, min: 160, max: 1920, on: false }
        ]
    };
}

function findBack(list) {
    var i;
    var name;
    var end = '';
    for (i = 0; i < list.length; i += 1) {
        name = list[i] && list[i].name ? list[i].name : '';
        if (/back$/.test(name)) {
            return name;
        }
        if (name === 'stream-end') {
            end = name;
        }
    }
    return end;
}

function crumbFor(name, head, where) {
    var base;
    if (name === 'airplay') {
        base = 'AirPlay';
    } else if (name === 'air-out') {
        base = 'AirPlay > Ekrany';
    } else if (name === 'air-box') {
        base = 'AirPlay > Ekrany > ' + (head && head !== 'THEiPlay' ? head : 'Opcje');
    } else if (name === 'label') {
        base = 'Napis';
    } else if (name === 'settings') {
        base = 'Ustawienia';
    } else if (name === 'youtube' || name === 'yt-login' || name === 'yt-browse') {
        base = name === 'yt-login' ? 'YouTube > Zaloguj' : (name === 'yt-browse' ? 'YouTube > Przeglądaj' : 'YouTube');
    } else if (name === 'pos-out' || name === 'pos-each') {
        base = 'Pozycja';
    } else if (name === 'pos-box') {
        base = 'Pozycja > ' + (head && head !== 'THEiPlay' ? head : 'Środek');
    } else if (name === 'quality') {
        base = 'AirPlay > Jakość obrazu';
    } else if (name === 'quality-central') {
        base = 'Jakość obrazu > Ekran centralny';
    } else if (name === 'quality-kombi') {
        base = 'Jakość obrazu > Zegary i HUD';
    } else if (name === 'stream') {
        base = 'AirPlay > Lustro';
    } else if (head && head !== 'THEiPlay' && head !== 'Stream') {
        base = 'THEiPlay > ' + head;
    } else {
        base = 'THEiPlay';
    }
    if (where) {
        return base + ' > ' + where;
    }
    return base;
}

function placeName(field, title) {
    if (field === 'air-name') {
        return 'Nazwa';
    }
    if (field === 'label-text') {
        return 'Tekst';
    }
    if (field === 'rdp-label' || field === 'vnc-label') {
        return 'Nazwa';
    }
    if (field === 'rdp-ip' || field === 'vnc-ip') {
        return 'IP';
    }
    if (field === 'rdp-port' || field === 'vnc-port') {
        return 'Port';
    }
    if (field === 'rdp-user') {
        return 'Konto';
    }
    if (field === 'rdp-pass') {
        return 'Hasło';
    }
    return title ? String(title) : 'Wpisz';
}

function fitCrumb(draw, text, scale, maxW) {
    var s = String(text || '');
    while (s.length > 4 && draw.textWidth(s, scale) > maxW) {
        s = s.slice(0, -2);
    }
    return s;
}

function drawMenuHeader(draw, lay, crumb, showBack) {
    var textX = lay.ox + 36;
    var maxW;
    var parts;
    var i;
    var x;
    var last;
    lay.crumb = tr(crumb || 'THEiPlay');
    lay.backHit = null;
    if (showBack) {
        draw.round(lay.ox + 20, lay.oy + 12, 156, 44, 22, CARD_HI);
        chevron(draw, 'w', lay.ox + 46, lay.oy + 34, 8, 3, ACCENT);
        draw.text(tr('wstecz'), lay.ox + 64, lay.oy + 24, 3, ACCENT);
        lay.backHit = { x: lay.ox + 20, y: lay.oy + 12, w: 156, h: 44 };
        textX = lay.ox + 198;
    }
    maxW = lay.ox + lay.boxW - textX - 780;
    if (!showBack) {
        // the home page: the name as a mark, "THE" light and "iPlay" in the accent
        if (lay.crumb === 'THEiPlay') {
            draw.text('THE', textX, lay.oy + 22, 4, SOFT, 'label');
            draw.text('iPlay', textX + draw.textWidth('THE', 4, 'label') + 2, lay.oy + 22, 4, ACCENT, 'bold');
        } else {
            draw.text(draw.fit(lay.crumb, 4, maxW), textX, lay.oy + 22, 4, ACCENT);
        }
        return;
    }
    // "AirPlay > Ekrany > Środek": the way here quiet, the place itself bright
    parts = lay.crumb.split(' > ');
    while (parts.length > 1 && draw.textWidth(parts.join('  ›  '), 4) > maxW) {
        parts.shift();
    }
    x = textX;
    for (i = 0; i < parts.length; i += 1) {
        last = i === parts.length - 1;
        if (last) {
            draw.text(draw.fit(parts[i], 4, Math.max(120, maxW - (x - textX))), x, lay.oy + 22, 4, INK, 'bold');
        } else {
            draw.text(parts[i], x, lay.oy + 22, 4, MUTED, 'label');
            x += draw.textWidth(parts[i], 4, 'label') + 14;
            chevron(draw, 'e', x + 4, lay.oy + 36, 7, 2.5, MUTED);
            x += 24;
        }
    }
}

function drawSpinner(draw, cx, cy) {
    var phase = Math.floor(Date.now() / 140) % 8;
    var i;
    var ang;
    var age;
    for (i = 0; i < 8; i += 1) {
        ang = i * Math.PI / 4 - Math.PI / 2;
        age = (phase - i + 8) % 8;      // 0: the head, then its tail
        draw.circle(cx + Math.cos(ang) * 42, cy + Math.sin(ang) * 42, age === 0 ? 9 : (age < 3 ? 7 : 5),
            age === 0 ? ACCENT : (age < 3 ? ACCENT_DIM : LINE));
    }
}

// exit: the right button closes the app (menu pages). Without it the
// button is "wybierz" (the knob keyboard still needs it).
function drawNav(draw, lay, onTop, exit, hot) {
    var y = onTop ? (lay.oy + lay.headerH + 10) : (lay.oy + lay.boxH - 78);
    var h = 56;
    var arrow = 76;
    var label = exit ? tr('Wyłącz aplikację') : 'wybierz';
    var tw = draw.textWidth(label, 3);
    var okW = Math.max(230, tw + (exit ? 88 : 48));
    var gap = 14;
    var okX = lay.ox + lay.boxW - okW - 24;
    var rightX = okX - gap - arrow;
    var leftX = rightX - gap - arrow;
    var across = !!(lay.bubbles && lay.bubbles[0] && lay.bubbles[0].home);
    var cy = y + h / 2;
    draw.round(leftX, y, arrow, h, 28, hot ? RED_B : CARD_HI);
    draw.round(rightX, y, arrow, h, 28, hot ? RED_B : CARD_HI);
    if (hot) {
        // an armed slider: the two buttons change its value (as the knob does)
        draw.stroke(leftX, y, arrow, h, 28, 2, RED);
        draw.stroke(rightX, y, arrow, h, 28, 2, RED);
        draw.line(leftX + arrow / 2 - 10, cy, leftX + arrow / 2 + 10, cy, 4, INK);
        draw.line(rightX + arrow / 2 - 10, cy, rightX + arrow / 2 + 10, cy, 4, INK);
        draw.line(rightX + arrow / 2, cy - 10, rightX + arrow / 2, cy + 10, 4, INK);
    } else {
        // a list runs down the page: up and down; the two-tile pages run across
        chevron(draw, across ? 'w' : 'n', leftX + arrow / 2, cy, 9, 3.5, INK);
        chevron(draw, across ? 'e' : 's', rightX + arrow / 2, cy, 9, 3.5, INK);
    }
    if (exit) {
        draw.round(okX, y, okW, h, 28, CARD_HI);
        powerSign(draw, okX + 36, cy + 1, 12, 3, HINT);
        draw.text(label, okX + 60 + Math.floor((okW - 60 - tw) / 2) - 6, y + 18, 3, INK);
    } else {
        draw.round(okX, y, okW, h, 28, ACCENT);
        draw.text(label, okX + Math.floor((okW - tw) / 2), y + 18, 3, PAGE);
    }
    lay.nav = {
        left: { x: leftX, y: y, w: arrow, h: h },
        right: { x: rightX, y: y, w: arrow, h: h },
        ok: { x: okX, y: y, w: okW, h: h, exit: !!exit }
    };
    if (onTop) {
        lay.framesTop = y + h + 22;
    }
}

function keyLabel(key) {
    if (key === 'SPC') {
        return tr('spacja');
    }
    if (key === 'ANU') {
        return tr('anuluj');
    }
    if (key === 'DEL') {
        return tr('usuń');
    }
    if (key === 'SH') {
        return 'Aa';
    }
    return key;
}

// A rounded rectangle with its own corner radius (pill() rounds to half the height).
function roundBox(draw, x, y, w, h, r, color) {
    draw.round(x, y, w, h, r, color);
}

var KB_KEY = 0x2A2622FF;       // letter keys
var KB_FN = 0x1E1B18FF;        // Aa, usuń, anuluj, spacja
var KB_PANEL = 0x110F0DFF;     // the keyboard's tray
var KB_FIELD = 0x1C1814FF;     // the text field

// The text field and the keyboard (knob: turn = next key, tilt up / down / left / right =
// the key there, press = type; touch: tap = type, hold = Polish letters).
function buildKeyboardFrame(edit, width, height, crumb, air, versionText) {
    var draw = new FrameBuilder();
    var page = pageBox(width, height);
    var rows = edit.rows || [];
    var spans = knobKeyboard.rowSpans(rows);
    var hits = [];
    var popupHits = [];
    var head = { ox: page.ox, oy: page.oy, boxW: page.boxW, boxH: page.boxH };
    var fieldX = page.ox + 40;
    var fieldY = page.oy + 70;
    var fieldW = page.boxW - 80;
    var fieldH = 84;
    var trayX = page.ox + 28;
    var trayY = fieldY + fieldH + 16;
    var trayW = page.boxW - 56;
    var keyH = 58;
    var rowGap = 9;
    var trayPad = 14;
    var trayH = rows.length * keyH + Math.max(0, rows.length - 1) * rowGap + trayPad * 2;
    var widest = 1;
    var unitPx;
    var r;
    var c;
    var k;
    var sp;
    var key;
    var x;
    var y;
    var w;
    var label;
    var scale;
    var lw;
    var focus;
    var held;
    var fn;
    var fill;
    var ink;
    var value = knobKeyboard.displayValue(edit);
    var maxChars;
    var shown;
    var count;
    var held2;
    var alts;
    var altW;
    var altX;
    var altY;
    draw.clear(0);
    drawPage(draw, { ox: page.ox, oy: page.oy, boxW: page.boxW, boxH: page.boxH, headerH: 62 });
    drawMenuHeader(draw, head, crumb || edit.title || 'Wpisz', true);

    // the field: its name, the text with a caret, how many characters are left
    roundBox(draw, fieldX - 2, fieldY - 2, fieldW + 4, fieldH + 4, 18, ACCENT_DIM);
    roundBox(draw, fieldX, fieldY, fieldW, fieldH, 16, KB_FIELD);
    // (the field's name is the header's title)
    count = value.length + (uiLang === 'en' ? ' of ' : ' z ') + (edit.max || 0);
    draw.text(count, fieldX + fieldW - 28 - draw.textWidth(count, 3), fieldY + Math.floor((fieldH - 21) / 2), 3, MUTED);
    maxChars = Math.max(4, Math.floor((fieldW - 200) / 30));
    shown = value.length > maxChars ? value.slice(value.length - maxChars) : value;
    if (shown.length) {
        draw.text(shown, fieldX + 28, fieldY + Math.floor((fieldH - 35) / 2), 5, INK);
    } else {
        draw.text(tr('wpisz tekst'), fieldX + 28, fieldY + Math.floor((fieldH - 28) / 2), 4, LINE, 'label');
    }
    draw.rect(fieldX + 28 + draw.textWidth(shown, 5) + (shown.length ? 4 : 0), fieldY + 22, 4, 40, ACCENT);

    // the tray and the keys, every row centred; widths from knob_keyboard (the knob's up / down uses them)
    roundBox(draw, trayX, trayY, trayW, trayH, 22, KB_PANEL);
    for (r = 0; r < spans.length; r += 1) {
        if (spans[r].length) {
            widest = Math.max(widest, spans[r][spans[r].length - 1].x1 - spans[r][0].x0);
        }
    }
    unitPx = Math.min(150, (trayW - trayPad * 2) / widest);
    for (r = 0; r < rows.length; r += 1) {
        y = trayY + trayPad + r * (keyH + rowGap);
        for (c = 0; c < rows[r].length; c += 1) {
            sp = spans[r][c];
            key = rows[r][c];
            k = sp.index;
            x = Math.round(trayX + trayW / 2 + sp.x0 * unitPx);
            w = Math.round((sp.x1 - sp.x0) * unitPx);
            focus = k === edit.keyIndex;
            held = !!(edit.popup && edit.popup.keyIndex === k);
            fn = key === 'SH' || key === 'SPC' || key === 'DEL' || key === 'ANU';
            fill = fn ? KB_FN : KB_KEY;
            ink = fn ? HINT : INK;
            if (key === 'OK') {
                fill = ACCENT_DIM;
                ink = INK;
            }
            if (key === 'SH' && edit.shift) {
                fill = ACCENT_GLOW;
                ink = ACCENT;
            }
            if (focus || held) {
                roundBox(draw, x - 4, y - 4, w + 8, keyH + 8, 16, ACCENT_GLOW);
                fill = ACCENT;
                ink = PAGE;
            }
            roundBox(draw, x, y, w, keyH, 12, fill);
            label = keyLabel(key);
            scale = label.length === 1 ? 4 : 3;
            lw = draw.textWidth(label, scale);
            draw.text(label, x + Math.floor((w - lw) / 2), y + Math.floor((keyH - 7 * scale) / 2), scale, ink);
            if (knobKeyboard.altsFor(key).length && !focus) {
                // a dot: holding this key gives Polish letters
                draw.rect(x + w - 12, y + 8, 4, 4, MUTED);
            }
            hits.push({ x: x, y: y, w: w, h: keyH, index: k });
        }
    }

    // Polish letters over a held key
    if (edit.popup && edit.popup.alts && edit.popup.alts.length) {
        held2 = hits[edit.popup.keyIndex];
        alts = edit.popup.alts;
        altW = 76;
        altY = held2 ? Math.max(page.oy + 8, held2.y - keyH - 20) : page.oy + 8;
        altX = held2
            ? held2.x + Math.floor(held2.w / 2) - Math.floor((alts.length * altW + (alts.length - 1) * 10) / 2)
            : page.ox + 80;
        roundBox(draw, altX - 12, altY - 12, alts.length * altW + (alts.length - 1) * 10 + 24, keyH + 24, 20, ACCENT_DIM);
        for (c = 0; c < alts.length; c += 1) {
            focus = c === edit.popup.pick;
            roundBox(draw, altX, altY, altW, keyH, 12, focus ? ACCENT : KB_KEY);
            lw = draw.textWidth(alts[c], 4);
            draw.text(alts[c], altX + Math.floor((altW - lw) / 2), altY + Math.floor((keyH - 28) / 2), 4, focus ? PAGE : INK);
            popupHits.push({ x: altX - 8, y: altY - 8, w: altW + 16, h: keyH + 16, pick: c });
            altX += altW + 10;
        }
    }

    // how to use it, under the tray
    label = tr('pokrętło: obrót lub wychylenie wybiera  ·  naciśnij: wpisz  ·  przytrzymaj literę: polskie znaki');
    draw.text(label, page.ox + Math.floor((page.boxW - draw.textWidth(label, 3)) / 2), trayY + trayH + 12, 3, MUTED);

    var board = { ox: page.ox, oy: page.oy, boxW: page.boxW, boxH: page.boxH };
    var airBadge = drawAirBadge(draw, board, air, versionText);
    return {
        frame: packFrame(draw),
        rects: draw.rects,
        layout: {
            ox: page.ox,
            oy: page.oy,
            boxW: page.boxW,
            boxH: page.boxH,
            bubbles: [],
            keys: hits,
            popup: popupHits,
            crumb: head.crumb,
            backHit: head.backHit,
            nav: null,
            airBadge: airBadge
        }
    };
}

function isStreamItems(items) {
    return !!(items && items.length === 1 && items[0] && items[0].name === 'stream-end');
}

function streamLayout(items, selected, width, height, detail, heading) {
    var page = pageBox(width, height);
    var btnW = 240;
    var btnH = 64;
    var x = page.ox + page.boxW - btnW - 24;
    var y = page.oy + page.boxH - btnH - 28;
    return {
        ox: page.ox,
        oy: page.oy,
        boxW: page.boxW,
        boxH: page.boxH,
        gap: 0,
        bubbles: [{
            x: x,
            y: y,
            w: btnW,
            h: btnH,
            hitX: x - 40,
            hitY: y - 40,
            hitW: btnW + 80,
            hitH: btnH + 80,
            scale: 4,
            iconPx: 3,
            selected: true
        }],
        heading: heading || 'Stream',
        detail: detail || '',
        hintY: y - 36,
        statusY: y - 8,
        headerH: 0,
        stream: true
    };
}

function drawVersionMark(draw, box, version) {
    var label;
    var tw;
    var text = String(version || '').replace(/^v/i, '');
    if (!text || !box) {
        return;
    }
    label = 'v' + text;
    tw = draw.textWidth(label, 2);
    draw.text(label, box.ox + box.boxW - tw - 36, box.oy + 28, 2, MUTED);
}

function parsePinDetail(detail) {
    var match = String(detail || '').match(/\bPIN\s+(\d{4,6})\b/i);
    return match ? match[1] : '';
}

function streamWindow(win, page) {
    var x = win.x | 0;
    var y = win.y | 0;
    var w = win.w | 0;
    var h = win.h | 0;
    var bottom = page.oy + page.boxH - 160;
    if (y < page.oy) {
        y = page.oy;
    }
    if (x < 0) {
        x = 0;
    }
    if (y >= bottom - 80) {
        y = bottom - 80;
    }
    if (y + h > bottom) {
        h = bottom - y;
    }
    if (h < 80) {
        h = 80;
    }
    if (w < 80) {
        w = 80;
    }
    return { x: x, y: y, w: w, h: h };
}

function drawChip(draw, box, on, label) {
    var text = String(label || '');
    var tw = draw.textWidth(text, 3);
    var r = Math.min(box.h / 2, 22);
    if (on) {
        draw.round(box.x, box.y, box.w, box.h, r, ACCENT);
    } else {
        draw.round(box.x, box.y, box.w, box.h, r, CARD_HI);
        draw.stroke(box.x, box.y, box.w, box.h, r, 1.5, LINE);
    }
    draw.text(text, box.x + Math.floor((box.w - tw) / 2), box.y + Math.floor((box.h - 21) / 2), 3, on ? PAGE : INK);
}

function drawSlider(draw, x, y, w, value, min, max, hot) {
    var span = (max | 0) - (min | 0);
    var t = span > 0 ? ((value | 0) - (min | 0)) / span : 0;
    var fill;
    var tone = hot ? RED : ACCENT;
    if (!(w > 8)) {
        return;
    }
    if (t < 0) {
        t = 0;
    }
    if (t > 1) {
        t = 1;
    }
    fill = Math.round((w - 4) * t);
    draw.round(x, y + 4, w, 8, 4, WELL);
    if (fill > 0) {
        draw.round(x, y + 4, fill + 4, 8, 4, tone);
    }
    draw.circle(x + 2 + fill, y + 8, 11, INK);
    draw.circle(x + 2 + fill, y + 8, 5, tone);
}

function drawStage(draw, x, y, maxW, maxH, shown) {
    var limitW = (shown && shown.limitW) || 1920;
    var limitH = (shown && shown.limitH) || 720;
    var scale = Math.min(maxW / limitW, maxH / limitH);
    var stageW = Math.max(40, Math.round(limitW * scale));
    var stageH = Math.max(24, Math.round(limitH * scale));
    var wx = x + Math.round(((shown && shown.x) || 0) * scale);
    var wy = y + Math.round(((shown && shown.y) || 0) * scale);
    var ww = Math.max(8, Math.round(((shown && shown.w) || limitW) * scale));
    var wh = Math.max(8, Math.round(((shown && shown.h) || limitH) * scale));
    if (ww > stageW) {
        ww = stageW;
    }
    if (wh > stageH) {
        wh = stageH;
    }
    if (wx + ww > x + stageW) {
        wx = x + stageW - ww;
    }
    if (wy + wh > y + stageH) {
        wy = y + stageH - wh;
    }
    draw.round(x, y, stageW, stageH, 8, PAGE);
    draw.stroke(x, y, stageW, stageH, 8, 1.5, LINE);
    draw.round(wx, wy, ww, wh, 4, ACCENT_DIM);
    draw.stroke(wx, wy, ww, wh, 4, 2, ACCENT);
}

function pushHit(hits, box) {
    hits.push({ name: box.name, x: box.x, y: box.y, w: box.w, h: box.h });
}

function drawAirBadge(draw, lay, air, versionText) {
    var picks;
    var chosen;
    var screens;
    var i;
    var row;
    var label;
    var tone;
    var tw;
    var total;
    var x;
    var y;
    var h;
    var cx;
    var btn;
    var lw;
    var px;
    var word;
    if (!air || !lay) {
        return null;
    }
    picks = ['central', 'cluster', 'hud'];
    chosen = {};
    screens = air.screens || [];
    for (i = 0; i < screens.length; i += 1) {
        row = screens[i];
        if (row && row.on) {
            chosen[row.key || row.name] = true;
        }
    }
    label = tr(String(air.status || (air.online ? 'połączono' : 'wyłączony'))).slice(0, 22);
    tw = draw.textWidth(label, 3);
    h = 44;
    total = 34 + tw + 18 + 164 + 10 + 132;
    x = lay.ox + lay.boxW - total - 20;
    y = lay.oy + 12;
    // the state: a lamp and its word
    if (air.online) {
        draw.circle(x + 14, y + h / 2, 11, ACCENT_GLOW);
        draw.circle(x + 14, y + h / 2, 7, ACCENT);
    } else if (air.bad) {
        draw.circle(x + 14, y + h / 2, 7, RED);
    } else {
        draw.arc(x + 14, y + h / 2, 5, 8, 0, 360, air.on ? ACCENT : MUTED, false);
    }
    tone = air.online ? ACCENT : (air.bad ? 0xFF9A8FFF : HINT);
    draw.text(label, x + 34, y + 12, 3, tone);
    cx = x + 34 + tw + 18;
    lay.airHits = [];
    // "Ekrany": three pips say which screens are chosen (centre, cluster, HUD)
    btn = { name: 'air-where', x: cx, y: y, w: 164, h: h };
    word = tr('Ekrany');
    lw = draw.textWidth(word, 3);
    if (air.whereOpen) {
        draw.round(btn.x, btn.y, btn.w, btn.h, 22, ACCENT);
    } else {
        draw.round(btn.x, btn.y, btn.w, btn.h, 22, CARD_HI);
        draw.stroke(btn.x, btn.y, btn.w, btn.h, 22, 1.5, LINE);
    }
    px = btn.x + Math.floor((btn.w - (lw + 14 + 46)) / 2);
    draw.text(word, px, btn.y + 12, 3, air.whereOpen ? PAGE : INK);
    px += lw + 14 + 5;
    for (i = 0; i < picks.length; i += 1) {
        if (chosen[picks[i]]) {
            draw.circle(px + i * 16, btn.y + h / 2, 5, air.whereOpen ? PAGE : ACCENT);
        } else {
            draw.arc(px + i * 16, btn.y + h / 2, 3.5, 5, 0, 360, air.whereOpen ? ACCENT_DIM : MUTED, false);
        }
    }
    lay.airHits.push(btn);
    // Start / Stop
    btn = { name: 'air-badge', x: cx + 164 + 10, y: y, w: 132, h: h };
    word = tr(air.on ? 'Stop' : 'Start');
    lw = draw.textWidth(word, 3);
    if (air.on) {
        draw.round(btn.x, btn.y, btn.w, btn.h, 22, ACCENT);
    } else {
        draw.round(btn.x, btn.y, btn.w, btn.h, 22, CARD_HI);
        draw.stroke(btn.x, btn.y, btn.w, btn.h, 22, 1.5, ACCENT_DIM);
    }
    px = btn.x + Math.floor((btn.w - (lw + 26)) / 2);
    if (air.on) {
        draw.round(px + 1, btn.y + h / 2 - 7, 14, 14, 3, PAGE);
    } else {
        draw.quad([[px + 2, btn.y + h / 2 - 8], [px + 16, btn.y + h / 2], [px + 2, btn.y + h / 2 + 8]], ACCENT);
    }
    draw.text(word, px + 26, btn.y + 12, 3, air.on ? PAGE : INK);
    lay.airHits.push(btn);
    lay.airStrip = { x: x, y: y, w: total, h: h };
    if (versionText) {
        lay.airStrip.version = String(versionText);
    }
    return btn;
}

function drawTunePanel(draw, hits, panel, tune) {
    var tools;
    var tool;
    var chip;
    var i;
    var x;
    var sliderY;
    var shown;
    var maxX;
    var maxY;
    var title;
    if (!tune) {
        return;
    }
    draw.card(panel.x, panel.y, panel.w, panel.h, 22, HEAD_A, HEAD_B);
    draw.stroke(panel.x, panel.y, panel.w, panel.h, 22, 1.5, LINE);
    draw.round(panel.x + 10, panel.y + 22, 5, 32, 2.5, ACCENT);
    title = tr(String(tune.title || 'Ekran'));
    draw.text(title, panel.x + 28, panel.y + 18, 4, INK);
    draw.text(tr('pokrętło zmienia, klik zapisuje'), panel.x + 28 + draw.textWidth(title, 4) + 24, panel.y + 24, 3, MUTED);
    tools = [
        { name: 'stream-pos', title: 'Pozycja', tool: 'pos' },
        { name: 'stream-size', title: 'Rozmiar', tool: 'size' },
        { name: 'stream-h', title: 'Wysokość', tool: 'h' },
        { name: 'stream-w', title: 'Szerokość', tool: 'w' }
    ];
    x = panel.x + 24;
    for (i = 0; i < tools.length; i += 1) {
        tool = tools[i];
        chip = { name: tool.name, x: x, y: panel.y + 62, w: 176, h: 48 };
        drawChip(draw, chip, tune.tool === tool.tool, tr(tool.title));
        pushHit(hits, chip);
        x += 186;
    }
    sliderY = panel.y + 132;
    maxX = Math.max(0, (tune.limitW || 1920) - (tune.w || 0));
    maxY = Math.max(0, (tune.limitH || 720) - (tune.h || 0));
    if (tune.tool === 'pos') {
        draw.text('X', panel.x + 28, sliderY - 2, 3, tune.axis === 'y' ? MUTED : ACCENT);
        drawSlider(draw, panel.x + 64, sliderY, 452, tune.x, 0, maxX);
        draw.text(String(tune.x | 0), panel.x + 536, sliderY - 2, 3, INK);
        pushHit(hits, { name: 'stream-axis-x', x: panel.x + 24, y: sliderY - 10, w: 580, h: 36 });
        draw.text('Y', panel.x + 28, sliderY + 38, 3, tune.axis === 'y' ? ACCENT : MUTED);
        drawSlider(draw, panel.x + 64, sliderY + 40, 452, tune.y, 0, maxY);
        draw.text(String(tune.y | 0), panel.x + 536, sliderY + 38, 3, INK);
        pushHit(hits, { name: 'stream-axis-y', x: panel.x + 24, y: sliderY + 30, w: 580, h: 36 });
    } else if (tune.tool === 'size' || tune.tool === 'w' || tune.tool === 'h') {
        if (tune.tool === 'h') {
            draw.text(tr('wys.'), panel.x + 28, sliderY + 6, 3, ACCENT);
            drawSlider(draw, panel.x + 124, sliderY + 8, 386, tune.h, 90, tune.limitH || 720);
        } else {
            draw.text(tr(tune.tool === 'size' ? 'całość' : 'szer.'), panel.x + 28, sliderY + 6, 3, ACCENT);
            drawSlider(draw, panel.x + 124, sliderY + 8, 386, tune.w, 160, tune.limitW || 1920);
        }
        draw.text(String(tune.w) + ' × ' + String(tune.h), panel.x + 536, sliderY + 6, 3, INK);
    } else {
        draw.text(tr('wybierz pozycję, rozmiar, wysokość albo szerokość'), panel.x + 28, sliderY + 10, 3, HINT);
    }
    chip = { name: 'stream-save', x: panel.x + 24, y: panel.y + 204, w: 180, h: 44 };
    drawChip(draw, chip, !!tune.saved, tr(tune.saved ? 'zapisane' : 'Zapisz'));
    pushHit(hits, chip);
    chip = { name: 'stream-cancel', x: panel.x + 216, y: panel.y + 204, w: 180, h: 44 };
    drawChip(draw, chip, false, tr('Anuluj'));
    pushHit(hits, chip);
    shown = tune.shown || {
        x: tune.x,
        y: tune.y,
        w: tune.w,
        h: tune.h,
        limitW: tune.limitW,
        limitH: tune.limitH
    };
    drawStage(draw, panel.x + panel.w - 256, panel.y + 62, 226, 124, shown);
    draw.text(tr('na żywo'), panel.x + panel.w - 256, panel.y + 198, 3, MUTED);
}

function drawWhereGlyph(draw, kind, x, y, tone, dim) {
    // a 210 x 130 sketch of the screen: tone = its picture, dim = the screen itself
    if (kind === 'cluster') {
        draw.arc(x + 60, y + 72, 37, 44, -128, 128, dim, true);
        draw.arc(x + 150, y + 72, 37, 44, -128, 128, dim, true);
        draw.round(x + 78, y + 52, 54, 40, 8, tone);
        draw.line(x + 60, y + 72, x + 42, y + 54, 4, dim);
        draw.line(x + 150, y + 72, x + 168, y + 54, 4, dim);
        return;
    }
    if (kind === 'hud') {
        draw.line(x + 34, y + 26, x + 176, y + 26, 4, dim);
        draw.line(x + 34, y + 26, x + 8, y + 112, 4, dim);
        draw.line(x + 176, y + 26, x + 202, y + 112, 4, dim);
        draw.line(x + 8, y + 112, x + 202, y + 112, 4, dim);
        draw.round(x + 66, y + 62, 78, 34, 8, tone);
        return;
    }
    draw.stroke(x + 8, y + 22, 194, 104, 14, 4, dim);
    draw.round(x + 60, y + 46, 90, 56, 8, tone);
}

function drawWhereSheet(draw, lay, air) {
    var tiles;
    var chosen;
    var screens;
    var i;
    var row;
    var panelW;
    var panelH;
    var x;
    var y;
    var tileW;
    var gap;
    var tx;
    var tile;
    var on;
    var cursor;
    var close;
    var here;
    var title;
    if (!air || !lay) {
        return;
    }
    var pick = (air && air.pickPrefix) || 'air-pick-';
    var shut = (air && air.pickClose) || 'air-where-close';
    // the YouTube start sheet: a tap beside the panel cancels, the button opens YouTube
    var cancel = (air && air.pickCancel) || shut;
    var hints = {};
    tiles = [
        { name: pick + 'cluster', key: 'cluster', title: 'Zegary', kind: 'cluster' },
        { name: pick + 'hud', key: 'hud', title: 'HUD', kind: 'hud' },
        { name: pick + 'central', key: 'central', title: 'Środek', kind: 'central' }
    ];
    chosen = {};
    screens = air.screens || [];
    for (i = 0; i < screens.length; i += 1) {
        row = screens[i];
        if (row && row.on) {
            chosen[row.key || row.name] = true;
        }
        if (row && row.hint) {
            hints[row.key || row.name] = String(row.hint);
        }
    }
    draw.rect(lay.ox, lay.oy, lay.boxW, lay.boxH, 0x060504F4);
    panelW = 900;
    panelH = 460;
    if (panelW > lay.boxW - 40) {
        panelW = lay.boxW - 40;
    }
    if (panelH > lay.boxH - 40) {
        panelH = lay.boxH - 40;
    }
    x = lay.ox + Math.floor((lay.boxW - panelW) / 2);
    y = lay.oy + Math.floor((lay.boxH - panelH) / 2);
    draw.card(x, y, panelW, panelH, 28, HEAD_A, HEAD_B);
    draw.stroke(x, y, panelW, panelH, 28, 1.5, LINE);
    title = tr('Gdzie pokazać');
    draw.text(title, x + 32, y + 24, 4, INK);
    draw.text(tr('kliknij kafelek'), x + 32 + draw.textWidth(title, 4) + 22, y + 30, 3, MUTED);
    tileW = Math.floor((panelW - 56 - 32) / 3);
    gap = 16;
    tx = x + 28;
    cursor = air.whereCursor | 0;
    if (!lay.airHits) {
        lay.airHits = [];
    }
    lay.airHits.push({ name: cancel, x: lay.ox, y: lay.oy, w: lay.boxW, h: lay.boxH });
    for (i = 0; i < tiles.length; i += 1) {
        tile = tiles[i];
        on = !!chosen[tile.key];
        here = cursor === i;
        // chosen: warm and ringed in the accent, with a tick; the knob's place: a light ring
        draw.card(tx, y + 78, tileW, 280, 20, on ? ROW_HI_A : ROW_A, on ? ROW_HI_B : ROW_B);
        if (on) {
            draw.stroke(tx, y + 78, tileW, 280, 20, 3, ACCENT);
            draw.circle(tx + tileW - 30, y + 108, 15, ACCENT);
            checkMark(draw, tx + tileW - 41, y + 97, 22, 3.5, PAGE);
        } else {
            draw.stroke(tx, y + 78, tileW, 280, 20, 1.5, LINE);
        }
        if (here) {
            draw.stroke(tx - 5, y + 73, tileW + 10, 290, 24, 2.5, INK);
        }
        drawWhereGlyph(draw, tile.kind, tx + Math.floor((tileW - 210) / 2), y + 92, on ? ACCENT : MUTED, on ? ACCENT_DIM : LINE);
        draw.text(tr(tile.title), tx + 20, y + 236, 4, on ? INK : SOFT);
        draw.text(tr(on ? 'włączone' : 'wyłączone'), tx + 20, y + 280, 3, on ? ACCENT : MUTED);
        if (hints[tile.key]) {
            draw.text(draw.fit(hints[tile.key], 2, tileW - 40), tx + 20, y + 318, 2, MUTED);
        }
        lay.airHits.push({ name: tile.name, x: tx, y: y + 78, w: tileW, h: 280 });
        tx += tileW + gap;
    }
    var closeLabel = tr((air && air.closeLabel) || 'Gotowe');
    var closeW = Math.max(160, draw.textWidth(closeLabel, 3) + 64);
    close = { name: shut, x: x + panelW - closeW - 32, y: y + panelH - 72, w: closeW, h: 48 };
    draw.round(close.x, close.y, close.w, close.h, 24, ACCENT);
    if (cursor === 3) {
        draw.stroke(close.x - 5, close.y - 5, close.w + 10, close.h + 10, 29, 2.5, INK);
    }
    draw.text(closeLabel, close.x + Math.floor((close.w - draw.textWidth(closeLabel, 3)) / 2), close.y + 14, 3, PAGE);
    lay.airHits.push(close);
}

// Full screen: black over the whole menu, only the picture; a tap shows the way out.
var FULL_EXIT = { name: 'air-full', x: 560, y: 590, w: 800, h: 72 };
function drawFullScreen(draw, lay, air) {
    draw.rect(0, 0, 1920, 720, 0x000000FF);
    draw.video(0, 0, 1920, 720, 1);
    lay.airWindow = { x: 0, y: 0, w: 1920, h: 720 };
    lay.airHits = [];
    lay.hits = [];
    lay.airBadge = null;
    lay.airStrip = null;
    if (air.fullUi) {
        draw.grad(0, 520, 1920, 200, 0x00000000, 0x000000D8);
        draw.round(FULL_EXIT.x, FULL_EXIT.y, FULL_EXIT.w, FULL_EXIT.h, 36, 0x1C1612F0);
        draw.stroke(FULL_EXIT.x, FULL_EXIT.y, FULL_EXIT.w, FULL_EXIT.h, 36, 2, ACCENT);
        var label = tr('Wyjdź z trybu pełnoekranowego');
        draw.text(label, FULL_EXIT.x + Math.floor((FULL_EXIT.w - draw.textWidth(label, 4)) / 2), FULL_EXIT.y + 22, 4, INK);
    }
}

function applyAirOverlay(draw, lay, air, versionText) {
    var hits = lay.hits || [];
    var win;
    lay.hits = hits;
    if (air && air.full && air.mirrored && air.window) {
        drawFullScreen(draw, lay, air);
        return;
    }
    lay.airBadge = drawAirBadge(draw, lay, air, versionText);
    lay.airWindow = null;
    if (air && !lay.stream && air.mirrored && air.window && air.window.w > 80 && air.window.h > 80) {
        win = {
            x: air.window.x | 0,
            y: air.window.y | 0,
            w: air.window.w | 0,
            h: air.window.h | 0
        };
        draw.video(win.x, win.y, win.w, win.h, 1);
        lay.airWindow = win;
    }
    if (air && air.yt && air.yt.live && air.yt.central !== false && !air.yt.whereOpen && air.yt.window) {
        draw.video(air.yt.window.x | 0, air.yt.window.y | 0, air.yt.window.w | 0, air.yt.window.h | 0, 1);
    } else if (air && air.yt && air.yt.live && air.yt.central !== false && !air.yt.whereOpen) {
        var vx = lay.ox + Math.floor(lay.boxW * 0.42);
        var vy = lay.oy + 110;
        var vw = lay.ox + lay.boxW - vx - 36;
        var vh = Math.floor(vw * 9 / 16);
        if (vh > lay.boxH - 180) {
            vh = lay.boxH - 180;
            vw = Math.floor(vh * 16 / 9);
        }
        draw.video(vx, vy, vw, vh, 1);
    }
    if (air && air.yt && air.yt.live && !air.yt.whereOpen) {
        drawYtBar(draw, lay);
    }
    if (air && air.yt && air.yt.whereOpen) {
        drawWhereSheet(draw, lay, {
            screens: air.yt.screens,
            whereCursor: air.yt.whereCursor,
            pickPrefix: 'yt-pick-',
            pickClose: 'yt-where-close',
            pickCancel: air.yt.whereGo ? 'yt-where-cancel' : '',
            closeLabel: air.yt.whereGo ? 'Otwórz YouTube' : ''
        });
    }
    if (air && air.whereOpen) {
        drawWhereSheet(draw, lay, air);
    }
    if (lay.airWindow && !air.whereOpen) {
        drawCenterChrome(draw, lay, lay.airWindow, !!air.full, !!air.movePos);
    }
}

function drawYtBar(draw, lay) {
    var play;
    var where;
    if (!lay.airHits) {
        lay.airHits = [];
    }
    play = { name: 'yt-play', x: lay.ox + lay.boxW - 420, y: lay.oy + 18, w: 112, h: 28 };
    where = { name: 'yt-where', x: play.x + 120, y: play.y, w: 132, h: 28 };
    drawChip(draw, play, true, 'Play');
    drawChip(draw, where, true, tr('Ekrany'));
    lay.airHits.push(play);
    lay.airHits.push(where);
}

var CHIP_W = 200;
var CHIP_H = 40;
var CHIP_GAP = 12;
function drawCenterChrome(draw, lay, win, full, moving) {
    // two chips of one size, side by side, at the window's top right inside it
    // (moved in when the window reaches past the menu page)
    var row = CHIP_W * 2 + CHIP_GAP;
    var x = win.x + win.w - 12 - row;
    var y = win.y + 12;
    var fullBtn;
    var posBtn;
    if (x < lay.ox + 12) {
        x = lay.ox + 12;
    }
    if (x + row > lay.ox + lay.boxW - 12) {
        x = lay.ox + lay.boxW - 12 - row;
    }
    if (y < lay.oy + 58) {
        y = lay.oy + 58;
    }
    if (y + CHIP_H > lay.oy + lay.boxH - 12) {
        y = lay.oy + lay.boxH - 12 - CHIP_H;
    }
    fullBtn = { name: 'air-full', x: x, y: y, w: CHIP_W, h: CHIP_H };
    posBtn = { name: 'air-pos', x: x + CHIP_W + CHIP_GAP, y: y, w: CHIP_W, h: CHIP_H };
    drawChip(draw, fullBtn, full, tr('Pełny ekran'));
    if (!full) {
        drawChip(draw, posBtn, moving, tr('Pozycja'));
    }
    if (!lay.airHits) {
        lay.airHits = [];
    }
    lay.airHits.push(fullBtn);
    if (!full) {
        lay.airHits.push(posBtn);
    }
}

function appendStreamChrome(draw, lay, page, info, win) {
    var hits = [];
    var barY = page.oy + page.boxH - 92;
    var x = page.ox + 20;
    var screens = (info && info.screens) || [];
    var i;
    var chip;
    var tune;
    var panel;
    var tools;
    var tool;
    var sliderY;
    var shown;
    var active;
    var maxX;
    var maxY;
    lay.hits = hits;
    for (i = 0; i < screens.length; i += 1) {
        chip = {
            name: screens[i].name,
            x: x,
            y: barY,
            w: screens[i].title === 'HUD' ? 150 : 210,
            h: 64
        };
        active = !!(info.tune && info.tune.name === String(screens[i].name || '').replace('stream-', ''));
        drawChip(draw, chip, active, tr(screens[i].title));
        if (screens[i].on && !active) {
            draw.circle(chip.x + chip.w - 24, chip.y + 20, 5, ACCENT);
        }
        pushHit(hits, chip);
        x += chip.w + 14;
    }
    if (lay.bubbles && lay.bubbles[0]) {
        pushHit(hits, {
            name: 'stream-end',
            x: lay.bubbles[0].x,
            y: lay.bubbles[0].y,
            w: lay.bubbles[0].w,
            h: lay.bubbles[0].h
        });
    }
    if (win && win.w >= 520 && win.h >= 80) {
        chip = { name: 'stream-win-pos', x: win.x + win.w - 318, y: win.y + 6, w: 148, h: 32 };
        drawChip(draw, chip, !!(info && info.tune && info.tune.name === 'central' && info.tune.tool === 'pos'), tr('pozycja'));
        pushHit(hits, chip);
        chip = { name: 'stream-win-size', x: win.x + win.w - 162, y: win.y + 6, w: 148, h: 32 };
        drawChip(draw, chip, !!(info && info.tune && info.tune.name === 'central' && info.tune.tool === 'size'), tr('rozmiar'));
        pushHit(hits, chip);
    }
    tune = info && info.tune;
    if (!tune) {
        return;
    }
    drawTunePanel(draw, hits, { x: page.ox + 20, y: barY - 276, w: 1120, h: 260 }, tune);
}

// "Wyłącz aplikację" on the Stream screen too (Miracast, RDP, VNC): the header's right side, left of
// the version. A tap on it is the menu pages' exit button (nav.ok with exit).
function drawStreamExit(draw, lay, page) {
    var label = tr('Wyłącz aplikację');
    var tw = draw.textWidth(label, 3);
    var w = tw + 76;
    var h = 48;
    var x = page.ox + page.boxW - w - 190;
    var y = page.oy + 8;
    draw.round(x, y, w, h, 24, CARD_HI);
    powerSign(draw, x + 30, y + h / 2 + 1, 11, 3, HINT);
    draw.text(label, x + 54, y + 14, 3, INK);
    lay.nav = { left: null, right: null, ok: { x: x, y: y, w: w, h: h, exit: true } };
}

function buildStreamFrame(items, selected, width, height, detail, heading, version, streamInfo, caption, crumb, air) {
    var draw = new FrameBuilder();
    var lay = streamLayout(items, selected, width, height, detail, heading);
    var bubble = lay.bubbles[0];
    var title = tr(String((items[0] && items[0].title) || 'Zakończ'));
    var titleW;
    var page = pageBox(width, height);
    var info = streamInfo || null;
    var pin = (info && info.pin) || parsePinDetail(detail);
    var mirrored = !!(info && info.mirrored);
    var pinScale;
    var pinW;
    var pinY;
    var label;
    var labelW;
    var lines;
    var i;
    var lineY;
    var panelX;
    var panelY;
    var panelW;
    var panelH;
    var placedWin = null;
    // The window is drawn here. waylandsink under the HMI stays blank on this unit.
    // (No page behind it: the picture of a desktop session shows through.)
    draw.clear(0);
    var head = { ox: page.ox, oy: page.oy, boxW: page.boxW, boxH: page.boxH };
    if (crumb) {
        draw.grad(page.ox, page.oy, page.boxW, 64, HEAD_A, HEAD_B);
        draw.rect(page.ox, page.oy + 63, page.boxW, 1, LINE);
        drawMenuHeader(draw, head, crumb, true);
        lay.crumb = head.crumb;
        lay.backHit = head.backHit;
    }
    drawVersionMark(draw, { ox: page.ox, oy: page.oy, boxW: page.boxW }, version);

    panelX = page.ox + 80;
    panelW = page.boxW - 160;
    if (info && info.window && info.window.w > 80 && info.window.h > 80) {
        var win = {
            x: info.window.x | 0,
            y: info.window.y | 0,
            w: info.window.w | 0,
            h: info.window.h | 0
        };
        placedWin = win;
        // the mirror's window: a dark title bar, the picture, a thin accent frame
        draw.rect(win.x, win.y, win.w, win.h, PAGE);
        if (info.video) {
            draw.video(win.x, win.y, win.w, win.h, 1);
        }
        draw.grad(win.x, win.y, win.w, 46, HEAD_A, HEAD_B);
        draw.rect(win.x, win.y + 44, win.w, 2, ACCENT);
        draw.stroke(win.x, win.y, win.w, win.h, 2, 2, ACCENT);
        draw.text('THE', win.x + 16, win.y + 12, 3, SOFT, 'label');
        draw.text('iPlay', win.x + 16 + draw.textWidth('THE', 3, 'label') + 1, win.y + 12, 3, ACCENT, 'bold');
        if (!mirrored && pin) {
            pinScale = 8;
            pinW = draw.textWidth(pin, pinScale);
            draw.text(pin, win.x + Math.floor((win.w - pinW) / 2), win.y + 84, pinScale, INK);
        } else if (!mirrored) {
            if (info && info.spin) {
                drawSpinner(draw, win.x + Math.floor(win.w / 2), win.y + Math.floor(win.h / 2) + 40);
            }
            label = draw.fit(tr(String((info && info.hint) || detail || 'czekam na klatkę')), 4, win.w - 40);
            labelW = draw.textWidth(label, 4);
            draw.text(label, win.x + Math.floor((win.w - labelW) / 2), win.y + 70, 4, INK);
            lines = (info && info.lines) || [];
            lineY = win.y + 124;
            for (i = 0; i < lines.length && i < 4; i += 1) {
                draw.text(draw.fit(String(lines[i]), 3, win.w - 48), win.x + 24, lineY, 3, HINT);
                lineY += 34;
            }
        }
        if (mirrored) {
            label = tr(String((info && (info.hint || info.headline)) || detail || 'lustro'));
            draw.text(draw.fit(label, 3, win.w), win.x, win.y + win.h + 10, 3, HINT);
        }
    } else if (!mirrored) {
        // no picture yet: one card with what to do (the code, or what is awaited)
        panelY = page.oy + 84;
        panelH = page.boxH - 84 - 130;
        draw.card(panelX, panelY, panelW, panelH, 28, HEAD_A, HEAD_B);
        draw.stroke(panelX, panelY, panelW, panelH, 28, 2, ACCENT_DIM);
        label = tr(String((info && info.headline) || heading || 'THEiPlay'));
        labelW = draw.textWidth(label, 4);
        draw.text(label, panelX + Math.floor((panelW - labelW) / 2), panelY + 28, 4, INK);
        if (pin) {
            pinScale = 12;
            pinW = draw.textWidth(pin, pinScale);
            label = tr('kod: wpisz go na iPhonie');
            labelW = draw.textWidth(label, 3);
            draw.text(label, panelX + Math.floor((panelW - labelW) / 2), panelY + 82, 3, ACCENT);
            pinY = panelY + 128;
            draw.text(pin, panelX + Math.floor((panelW - pinW) / 2), pinY, pinScale, INK);
            lineY = pinY + pinScale * 7 + 40;
        } else {
            lineY = panelY + 96;
            label = tr(String((info && info.hint) || detail || 'czekam na iPhone'));
            labelW = draw.textWidth(label, 3);
            draw.text(label, panelX + Math.floor((panelW - labelW) / 2), lineY, 3, HINT);
            if (info && info.spin) {
                drawSpinner(draw, panelX + Math.floor(panelW / 2), lineY + 110);
                lineY += 190;
            } else {
                lineY += 52;
            }
        }
        lines = (info && info.lines) || [];
        for (i = 0; i < lines.length; i += 1) {
            if (lineY > panelY + panelH - 40) {
                break;
            }
            label = draw.fit(String(lines[i]), 3, panelW - 96);
            draw.text(label, panelX + Math.floor((panelW - draw.textWidth(label, 3)) / 2), lineY, 3, MUTED);
            lineY += 36;
        }
    } else {
        if (detail) {
            draw.text(draw.fit(String(detail), 3, 900), lay.ox + 72, page.oy + 78, 3, MUTED);
        }
        lines = (info && info.lines) || [];
        lineY = page.oy + 112;
        for (i = 0; i < lines.length && i < 3; i += 1) {
            draw.text(draw.fit(String(lines[i]), 3, 900), lay.ox + 72, lineY, 3, HINT);
            lineY += 34;
        }
    }

    // "Zakończ": the one button of this screen
    draw.round(bubble.x - 4, bubble.y - 4, bubble.w + 8, bubble.h + 8, 36, ACCENT_GLOW);
    draw.card(bubble.x, bubble.y, bubble.w, bubble.h, 32, ROW_HI_A, ROW_HI_B);
    draw.stroke(bubble.x, bubble.y, bubble.w, bubble.h, 32, 2.5, ACCENT);
    titleW = draw.textWidth(title, 4);
    draw.round(bubble.x + Math.floor((bubble.w - titleW - 38) / 2), bubble.y + Math.floor(bubble.h / 2) - 11, 22, 22, 5, ACCENT);
    draw.text(title, bubble.x + Math.floor((bubble.w - titleW - 38) / 2) + 38, bubble.y + 18, 4, INK);
    appendStreamChrome(draw, lay, page, info, placedWin);
    drawStreamExit(draw, lay, page);
    applyAirOverlay(draw, lay, air, version);
    if (caption && caption.on && caption.text) {
        draw.pixelText(String(caption.text).slice(0, 24), caption.x | 0, caption.y | 0, caption.scale || 4, caption.color || ACCENT);
    }
    return {
        frame: packFrame(draw),
        rects: draw.rects,
        layout: lay
    };
}

// The menu's own YouTube pages (shown only when the YouTube screen, rt_view.js, could not start):
// THEiPlay's colours, as everything else.
var RT_BG = PAGE;
var RT_CARD = CARD_HI;
var RT_PH = CARD;
var RT_TEXT = INK;
var RT_DIM = HINT;
var RT_PINK = ACCENT;
var RT_HEAD = PAGE_TOP;

function drawQrBlock(draw, text, x, y, mod) {
    var q;
    var side;
    var r;
    var c;
    var end;
    try {
        q = qr.encode(String(text || 'https://www.google.com/device'));
    } catch (err) {
        return 0;
    }
    side = (q.length + 8) * mod;
    draw.rect(x, y, side, side, 0xFFFFFFFF);
    for (r = 0; r < q.length; r += 1) {
        c = 0;
        while (c < q[r].length) {
            if (!q[r][c]) {
                c += 1;
            } else {
                end = c;
                while (end < q[r].length && q[r][end]) {
                    end += 1;
                }
                draw.rect(x + (4 + c) * mod, y + (4 + r) * mod, (end - c) * mod, mod, 0x000000FF);
                c = end;
            }
        }
    }
    return side;
}

function drawRideFrame(items, selected, width, height, ride) {
    var draw = new FrameBuilder();
    var hits = [];
    var sel = items[selected] && items[selected].name ? items[selected].name : '';
    var rails = [
        { name: 'yt-search', label: 'Szukaj' },
        { name: 'yt-feed-home', label: 'Home' },
        { name: 'yt-feed-subs', label: 'Subskrypcje' },
        { name: 'yt-feed-wl', label: 'Do obejrzenia' }
    ];
    var mode = ride.mode || 'home';
    var i;
    var rail;
    var on;
    var ry;
    var sections;
    var sec;
    var itemsRow;
    var n;
    var col;
    var tile;
    var tx;
    var ty;
    var label;
    var auth;
    var url;
    var side;
    var cardX;
    var cardY;
    var play;
    draw.grad(0, 0, width, height, PAGE_A, PAGE_B);
    draw.grad(0, 0, width, 56, HEAD_A, HEAD_B);
    draw.rect(0, 55, width, 1, LINE);
    draw.text('YouTube', 88, 14, 4, RT_TEXT);
    hits.push({ name: 'yt-ride-back', x: 16, y: 8, w: 56, h: 40 });
    draw.round(16, 8, 56, 40, 20, CARD_HI);
    chevron(draw, 'w', 44, 28, 8, 3, ACCENT);
    if (mode !== 'player' && mode !== 'signin') {
        for (i = 0; i < rails.length; i += 1) {
            rail = rails[i];
            on = sel === rail.name || (rail.name === 'yt-feed-home' && mode === 'home') || (rail.name === 'yt-feed-subs' && mode === 'subs') || (rail.name === 'yt-feed-wl' && mode === 'wl') || (rail.name === 'yt-search' && mode === 'results');
            ry = 88 + i * 110;
            if (on) {
                draw.round(12, ry, 150, 92, 18, RT_CARD);
                draw.round(18, ry + 30, 5, 32, 2.5, RT_PINK);
            }
            draw.text(draw.fit(tr(rail.label), 2, 116), 34, ry + 38, 2, on ? RT_TEXT : RT_DIM);
            hits.push({ name: rail.name, x: 12, y: ry, w: 124, h: 96 });
        }
    }
    if (mode === 'signin') {
        auth = ride.auth || {};
        url = auth.url || 'https://www.google.com/device';
        cardX = 280;
        cardY = 120;
        draw.pill(cardX, cardY, 1400, 460, RT_CARD);
        if (auth.state === 'code' && auth.code) {
            side = drawQrBlock(draw, url, cardX + 48, cardY + 70, 6);
            if (!side) {
                side = 180;
            }
            draw.text(tr('Zaloguj się'), cardX + side + 140, cardY + 90, 5, RT_TEXT);
            draw.text(tr('Wpisz ten kod na telefonie'), cardX + side + 140, cardY + 150, 3, RT_DIM);
            draw.pill(cardX + side + 140, cardY + 190, 640, 90, RT_HEAD);
            draw.text(String(auth.code), cardX + side + 164, cardY + 214, 6, RT_TEXT);
            draw.text(String(url).replace(/^https:\/\/(www\.)?/, ''), cardX + side + 140, cardY + 320, 3, RT_DIM);
            draw.text(tr('Konto zostaje w aucie'), cardX + side + 140, cardY + 370, 3, RT_DIM);
        } else if (auth.state === 'error') {
            draw.text(tr('Logowanie niedostępne'), cardX + 80, cardY + 180, 4, RT_TEXT);
            draw.text(draw.fit(String(auth.msg || tr('dotknij, żeby spróbować ponownie')), 3, 1200), cardX + 80, cardY + 230, 3, RT_DIM);
            hits.push({ name: 'yt-login-retry', x: cardX + 80, y: cardY + 280, w: 360, h: 64 });
            draw.pill(cardX + 80, cardY + 280, 360, 64, RT_PINK);
            draw.text(tr('Spróbuj ponownie'), cardX + 110, cardY + 298, 4, PAGE);
        } else if (auth.state === 'unsupported') {
            draw.text(tr('Logowanie wymaga nowszej usługi w aucie'), cardX + 80, cardY + 200, 4, RT_TEXT);
        } else {
            draw.text(tr('Pobieram kod logowania') + '…', cardX + 80, cardY + 200, 4, RT_TEXT);
        }
    } else if (mode === 'player') {
        play = ride.playing || {};
        draw.text(draw.fit(String(play.title || 'YouTube'), 5, 1500), 120, 100, 5, RT_TEXT);
        draw.text(draw.fit(String(play.channel || ''), 3, 1200), 120, 156, 3, RT_DIM);
        hits.push({ name: 'yt-back10', x: 480, y: 300, w: 140, h: 80 });
        draw.pill(480, 300, 140, 80, RT_CARD);
        draw.text('-10', 510, 326, 4, RT_TEXT);
        hits.push({ name: 'yt-play', x: 660, y: 280, w: 180, h: 110 });
        draw.round(660, 280, 180, 110, 55, ACCENT);
        if (play.state === 'playing') {
            draw.round(728, 310, 16, 50, 4, PAGE);
            draw.round(756, 310, 16, 50, 4, PAGE);
        } else {
            draw.quad([[734, 308], [778, 335], [734, 362]], PAGE);
        }
        hits.push({ name: 'yt-fwd10', x: 880, y: 300, w: 140, h: 80 });
        draw.pill(880, 300, 140, 80, RT_CARD);
        draw.text('+10', 910, 326, 4, RT_TEXT);
        draw.round(160, 520, 1400, 8, 4, WELL);
        if (play.total > 0) {
            draw.round(160, 520, Math.max(8, Math.round(1400 * play.elapsed / play.total)), 8, 4, RT_PINK);
        }
        draw.text(play.state || '', 160, 560, 3, RT_DIM);
    } else {
        sections = ride.sections || [];
        ty = 88;
        n = 0;
        for (i = 0; i < sections.length && i < 2; i += 1) {
            sec = sections[i];
            draw.text(draw.fit(String(sec.title || ''), 4, 1400), 180, ty, 4, RT_TEXT);
            ty += 36;
            itemsRow = sec.items || [];
            for (col = 0; col < itemsRow.length && col < 4; col += 1) {
                tile = itemsRow[col];
                tx = 180 + col * 360;
                on = sel === 'yt-vid-' + n;
                draw.card(tx, ty, 340, 190, 20, on ? ROW_HI_A : ROW_A, on ? ROW_HI_B : ROW_B);
                if (on) {
                    draw.stroke(tx, ty, 340, 190, 20, 2.5, ACCENT);
                }
                draw.round(tx + 8, ty + 8, 324, 120, 14, WELL);
                draw.quad([[tx + 156, ty + 50], [tx + 190, ty + 68], [tx + 156, ty + 86]], LINE);
                label = String(tile.duration || '');
                if (label) {
                    draw.round(tx + 324 - draw.textWidth(label, 2) - 24, ty + 94, draw.textWidth(label, 2) + 16, 28, 8, 0x000000C8);
                    draw.text(label, tx + 324 - draw.textWidth(label, 2) - 16, ty + 100, 2, RT_TEXT);
                }
                draw.text(draw.fit(String(tile.title || ''), 3, 316), tx + 12, ty + 136, 3, RT_TEXT);
                draw.text(draw.fit(String(tile.hint || ''), 2, 316), tx + 12, ty + 164, 2, RT_DIM);
                hits.push({ name: 'yt-vid-' + n, x: tx, y: ty, w: 340, h: 190 });
                n += 1;
            }
            if (!itemsRow.length) {
                draw.text(tr(ride.status || 'Wczytuję…'), 180, ty + 20, 3, RT_DIM);
            }
            ty += 230;
        }
        if (!sections.length) {
            draw.text(tr(ride.status || 'Wczytuję…'), 200, 280, 4, RT_TEXT);
        }
    }
    return {
        frame: packFrame(draw),
        rects: draw.rects,
        layout: {
            hits: [],
            rideHits: hits,
            nav: null,
            bubbles: [],
            oy: 0,
            ox: 0,
            boxW: width,
            boxH: height,
            headerH: 56,
            first: 0,
            count: items.length
        }
    };
}

function drawPage(draw, lay) {
    // the page: a warm dark sheet, lighter at the top; its header band; the accent down the left edge
    draw.grad(lay.ox, lay.oy, lay.boxW, lay.boxH, PAGE_A, PAGE_B);
    draw.grad(lay.ox, lay.oy, lay.boxW, lay.headerH, HEAD_A, HEAD_B);
    draw.rect(lay.ox, lay.oy + lay.headerH - 1, lay.boxW, 1, LINE);
    draw.grad(lay.ox, lay.oy, 6, lay.boxH, ACCENT, ACCENT_DIM);
}

// One option row: icon in its well, title, hint, the tick of a chosen one.
function drawRow(draw, bubble, item, title, hint, focus) {
    var hot = !!item.armed;
    var x = bubble.x;
    var y = bubble.y;
    var w = bubble.w;
    var h = bubble.h;
    var r = bubble.home ? 26 : 18;
    var well;
    var wx;
    var wy;
    var side = draw.iconSize(bubble.iconPx);
    var textX;
    var labelY;
    var room;
    var tw;
    if (hot) {
        draw.card(x, y, w, h, r, RED_A, RED_B);
        draw.stroke(x, y, w, h, r, 3, RED);
    } else if (focus) {
        draw.round(x - 4, y - 4, w + 8, h + 8, r + 4, ACCENT_GLOW);
        draw.card(x, y, w, h, r, ROW_HI_A, ROW_HI_B);
        draw.stroke(x, y, w, h, r, 2.5, ACCENT);
    } else {
        draw.card(x, y, w, h, r, ROW_A, ROW_B);
    }
    if (bubble.home) {
        // a large tile (pages of two): the icon in a round well, the words centred under it
        well = 112;
        wx = x + Math.floor((w - well) / 2);
        wy = y + 40;
        draw.circle(wx + well / 2, wy + well / 2, well / 2, hot ? RED : (focus ? ACCENT : WELL));
        draw.icon(item.icon || 'play', wx + (well - side) / 2, wy + (well - side) / 2, bubble.iconPx, (hot || focus) ? PAGE : ICON_FG);
        title = draw.fit(title, bubble.scale, w - 48);
        tw = draw.textWidth(title, bubble.scale);
        draw.text(title, x + Math.floor((w - tw) / 2), y + 178, bubble.scale, (hot || focus) ? INK : SOFT);
        if (hint) {
            hint = draw.fit(hint, 3, w - 48);
            tw = draw.textWidth(hint, 3);
            draw.text(hint, x + Math.floor((w - tw) / 2), y + 236, 3, hot ? 0xFFB9B0FF : (focus ? ACCENT : MUTED));
        }
        if (item.on) {
            draw.circle(x + w - 36, y + 36, 15, ACCENT);
            checkMark(draw, x + w - 47, y + 25, 22, 3.5, PAGE);
        }
        return;
    }
    well = 60;
    wx = x + 16;
    wy = y + Math.floor((h - well) / 2);
    draw.round(wx, wy, well, well, 16, hot ? RED : (focus ? ACCENT : WELL));
    draw.icon(item.icon || 'play', wx + (well - side) / 2, wy + (well - side) / 2, bubble.iconPx, (hot || focus) ? PAGE : ICON_FG);
    textX = wx + well + 20;
    room = w - (textX - x) - (item.on ? 70 : 24);
    labelY = hint ? y + 15 : y + Math.floor((h - 28) / 2);
    draw.text(draw.fit(title, bubble.scale, room), textX, labelY, bubble.scale, (hot || focus) ? INK : SOFT);
    if (hint) {
        draw.text(draw.fit(hint, 3, room), textX, labelY + 40, 3, hot ? 0xFFB9B0FF : (focus ? ACCENT : MUTED));
    }
    if (item.on) {
        draw.circle(x + w - 38, y + h / 2, 15, ACCENT);
        checkMark(draw, x + w - 49, y + h / 2 - 11, 22, 3.5, PAGE);
    }
}

// The right half of the AirPlay page while AirPlay is on and no iPhone sends a picture yet: the
// code to type (until 0.1.134 only a small "PIN 1234" at the page's foot), or how to connect.
function drawAirGuide(draw, lay, air, items, detail) {
    var pin = parsePinDetail(detail);
    var name = '';
    var sound = false;
    var onPage = false;
    var i;
    var x;
    var y;
    var w = 600;
    var h;
    var top;
    var bottom;
    var label;
    var steps;
    if (!air || !air.on || air.online || air.bad || air.whereOpen || (air.mirrored && air.window)) {
        return;
    }
    if (!lay.bubbles.length || lay.bubbles[0].home) {
        return;
    }
    for (i = 0; i < items.length; i += 1) {
        if (items[i].name === 'air-name') {
            name = String(items[i].hint || '');
            onPage = true;
        }
        if (items[i].name === 'air-sound') {
            sound = /^włączone/.test(String(items[i].hint || ''));
        }
    }
    if (!onPage) {
        return;
    }
    x = lay.ox + lay.boxW - w - 60;
    if (x < lay.bubbles[0].x + lay.bubbles[0].w + 40) {
        return;
    }
    h = pin ? 300 : 322;
    top = lay.oy + lay.headerH + 12;
    bottom = lay.oy + lay.boxH - 96;
    y = top + Math.max(0, Math.floor((bottom - top - h) / 2));
    draw.card(x, y, w, h, 26, HEAD_A, HEAD_B);
    draw.stroke(x, y, w, h, 26, 1.5, pin ? ACCENT_DIM : LINE);
    if (pin) {
        label = tr('Kod AirPlay');
        draw.text(label, x + Math.floor((w - draw.textWidth(label, 4)) / 2), y + 30, 4, INK);
        draw.text(pin, x + Math.floor((w - draw.textWidth(pin, 12)) / 2), y + 96, 12, INK);
        label = tr('wpisz go na iPhonie');
        draw.text(label, x + Math.floor((w - draw.textWidth(label, 3)) / 2), y + 236, 3, ACCENT);
        return;
    }
    draw.text(tr('Połącz iPhone'), x + 36, y + 28, 4, INK);
    steps = [
        tr('otwórz Centrum sterowania'),
        tr(sound ? 'dotknij AirPlay przy odtwarzaczu' : 'wybierz Klonowanie ekranu'),
        tr('wybierz') + ' ' + (name || 'THEiPlay')
    ];
    for (i = 0; i < steps.length; i += 1) {
        draw.circle(x + 56, y + 116 + i * 58, 19, i === 2 ? ACCENT : WELL);
        label = String(i + 1);
        draw.text(label, x + 56 - Math.floor(draw.textWidth(label, 3, 'bold') / 2), y + 105 + i * 58, 3, i === 2 ? PAGE : SOFT, 'bold');
        draw.text(draw.fit(steps[i], 3, w - 130), x + 92, y + 105 + i * 58, 3, i === 2 ? INK : SOFT, i === 2 ? 'bold' : 'label');
    }
    draw.text(tr('iPhone i auto w jednej sieci Wi-Fi'), x + 36, y + h - 44, 2, MUTED);
}

// More rows than fit: a track beside the list, its thumb where the shown rows are.
function drawScroll(draw, lay) {
    var pin = lay.pinned || 0;
    var shown = lay.bubbles.length - pin;
    var total = lay.count - pin;
    var first;
    var last;
    var x;
    var top;
    var bottom;
    var len;
    var thumb;
    if (!lay.bubbles.length || lay.bubbles[0].home || shown < 1 || total <= shown) {
        return;
    }
    first = lay.bubbles[pin];
    last = lay.bubbles[lay.bubbles.length - 1];
    x = first.x + first.w + 14;
    top = first.y + 4;
    bottom = last.y + last.h - 4;
    len = bottom - top;
    thumb = Math.max(36, Math.round(len * shown / total));
    draw.round(x, top, 6, len, 3, WELL);
    draw.round(x, top + Math.round((len - thumb) * (lay.first - pin) / (total - shown)), 6, thumb, 3, ACCENT);
}

function buildFrame(items, selected, width, height, detail, heading, version, streamInfo, boxPreview, caption, crumb, air, ride) {
    if (ride && ride.on) {
        return drawRideFrame(items, selected, width, height, ride);
    }
    var draw = new FrameBuilder();
    var lay;
    var i;
    var bubble;
    var title;
    var hint;
    var itemIndex;
    var item;
    var armedNow;
    if (isStreamItems(items) || heading === 'Stream') {
        return buildStreamFrame(items, selected, width, height, detail, heading, version, streamInfo, caption, crumb, air);
    }
    var previewSpace = !!(boxPreview && ((boxPreview.frames && boxPreview.frames.length) || boxPreview.w || boxPreview.limitW));
    lay = menuLayout(items, selected, width, height, detail, heading, previewSpace);
    draw.clear(0);
    drawPage(draw, lay);
    if (crumb) {
        drawMenuHeader(draw, lay, crumb, crumb !== 'THEiPlay');
    } else if (lay.heading) {
        draw.text(lay.heading, lay.ox + 36, lay.oy + 22, 4, INK);
    } else {
        drawMenuHeader(draw, lay, 'THEiPlay', false);
    }
    if (!air) {
        drawVersionMark(draw, lay, version);
    }
    for (i = 0; i < lay.bubbles.length; i += 1) {
        bubble = lay.bubbles[i];
        itemIndex = bubble.index != null ? bubble.index : i;
        item = items[itemIndex];
        title = String(item.title || '');
        hint = item.hint ? String(item.hint) : '';
        if (item.name === 'lang-toggle') {
            title = uiLang === 'en' ? 'Language' : 'Język';
            hint = uiLang === 'en' ? 'English' : 'polski';
        } else {
            title = tr(title);
            hint = tr(hint);
        }
        drawRow(draw, bubble, item, title, hint, itemIndex === selected);
    }
    drawScroll(draw, lay);
    if (!previewSpace) {
        drawAirGuide(draw, lay, air, items, detail);
    }
    armedNow = !!(items[selected] && items[selected].armed);
    if (detail) {
        draw.text(draw.fit(tr(detail), 3, 620), lay.ox + 36, lay.oy + lay.boxH - 60, 3, INK);
    } else {
        draw.text(tr(armedNow ? 'pokrętło albo – i + zmienia, klik zapisuje' : 'pokrętło albo dotyk'), lay.ox + 36, lay.oy + lay.boxH - 60, 3, MUTED);
    }
    var framesOn = !!(boxPreview && boxPreview.frames && boxPreview.frames.length);
    drawNav(draw, lay, framesOn, true, armedNow);
    if (boxPreview && boxPreview.frames && boxPreview.frames.length) {
        drawScreenFrames(draw, lay, boxPreview, items[selected]);
    } else if (boxPreview && (heading === 'Okno' || heading === 'Pozycja' || heading === 'Środek' || heading === 'Zegary' || heading === 'HUD')) {
        drawBoxPreview(draw, lay, boxPreview, items[selected]);
    }
    if (caption && caption.on && caption.text) {
        draw.pixelText(String(caption.text).slice(0, 24), caption.x | 0, caption.y | 0, caption.scale || 4, caption.color || ACCENT);
    }
    applyAirOverlay(draw, lay, air, version);
    return {
        frame: packFrame(draw),
        rects: draw.rects,
        layout: lay
    };
}

function drawScreenFrames(draw, lay, preview, selectedItem) {
    var frames = preview.frames || [];
    var colW = 500;
    var gap = 14;
    var n = frames.length || 1;
    var y = lay.framesTop || (lay.oy + lay.headerH + 12);
    var budget = lay.oy + lay.boxH - y - 16;
    var slot = Math.floor((budget - gap * (n - 1)) / n);
    var x0 = lay.ox + lay.boxW - colW - 24;
    var i;
    var frame;
    var labelH = 26;
    var innerH;
    var scale;
    var stageW;
    var stageH;
    var sx;
    var sy;
    var wx;
    var wy;
    var ww;
    var wh;
    if (x0 < lay.ox + 520) {
        x0 = lay.ox + 520;
        colW = lay.ox + lay.boxW - x0 - 24;
    }
    for (i = 0; i < frames.length; i += 1) {
        frame = frames[i];
        innerH = slot - labelH - 8;
        if (innerH < 36) {
            innerH = 36;
        }
        scale = Math.min(colW / (frame.limitW || 1), innerH / (frame.limitH || 1));
        stageW = Math.max(48, Math.round((frame.limitW || 1) * scale));
        stageH = Math.max(28, Math.round((frame.limitH || 1) * scale));
        sx = x0 + Math.floor((colW - stageW) / 2);
        sy = y + labelH;
        wx = sx + Math.round((frame.x || 0) * scale);
        wy = sy + Math.round((frame.y || 0) * scale);
        ww = Math.max(8, Math.round((frame.w || 0) * scale));
        wh = Math.max(8, Math.round((frame.h || 0) * scale));
        if (ww > stageW) {
            ww = stageW;
        }
        if (wh > stageH) {
            wh = stageH;
        }
        if (wx < sx) {
            wx = sx;
        }
        if (wy < sy) {
            wy = sy;
        }
        if (wx + ww > sx + stageW) {
            wx = sx + stageW - ww;
        }
        if (wy + wh > sy + stageH) {
            wy = sy + stageH - wh;
        }
        // each screen to scale, the window where it will be shown on it
        draw.text(tr(String(frame.label || '')), sx, y - 2, 3, frame.focus ? ACCENT : MUTED);
        draw.round(sx, sy, stageW, stageH, 8, PAGE);
        draw.stroke(sx, sy, stageW, stageH, 8, frame.focus ? 2 : 1.5, frame.focus ? ACCENT : LINE);
        draw.round(wx, wy, ww, wh, 4, frame.focus ? ACCENT_DIM : CARD_HI);
        draw.stroke(wx, wy, ww, wh, 4, 2, frame.focus ? ACCENT : LINE);
        y += slot + gap;
    }
}

function drawBoxPreview(draw, lay, preview, selectedItem) {
    var limitW = preview.limitW || 1920;
    var limitH = preview.limitH || 720;
    var maxW = 520;
    var maxH = preview.sliders && preview.sliders.length ? 200 : 280;
    var scale = Math.min(maxW / limitW, maxH / limitH);
    var stageW = Math.max(80, Math.round(limitW * scale));
    var stageH = Math.max(48, Math.round(limitH * scale));
    var x = lay.ox + lay.boxW - stageW - 36;
    var y = lay.oy + lay.headerH + 24;
    var wx = x + Math.round((preview.x || 0) * scale);
    var wy = y + Math.round((preview.y || 0) * scale);
    var ww = Math.max(12, Math.round((preview.w || limitW) * scale));
    var wh = Math.max(12, Math.round((preview.h || limitH) * scale));
    var mode = preview.mode || '';
    var caption;
    var si;
    var row;
    var sy;
    var lab;
    var size;
    if (selectedItem && selectedItem.name === 'air-box-size') {
        mode = 'size';
    }
    if (selectedItem && (selectedItem.name === 'air-box-x' || selectedItem.name === 'air-box-y')) {
        mode = 'move';
    }
    if (ww > stageW) {
        ww = stageW;
    }
    if (wh > stageH) {
        wh = stageH;
    }
    if (wx + ww > x + stageW) {
        wx = x + stageW - ww;
    }
    if (wy + wh > y + stageH) {
        wy = y + stageH - wh;
    }
    // the screen to scale, the window where it will be shown on it
    draw.round(x, y, stageW, stageH, 10, PAGE);
    draw.stroke(x, y, stageW, stageH, 10, 1.5, LINE);
    draw.round(wx, wy, ww, wh, 5, ACCENT_DIM);
    draw.stroke(wx, wy, ww, wh, 5, 2, ACCENT);
    caption = tr(mode === 'move' ? 'pozycja' : (mode === 'size' ? 'wielkość' : 'podgląd'));
    if (preview.label) {
        caption = tr(String(preview.label)) + ' · ' + caption;
    }
    draw.text(caption, x, y + stageH + 16, 3, HINT);
    size = String(preview.w || 0) + ' × ' + String(preview.h || 0);
    draw.text(size, x + stageW - draw.textWidth(size, 3), y + stageH + 16, 3, MUTED);
    if (preview.sliders && preview.sliders.length) {
        sy = y + stageH + 62;
        for (si = 0; si < preview.sliders.length; si += 1) {
            row = preview.sliders[si];
            if (selectedItem && row.key) {
                row.on = selectedItem.name === row.key;
            }
            var hotSlider = !!(selectedItem && selectedItem.armed && row.key === selectedItem.name);
            lab = tr(String(row.label || ''));
            draw.text(lab, x, sy - 2, 3, hotSlider ? RED : (row.on ? ACCENT : MUTED));
            drawSlider(draw, x + 140, sy, Math.max(80, stageW - 232), row.value | 0, row.min | 0, row.max | 0, hotSlider);
            lab = String(row.value | 0);
            draw.text(lab, x + stageW - draw.textWidth(lab, 3), sy - 2, 3, INK);
            sy += 40;
        }
    }
}

// ---- Przeglądarka: a toolbar over the page picture. The picture is the video file
// g21-browserd's decoder writes (/dev/shm/mgu-video-g21browser), drawn by the renderer (op 19)
// exactly as large as the page area, so a touch at (x, y) below the toolbar is the page's pixel.
var WEB_BAR_H = 84;
var WEB_ZOOMS = [1, 1.25, 1.5, 1.75, 2];

function webLayout(width, height) {
    var y = 14;
    var h = 56;
    var right = width - 16;
    var lay = {
        exit: { name: 'web-exit', x: 16, y: y, w: 136, h: h },
        back: { name: 'web-back', x: 164, y: y, w: 64, h: h },
        fwd: { name: 'web-fwd', x: 236, y: y, w: 64, h: h },
        reload: { name: 'web-reload', x: 308, y: y, w: 64, h: h },
        home: { name: 'web-home', x: 380, y: y, w: 64, h: h },
        power: { name: 'app-exit', x: right - 64, y: y, w: 64, h: h },
        zoomIn: { name: 'web-zoom-in', x: right - 136, y: y, w: 64, h: h },
        zoomOut: { name: 'web-zoom-out', x: right - 208, y: y, w: 64, h: h },
        enter: { name: 'web-enter', x: right - 280, y: y, w: 64, h: h },
        keys: { name: 'web-keys', x: right - 352, y: y, w: 64, h: h }
    };
    lay.url = { name: 'web-url', x: 456, y: y, w: lay.keys.x - 12 - 456, h: h };
    lay.page = { x: 0, y: WEB_BAR_H, w: width & ~3, h: (height - WEB_BAR_H) & ~1 };
    return lay;
}

// what the page area says while there is no picture
function webStatus(web) {
    if (!web.connected) {
        return { title: 'Brak narzędzia Przeglądarka', hint: 'zainstaluj je w MGU Store', busy: false };
    }
    if (web.engine === 'failed') {
        return { title: web.err || 'silnik nie wystartował', hint: 'dotknij odśwież, aby spróbować ponownie', busy: false };
    }
    if (web.engine === 'downloading') {
        // once: the head unit fetches Google's engine itself (about 100 MB)
        return { title: 'Pobieram silnik przeglądarki', hint: (web.pct | 0) + '%  ·  ' + tr('jednorazowo, około 100 MB'), busy: true };
    }
    if (web.engine === 'unpacking') {
        return { title: 'Sprawdzam i rozpakowuję silnik', hint: (web.pct | 0) + '%', busy: true };
    }
    if (web.live && !web.video) {
        return { title: 'Brak obrazu strony', hint: 'renderer bez warstwy wideo', busy: false };
    }
    return { title: 'Uruchamiam przeglądarkę', hint: '', busy: true };
}

function webButton(draw, hits, box, on, fill) {
    draw.round(box.x, box.y, box.w, box.h, 18, fill || CARD_HI);
    if (on) {
        hits.push(box);
    }
    return { cx: box.x + box.w / 2, cy: box.y + box.h / 2 };
}

function webReloadGlyph(draw, cx, cy, ink) {
    var r = 12.75;
    var a = 330 * Math.PI / 180;
    var px = cx + Math.sin(a) * r;
    var py = cy - Math.cos(a) * r;
    var tx = Math.cos(a);
    var ty = Math.sin(a);
    var nx = Math.sin(a);
    var ny = -Math.cos(a);
    draw.arc(cx, cy, 11, 14.5, 50, 330, ink, true);
    draw.quad([[px + tx * 9, py + ty * 9], [px + nx * 6.5, py + ny * 6.5], [px - nx * 6.5, py - ny * 6.5]], ink);
}

function buildWebFrame(width, height, web) {
    var draw = new FrameBuilder();
    var lay = webLayout(width, height);
    var hits = [];
    var info = web || {};
    var showVideo = !!(info.live && info.video);
    var ready = !!(info.connected && info.engine === 'ready');
    var zoomAt = WEB_ZOOMS.indexOf(Number(info.zoom));
    var c;
    var ink;
    var st;
    var tw;
    var hw;
    var midY;
    var shown;
    var title;
    var titleW;
    var urlW;
    var secure;
    var i;
    draw.clear(0);
    if (showVideo) {
        draw.video(lay.page.x, lay.page.y, lay.page.w, lay.page.h, 1);
    } else {
        draw.grad(0, WEB_BAR_H, width, height - WEB_BAR_H, PAGE_A, PAGE_B);
        st = webStatus(info);
        midY = WEB_BAR_H + Math.floor((height - WEB_BAR_H) / 2);
        if (st.busy) {
            drawSpinner(draw, Math.floor(width / 2), midY - 70);
        }
        tw = draw.textWidth(tr(st.title), 5);
        draw.text(tr(st.title), Math.floor((width - tw) / 2), midY + (st.busy ? 16 : -40), 5, st.busy ? INK : SOFT);
        if (st.hint) {
            hw = draw.textWidth(tr(st.hint), 3);
            draw.text(tr(st.hint), Math.floor((width - hw) / 2), midY + (st.busy ? 76 : 20), 3, MUTED);
        }
    }

    // the toolbar
    draw.grad(0, 0, width, WEB_BAR_H, HEAD_A, HEAD_B);
    draw.rect(0, WEB_BAR_H - 3, width, 3, info.loading && ready ? ACCENT : LINE);

    c = webButton(draw, hits, lay.exit, true);
    chevron(draw, 'w', lay.exit.x + 26, c.cy, 8, 3, ACCENT);
    draw.text('Menu', lay.exit.x + 46, lay.exit.y + 18, 3, ACCENT);

    c = webButton(draw, hits, lay.back, ready && !!info.back);
    chevron(draw, 'w', c.cx, c.cy, 10, 3.5, ready && info.back ? INK : LINE);
    c = webButton(draw, hits, lay.fwd, ready && !!info.fwd);
    chevron(draw, 'e', c.cx, c.cy, 10, 3.5, ready && info.fwd ? INK : LINE);

    // reload; while a page loads the same button stops it
    c = webButton(draw, hits, lay.reload, !!info.connected);
    ink = info.connected ? INK : LINE;
    if (ready && info.loading) {
        draw.line(c.cx - 9, c.cy - 9, c.cx + 9, c.cy + 9, 3.5, ink);
        draw.line(c.cx + 9, c.cy - 9, c.cx - 9, c.cy + 9, 3.5, ink);
    } else {
        webReloadGlyph(draw, c.cx, c.cy, ink);
    }

    c = webButton(draw, hits, lay.home, ready);
    ink = ready ? INK : LINE;
    draw.quad([[c.cx, c.cy - 15], [c.cx + 16, c.cy - 1], [c.cx - 16, c.cy - 1]], ink);
    draw.round(c.cx - 10, c.cy - 2, 20, 15, 2, ink);
    draw.rect(c.cx - 3, c.cy + 4, 6, 9, CARD_HI);

    // the address: its text, or what to type
    draw.round(lay.url.x, lay.url.y, lay.url.w, lay.url.h, 18, WELL);
    if (ready) {
        hits.push(lay.url);
    }
    shown = String(info.url || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (shown) {
        secure = /^https:/i.test(String(info.url));
        draw.icon(secure ? 'lock' : 'unlock', lay.url.x + 16, lay.url.y + 12, 2, secure ? HINT : MUTED);
        title = String(info.title || '');
        titleW = 0;
        if (title && title !== info.url) {
            title = draw.fit(title, 3, Math.floor(lay.url.w * 0.36));
            titleW = draw.textWidth(title, 3);
            draw.text(title, lay.url.x + lay.url.w - 24 - titleW, lay.url.y + 18, 3, MUTED);
        }
        urlW = lay.url.w - 60 - 24 - (titleW ? titleW + 28 : 0);
        draw.text(draw.fit(shown, 3, urlW), lay.url.x + 60, lay.url.y + 18, 3, INK);
    } else {
        draw.text(tr(ready ? 'Wpisz adres albo szukaj' : 'Przeglądarka'), lay.url.x + 26, lay.url.y + 18, 3, MUTED);
    }

    // the app's keyboard for a field of the page; bright when the page has a text field in focus
    c = webButton(draw, hits, lay.keys, ready, ready && info.editable ? ACCENT : CARD_HI);
    ink = !ready ? LINE : (info.editable ? PAGE : INK);
    draw.stroke(c.cx - 18, c.cy - 12, 36, 24, 5, 2.5, ink);
    for (i = 0; i < 4; i += 1) {
        draw.rect(c.cx - 12 + i * 7, c.cy - 6, 3.5, 3.5, ink);
    }
    draw.rect(c.cx - 9, c.cy + 3, 18, 3.5, ink);

    c = webButton(draw, hits, lay.enter, ready);
    ink = ready ? INK : LINE;
    draw.line(c.cx + 11, c.cy - 10, c.cx + 11, c.cy + 4, 3, ink);
    draw.line(c.cx + 11, c.cy + 4, c.cx - 10, c.cy + 4, 3, ink);
    chevron(draw, 'w', c.cx - 7, c.cy + 4, 6, 3, ink);

    c = webButton(draw, hits, lay.zoomOut, ready && zoomAt > 0);
    ink = ready && zoomAt > 0 ? INK : LINE;
    draw.text('A', c.cx - 19, lay.zoomOut.y + 18, 3, ink);
    draw.line(c.cx + 5, c.cy, c.cx + 18, c.cy, 3, ink);
    c = webButton(draw, hits, lay.zoomIn, ready && zoomAt >= 0 && zoomAt < WEB_ZOOMS.length - 1);
    ink = ready && zoomAt >= 0 && zoomAt < WEB_ZOOMS.length - 1 ? INK : LINE;
    draw.text('A', c.cx - 19, lay.zoomIn.y + 18, 3, ink);
    draw.line(c.cx + 5, c.cy, c.cx + 18, c.cy, 3, ink);
    draw.line(c.cx + 11.5, c.cy - 6.5, c.cx + 11.5, c.cy + 6.5, 3, ink);

    // "Wyłącz aplikację", as on every other screen
    c = webButton(draw, hits, lay.power, true, RED_CARD);
    powerSign(draw, c.cx, c.cy + 1, 12, 3, INK);

    // what the daemon has to say over a page that shows (a bad address, a page that stopped)
    if (showVideo && info.err) {
        tw = draw.textWidth(tr(info.err), 3);
        draw.round(Math.floor((width - tw) / 2) - 28, height - 78, tw + 56, 52, 26, RED_CARD);
        draw.text(tr(info.err), Math.floor((width - tw) / 2), height - 78 + 16, 3, INK);
    }
    return {
        frame: packFrame(draw),
        rects: draw.rects,
        layout: { webHits: hits, webPage: lay.page, web: lay, video: showVideo }
    };
}

function encoderStep(previous, next) {
    if (previous === null || previous === undefined) {
        return 0;
    }
    var delta = (next - previous) | 0;
    if (delta > 32767) {
        delta -= 65536;
    }
    if (delta < -32767) {
        delta += 65536;
    }
    if (delta > 4) {
        return 4;
    }
    if (delta < -4) {
        return -4;
    }
    return delta;
}

function createMenuSurface(opts) {
    var note = opts.note || function () {};
    var choose = opts.choose || function () {};
    var screenName = 'root';
    var items = (opts.items || SCREENS.root).map(function (item) {
        return {
            name: item.name,
            title: item.title,
            hint: item.hint,
            icon: item.icon || 'play'
        };
    });
    var heading = '';
    var version = String((opts && opts.version) || '');
    var paths = opts.sockets || ['/run/mgu-renderd/renderd.sock', '/run/mgu-render/render.sock'];
    var selected = 0;
    var armed = '';
    var whereOpen = false;
    var ytOpen = false;
    // ytGo: the sheet was opened by THEiPlay's YouTube tile (openYtWhere): its button opens YouTube
    var ytGo = false;
    var ytCursor = 0;
    var ytState = null;
    var whereCursor = 0;
    var movePos = false;
    var shown = false;
    var front = false;
    var ready = false;
    var native = false;
    var touchOn = false;
    var sock = null;
    var incoming = Buffer.alloc(0);
    var screen = { w: 1920, h: 720 };
    var retry = null;
    var pulse = null;
    var which = 0;
    var lastOp = null;
    var lastPush = 0;
    var lastTilt = '';
    var boxPreview = null;
    var rideView = null;
    var webView = null;
    var webHits = [];
    var webPage = null;
    var webTouch = null;
    var webMoveAt = 0;
    var webKey = '';
    var rideHits = [];
    var caption = null;
    var lastFrame = null;
    var noted = false;
    var surfaced = false;
    var claimNoted = false;
    var detail = '';
    var streamInfo = null;
    var edit = null;
    var touchDown = null;
    var keyHits = [];
    var popupHits = [];
    var holdTimer = null;
    var dragWin = null;
    var dragTimer = null;
    var streamHits = [];
    var airState = null;
    var airBadge = null;
    var airHits = [];
    var airStrip = null;
    var airWindow = null;
    var airKey = '';
    var mirrorSent = false;
    var mirrorPath = '';
    var pulseBeat = 0;
    var frameHold = false;
    var frameQueued = false;
    var frameHoldTimer = null;
    var backBox = null;
    var backAction = '';
    var navBoxes = null;

    function isSocket(file) {
        // Windows named pipes (emu.js) are not fs sockets; still connectable via net.
        if (typeof file === 'string' && file.indexOf('\\\\.\\pipe\\') === 0) {
            return true;
        }
        try {
            return fs.statSync(file).isSocket();
        } catch (err) {
            return false;
        }
    }

    function write(buf) {
        if (!sock) {
            return;
        }
        try {
            sock.write(buf);
        } catch (err) {
            note('menu-write ' + (err && err.message));
        }
    }

    function clearFrameHold() {
        frameHold = false;
        frameQueued = false;
        if (frameHoldTimer) {
            clearTimeout(frameHoldTimer);
            frameHoldTimer = null;
        }
    }

    // One frame in flight, like the other apps: the renderer sends TICK when the
    // screen has drawn it (up to 60 fps). A second frame waits. Sending faster
    // than that drops the client and the picture goes.
    // Glyph atlases (the fonts): each is uploaded once per connection, before the first frame
    // whose text needs it (as rt_renderd.js does for the YouTube screen).
    var sentAtlases = {};
    function sendAtlases(ids) {
        var i;
        var f;
        var head;
        for (i = 0; ids && i < ids.length; i += 1) {
            if (sentAtlases[ids[i]]) {
                continue;
            }
            f = record.atlasById(ids[i]);
            if (!f || !f.alpha) {
                continue;
            }
            head = Buffer.alloc(12);
            head.writeUInt32LE(ids[i] >>> 0, 0);
            head.writeUInt32LE(f.atlasW, 4);
            head.writeUInt32LE(f.atlasH, 8);
            write(message(ATLAS, Buffer.concat([head, f.alpha])));
            sentAtlases[ids[i]] = true;
            note('menu-atlas ' + f.family + '@' + f.size);
        }
    }

    var sentFrame = null;
    function flushFrame(force) {
        if (!lastFrame || !sock || !shown) {
            return;
        }
        if (!force && !frameQueued && sentFrame && sentFrame.equals(lastFrame)) {
            return;
        }
        if (frameHold) {
            frameQueued = true;
            return;
        }
        frameQueued = false;
        frameHold = true;
        if (frameHoldTimer) {
            clearTimeout(frameHoldTimer);
        }
        frameHoldTimer = setTimeout(function () {
            frameHoldTimer = null;
            frameHold = false;
            if (frameQueued && shown && ready) {
                flushFrame(true);
            }
        }, 250);
        if (frameHoldTimer.unref) {
            frameHoldTimer.unref();
        }
        sendAtlases(lastFrame.atlases);
        sentFrame = lastFrame;
        write(lastFrame);
    }

    function releaseFrame() {
        frameHold = false;
        if (frameHoldTimer) {
            clearTimeout(frameHoldTimer);
            frameHoldTimer = null;
        }
        if (frameQueued && shown && ready) {
            flushFrame();
        }
    }

    function sendPlace() {
        var w = screen.w || 1920;
        var h = screen.h || 720;
        var b = Buffer.alloc(28);
        b.writeInt32LE(0, 0);
        b.writeInt32LE(0, 4);
        b.writeInt32LE(w, 8);
        b.writeInt32LE(h, 12);
        b.writeFloatLE(1, 16);
        b.writeFloatLE(0, 20);
        b.writeFloatLE(0, 24);
        write(message(PLACE, b));
    }

    function sendShow(on) {
        write(message(SHOW, u32(on ? 1 : 0)));
    }

    function sendGrab(on) {
        write(message(native ? X_GRAB : GRAB, u32(on ? 1 : 0)));
    }

    function sendMirror(on, path) {
        var file = path || MIRROR_FILE;
        var body;
        if (!native) {
            return;
        }
        if (on) {
            if (mirrorSent && mirrorPath === file) {
                return;
            }
            if (mirrorSent) {
                write(message(DROP_VIDEO, u32(1)));
                mirrorSent = false;
            }
            body = Buffer.alloc(4 + file.length + 1);
            body.writeUInt32LE(1, 0);
            body.write(file, 4);
            write(message(VIDEO, body));
            mirrorSent = true;
            mirrorPath = file;
            return;
        }
        if (mirrorSent) {
            write(message(DROP_VIDEO, u32(1)));
            mirrorSent = false;
            mirrorPath = '';
        }
    }

    // A new video file (the ring made one for a new size): name it to the renderer again.
    // paint() decides whether video shows on this screen; the old code asked only
    // streamInfo.video, so off the Stream screen a rebind left the centre black.
    function rebindVideo() {
        if (mirrorSent) {
            write(message(DROP_VIDEO, u32(1)));
            mirrorSent = false;
        }
        paint();
    }

    // AirPlay menu (car 2026-11-14): its 1 s status loop sets ~12 hints/titles/states, and each
    // used to build and send a whole menu frame, so the renderer redrew the layer over the video
    // several times a second and the device stuttered. Setters now paint once per turn of the event
    // loop, only when something changed, and an identical frame is not sent again (the 1 s pulse
    // still re-sends it).
    var paintPending = false;
    function paintSoon() {
        if (paintPending) {
            return;
        }
        paintPending = true;
        setImmediate(function () {
            paintPending = false;
            paint();
        });
    }

    function paint() {
        paintPending = false;
        if (!ready || !shown) {
            return;
        }
        if (!surfaced) {
            sendPlace();
            sendShow(true);
            sendGrab(true);
            sendClaim();
            surfaced = true;
        }
        if (webView && webView.on && !edit) {
            // Przeglądarka: its own frame; the video is the browser's file, not the mirror's
            var webInfo = {
                connected: webView.connected, engine: webView.engine, err: webView.err, url: webView.url, title: webView.title,
                loading: webView.loading, back: webView.back, fwd: webView.fwd, live: webView.live, zoom: webView.zoom,
                editable: webView.editable, pct: webView.pct, video: native
            };
            var webBuilt;
            sendMirror(!!(webView.live && native), webView.ring || WEB_FILE);
            webBuilt = buildWebFrame(screen.w || 1920, screen.h || 720, webInfo);
            webHits = webBuilt.layout.webHits;
            webPage = webBuilt.layout.webPage;
            keyHits = [];
            popupHits = [];
            backBox = null;
            backAction = '';
            navBoxes = null;
            streamHits = [];
            rideHits = [];
            airBadge = null;
            airHits = [];
            airStrip = null;
            airWindow = null;
            lastFrame = webBuilt.frame;
            flushFrame();
            if (!noted) {
                noted = true;
                note('menu-frame ' + webBuilt.rects);
            }
            return;
        }
        webHits = [];
        webPage = null;
        if (streamInfo && screenName === 'stream') {
            streamInfo.video = !!(streamInfo.mirrored && native && streamInfo.window);
        } else if (streamInfo) {
            streamInfo.video = false;
        }
        if ((screenName === 'youtube' || screenName === 'yt-browse') && ytState && ytState.live && ytState.central !== false && native) {
            sendMirror(true, youtubeFilePath);
        } else {
            sendMirror(!!((streamInfo && streamInfo.video) || (screenName !== 'stream' && airState && airState.mirrored && airState.window && native)));
        }
        var armI;
        for (armI = 0; armI < items.length; armI += 1) {
            items[armI].armed = !!(armed && items[armI].adjust && items[armI].name === armed);
        }
        if (ytState) {
            ytState.whereOpen = ytOpen;
            ytState.whereCursor = ytCursor;
            ytState.whereGo = ytGo;
        }
        if (airState) {
            airState.yt = screenName === 'youtube' ? ytState : null;
            airState.whereOpen = whereOpen;
            airState.whereCursor = whereCursor;
            airState.movePos = movePos;
            // full screen: the app's flag (no longer a saved 1920x720 window, which came back
            // after reopening the app as a black screen with no way out)
            airState.full = !!(airState.full && airState.mirrored && airState.window);
            if (airState.full) {
                movePos = false;
                airState.movePos = false;
            }
        }
        var place = edit ? placeName(edit.field, edit.title) : '';
        var crumb = crumbFor(screenName, heading, place);
        var airArg = airState || (screenName === 'youtube' && ytState ? { yt: ytState } : null);
        var built = edit
            ? buildKeyboardFrame(edit, screen.w || 1920, screen.h || 720, crumb, airArg, version)
            : buildFrame(items, selected, screen.w || 1920, screen.h || 720, detail, heading, version, streamInfo, boxPreview, caption, crumb, airArg, rideView);
        keyHits = (built.layout && built.layout.keys) || [];
        popupHits = (built.layout && built.layout.popup) || [];
        backBox = built.layout && built.layout.backHit ? built.layout.backHit : null;
        navBoxes = built.layout && built.layout.nav ? built.layout.nav : null;
        streamHits = (built.layout && built.layout.hits) || [];
        rideHits = (built.layout && built.layout.rideHits) || [];
        airBadge = built.layout && built.layout.airBadge ? built.layout.airBadge : null;
        airHits = (built.layout && built.layout.airHits) || [];
        airStrip = built.layout && built.layout.airStrip ? built.layout.airStrip : null;
        airWindow = built.layout && built.layout.airWindow ? built.layout.airWindow : null;
        if (!edit && (whereOpen || ytOpen)) {
            // "Gdzie pokazać" covers the page: the back pill, the arrows and "Wyłącz aplikację"
            // under it must not answer a tap (they did until 0.1.134: a tap beside the sheet at
            // the bottom right closed the whole app)
            navBoxes = null;
            backBox = null;
        }
        backAction = edit ? '' : findBack(items);
        lastFrame = built.frame;
        flushFrame();
        if (!noted) {
            noted = true;
            note('menu-frame ' + built.rects);
        }
    }

    function hideSurface() {
        sendShow(false);
        sendGrab(false);
    }

    function dropSurface(reason) {
        front = false;
        shown = false;
        note('menu-drop ' + (reason || 'leave'));
        stopNavRepeat();
        if (pulse) {
            clearInterval(pulse);
            pulse = null;
        }
        clearFrameHold();
        surfaced = false;
        if (retry) {
            clearTimeout(retry);
            retry = null;
        }
        hideSurface();
        ready = false;
        if (sock) {
            sock.destroy();
            sock = null;
        }
    }

    function showSurface(reason) {
        shown = true;
        front = true;
        note('menu-show ' + (reason || 'open'));
        armPulse();
        if (sock && ready) {
            paint();
            return;
        }
        if (!sock) {
            connect();
        }
    }

    function sendClaim() {
        // mgu-render: CLAIM = u32 n + n*(f32 x,y,w,h). Without a claim, TOUCH
        // never reaches the app. Do not gate on X_STATE "front" — on this G21
        // it goes false right after READY and used to block claims forever.
        if (!ready || !shown) {
            return;
        }
        var w = screen.w || 1920;
        var h = screen.h || 720;
        var b = Buffer.alloc(36);
        b.writeUInt32LE(2, 0);
        b.writeFloatLE(0, 4);
        b.writeFloatLE(0, 8);
        b.writeFloatLE(w, 12);
        b.writeFloatLE(h, 16);
        b.writeFloatLE(CONTENT.x, 20);
        b.writeFloatLE(CONTENT.y, 24);
        b.writeFloatLE(CONTENT.w, 28);
        b.writeFloatLE(CONTENT.h, 32);
        write(message(CLAIM, b));
        if (!claimNoted) {
            claimNoted = true;
            note('menu-claim ' + w + 'x' + h);
        }
    }

    function pointIn(box, x, y) {
        var pts;
        var pi;
        var p;
        if (!box) {
            return false;
        }
        pts = [
            { x: x, y: y }
        ];
        for (pi = 0; pi < pts.length; pi += 1) {
            p = pts[pi];
            if (p.x >= box.x && p.x < box.x + box.w && p.y >= box.y && p.y < box.y + box.h) {
                return true;
            }
        }
        return false;
    }

    function hitsBack(x, y) {
        return pointIn(backBox, x, y);
    }

    function hitsNav(x, y) {
        if (!navBoxes) {
            return '';
        }
        if (pointIn(navBoxes.ok, x, y)) {
            return 'ok';
        }
        if (pointIn(navBoxes.left, x, y)) {
            return 'left';
        }
        if (pointIn(navBoxes.right, x, y)) {
            return 'right';
        }
        return '';
    }

    // An armed slider (Poziomo, Pionowo, Rozciągnięcie, Wielkość): the two buttons change its value
    // as the knob does. Until 0.1.134 they left the slider, so a finger alone could not set it.
    function navAdjusts() {
        var it = items[selected];
        return !!(!edit && armed && it && it.adjust && it.name === armed && typeof opts.adjust === 'function');
    }

    var navRepeat = null;
    var navRepeatFired = false;
    var navRepeatLeft = 0;
    function stopNavRepeat() {
        if (navRepeat) {
            clearTimeout(navRepeat);
            navRepeat = null;
        }
    }

    // held: after 0.4 s a step every 70 ms, for at most 20 s (a lost "finger up" must not run on)
    function startNavRepeat(which) {
        stopNavRepeat();
        navRepeatFired = false;
        if ((which !== 'left' && which !== 'right') || !navAdjusts()) {
            return;
        }
        navRepeatLeft = 280;
        var tick = function () {
            navRepeat = null;
            if (!shown || !navAdjusts() || navRepeatLeft <= 0) {
                return;
            }
            navRepeatLeft -= 1;
            navRepeatFired = true;
            opts.adjust(armed, which === 'left' ? -1 : 1);
            paintSoon();
            navRepeat = setTimeout(tick, 70);
        };
        navRepeat = setTimeout(tick, 400);
    }

    function useNav(which) {
        if ((which === 'left' || which === 'right') && navAdjusts()) {
            opts.adjust(armed, which === 'left' ? -1 : 1);
            paintSoon();
            return;
        }
        if (which === 'left') {
            if (edit) {
                knobKeyboard.moveKey(edit, -1);
                paint();
            } else {
                move(-1);
            }
            return;
        }
        if (which === 'right') {
            if (edit) {
                knobKeyboard.moveKey(edit, 1);
                paint();
            } else {
                move(1);
            }
            return;
        }
        if (edit) {
            applyEditResult(knobKeyboard.applyKey(edit));
            return;
        }
        if (navBoxes && navBoxes.ok && navBoxes.ok.exit) {
            note('menu-exit');
            choose('app-exit');
            return;
        }
        press();
    }

    function hitRow(x, y) {
        var previewSpace = !!(boxPreview && ((boxPreview.frames && boxPreview.frames.length) || boxPreview.w || boxPreview.limitW));
        var lay = menuLayout(items, selected, screen.w || 1920, screen.h || 720, detail, heading, previewSpace);
        var i;
        var bubble;
        var pts = [
            { x: x, y: y }
        ];
        var p;
        var pi;
        var best = -1;
        var bestDist = 1e9;
        var cx;
        var cy;
        var dx;
        var dy;
        var dist;
        var bestBox = -1;
        var bestHit = 1e9;
        for (pi = 0; pi < pts.length; pi += 1) {
            p = pts[pi];
            for (i = 0; i < lay.bubbles.length; i += 1) {
                bubble = lay.bubbles[i];
                var hx = bubble.hitX != null ? bubble.hitX : bubble.x;
                var hy = bubble.hitY != null ? bubble.hitY : bubble.y;
                var hw = bubble.hitW != null ? bubble.hitW : bubble.w;
                var hh = bubble.hitH != null ? bubble.hitH : bubble.h;
                cx = hx + hw / 2;
                cy = hy + hh / 2;
                dx = p.x - cx;
                dy = p.y - cy;
                dist = dx * dx + dy * dy;
                if (p.x >= hx && p.x < hx + hw && p.y >= hy && p.y < hy + hh && dist < bestHit) {
                    bestHit = dist;
                    bestBox = i;
                }
                if (dist < bestDist) {
                    bestDist = dist;
                    best = i;
                }
            }
        }
        if (bestBox >= 0) {
            return lay.bubbles[bestBox].index != null ? lay.bubbles[bestBox].index : bestBox;
        }
        // Finger often lands in the gap; accept the nearest tile within ~120 px.
        if (best >= 0 && bestDist <= 120 * 120) {
            return lay.bubbles[best].index != null ? lay.bubbles[best].index : best;
        }
        return -1;
    }

    function activateHit(hit, why) {
        if (hit < 0 || hit >= items.length) {
            return false;
        }
        selected = hit;
        note('menu-hit ' + why + ' ' + items[hit].name);
        paint();
        press();
        return true;
    }

    function cloneScreen(name) {
        var source = SCREENS[name] || SCREENS.root;
        return source.map(function (item) {
            return {
                name: item.name,
                title: item.title,
                hint: item.hint,
                icon: item.icon || 'play',
                adjust: !!item.adjust,
                on: !!item.on
            };
        });
    }

    function setScreen(name) {
        var next = String(name || 'root');
        if (!SCREENS[next]) {
            next = 'root';
        }
        screenName = next;
        items = cloneScreen(next);
        selected = 0;
        armed = '';
        clearHold();
        edit = null;
        if (next === 'airplay') {
            heading = 'THEiPlay';
        } else if (next === 'air-out') {
            heading = 'Gdzie pokazać';
        } else if (next === 'air-box') {
            heading = 'Okno';
            if (!boxPreview) {
                boxPreview = defaultWindowPreview();
            }
        } else if (next === 'pos-out' || next === 'pos-each' || next === 'pos-box') {
            heading = 'Pozycja';
        } else if (next === 'label') {
            heading = 'Napis';
        } else if (next === 'quality' || next === 'quality-central' || next === 'quality-kombi') {
            heading = 'Jakość obrazu';
        } else if (next === 'stream') {
            heading = 'Stream';
            streamInfo = null;
        } else {
            heading = 'THEiPlay';
        }
        detail = '';
        noted = false;
        paint();
        return screenName;
    }

    function setItemHint(name, text, quiet) {
        var i;
        for (i = 0; i < items.length; i += 1) {
            if (items[i].name === name) {
                if (items[i].hint === String(text || '')) {
                    return true;
                }
                items[i].hint = String(text || '');
                if (!edit && !quiet) {
                    paintSoon();
                }
                return true;
            }
        }
        return false;
    }

    function setItemTitle(name, text, quiet) {
        var i;
        for (i = 0; i < items.length; i += 1) {
            if (items[i].name === name) {
                if (items[i].title === String(text || '')) {
                    return true;
                }
                items[i].title = String(text || '');
                if (!edit && !quiet) {
                    paintSoon();
                }
                return true;
            }
        }
        return false;
    }

    function setItemIcon(name, icon) {
        var i;
        for (i = 0; i < items.length; i += 1) {
            if (items[i].name === name) {
                if (items[i].icon === String(icon || 'play')) {
                    return true;
                }
                items[i].icon = String(icon || 'play');
                if (!edit) {
                    paintSoon();
                }
                return true;
            }
        }
        return false;
    }

    function move(delta) {
        if (!delta) {
            return;
        }
        if (edit) {
            knobKeyboard.moveKey(edit, delta > 0 ? 1 : -1);
            paint();
            return;
        }
        selected = (selected + delta) % items.length;
        if (selected < 0) {
            selected += items.length;
        }
        armed = '';
        paint();
    }

    function finishEdit(result) {
        var done = edit && edit.onDone;
        var cancel = edit && edit.onCancel;
        var field = edit && edit.field;
        var value = result && result.value;
        clearHold();
        edit = null;
        paint();
        if (result && result.action === 'done' && typeof done === 'function') {
            done(value, field);
            return;
        }
        if (typeof cancel === 'function') {
            cancel(field);
        }
    }

    function press() {
        var item;
        var result;
        if (edit) {
            result = knobKeyboard.applyKey(edit);
            if (result.action === 'done' || result.action === 'cancel') {
                finishEdit(result);
                return;
            }
            paint();
            return;
        }
        if (streamInfo && streamInfo.tune) {
            if (streamInfo.tune.tool) {
                choose('stream-save');
            }
            return;
        }
        item = items[selected];
        if (item && (item.name === 'yt-where')) {
            ytOpen = !ytOpen;
            ytCursor = 0;
            paint();
            return;
        }
        if (item && item.name === 'lang-toggle') {
            uiLang = uiLang === 'en' ? 'pl' : 'en';
            paint();
            choose('lang-toggle');
            return;
        }
        if (item && item.adjust) {
            armed = armed === item.name ? '' : item.name;
            paint();
            return;
        }
        armed = '';
        if (item) {
            choose(item.name);
        }
    }

    function tiltName(df) {
        if (df === 1) {
            return 'n';
        }
        if (df === 4) {
            return 'e';
        }
        if (df === 7) {
            return 's';
        }
        if (df === 10) {
            return 'w';
        }
        return '';
    }

    function nudgeCentral(dx, dy) {
        var win;
        var maxX;
        var maxY;
        if (!airState || !airState.window || airState.full) {
            return;
        }
        win = airState.window;
        maxX = (screen.w || 1920) - win.w;
        maxY = (screen.h || 720) - win.h;
        if (maxX < 0) {
            maxX = 0;
        }
        if (maxY < 0) {
            maxY = 0;
        }
        win.x += dx;
        win.y += dy;
        if (win.x < 0) {
            win.x = 0;
        }
        if (win.y < 0) {
            win.y = 0;
        }
        if (win.x > maxX) {
            win.x = maxX;
        }
        if (win.y > maxY) {
            win.y = maxY;
        }
        win.x = win.x | 0;
        win.y = win.y | 0;
        if (typeof opts.onWindowMove === 'function') {
            opts.onWindowMove(win.x, win.y, true);
        }
        paint();
    }

    function onControl(operation, push, df) {
        var step = encoderStep(lastOp, operation);
        var item = items[selected];
        var adjusted = false;
        var tilt = tiltName(df | 0);
        var tilted = tilt && tilt !== lastTilt;
        lastOp = operation;
        lastTilt = tilt;
        if (webView && webView.on && !edit) {
            // Przeglądarka: the knob scrolls the page, left / right is back / forward, a press opens the address
            if (step && typeof opts.onWebScroll === 'function') {
                opts.onWebScroll(0, step * 96);
            } else if (tilted && (tilt === 'n' || tilt === 's') && typeof opts.onWebScroll === 'function') {
                opts.onWebScroll(0, tilt === 's' ? 300 : -300);
            } else if (tilted && tilt === 'w') {
                choose('web-back');
            } else if (tilted && tilt === 'e') {
                choose('web-fwd');
            }
            if (push === 1 && lastPush !== 1) {
                choose('web-url');
            }
            lastPush = push;
            return;
        }
        if (airState && airState.full && !edit) {
            // full screen: the knob shows the way out; pressed while shown, it leaves
            if (push === 1 && lastPush !== 1) {
                choose(airState.fullUi ? 'air-full' : 'air-full-tap');
            } else if (step || tilted) {
                choose('air-full-tap');
            }
            lastPush = push;
            return;
        }
        if (movePos && !edit && airState && airState.window && !airState.full) {
            if (step) {
                nudgeCentral(step * 48, 0);
            } else if (tilted && (tilt === 'n' || tilt === 's')) {
                nudgeCentral(0, tilt === 's' ? 48 : -48);
            }
            if (push === 1 && lastPush !== 1) {
                movePos = false;
                paint();
            }
            lastPush = push;
            return;
        }
        if (ytOpen && !edit) {
            if (tilted) {
                step = tilt === 'e' ? 1 : (tilt === 'w' ? -1 : 0);
                if (tilt === 's') {
                    ytCursor = 3;
                } else if (tilt === 'n' && ytCursor === 3) {
                    ytCursor = 1;
                }
            }
            if (step) {
                ytCursor += step > 0 ? 1 : -1;
                if (ytCursor < 0) {
                    ytCursor = 3;
                }
                if (ytCursor > 3) {
                    ytCursor = 0;
                }
            }
            if (push === 1 && lastPush !== 1) {
                if (ytCursor >= 3) {
                    ytOpen = false;
                    if (ytGo) {
                        ytGo = false;
                        choose('yt-where-go');
                    }
                } else if (ytCursor === 0) {
                    choose('yt-pick-cluster');
                } else if (ytCursor === 1) {
                    choose('yt-pick-hud');
                } else {
                    choose('yt-pick-central');
                }
            }
            lastPush = push;
            if (step || push === 1 || tilted) {
                paint();
            }
            return;
        }
        if (whereOpen && !edit) {
            if (tilted) {
                step = tilt === 'e' ? 1 : (tilt === 'w' ? -1 : 0);
                if (tilt === 's') {
                    whereCursor = 3;
                } else if (tilt === 'n' && whereCursor === 3) {
                    whereCursor = 1;
                }
            }
            if (step) {
                whereCursor += step > 0 ? 1 : -1;
                if (whereCursor < 0) {
                    whereCursor = 3;
                }
                if (whereCursor > 3) {
                    whereCursor = 0;
                }
            }
            if (push === 1 && lastPush !== 1) {
                if (whereCursor >= 3) {
                    whereOpen = false;
                } else if (whereCursor === 0) {
                    choose('air-pick-cluster');
                } else if (whereCursor === 1) {
                    choose('air-pick-hud');
                } else {
                    choose('air-pick-central');
                }
            }
            lastPush = push;
            if (step || push === 1 || tilted) {
                paint();
            }
            return;
        }
        if (tilted && edit) {
            // keyboard: tilt up / down = the key above / below, left / right = the key beside
            knobKeyboard.moveKeyDir(edit, tilt);
            paint();
        }
        if (tilted && !edit) {
            if (armed && (tilt === 'n' || tilt === 's')) {
                armed = '';
            }
            adjusted = typeof opts.onTilt === 'function' && !!opts.onTilt(tilt);
            if (!adjusted && (tilt === 'n' || tilt === 's') && !(streamInfo && streamInfo.tune && streamInfo.tune.tool)) {
                move(tilt === 's' ? 1 : -1);
            }
        }
        if (step && !edit && streamInfo && streamInfo.tune && streamInfo.tune.tool) {
            if (typeof opts.adjust === 'function') {
                opts.adjust('stream-tune', step);
            }
            adjusted = true;
        }
        if (step && !edit && !adjusted && armed && item && item.adjust && item.name === armed && typeof opts.adjust === 'function') {
            adjusted = !!opts.adjust(item.name, step);
        }
        if (step && !adjusted) {
            armed = '';
            move(step > 0 ? 1 : -1);
        }
        if (push === 1 && lastPush !== 1) {
            press();
        }
        lastPush = push;
    }

    function startEdit(opts) {
        edit = knobKeyboard.createEdit(opts || {});
        noted = false;
        paint();
        return true;
    }

    function cancelEdit() {
        if (!edit) {
            return false;
        }
        finishEdit({ action: 'cancel' });
        return true;
    }

    function clearHold() {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    }

    function hitList(x, y, boxes) {
        var pts = [
            { x: x, y: y },
            { x: x + CONTENT.x, y: y + CONTENT.y },
            { x: x - CONTENT.x, y: y - CONTENT.y }
        ];
        var pi;
        var i;
        var box;
        var p;
        if (!boxes) {
            return null;
        }
        for (pi = 0; pi < pts.length; pi += 1) {
            p = pts[pi];
            for (i = 0; i < boxes.length; i += 1) {
                box = boxes[i];
                if (p.x >= box.x && p.x < box.x + box.w && p.y >= box.y && p.y < box.y + box.h) {
                    return box;
                }
            }
        }
        return null;
    }

    function applyEditResult(result) {
        if (!result) {
            return;
        }
        if (result.action === 'done' || result.action === 'cancel') {
            finishEdit(result);
            return;
        }
        paint();
    }

    function onEditTouch(phase, tx, ty) {
        var box;
        var pop;
        var pick;
        var ch;
        var idx;
        if (!edit) {
            return;
        }
        if (phase === 1) {
            box = hitList(tx, ty, keyHits);
            clearHold();
            edit.popup = null;
            if (!box) {
                touchDown = null;
                paint();
                return;
            }
            edit.keyIndex = box.index;
            touchDown = { x: tx, y: ty, key: box.index, t: Date.now(), held: false };
            paint();
            holdTimer = setTimeout(function () {
                var alts;
                holdTimer = null;
                if (!edit || !touchDown || touchDown.key !== box.index) {
                    return;
                }
                alts = knobKeyboard.altsFor(edit.keys[box.index]);
                if (!alts.length) {
                    return;
                }
                touchDown.held = true;
                touchDown.alt = alts[0];
                edit.popup = { keyIndex: box.index, alts: alts, pick: 0 };
                paint();
            }, 260);
            return;
        }
        if (phase === 2 && edit.popup && touchDown) {
            pop = hitList(tx, ty, popupHits);
            if (pop && pop.pick !== edit.popup.pick) {
                edit.popup.pick = pop.pick;
                touchDown.alt = edit.popup.alts[pop.pick];
                paint();
            }
            return;
        }
        if (phase === 3) {
            var held = !!(touchDown && (touchDown.held || (Date.now() - touchDown.t) >= 260));
            clearHold();
            if (held && touchDown) {
                pop = edit.popup ? hitList(tx, ty, popupHits) : null;
                if (pop && edit.popup) {
                    ch = edit.popup.alts[pop.pick];
                } else if (touchDown.alt) {
                    ch = touchDown.alt;
                } else if (edit.popup && edit.popup.alts && edit.popup.alts.length) {
                    ch = edit.popup.alts[edit.popup.pick] || edit.popup.alts[0];
                }
                idx = touchDown.key;
                edit.popup = null;
                touchDown = null;
                if (ch) {
                    edit.keyIndex = idx;
                    applyEditResult(knobKeyboard.applyKey(edit, ch));
                    return;
                }
            }
            if (touchDown && touchDown.key >= 0) {
                idx = touchDown.key;
                box = hitList(tx, ty, keyHits);
                if (box) {
                    idx = box.index;
                }
                touchDown = null;
                edit.keyIndex = idx;
                applyEditResult(knobKeyboard.applyKey(edit));
                return;
            }
            touchDown = null;
        }
    }

    function onWindowDrag(phase, tx, ty) {
        var win;
        var moved;
        var maxX;
        var maxY;
        if (screenName === 'stream' && streamInfo && streamInfo.window) {
            win = streamInfo.window;
        } else if (airState && airState.mirrored && airState.window) {
            win = airState.window;
        } else {
            return false;
        }
        if (airState && airState.full) {
            return false;
        }
        if (phase === 1) {
            if (tx >= win.x && tx < win.x + win.w && ty >= win.y && ty < win.y + win.h) {
                dragWin = { x: tx, y: ty, ox: win.x, oy: win.y };
                return true;
            }
            return false;
        }
        if (!dragWin) {
            return false;
        }
        moved = {
            x: dragWin.ox + (tx - dragWin.x),
            y: dragWin.oy + (ty - dragWin.y)
        };
        maxX = (screen.w || 1920) - win.w;
        maxY = (screen.h || 720) - win.h;
        if (moved.x < 0) {
            moved.x = 0;
        }
        if (moved.y < 0) {
            moved.y = 0;
        }
        if (maxX < 0) {
            maxX = 0;
        }
        if (maxY < 0) {
            maxY = 0;
        }
        if (moved.x > maxX) {
            moved.x = maxX;
        }
        if (moved.y > maxY) {
            moved.y = maxY;
        }
        win.x = moved.x | 0;
        win.y = moved.y | 0;
        if (airState && airState.tune && airState.tune.name === 'central' && win === airState.window) {
            airState.tune.x = win.x;
            airState.tune.y = win.y;
            if (airState.tune.shown) {
                airState.tune.shown.x = win.x;
                airState.tune.shown.y = win.y;
            }
        }
        if (typeof opts.onWindowMove === 'function') {
            opts.onWindowMove(win.x, win.y, phase === 3);
        }
        if (phase === 3) {
            dragWin = null;
            if (dragTimer) {
                clearTimeout(dragTimer);
                dragTimer = null;
            }
            paint();
            return true;
        }
        if (!dragTimer) {
            pumpDrag();
        }
        return true;
    }

    function pumpDrag() {
        dragTimer = null;
        if (!dragWin) {
            return;
        }
        paint();
        dragTimer = setTimeout(pumpDrag, 50);
    }

    // Przeglądarka: the toolbar's buttons answer a tap that ends on them; everything below goes to
    // the page as it is (down, moves, up), in the page area's own pixels.
    function onWebTouch(phase, tx, ty) {
        var hit = '';
        var i;
        var px;
        var py;
        if (phase === 1) {
            for (i = webHits.length - 1; i >= 0; i -= 1) {
                if (pointIn(webHits[i], tx, ty)) {
                    hit = webHits[i].name;
                    break;
                }
            }
            if (hit) {
                webTouch = { hit: hit };
            } else if (webPage && pointIn(webPage, tx, ty) && webView.live) {
                webTouch = { page: true };
                webMoveAt = Date.now();
                if (typeof opts.onWebTouch === 'function') {
                    opts.onWebTouch(1, tx - webPage.x, ty - webPage.y);
                }
            } else {
                webTouch = null;
            }
            return;
        }
        if (!webTouch) {
            return;
        }
        if (webTouch.page) {
            if (!webPage) {
                webTouch = null;
                return;
            }
            if (phase === 2) {
                if (Date.now() - webMoveAt < 14) {
                    return;
                }
                webMoveAt = Date.now();
            }
            px = Math.max(0, Math.min(webPage.w - 1, tx - webPage.x));
            py = Math.max(0, Math.min(webPage.h - 1, ty - webPage.y));
            if (typeof opts.onWebTouch === 'function') {
                opts.onWebTouch(phase === 2 ? 2 : 3, px, py);
            }
            if (phase !== 2) {
                webTouch = null;
            }
            return;
        }
        if (phase !== 2) {
            hit = webTouch.hit;
            webTouch = null;
            for (i = webHits.length - 1; i >= 0; i -= 1) {
                if (webHits[i].name === hit && pointIn(webHits[i], tx, ty)) {
                    choose(hit);
                    return;
                }
            }
        }
    }

    function hitStream(x, y) {
        var i;
        var box;
        if (!streamHits) {
            return '';
        }
        for (i = streamHits.length - 1; i >= 0; i -= 1) {
            box = streamHits[i];
            if (pointIn(box, x, y)) {
                return box.name;
            }
        }
        return '';
    }

    function hitAir(x, y) {
        var i;
        var box;
        if (!airHits) {
            return '';
        }
        for (i = airHits.length - 1; i >= 0; i -= 1) {
            box = airHits[i];
            if (pointIn(box, x, y)) {
                return box.name;
            }
        }
        return '';
    }

    function take(buf) {
        incoming = incoming.length ? Buffer.concat([incoming, buf]) : buf;
        while (incoming.length >= 8) {
            var type = incoming.readUInt32LE(0);
            var len = incoming.readUInt32LE(4);
            if (incoming.length < 8 + len) {
                return;
            }
            var body = incoming.slice(8, 8 + len);
            incoming = incoming.slice(8 + len);
            if (type === X_READY) {
                native = true;
                if (body.length >= 12) {
                    touchOn = !!(body.readUInt32LE(8) & 1);
                }
                write(message(X_MODE, u32(X_MODE_LAYER)));
            } else if (type === TICK) {
                releaseFrame();
            } else if (type === READY) {
                ready = true;
                if (body.length >= 12) {
                    screen = { w: body.readUInt32LE(4), h: body.readUInt32LE(8) };
                }
                if (!native && body.length >= 16) {
                    touchOn = body.readUInt32LE(12) !== 0;
                }
                note('menu-ready ' + screen.w + 'x' + screen.h + (native ? ' native' : ''));
                paint();
            } else if (type === X_STATE && body.length >= 8) {
                // Byte 4 is on-screen. Logging every repeat looked like a leak;
                // the renderer also hides the layer when this flips.
                var onScreen = body.readUInt32LE(4) !== 0;
                if (onScreen !== front) {
                    front = onScreen;
                    note(front ? 'menu-front' : 'menu-away');
                }
            } else if (type === CLOSED) {
                note('menu-closed');
            } else if (type === TOUCH && body.length >= 12 && shown) {
                var phase = body.readUInt32LE(0);
                var tx = body.readFloatLE(4);
                var ty = body.readFloatLE(8);
                var hit;
                if (webView && webView.on && !edit) {
                    onWebTouch(phase, tx, ty);
                    return;
                }
                if (airState && airState.full && !edit) {
                    // full screen: a tap shows "Wyjdź z trybu pełnoekranowego"; on it, it leaves
                    if (phase === 3) {
                        choose(airState.fullUi && pointIn(FULL_EXIT, tx, ty) ? 'air-full' : 'air-full-tap');
                    }
                    touchDown = null;
                    return;
                }
                if ((screenName === 'yt-login' || screenName === 'yt-browse') && rideHits && rideHits.length) {
                    var rideName = '';
                    var rideI;
                    for (rideI = rideHits.length - 1; rideI >= 0; rideI -= 1) {
                        if (pointIn(rideHits[rideI], tx, ty)) {
                            rideName = rideHits[rideI].name;
                            break;
                        }
                    }
                    if (rideName) {
                        if (phase === 1) {
                            touchDown = { ride: rideName, x: tx, y: ty, hit: -1, origin: selected, t: Date.now(), dragged: false };
                        } else if (phase === 3 && touchDown && touchDown.ride === rideName) {
                            choose(rideName);
                            touchDown = null;
                        } else if (phase === 3) {
                            touchDown = null;
                        }
                        return;
                    }
                }
                if (phase === 3) {
                    stopNavRepeat();
                }
                if (hitsNav(tx, ty)) {
                    if (phase === 1) {
                        touchDown = { nav: hitsNav(tx, ty), x: tx, y: ty, hit: -1, origin: selected, t: Date.now(), dragged: false };
                        startNavRepeat(touchDown.nav);
                    } else if (phase === 3 && touchDown && touchDown.nav && hitsNav(tx, ty) === touchDown.nav) {
                        if (!navRepeatFired) {
                            useNav(touchDown.nav);      // (a held button has done its steps already)
                        }
                        touchDown = null;
                    } else if (phase === 3) {
                        touchDown = null;
                    }
                    return;
                }
                if (touchDown && touchDown.nav) {
                    stopNavRepeat();        // the finger slid off the button
                }
                if (hitsBack(tx, ty)) {
                    if (phase === 3) {
                        if (edit) {
                            cancelEdit();
                        } else if (backAction) {
                            choose(backAction);
                        }
                    }
                    touchDown = null;
                    return;
                }
                note('menu-touch ' + phase + ' ' + Math.round(tx) + ',' + Math.round(ty));
                if (hitAir(tx, ty) || (airStrip && pointIn(airStrip, tx, ty)) || (airBadge && pointIn(airBadge, tx, ty))) {
                    if (phase === 1 && hitAir(tx, ty)) {
                        touchDown = { stream: hitAir(tx, ty), x: tx, y: ty, hit: -1, origin: selected, t: Date.now(), dragged: false };
                    } else if (phase === 3 && touchDown && touchDown.stream && hitAir(tx, ty) === touchDown.stream) {
                        if (touchDown.stream === 'yt-where') {
                            ytOpen = !ytOpen;
                            ytCursor = 0;
                            paint();
                        } else if (touchDown.stream === 'yt-where-close') {
                            ytOpen = false;
                            if (ytGo) {
                                ytGo = false;
                                choose('yt-where-go');
                            }
                            paint();
                        } else if (touchDown.stream === 'yt-where-cancel') {
                            ytOpen = false;
                            ytGo = false;
                            choose('yt-where-cancel');
                            paint();
                        } else if (touchDown.stream === 'yt-play') {
                            choose('yt-play');
                        } else if (touchDown.stream === 'air-where') {
                            whereOpen = !whereOpen;
                            whereCursor = 0;
                            paint();
                        } else if (touchDown.stream === 'air-where-close') {
                            whereOpen = false;
                            paint();
                        } else if (touchDown.stream === 'air-pos') {
                            movePos = !movePos;
                            paint();
                        } else if (touchDown.stream === 'air-full') {
                            movePos = false;
                            choose('air-full');
                        } else {
                            choose(touchDown.stream);
                        }
                        touchDown = null;
                    } else if (phase === 3) {
                        touchDown = null;
                    }
                    return;
                }
                if (airWindow && pointIn(airWindow, tx, ty)) {
                    if (airState && airState.full) {
                        touchDown = null;
                        return;
                    }
                    if (!edit && onWindowDrag(phase, tx, ty)) {
                        return;
                    }
                }
                if (screenName === 'stream' || (airState && (airState.window || airState.tune || airState.on))) {
                    if (touchDown && touchDown.stream) {
                        if (phase === 3) {
                            if (hitStream(tx, ty) === touchDown.stream) {
                                choose(touchDown.stream);
                            }
                            touchDown = null;
                        }
                        return;
                    }
                    if (phase === 1 && hitStream(tx, ty)) {
                        touchDown = { stream: hitStream(tx, ty), x: tx, y: ty, hit: -1, origin: selected, t: Date.now(), dragged: false };
                        return;
                    }
                }
                if (!edit && onWindowDrag(phase, tx, ty)) {
                    return;
                }
                if (screenName === 'stream') {
                    if (phase === 3) {
                        touchDown = null;
                    }
                    return;
                }
                if (edit) {
                    onEditTouch(phase, tx, ty);
                } else if (phase === 1) {
                    touchDown = { x: tx, y: ty, hit: hitRow(tx, ty), origin: selected, t: Date.now(), dragged: false };
                    if (touchDown.hit >= 0) {
                        selected = touchDown.hit;
                        touchDown.origin = touchDown.hit;
                        paint();
                    }
                } else if (phase === 2 && touchDown) {
                    var dragY = ty - touchDown.y;
                    var steps;
                    var origin;
                    var next;
                    if (Math.abs(dragY) >= 96) {
                        steps = Math.round(dragY / 72);
                        origin = touchDown.origin;
                        if (origin < 0) {
                            origin = selected;
                        }
                        next = origin - steps;
                        if (next < 0) {
                            next = 0;
                        }
                        if (next >= items.length) {
                            next = items.length - 1;
                        }
                        touchDown.dragged = true;
                        if (next !== selected) {
                            selected = next;
                            paint();
                        }
                    } else {
                        hit = hitRow(tx, ty);
                        if (hit >= 0 && hit !== selected) {
                            selected = hit;
                            touchDown.hit = hit;
                            paint();
                        }
                    }
                } else if (phase === 3) {
                    if (touchDown && touchDown.dragged) {
                        touchDown = null;
                    } else {
                    hit = touchDown && touchDown.hit >= 0 ? touchDown.hit : hitRow(tx, ty);
                    if (touchDown && hit >= 0) {
                        var ddx = tx - touchDown.x;
                        var ddy = ty - touchDown.y;
                        if ((ddx * ddx + ddy * ddy) <= 120 * 120) {
                            activateHit(hit, 'up');
                        }
                    } else if (hit >= 0) {
                        activateHit(hit, 'up');
                    }
                    touchDown = null;
                    }
                }
            } else if (type === CCU && body.length >= 5 && body.length < 12 && shown) {
                onControl(body.readUInt16BE(1), body[3], body[4]);
            } else if (type === X_CCU && body.length >= 5 && shown) {
                onControl(body.readUInt16BE(1), body[3], body[4]);
            }
        }
    }

    function connect() {
        var file = paths[which % paths.length];
        if (!isSocket(file)) {
            which += 1;
            file = paths[which % paths.length];
        }
        note('menu-socket ' + file);
        var next = net.createConnection(file);
        sock = next;
        next.on('connect', function () {
            ready = false;
            native = false;
            mirrorSent = false;
            sentFrame = null;
            sentAtlases = {};
            clearFrameHold();
            incoming = Buffer.alloc(0);
            write(message(HELLO, Buffer.concat([
                Buffer.from('g21_airplay'),
                Buffer.from([0]),
                Buffer.from('proto=mgu-render/1')
            ])));
        });
        next.on('data', take);
        next.on('error', function (err) {
            note('menu-error ' + (err && err.message));
            which += 1;
        });
        next.on('close', function () {
            ready = false;
            sock = null;
            // Do not reconnect while the app is away. A quiet reconnect kept the
            // last menu over iDrive after the owner left with the back arrow.
            if (shown && !retry) {
                retry = setTimeout(function () {
                    retry = null;
                    if (shown) {
                        connect();
                    }
                }, 3000);
                if (retry.unref) {
                    retry.unref();
                }
            }
        });
    }

    function armPulse() {
        if (pulse) {
            return;
        }
        pulse = setInterval(function () {
            if (!shown || !ready) {
                return;
            }
            // GRAB lasts 1.5 s in mgu-renderd. One grab at open lets the knob die.
            sendGrab(true);
            pulseBeat += 1;
            if (lastFrame && (pulseBeat % 2) === 0) {
                flushFrame(true);
            }
        }, 500);
        if (pulse.unref) {
            pulse.unref();
        }
    }

    return {
        items: items,
        open: function () {
            showSurface('open');
        },
        setFront: function (on) {
            if (on) {
                showSurface('front');
            } else {
                dropSurface('leave');
            }
        },
        close: function () {
            dropSurface('close');
        },
        move: move,
        press: press,
        lang: function () { return uiLang; },
        setLang: function (next) {
            uiLang = next === 'en' ? 'en' : 'pl';
            paint();
            return uiLang;
        },
        repaint: function () {
            paint();
        },
        setScreen: setScreen,
        setItems: function (nextItems, nextHeading) {
            items = (nextItems || []).map(function (item) {
                return {
                    name: item.name,
                    title: item.title,
                    hint: item.hint || '',
                    icon: item.icon || 'play',
                    adjust: !!item.adjust,
                    on: !!item.on
                };
            });
            armed = '';
            if (typeof nextHeading === 'string') {
                heading = nextHeading;
            }
            if (selected >= items.length) {
                selected = 0;
            }
            noted = false;
            paint();
        },
        setItemHint: setItemHint,
        setItemTitle: setItemTitle,
        setItemIcon: setItemIcon,
        screen: function () { return screenName; },
        setStatus: function (text) {
            var next = String(text || '');
            if (next === detail) {
                return;
            }
            detail = next;
            if (!edit) {
                paintSoon();
            }
        },
        setCaption: function (info) {
            caption = info && info.on ? {
                on: true,
                text: String(info.text || ''),
                x: info.x | 0,
                y: info.y | 0
            } : null;
            if (!edit) {
                paint();
            }
        },
        // Przeglądarka: info.on and the daemon's state (browser_client.js); null leaves the screen
        setWeb: function (info) {
            var next = info && info.on ? info : null;
            var key = next ? [next.connected ? 1 : 0, next.engine, next.err, next.url, next.title, next.loading ? 1 : 0, next.back ? 1 : 0, next.fwd ? 1 : 0,
                next.live ? 1 : 0, next.zoom, next.editable ? 1 : 0, next.pct, next.ring].join('|') : '';
            if (key === webKey && !!next === !!webView) {
                return;
            }
            webView = next;
            webKey = key;
            if (!next) {
                webTouch = null;
            }
            if (!edit) {
                paintSoon();
            }
        },
        /** the page area of Przeglądarka on this screen: { x, y, w, h } */
        webPage: function () {
            return webLayout(screen.w || 1920, screen.h || 720).page;
        },
        setRideView: function (info) {
            rideView = info && info.on ? info : null;
            if (!edit) {
                paint();
            }
        },
        setBoxPreview: function (info) {
            boxPreview = info && typeof info === 'object' ? {
                x: info.x | 0,
                y: info.y | 0,
                w: info.w | 0,
                h: info.h | 0,
                limitW: info.limitW | 0,
                limitH: info.limitH | 0,
                mode: info.mode ? String(info.mode) : '',
                rotate: info.rotate | 0,
                label: info.label ? String(info.label) : '',
                frames: Array.isArray(info.frames) ? info.frames.map(function (frame) {
                    return {
                        label: frame && frame.label ? String(frame.label) : '',
                        limitW: frame && frame.limitW ? (frame.limitW | 0) : 1,
                        limitH: frame && frame.limitH ? (frame.limitH | 0) : 1,
                        x: frame && frame.x ? (frame.x | 0) : 0,
                        y: frame && frame.y ? (frame.y | 0) : 0,
                        w: frame && frame.w ? (frame.w | 0) : 0,
                        h: frame && frame.h ? (frame.h | 0) : 0,
                        focus: !!(frame && frame.focus)
                    };
                }) : [],
                sliders: Array.isArray(info.sliders) ? info.sliders.map(function (row) {
                    return {
                        key: row && row.key ? String(row.key) : '',
                        label: row && row.label ? String(row.label) : '',
                        value: row && row.value ? (row.value | 0) : 0,
                        min: row && row.min ? (row.min | 0) : 0,
                        max: row && row.max ? (row.max | 0) : 0,
                        on: !!(row && row.on)
                    };
                }) : []
            } : null;
            if (!edit) {
                paint();
            }
        },
        setStreamInfo: function (info) {
            var next = info && typeof info === 'object' ? {
                pin: info.pin ? String(info.pin) : '',
                headline: info.headline ? String(info.headline) : '',
                hint: info.hint ? String(info.hint) : '',
                mirrored: !!info.mirrored,
                spin: !!info.spin,
                lines: Array.isArray(info.lines) ? info.lines.map(function (line) {
                    return String(line || '');
                }) : [],
                window: info.window && typeof info.window === 'object' ? {
                    x: info.window.x | 0,
                    y: info.window.y | 0,
                    w: info.window.w | 0,
                    h: info.window.h | 0
                } : null,
                screens: Array.isArray(info.screens) ? info.screens.map(function (row) {
                    return {
                        name: row && row.name ? String(row.name) : '',
                        title: row && row.title ? String(row.title) : '',
                        on: !!(row && row.on)
                    };
                }) : [],
                tune: info.tune && typeof info.tune === 'object' ? {
                    name: String(info.tune.name || ''),
                    title: String(info.tune.title || ''),
                    tool: String(info.tune.tool || ''),
                    axis: info.tune.axis === 'y' ? 'y' : 'x',
                    x: info.tune.x | 0,
                    y: info.tune.y | 0,
                    w: info.tune.w | 0,
                    h: info.tune.h | 0,
                    limitW: info.tune.limitW | 0,
                    limitH: info.tune.limitH | 0,
                    saved: !!info.tune.saved,
                    shown: info.tune.shown && typeof info.tune.shown === 'object' ? {
                        x: info.tune.shown.x | 0,
                        y: info.tune.shown.y | 0,
                        w: info.tune.shown.w | 0,
                        h: info.tune.shown.h | 0,
                        limitW: info.tune.shown.limitW | 0,
                        limitH: info.tune.shown.limitH | 0
                    } : null
                } : null
            } : null;
            if (streamInfo && next && JSON.stringify(streamInfo) === JSON.stringify(next)) {
                return;
            }
            streamInfo = next;
            if (!edit) {
                paintSoon();
            }
        },
        setAirWindow: function (win) {
            if (!airState || !win) {
                return;
            }
            airState.window = {
                x: win.x | 0,
                y: win.y | 0,
                w: win.w | 0,
                h: win.h | 0
            };
        },
        setYtState: function (info) {
            ytState = info || null;
            if (ytState && !ytState.live && !ytGo) {
                ytOpen = false;
            }
            paint();
        },
        /** THEiPlay's YouTube tile: the sheet "where to show YouTube"; its button chooses 'yt-where-go', a tap beside it 'yt-where-cancel'. */
        openYtWhere: function () {
            ytGo = true;
            ytOpen = true;
            ytCursor = 3;
            paint();
        },
        ytWhereOpen: function () {
            return ytOpen;
        },
        setAirState: function (info) {
            var tune = info && info.tune && typeof info.tune === 'object' ? info.tune : null;
            var win = info && info.window && typeof info.window === 'object' ? info.window : null;
            var next = {
                on: !!(info && info.on),
                online: !!(info && info.online),
                bad: !!(info && info.bad),
                status: info && info.status ? String(info.status) : 'offline',
                screens: Array.isArray(info && info.screens) ? info.screens.map(function (row) {
                    return {
                        key: row && (row.key || row.name) ? String(row.key || row.name) : '',
                        on: !!(row && row.on)
                    };
                }) : [],
                mirrored: !!(info && info.mirrored),
                full: !!(info && info.full),
                fullUi: !!(info && info.fullUi),
                window: win ? {
                    x: win.x | 0,
                    y: win.y | 0,
                    w: win.w | 0,
                    h: win.h | 0
                } : null,
                tune: tune ? {
                    name: String(tune.name || ''),
                    title: String(tune.title || ''),
                    tool: String(tune.tool || ''),
                    axis: tune.axis === 'y' ? 'y' : 'x',
                    x: tune.x | 0,
                    y: tune.y | 0,
                    w: tune.w | 0,
                    h: tune.h | 0,
                    limitW: tune.limitW | 0,
                    limitH: tune.limitH | 0,
                    saved: !!tune.saved,
                    shown: tune.shown && typeof tune.shown === 'object' ? {
                        x: tune.shown.x | 0,
                        y: tune.shown.y | 0,
                        w: tune.shown.w | 0,
                        h: tune.shown.h | 0,
                        limitW: tune.shown.limitW | 0,
                        limitH: tune.shown.limitH | 0
                    } : null
                } : null
            };
            var key = [
                next.on ? 1 : 0,
                next.online ? 1 : 0,
                next.bad ? 1 : 0,
                next.status,
                next.screens.map(function (row) { return row.key + (row.on ? '1' : '0'); }).join(','),
                next.mirrored ? 1 : 0,
                (next.full ? 1 : 0) + '/' + (next.fullUi ? 1 : 0),
                next.window ? (next.window.x + ',' + next.window.y + ',' + next.window.w + ',' + next.window.h) : '',
                next.tune ? (next.tune.name + '/' + next.tune.tool + '/' + next.tune.axis + '/' + next.tune.x + '/' + next.tune.y + '/' + next.tune.w + '/' + next.tune.h + '/' + (next.tune.saved ? 1 : 0)) : ''
            ].join('|');
            if (key === airKey) {
                return;
            }
            airState = next;
            airKey = key;
            if (!edit) {
                paintSoon();
            }
        },
        rebindVideo: rebindVideo,
        selected: function () { return selected; },
        selectedName: function () {
            return items[selected] ? items[selected].name : '';
        },
        startEdit: startEdit,
        cancelEdit: cancelEdit,
        editing: function () { return !!edit; }
    };
}

module.exports = {
    ITEMS: ITEMS,
    ROOT_ITEMS: ROOT_ITEMS,
    AIRPLAY_ITEMS: AIRPLAY_ITEMS,
    AIR_OUT_ITEMS: AIR_OUT_ITEMS,
    STREAM_ITEMS: STREAM_ITEMS,
    SCREENS: SCREENS,
    screenOptions: screenOptions,
    positionOptions: positionOptions,
    positionPage: positionPage,
    qualityItems: qualityItems,
    qualityOptions: qualityOptions,
    ICONS: ICONS,
    message: message,
    buildFrame: buildFrame,
    buildStreamFrame: buildStreamFrame,
    streamWindow: streamWindow,
    buildKeyboardFrame: buildKeyboardFrame,
    buildWebFrame: buildWebFrame,
    webLayout: webLayout,
    WEB_ZOOMS: WEB_ZOOMS,
    encoderStep: encoderStep,
    crumbFor: crumbFor,
    createMenuSurface: createMenuSurface,
    FONT: FONT
};
