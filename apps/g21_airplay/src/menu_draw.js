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
var FRAME = 7;
var VIDEO = 13;
var DROP_VIDEO = 14;
var MIRROR_FILE = '/dev/shm/mgu-video-g21airplay';
var youtubeFilePath = '/dev/shm/mgu-video-ridetube';
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
    'wybierz ekran': 'pick a screen'
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
    if (s.indexOf('blad ') === 0) {
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
    { name: 'position', title: 'Pozycja', hint: 'wspólne okno', icon: 'grid' }
];

var AIRPLAY_ITEMS = [
    { name: 'air-toggle', title: 'Start', hint: 'włącz lustro', icon: 'play' },
    { name: 'air-screen', title: 'Ekrany', hint: 'środek', icon: 'desktop' },
    { name: 'air-quality', title: 'Jakość obrazu', hint: '600x400, 400x240', icon: 'desktop' },
    { name: 'air-name', title: 'Nazwa', hint: 'THEiPlay', icon: 'tag' },
    { name: 'air-pin', title: 'Kod', hint: 'bez kodu', icon: 'unlock' },
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
    { name: 'yt-feed-home', title: 'Home', hint: 'RideTube', icon: 'grid', on: true },
    { name: 'yt-feed-subs', title: 'Subskrypcje', hint: 'RideTube', icon: 'grid' },
    { name: 'yt-feed-wl', title: 'Do obejrzenia', hint: 'RideTube', icon: 'tag' },
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
    'quality-kombi': qualityOptions('kombi', ['240x144', '320x192', '400x240', '480x288', '600x360'], '400x240'),
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

function FrameBuilder() {
    this.parts = [];
    this.rects = 0;
}

FrameBuilder.prototype.op = function (value) {
    this.parts.push(u32(value));
};

FrameBuilder.prototype.f32 = function (value) {
    var b = Buffer.alloc(4);
    b.writeFloatLE(value, 0);
    this.parts.push(b);
};

FrameBuilder.prototype.clear = function (color) {
    this.op(1);
    this.op(color);
};

FrameBuilder.prototype.video = function (x, y, w, h, id) {
    if (!(w > 0) || !(h > 0)) {
        return;
    }
    this.op(19);
    this.f32(x);
    this.f32(y);
    this.f32(w);
    this.f32(h);
    this.f32(0);
    this.op(id || 1);
};

FrameBuilder.prototype.rect = function (x, y, w, h, color) {
    if (!(w > 0) || !(h > 0)) {
        return;
    }
    this.op(2);
    this.f32(x);
    this.f32(y);
    this.f32(w);
    this.f32(h);
    this.op(color);
    this.rects += 1;
};

FrameBuilder.prototype.text = function (str, x, y, scale, color) {
    var pen = x;
    var text = String(str);
    var i;
    var row;
    var col;
    var glyph;
    var ch;
    for (i = 0; i < text.length; i += 1) {
        ch = text.charAt(i);
        glyph = FONT[ch] || FONT[' '];
        for (row = 0; row < glyph.length; row += 1) {
            for (col = 0; col < glyph[row].length; col += 1) {
                if (glyph[row].charAt(col) === '1') {
                    this.rect(pen + col * scale, y + row * scale, scale, scale, color);
                }
            }
        }
        pen += 6 * scale;
    }
};

FrameBuilder.prototype.textWidth = function (str, scale) {
    return String(str || '').length * 6 * scale;
};

FrameBuilder.prototype.pill = function (x, y, w, h, color) {
    var radius = Math.floor(Math.min(h / 2, w / 2, 28));
    var i;
    var inset;
    var span;
    if (radius < 6) {
        this.rect(x, y, w, h, color);
        return;
    }
    for (i = 0; i < radius; i += 1) {
        inset = radius - 1 - Math.floor(Math.sqrt((radius * radius) - ((radius - 1 - i) * (radius - 1 - i))));
        if (inset < 0) {
            inset = 0;
        }
        span = w - (inset * 2);
        if (span > 0) {
            this.rect(x + inset, y + i, span, 1, color);
            this.rect(x + inset, y + h - 1 - i, span, 1, color);
        }
    }
    if (h > radius * 2) {
        this.rect(x, y + radius, w, h - (radius * 2), color);
    }
};

FrameBuilder.prototype.icon = function (name, x, y, px, color) {
    var rows = ICONS[name] || ICONS.play;
    var row;
    var col;
    var line;
    var size = px || 3;
    for (row = 0; row < rows.length; row += 1) {
        line = rows[row];
        for (col = 0; col < line.length; col += 1) {
            if (line.charAt(col) === '1') {
                this.rect(x + col * size, y + row * size, size, size, color);
            }
        }
    }
};

FrameBuilder.prototype.iconSize = function (px) {
    return 16 * (px || 3);
};

FrameBuilder.prototype.bytes = function () {
    return Buffer.concat(this.parts);
};

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
        return 'Haslo';
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
    var scale = 4;
    var label;
    lay.crumb = tr(crumb || 'THEiPlay');
    lay.backHit = null;
    if (showBack) {
        draw.pill(lay.ox + 20, lay.oy + 14, 150, 40, CARD);
        draw.text(tr('wstecz'), lay.ox + 40, lay.oy + 24, 3, ACCENT);
        lay.backHit = { x: lay.ox + 20, y: lay.oy + 14, w: 150, h: 40 };
        textX = lay.ox + 188;
        scale = 4;
    }
    label = fitCrumb(draw, lay.crumb, scale, lay.ox + lay.boxW - textX - 780);
    draw.text(label, textX, lay.oy + 22, scale, showBack ? INK : ACCENT);
}

function drawSpinner(draw, cx, cy) {
    var phase = Math.floor(Date.now() / 140) % 8;
    var i;
    var ang;
    var x;
    var y;
    var on;
    for (i = 0; i < 8; i += 1) {
        ang = i * Math.PI / 4 - Math.PI / 2;
        x = cx + Math.round(Math.cos(ang) * 42) - 7;
        y = cy + Math.round(Math.sin(ang) * 42) - 7;
        on = i === phase;
        draw.rect(x, y, on ? 18 : 10, on ? 18 : 10, on ? ACCENT : MUTED);
    }
}

