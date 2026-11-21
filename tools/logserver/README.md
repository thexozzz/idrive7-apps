# Serwer logów THEiPlay

Auto wysyła logi narzędzi THEiPlay na ten serwer, gdy tylko ma wyjście do sieci Tailscale; czyta się je później, także
gdy auto jest wyłączone. Jeden plik, bez zależności, Node 12 lub nowszy.

## Uruchomienie (na komputerze właściciela, 100.89.159.94)

```
node server.js --port 12346 --dir ./logs
```

Bez `--host` serwer słucha na adresie Tailscale tej maszyny (100.64.0.0/10), a gdy go nie ma – tylko na 127.0.0.1.
Nie ma hasła: kto dosięgnie portu, może czytać i dopisywać logi. Zostaw go wewnątrz sieci Tailscale.

## Co przychodzi

Pliki `logs/<nazwa jednostki>/`: `audiod.log` (dźwięk), `browserd.log` (przeglądarka; zawiera adresy otwieranych stron),
`inputd.log`, `app-start.log` (aplikacja), `session-input.log`. Nic z systemu BMW.

## Czytanie

- `http://100.89.159.94:12346/` – lista plików z rozmiarem i czasem ostatniej zmiany
- `http://100.89.159.94:12346/get/<jednostka>/audiod.log?tail=200000` – koniec pliku (bez `tail`: cały)

## Po stronie auta

`g21-browser` 0.1.59 (`g21-logship.js`): co 30 s wysyła to, czego jeszcze nie wysłał; serwer nieosiągalny niczego nie
gubi. Wyłącznik: Ustawienia > Zaawansowane > „Wysyłanie logów". Inny serwer: `"logServer": "host:port"` w
`/var/opt/g21-browser/state/settings.json`.