// exit: the right button closes the app (menu pages). Without it the
// button is "wybierz" (the knob keyboard still needs it).
function drawNav(draw, lay, onTop, exit) {
    var y = onTop ? (lay.oy + lay.headerH + 10) : (lay.oy + lay.boxH - 78);
    var h = 56;
    var arrow = 76;
    var label = exit ? tr('Wyłącz aplikację') : 'wybierz';
    var textScale = exit ? 3 : 4;
    var tw = draw.textWidth(label, textScale);
    var okW = Math.max(230, tw + (exit ? 76 : 48));
    var gap = 14;
    var okX = lay.ox + lay.boxW - okW - 24;
    var rightX = okX - gap - arrow;
    var leftX = rightX - gap - arrow;
    var ix;
    draw.pill(leftX, y, arrow, h, CARD_HI);
    draw.text('<', leftX + 28, y + 16, 4, INK);
    draw.pill(rightX, y, arrow, h, CARD_HI);
    draw.text('>', rightX + 28, y + 16, 4, INK);
    if (exit) {
        // Power glyph: a ring with a gap at the top and a bar through it.
        draw.pill(okX, y, okW, h, CARD_HI);
        ix = okX + 22;
        draw.rect(ix, y + 18, 3, 20, INK);
        draw.rect(ix + 21, y + 18, 3, 20, INK);
        draw.rect(ix, y + 38, 24, 3, INK);
        draw.rect(ix, y + 18, 6, 3, INK);
        draw.rect(ix + 18, y + 18, 6, 3, INK);
        draw.rect(ix + 10, y + 11, 4, 18, INK);
        draw.text(label, okX + 56 + Math.floor((okW - 56 - tw) / 2) - 8, y + 19, textScale, INK);
    } else {
        draw.pill(okX, y, okW, h, ACCENT);
        draw.text(label, okX + Math.floor((okW - tw) / 2), y + 16, textScale, PAGE);
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
        return 'spacja';
    }
    if (key === 'ANU') {
        return 'anuluj';
    }
    if (key === 'DEL') {
        return 'usun';
    }
    if (key === 'SH') {
        return 'Aa';
    }
    return key;
}

function buildKeyboardFrame(edit, width, height, crumb, air, versionText) {
    var draw = new FrameBuilder();
    var page = pageBox(width, height);
    var rows = edit.rows || [];
    var gap = 10;
    var keyH = 52;
    var maxCols = 10;
    var unit = Math.floor((page.boxW - 80 - (maxCols - 1) * gap) / maxCols);
    var startY = page.oy + 156;
    var hits = [];
    var popupHits = [];
    var index = 0;
    var r;
    var c;
    var row;
    var rowW;
    var keyW;
    var x;
    var y;
    var label;
    var labelW;
    var focus;
    var held;
    var alts;
    var altW;
    var altX;
    var altY;
    var shown = knobKeyboard.displayValue(edit) + '_';
    var head = {
        ox: page.ox,
        oy: page.oy,
        boxW: page.boxW,
        boxH: page.boxH
    };
    draw.clear(0);
    draw.rect(page.ox, page.oy, page.boxW, page.boxH, PAGE);
    draw.rect(page.ox, page.oy, page.boxW, 56, PAGE_TOP);
    drawMenuHeader(draw, head, crumb || edit.title || 'Wpisz', true);
    draw.text('tap: litera   przytrzymaj: polskie', page.ox + 72, page.oy + 72, 3, MUTED);
    draw.pill(page.ox + 48, page.oy + 100, page.boxW - 96, 44, CARD_HI);
    draw.text(shown.slice(0, 40), page.ox + 68, page.oy + 112, 4, INK);
    for (r = 0; r < rows.length; r += 1) {
        row = rows[r];
        keyW = unit;
        if (row.length <= 5) {
            keyW = Math.floor(unit * 1.7);
        }
        rowW = row.length * keyW + (row.length - 1) * gap;
        x = page.ox + Math.floor((page.boxW - rowW) / 2);
        y = startY + r * (keyH + gap);
        for (c = 0; c < row.length; c += 1) {
            focus = index === edit.keyIndex;
            held = edit.popup && edit.popup.keyIndex === index;
            label = keyLabel(row[c]);
            draw.pill(x, y, keyW, keyH, (focus || held) ? ACCENT : CARD);
            labelW = draw.textWidth(label, 3);
            draw.text(
                label,
                x + Math.floor((keyW - labelW) / 2),
                y + Math.floor((keyH - 21) / 2),
                3,
                (focus || held) ? INK : HINT
            );
            hits.push({ x: x, y: y, w: keyW, h: keyH, index: index });
            index += 1;
            x += keyW + gap;
        }
    }
    if (edit.popup && edit.popup.alts && edit.popup.alts.length) {
        held = hits[edit.popup.keyIndex];
        alts = edit.popup.alts;
        altW = 72;
        altY = held ? Math.max(page.oy + 8, held.y - keyH - 16) : page.oy + 8;
        altX = held
            ? held.x + Math.floor(held.w / 2) - Math.floor((alts.length * altW + (alts.length - 1) * 8) / 2)
            : page.ox + 80;
        for (c = 0; c < alts.length; c += 1) {
            focus = c === edit.popup.pick;
            draw.pill(altX - 4, altY - 4, altW + 8, keyH + 8, ACCENT_GLOW);
            draw.pill(altX, altY, altW, keyH, focus ? ACCENT : CARD_HI);
            labelW = draw.textWidth(alts[c], 4);
            draw.text(
                alts[c],
                altX + Math.floor((altW - labelW) / 2),
                altY + 12,
                4,
                INK
            );
            popupHits.push({ x: altX - 8, y: altY - 8, w: altW + 16, h: keyH + 16, pick: c });
            altX += altW + 8;
        }
    }
    var board = { ox: page.ox, oy: page.oy, boxW: page.boxW, boxH: page.boxH };
    var airBadge;
    drawNav(draw, board);
    airBadge = drawAirBadge(draw, board, air, versionText);
    return {
        frame: message(FRAME, draw.bytes()),
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
            nav: board.nav,
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
    var scale;
    var tw;
    var text = String(version || '').replace(/^v/i, '');
    if (!text || !box) {
        return;
    }
    label = 'v' + text;
    scale = 3;
    tw = draw.textWidth(label, scale);
    draw.text(
        label,
        box.ox + box.boxW - tw - 40,
        box.oy + 26,
        scale,
        MUTED
    );
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
    var scale = 3;
    var text = String(label || '');
    var tw = draw.textWidth(text, scale);
    draw.rect(box.x, box.y, box.w, box.h, on ? ACCENT : CARD);
    draw.rect(box.x, box.y + box.h - 3, box.w, 3, on ? PAGE : LINE);
    draw.text(text, box.x + Math.floor((box.w - tw) / 2), box.y + Math.floor((box.h - 21) / 2), scale, on ? PAGE : INK);
}

function drawSlider(draw, x, y, w, value, min, max, hot) {
    var span = (max | 0) - (min | 0);
    var t = span > 0 ? ((value | 0) - (min | 0)) / span : 0;
    var fill;
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
    draw.rect(x, y, w, 16, PAGE);
    if (fill > 0) {
        draw.rect(x + 2, y + 2, fill, 12, hot ? RED : ACCENT);
    }
    draw.rect(x + 2 + fill - 5, y - 4, 10, 24, INK);
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
    draw.rect(x, y, stageW, stageH, PAGE);
    draw.rect(wx, wy, ww, wh, ACCENT_DIM);
    draw.rect(wx, wy, ww, Math.min(8, wh), ACCENT);
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
    var anyOn;
    var x;
    var y;
    var h;
    var cx;
    var btn;
    if (!air || !lay) {
        return null;
    }
    picks = [
        { name: 'air-pick-central', title: 'Środek', key: 'central' },
        { name: 'air-pick-cluster', title: 'Zegary', key: 'cluster' },
        { name: 'air-pick-hud', title: 'HUD', key: 'hud' }
    ];
    chosen = {};
    screens = air.screens || [];
    for (i = 0; i < screens.length; i += 1) {
        row = screens[i];
        if (row && row.on) {
            chosen[row.key || row.name] = true;
        }
    }
    label = String(air.status || (air.online ? 'sukces' : 'offline')).slice(0, 16);
    tw = draw.textWidth(label, 3);
    for (i = 0; i < picks.length; i += 1) {
        if (chosen[picks[i].key]) {
            anyOn = true;
        }
    }
    total = 36 + tw + 12 + 132 + 8 + 112 + 16;
    h = 40;
    x = lay.ox + lay.boxW - total - 16;
    y = lay.oy + 14;
    draw.rect(x, y, total, h, PAGE_TOP);
    if (air.online) {
        draw.rect(x + 12, y + 12, 16, 16, ACCENT);
    } else {
        draw.rect(x + 12, y + 12, 16, 16, MUTED);
        draw.rect(x + 16, y + 16, 8, 8, PAGE_TOP);
    }
    tone = air.online ? ACCENT : (air.bad ? INK : HINT);
    draw.text(tr(label), x + 36, y + 10, 3, tone);
    cx = x + 36 + tw + 12;
    lay.airHits = [];
    btn = { name: 'air-where', x: cx, y: y + 6, w: 132, h: 28 };
    drawChip(draw, btn, !!(air.whereOpen || anyOn), tr('Ekrany'));
    lay.airHits.push(btn);
    btn = { name: 'air-badge', x: x + total - 128, y: y + 6, w: 112, h: 28 };
    drawChip(draw, btn, !!air.on, tr(air.on ? 'Stop' : 'Start'));
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
    if (!tune) {
        return;
    }
    draw.rect(panel.x, panel.y, panel.w, panel.h, PAGE_TOP);
    draw.rect(panel.x, panel.y, 6, panel.h, ACCENT);
    draw.text(String(tune.title || 'Ekran'), panel.x + 24, panel.y + 16, 4, INK);
    draw.text('pokretlo zmienia, klik zapisuje', panel.x + 280, panel.y + 22, 3, MUTED);
    tools = [
        { name: 'stream-pos', title: 'Pozycja', tool: 'pos' },
        { name: 'stream-size', title: 'Rozmiar', tool: 'size' },
        { name: 'stream-h', title: 'Wysokość', tool: 'h' },
        { name: 'stream-w', title: 'Szerokość', tool: 'w' }
    ];
    x = panel.x + 24;
    for (i = 0; i < tools.length; i += 1) {
        tool = tools[i];
        chip = { name: tool.name, x: x, y: panel.y + 58, w: 176, h: 48 };
        drawChip(draw, chip, tune.tool === tool.tool, tool.title);
        pushHit(hits, chip);
        x += 186;
    }
    sliderY = panel.y + 124;
    maxX = Math.max(0, (tune.limitW || 1920) - (tune.w || 0));
    maxY = Math.max(0, (tune.limitH || 720) - (tune.h || 0));
    if (tune.tool === 'pos') {
        draw.text('X', panel.x + 24, sliderY, 3, tune.axis === 'y' ? MUTED : ACCENT);
        drawSlider(draw, panel.x + 56, sliderY, 460, tune.x, 0, maxX);
        draw.text(String(tune.x | 0), panel.x + 530, sliderY, 3, INK);
        pushHit(hits, { name: 'stream-axis-x', x: panel.x + 24, y: sliderY - 6, w: 560, h: 28 });
        draw.text('Y', panel.x + 24, sliderY + 40, 3, tune.axis === 'y' ? ACCENT : MUTED);
        drawSlider(draw, panel.x + 56, sliderY + 40, 460, tune.y, 0, maxY);
        draw.text(String(tune.y | 0), panel.x + 530, sliderY + 40, 3, INK);
        pushHit(hits, { name: 'stream-axis-y', x: panel.x + 24, y: sliderY + 34, w: 560, h: 28 });
    } else if (tune.tool === 'size' || tune.tool === 'w' || tune.tool === 'h') {
        if (tune.tool === 'h') {
            draw.text('wys.', panel.x + 24, sliderY + 8, 3, ACCENT);
            drawSlider(draw, panel.x + 110, sliderY + 6, 400, tune.h, 90, tune.limitH || 720);
        } else {
            draw.text(tune.tool === 'size' ? 'calosc' : 'szer.', panel.x + 24, sliderY + 8, 3, ACCENT);
            drawSlider(draw, panel.x + 110, sliderY + 6, 400, tune.w, 160, tune.limitW || 1920);
        }
        draw.text(String(tune.w) + 'x' + String(tune.h), panel.x + 524, sliderY + 8, 3, INK);
    } else {
        draw.text('wybierz pozycje, rozmiar, wysokosc albo szerokosc', panel.x + 24, sliderY + 10, 3, HINT);
    }
    chip = { name: 'stream-save', x: panel.x + 24, y: panel.y + 204, w: 180, h: 44 };
    drawChip(draw, chip, !!tune.saved, tune.saved ? 'zapisane' : 'Zapisz');
    pushHit(hits, chip);
    chip = { name: 'stream-cancel', x: panel.x + 216, y: panel.y + 204, w: 180, h: 44 };
    drawChip(draw, chip, false, 'Anuluj');
    pushHit(hits, chip);
    shown = tune.shown || {
        x: tune.x,
        y: tune.y,
        w: tune.w,
        h: tune.h,
        limitW: tune.limitW,
        limitH: tune.limitH
    };
    drawStage(draw, panel.x + panel.w - 250, panel.y + 58, 220, 120, shown);
    draw.text('na zywo', panel.x + panel.w - 250, panel.y + 186, 3, MUTED);
}

function drawWhereGlyph(draw, kind, x, y) {
    if (kind === 'cluster') {
        draw.pill(x + 18, y + 28, 78, 78, ACCENT_DIM);
        draw.pill(x + 114, y + 28, 78, 78, ACCENT_DIM);
        draw.pill(x + 40, y + 50, 34, 34, PAGE);
        draw.pill(x + 136, y + 50, 34, 34, PAGE);
        return;
    }
    if (kind === 'hud') {
        draw.rect(x + 24, y + 36, 162, 22, ACCENT_DIM);
        draw.rect(x + 48, y + 70, 114, 8, MUTED);
        draw.rect(x + 70, y + 88, 70, 6, LINE);
        return;
    }
    draw.rect(x + 8, y + 22, 194, 110, ACCENT_DIM);
    draw.rect(x + 20, y + 34, 170, 86, PAGE);
    draw.rect(x + 36, y + 48, 138, 58, CARD_HI);
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
    if (!air || !lay) {
        return;
    }
    var pick = (air && air.pickPrefix) || 'air-pick-';
    var shut = (air && air.pickClose) || 'air-where-close';
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
    }
    draw.rect(lay.ox, lay.oy, lay.boxW, lay.boxH, PAGE);
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
    draw.rect(x, y, panelW, panelH, PAGE_TOP);
    draw.rect(x, y, panelW, 6, ACCENT);
    draw.text(tr('Gdzie pokazać'), x + 28, y + 22, 4, INK);
    draw.text(tr('kliknij kafelek'), x + 320, y + 28, 3, MUTED);
    tileW = Math.floor((panelW - 56 - 32) / 3);
    gap = 16;
    tx = x + 28;
    cursor = air.whereCursor | 0;
    if (!lay.airHits) {
        lay.airHits = [];
    }
    lay.airHits.push({ name: shut, x: lay.ox, y: lay.oy, w: lay.boxW, h: lay.boxH });
    for (i = 0; i < tiles.length; i += 1) {
        tile = tiles[i];
        on = !!chosen[tile.key];
        draw.rect(tx, y + 78, tileW, 280, (cursor === i || on) ? CARD_HI : CARD);
        draw.rect(tx, y + 78, tileW, cursor === i ? 6 : 3, on ? RED : (cursor === i ? ACCENT : LINE));
        drawWhereGlyph(draw, tile.kind, tx + Math.floor((tileW - 210) / 2), y + 100);
        draw.text(tr(tile.title), tx + 16, y + 250, 3, on ? RED : INK);
        draw.text(tr(on ? 'wlaczone' : 'wylaczone'), tx + 16, y + 282, 3, on ? ACCENT : MUTED);
        lay.airHits.push({ name: tile.name, x: tx, y: y + 78, w: tileW, h: 280 });
        tx += tileW + gap;
    }
    close = { name: shut, x: x + panelW - 180, y: y + panelH - 64, w: 148, h: 40 };
    drawChip(draw, close, cursor === 3, tr('Gotowe'));
    lay.airHits.push(close);
}

function applyAirOverlay(draw, lay, air, versionText) {
    var hits = lay.hits || [];
    var win;
    lay.hits = hits;
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
            pickClose: 'yt-where-close'
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

function drawCenterChrome(draw, lay, win, full, moving) {
    var y = win.y + 10;
    var x = win.x + 10;
    var fullBtn;
    var posBtn;
    if (y < lay.oy + 58) {
        y = lay.oy + 58;
    }
    if (x + 292 > lay.ox + lay.boxW) {
        x = lay.ox + lay.boxW - 302;
    }
    fullBtn = { name: 'air-full', x: x, y: y, w: 150, h: 36 };
    posBtn = { name: 'air-pos', x: x + 158, y: y, w: 132, h: 36 };
    drawChip(draw, fullBtn, full, 'Full screen');
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
        drawChip(draw, chip, active, screens[i].title);
        if (screens[i].on && !active) {
            draw.rect(chip.x + 12, chip.y + chip.h - 8, chip.w - 24, 4, ACCENT);
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
        drawChip(draw, chip, !!(info && info.tune && info.tune.name === 'central' && info.tune.tool === 'pos'), 'pozycja');
        pushHit(hits, chip);
        chip = { name: 'stream-win-size', x: win.x + win.w - 162, y: win.y + 6, w: 148, h: 32 };
        drawChip(draw, chip, !!(info && info.tune && info.tune.name === 'central' && info.tune.tool === 'size'), 'rozmiar');
        pushHit(hits, chip);
    }
    tune = info && info.tune;
    if (!tune) {
        return;
    }
    drawTunePanel(draw, hits, { x: page.ox + 20, y: barY - 276, w: 1120, h: 260 }, tune);
}

function buildStreamFrame(items, selected, width, height, detail, heading, version, streamInfo, caption, crumb, air) {
    var draw = new FrameBuilder();
    var lay = streamLayout(items, selected, width, height, detail, heading);
    var bubble = lay.bubbles[0];
    var title = String((items[0] && items[0].title) || 'Zakończ');
    var titleW;
    var page = pageBox(width, height);
    var info = streamInfo || null;
    var pin = (info && info.pin) || parsePinDetail(detail);
    var mirrored = !!(info && info.mirrored);
    var pinScale;
    var pinW;
    var pinX;
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
    draw.clear(0);
    var head = { ox: page.ox, oy: page.oy, boxW: page.boxW, boxH: page.boxH };
    if (crumb) {
        draw.rect(page.ox, page.oy, page.boxW, 64, PAGE_TOP);
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
            draw.rect(win.x, win.y, win.w, win.h, PAGE);
        if (info.video) {
            draw.video(win.x, win.y, win.w, win.h, 1);
        }
        draw.rect(win.x, win.y, win.w, 44, ACCENT);
        draw.rect(win.x, win.y + 44, win.w, 3, ACCENT_DIM);
        draw.rect(win.x, win.y, 3, win.h, ACCENT);
        draw.rect(win.x + win.w - 3, win.y, 3, win.h, ACCENT);
        draw.rect(win.x, win.y + win.h - 3, win.w, 3, ACCENT);
        draw.text('THEiPlay', win.x + 16, win.y + 12, 3, PAGE);
        if (!mirrored && pin) {
            pinScale = 8;
            pinW = draw.textWidth(pin, pinScale);
            draw.text(pin, win.x + Math.floor((win.w - pinW) / 2), win.y + 80, pinScale, INK);
        } else if (!mirrored) {
            if (info && info.spin) {
                drawSpinner(draw, win.x + Math.floor(win.w / 2), win.y + Math.floor(win.h / 2));
            }
            label = String((info && info.hint) || detail || 'czekam na klatke');
            labelW = draw.textWidth(label, 4);
            draw.text(label, win.x + Math.floor((win.w - labelW) / 2), win.y + 90, 4, INK);
            lines = (info && info.lines) || [];
            lineY = win.y + 150;
            for (i = 0; i < lines.length && i < 4; i += 1) {
                draw.text(String(lines[i]).slice(0, 36), win.x + 24, lineY, 3, HINT);
                lineY += 32;
            }
        }
        if (mirrored) {
            label = String((info && (info.hint || info.headline)) || detail || 'lustro');
            draw.text(String(label).slice(0, 42), win.x, win.y + win.h + 10, 3, HINT);
        }
    } else if (!mirrored) {
        panelY = page.oy + 48;
        panelH = page.boxH - 200;
        draw.pill(panelX - 8, panelY - 8, panelW + 16, panelH + 16, ACCENT_DIM);
        draw.pill(panelX, panelY, panelW, panelH, CARD);
        label = String((info && info.headline) || heading || 'THEiPlay');
        labelW = draw.textWidth(label, 4);
        draw.text(label, panelX + Math.floor((panelW - labelW) / 2), panelY + 36, 4, INK);
        if (pin) {
            pinScale = 12;
            pinW = draw.textWidth(pin, pinScale);
            pinX = panelX + Math.floor((panelW - pinW) / 2);
            pinY = panelY + 110;
            label = 'kod — wpisz na iPhonie';
            labelW = draw.textWidth(label, 3);
            draw.text(label, panelX + Math.floor((panelW - labelW) / 2), pinY - 40, 3, MUTED);
            draw.text(pin, pinX, pinY, pinScale, INK);
            lineY = pinY + pinScale * 8 + 36;
        } else {
            lineY = panelY + 120;
            label = String((info && info.hint) || detail || 'czekam na iPhone');
            labelW = draw.textWidth(label, 3);
            draw.text(label, panelX + Math.floor((panelW - labelW) / 2), lineY, 3, HINT);
            lineY += 48;
        }
        lines = (info && info.lines) || [];
        for (i = 0; i < lines.length; i += 1) {
            draw.text(String(lines[i]).slice(0, 42), panelX + 48, lineY, 3, MUTED);
            lineY += 36;
            if (lineY > panelY + panelH - 40) {
                break;
            }
        }
    } else {
        if (detail) {
            draw.text(String(detail).slice(0, 48), lay.ox + 72, page.oy + 28, 3, MUTED);
        }
        lines = (info && info.lines) || [];
        lineY = page.oy + 64;
        for (i = 0; i < lines.length && i < 3; i += 1) {
            draw.text(String(lines[i]).slice(0, 48), lay.ox + 72, lineY, 3, HINT);
            lineY += 32;
        }
    }

    draw.pill(bubble.x - 4, bubble.y - 4, bubble.w + 8, bubble.h + 8, ACCENT_DIM);
    draw.pill(bubble.x, bubble.y, bubble.w, bubble.h, CARD_HI);
    draw.rect(bubble.x + 24, bubble.y + bubble.h - 12, bubble.w - 48, 4, ACCENT);
    draw.icon('stop', bubble.x + 28, bubble.y + 8, 3, ICON_ACCENT);
    titleW = draw.textWidth(title, 4);
    draw.text(title, bubble.x + Math.floor((bubble.w - titleW) / 2) + 20, bubble.y + 18, 4, INK);
    appendStreamChrome(draw, lay, page, info, placedWin);
    applyAirOverlay(draw, lay, air, version);
    if (caption && caption.on && caption.text) {
        draw.text(String(caption.text).slice(0, 24), caption.x | 0, caption.y | 0, caption.scale || 4, caption.color || ACCENT);
    }
    return {
        frame: message(FRAME, draw.bytes()),
        rects: draw.rects,
        layout: lay
    };
}

var RT_BG = 0x0B0F1EFF;
var RT_CARD = 0x1A2038FF;
var RT_PH = 0x232A46FF;
var RT_TEXT = 0xF1F3FFFF;
var RT_DIM = 0xA4ABC8FF;
var RT_PINK = 0xFF3F8EFF;
var RT_HEAD = 0x070A14FF;

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
        { name: 'yt-search', label: 'Search' },
        { name: 'yt-feed-home', label: 'Home' },
        { name: 'yt-feed-subs', label: 'Subs' },
        { name: 'yt-feed-wl', label: 'Watch later' }
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
    draw.rect(0, 0, width, height, RT_BG);
    draw.rect(0, 0, width, 56, RT_HEAD);
    draw.text('RideTube', 88, 16, 4, RT_TEXT);
    hits.push({ name: 'yt-ride-back', x: 16, y: 8, w: 56, h: 40 });
    draw.text('<', 24, 16, 4, RT_TEXT);
    if (mode !== 'player' && mode !== 'signin') {
        for (i = 0; i < rails.length; i += 1) {
            rail = rails[i];
            on = sel === rail.name || (rail.name === 'yt-feed-home' && mode === 'home') || (rail.name === 'yt-feed-subs' && mode === 'subs') || (rail.name === 'yt-feed-wl' && mode === 'wl') || (rail.name === 'yt-search' && mode === 'results');
            ry = 88 + i * 110;
            if (on) {
                draw.pill(18, ry, 112, 92, RT_CARD);
                draw.rect(18, ry + 30, 6, 32, RT_PINK);
            }
            draw.text(rail.label, 36, ry + 36, 3, on ? RT_TEXT : RT_DIM);
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
            draw.text('Sign in', cardX + side + 140, cardY + 90, 5, RT_TEXT);
            draw.text('Enter this code on your phone', cardX + side + 140, cardY + 150, 3, RT_DIM);
            draw.pill(cardX + side + 140, cardY + 190, 640, 90, RT_HEAD);
            draw.text(String(auth.code), cardX + side + 164, cardY + 214, 6, RT_TEXT);
            draw.text(String(url).replace(/^https:\/\/(www\.)?/, ''), cardX + side + 140, cardY + 320, 3, RT_DIM);
            draw.text('The account stays on the car', cardX + side + 140, cardY + 370, 3, RT_DIM);
        } else if (auth.state === 'error') {
            draw.text('Sign-in is not available', cardX + 80, cardY + 180, 4, RT_TEXT);
            draw.text(String(auth.msg || 'tap to try again').slice(0, 48), cardX + 80, cardY + 230, 3, RT_DIM);
            hits.push({ name: 'yt-login-retry', x: cardX + 80, y: cardY + 280, w: 360, h: 64 });
            draw.pill(cardX + 80, cardY + 280, 360, 64, RT_PINK);
            draw.text('Try again', cardX + 120, cardY + 298, 4, RT_HEAD);
        } else if (auth.state === 'unsupported') {
            draw.text('Signing in needs a newer service', cardX + 80, cardY + 200, 4, RT_TEXT);
        } else {
            draw.text('Getting a sign-in code...', cardX + 80, cardY + 200, 4, RT_TEXT);
        }
    } else if (mode === 'player') {
        play = ride.playing || {};
        draw.text(String(play.title || 'RideTube').slice(0, 36), 120, 100, 5, RT_TEXT);
        draw.text(String(play.channel || '').slice(0, 40), 120, 150, 3, RT_DIM);
        draw.text(play.state === 'playing' ? 'Pause' : 'Play', 700, 340, 4, RT_TEXT);
        hits.push({ name: 'yt-back10', x: 480, y: 300, w: 140, h: 80 });
        draw.pill(480, 300, 140, 80, RT_CARD);
        draw.text('-10', 510, 326, 4, RT_TEXT);
        hits.push({ name: 'yt-play', x: 660, y: 280, w: 180, h: 110 });
        draw.pill(660, 280, 180, 110, 0xFFFFFFFF);
        draw.text(play.state === 'playing' ? 'II' : '>', 720, 314, 5, RT_HEAD);
        hits.push({ name: 'yt-fwd10', x: 880, y: 300, w: 140, h: 80 });
        draw.pill(880, 300, 140, 80, RT_CARD);
        draw.text('+10', 910, 326, 4, RT_TEXT);
        draw.rect(160, 520, 1400, 8, RT_CARD);
        if (play.total > 0) {
            draw.rect(160, 520, Math.max(8, Math.round(1400 * play.elapsed / play.total)), 8, RT_PINK);
        }
        draw.text(play.state || '', 160, 560, 3, RT_DIM);
    } else {
        sections = ride.sections || [];
        ty = 88;
        n = 0;
        for (i = 0; i < sections.length && i < 2; i += 1) {
            sec = sections[i];
            draw.text(String(sec.title || '').slice(0, 28), 180, ty, 4, RT_TEXT);
            ty += 36;
            itemsRow = sec.items || [];
            for (col = 0; col < itemsRow.length && col < 4; col += 1) {
                tile = itemsRow[col];
                tx = 180 + col * 360;
                on = sel === 'yt-vid-' + n;
                draw.pill(tx, ty, 340, 190, on ? RT_PINK : RT_PH);
                draw.pill(tx + 8, ty + 8, 324, 120, RT_CARD);
                label = String(tile.duration || '');
                if (label) {
                    draw.pill(tx + 220, ty + 96, 96, 28, RT_HEAD);
                    draw.text(label, tx + 232, ty + 102, 3, RT_TEXT);
                }
                draw.text(String(tile.title || '').slice(0, 22), tx + 8, ty + 140, 3, RT_TEXT);
                draw.text(String(tile.hint || '').slice(0, 28), tx + 8, ty + 164, 2, RT_DIM);
                hits.push({ name: 'yt-vid-' + n, x: tx, y: ty, w: 340, h: 190 });
                n += 1;
            }
            if (!itemsRow.length) {
                draw.text(ride.status || 'Loading...', 180, ty + 20, 3, RT_DIM);
            }
            ty += 230;
        }
        if (!sections.length) {
            draw.text(ride.status || 'Loading...', 200, 280, 4, RT_TEXT);
        }
    }
    return {
        frame: message(FRAME, draw.bytes()),
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

function buildFrame(items, selected, width, height, detail, heading, version, streamInfo, boxPreview, caption, crumb, air, ride) {
    if (ride && ride.on) {
        return drawRideFrame(items, selected, width, height, ride);
    }
    var draw = new FrameBuilder();
    var lay;
    var i;
    var bubble;
    var title;
    var titleW;
    var ink;
    var hint;
    var iconName;
    var iconPx;
    var iconSide;
    var iconX;
    var iconY;
    var labelY;
    var focus;
    if (isStreamItems(items) || heading === 'Stream') {
        return buildStreamFrame(items, selected, width, height, detail, heading, version, streamInfo, caption, crumb, air);
    }
    var previewSpace = !!(boxPreview && ((boxPreview.frames && boxPreview.frames.length) || boxPreview.w || boxPreview.limitW));
    lay = menuLayout(items, selected, width, height, detail, heading, previewSpace);
    draw.clear(0);
    draw.rect(lay.ox, lay.oy, lay.boxW, lay.boxH, PAGE);
    draw.rect(lay.ox, lay.oy, 8, lay.boxH, ACCENT);
    draw.rect(lay.ox, lay.oy, lay.boxW, lay.headerH, PAGE_TOP);
    draw.rect(lay.ox + 28, lay.oy + lay.headerH - 3, 96, 3, ACCENT);
    if (crumb) {
        drawMenuHeader(draw, lay, crumb, crumb !== 'THEiPlay');
    } else if (lay.heading) {
        draw.text(lay.heading, lay.ox + 36, lay.oy + 22, 5, INK);
    } else {
        draw.text('THEiPlay', lay.ox + 36, lay.oy + 22, 5, ACCENT);
    }
    if (!air) {
        drawVersionMark(draw, lay, version);
    }
    for (i = 0; i < lay.bubbles.length; i += 1) {
        bubble = lay.bubbles[i];
        var itemIndex = bubble.index != null ? bubble.index : i;
        var item = items[itemIndex];
        title = String(item.title || '');
        hint = item.hint ? String(item.hint) : '';
        if (item.name === 'lang-toggle') {
            title = uiLang === 'en' ? 'Language' : 'Język';
            hint = uiLang === 'en' ? 'English' : 'polski';
        } else {
            title = tr(title);
            hint = tr(hint);
        }
        iconName = item.icon || 'play';
        iconPx = bubble.iconPx;
        iconSide = draw.iconSize(iconPx);
        focus = itemIndex === selected;
        var hot = !!item.armed;
        var edge = hot ? RED : ACCENT;
        draw.rect(bubble.x, bubble.y, bubble.w, bubble.h, hot ? RED_CARD : (focus ? CARD_HI : CARD));
        if (hot || focus) {
            draw.rect(bubble.x, bubble.y, bubble.w, 4, edge);
            draw.rect(bubble.x, bubble.y + bubble.h - 4, bubble.w, 4, edge);
            draw.rect(bubble.x, bubble.y, 4, bubble.h, edge);
            draw.rect(bubble.x + bubble.w - 4, bubble.y, 4, bubble.h, edge);
        }
        if (bubble.home) {
            iconX = bubble.x + Math.floor((bubble.w - iconSide) / 2);
            iconY = bubble.y + 64;
            draw.icon(iconName, iconX, iconY, iconPx, focus ? ICON_ACCENT : ICON_FG);
            titleW = draw.textWidth(title, bubble.scale);
            draw.text(
                title,
                bubble.x + Math.floor((bubble.w - titleW) / 2),
                bubble.y + 160,
                bubble.scale,
                focus ? INK : HINT
            );
            if (hint) {
                titleW = draw.textWidth(hint.slice(0, 22), 3);
                draw.text(
                    hint.slice(0, 22),
                    bubble.x + Math.floor((bubble.w - titleW) / 2),
                    bubble.y + 210,
                    3,
                    focus ? ACCENT : MUTED
                );
            }
        } else {
            iconX = bubble.x + 28;
            iconY = bubble.y + Math.floor((bubble.h - iconSide) / 2);
            draw.icon(iconName, iconX, iconY, iconPx, focus ? ICON_ACCENT : ICON_FG);
            labelY = hint ? bubble.y + 22 : bubble.y + Math.floor((bubble.h - 28) / 2);
            draw.text(title, bubble.x + 28 + iconSide + 22, labelY, bubble.scale, focus ? INK : HINT);
            if (hint) {
                draw.text(hint.slice(0, item.on ? 28 : 36), bubble.x + 28 + iconSide + 22, labelY + 34, 3, focus ? ACCENT : MUTED);
            }
            if (item.on) {
                var mark = 16;
                draw.rect(
                    bubble.x + bubble.w - mark - 22,
                    bubble.y + Math.floor((bubble.h - mark) / 2),
                    mark,
                    mark,
                    ACCENT
                );
            }
        }
    }
    if (lay.bubbles.length && !lay.bubbles[0].home) {
        var pinN = lay.pinned || 0;
        if (lay.first > pinN) {
            draw.text(tr('w gore'), lay.ox + lay.boxW - 280, lay.oy + 28, 3, MUTED);
        }
        if (lay.first + (lay.bubbles.length - pinN) < lay.count) {
            draw.text(tr('dalej'), lay.ox + lay.boxW - 160, lay.hintY, 3, MUTED);
        }
    }
    if (detail) {
        draw.text(detail.slice(0, 28), lay.ox + 36, lay.oy + lay.boxH - 58, 3, INK);
    } else {
        draw.text(tr('strzalki, potem wybierz'), lay.ox + 36, lay.oy + lay.boxH - 58, 3, MUTED);
    }
    var framesOn = !!(boxPreview && boxPreview.frames && boxPreview.frames.length);
    drawNav(draw, lay, framesOn, true);
    if (boxPreview && boxPreview.frames && boxPreview.frames.length) {
        drawScreenFrames(draw, lay, boxPreview, items[selected]);
    } else if (boxPreview && (heading === 'Okno' || heading === 'Pozycja' || heading === 'Środek' || heading === 'Zegary' || heading === 'HUD')) {
        drawBoxPreview(draw, lay, boxPreview, items[selected]);
    }
    if (caption && caption.on && caption.text) {
        draw.text(String(caption.text).slice(0, 24), caption.x | 0, caption.y | 0, caption.scale || 4, caption.color || ACCENT);
    }
    applyAirOverlay(draw, lay, air, version);
    return {
        frame: message(FRAME, draw.bytes()),
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
    var labelH = 22;
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
    var edge;
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
        edge = frame.focus ? ACCENT : LINE;
        draw.text(tr(String(frame.label || '')), sx, y, 3, frame.focus ? ACCENT : MUTED);
        draw.rect(sx - 3, sy - 3, stageW + 6, stageH + 6, edge);
        draw.rect(sx, sy, stageW, stageH, PAGE_TOP);
        draw.rect(wx, wy, ww, wh, frame.focus ? ACCENT_DIM : CARD_HI);
        draw.rect(wx, wy, ww, 3, frame.focus ? ACCENT : LINE);
        draw.rect(wx, wy + wh - 3, ww, 3, frame.focus ? ACCENT : LINE);
        draw.rect(wx, wy, 3, wh, frame.focus ? ACCENT : LINE);
        draw.rect(wx + ww - 3, wy, 3, wh, frame.focus ? ACCENT : LINE);
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
    draw.rect(x - 4, y - 4, stageW + 8, stageH + 8, LINE);
    draw.rect(x, y, stageW, stageH, PAGE_TOP);
    draw.rect(wx, wy, ww, wh, ACCENT_DIM);
    draw.rect(wx, wy, ww, Math.min(14, wh), ACCENT);
    caption = mode === 'move' ? 'pozycja' : (mode === 'size' ? 'wielkosc' : 'podglad');
    if (preview.label) {
        caption = String(preview.label) + '  ' + caption;
    }
    draw.text(caption, x, y + stageH + 18, 3, HINT);
    draw.text(String(preview.w || 0) + 'x' + String(preview.h || 0), x, y + stageH + 48, 3, MUTED);
    if (preview.sliders && preview.sliders.length) {
        sy = y + stageH + 78;
        for (si = 0; si < preview.sliders.length; si += 1) {
            row = preview.sliders[si];
            if (selectedItem && row.key) {
                row.on = selectedItem.name === row.key;
            }
            var hotSlider = !!(selectedItem && selectedItem.armed && row.key === selectedItem.name);
            lab = tr(String(row.label || ''));
            draw.text(lab, x, sy, 3, hotSlider ? RED : (row.on ? ACCENT : MUTED));
            drawSlider(draw, x + 130, sy, Math.max(80, stageW - 220), row.value | 0, row.min | 0, row.max | 0, hotSlider);
            draw.text(String(row.value | 0), x + stageW - 72, sy, 3, INK);
            sy += 36;
        }
    }
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
    function flushFrame() {
        if (!lastFrame || !sock || !shown) {
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
                flushFrame();
            }
        }, 250);
        if (frameHoldTimer.unref) {
            frameHoldTimer.unref();
        }
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

    function rebindVideo() {
        if (mirrorSent) {
            write(message(DROP_VIDEO, u32(1)));
            mirrorSent = false;
        }
        sendMirror(!!(streamInfo && streamInfo.video));
    }

    function paint() {
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
        }
        if (airState) {
            airState.yt = screenName === 'youtube' ? ytState : null;
            airState.whereOpen = whereOpen;
            airState.whereCursor = whereCursor;
            airState.movePos = movePos;
            airState.full = !!(airState.window && airState.window.w >= 1800 && airState.window.h >= 680);
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

    function useNav(which) {
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
                items[i].hint = String(text || '');
                if (!edit && !quiet) {
                    paint();
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
                items[i].title = String(text || '');
                if (!edit && !quiet) {
                    paint();
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
                items[i].icon = String(icon || 'play');
                if (!edit) {
                    paint();
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
                } else if (ytCursor === 0) {
                    choose('yt-pick-cluster');
                } else if (ytCursor === 1) {
                    choose('yt-pick-hud');
                } else {
                    choose('yt-pick-central');
                }
            }
            lastPush = push;
            if (step || push === 1) {
                paint();
            }
            return;
        }
        if (whereOpen && !edit) {
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
            if (step || push === 1) {
                paint();
            }
            return;
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
                if (hitsNav(tx, ty)) {
                    if (phase === 1) {
                        touchDown = { nav: hitsNav(tx, ty), x: tx, y: ty, hit: -1, origin: selected, t: Date.now(), dragged: false };
                    } else if (phase === 3 && touchDown && touchDown.nav && hitsNav(tx, ty) === touchDown.nav) {
                        useNav(touchDown.nav);
                        touchDown = null;
                    } else if (phase === 3) {
                        touchDown = null;
                    }
                    return;
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
                flushFrame();
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
                paint();
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
            streamInfo = next;
            if (!edit) {
                paint();
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
            if (ytState && !ytState.live) {
                ytOpen = false;
            }
            paint();
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
                next.window ? (next.window.x + ',' + next.window.y + ',' + next.window.w + ',' + next.window.h) : '',
                next.tune ? (next.tune.name + '/' + next.tune.tool + '/' + next.tune.axis + '/' + next.tune.x + '/' + next.tune.y + '/' + next.tune.w + '/' + next.tune.h + '/' + (next.tune.saved ? 1 : 0)) : ''
            ].join('|');
            if (key === airKey) {
                return;
            }
            airState = next;
            airKey = key;
            if (!edit) {
                paint();
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
    encoderStep: encoderStep,
    crumbFor: crumbFor,
    createMenuSurface: createMenuSurface,
    FONT: FONT
};
