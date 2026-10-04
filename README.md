# Leonies Lernwelt

Eine kleine Lern-App für Kinder im Grundschulalter, gemacht für das Tablet. Sie läuft
einfach im Browser – ohne Installation, ohne Konto, ohne Werbung.

Das erste Modul heißt **„Die Uhr“**: Leonie (8) lernt damit, die Zeigeruhr zu lesen.
Weitere Module folgen.

**Ausprobieren:** [lernwelt.nieda.de](https://lernwelt.nieda.de)

<p align="center">
  <img src="docs/screenshots/clock-question.png" alt="Die Uhr: große Zeigeruhr mit drei Antwortknöpfen" width="720">
</p>

## Die Idee

Die Uhr lesen ist für viele Kinder schwer: zwei Zeiger, zwölf Zahlen, sechzig Striche –
und dann heißt 3:30 auch noch „halb vier“. Die App übt das in kleinen Schritten und mit
vielen Wiederholungen statt mit Prüfungen:

- In der Mitte steht immer eine **große Zeigeruhr** mit den Zahlen 1 bis 12.
- Darunter gibt es **drei Antworten** zum Antippen. Eine davon stimmt.
- Wer richtig tippt, bekommt **Punkte**, sammelt **Sterne** und füllt seinen
  **Zuckerstangen-Balken** bis zum **Pokal**.
- Fehler kosten nichts. Die App erklärt in Ruhe, was die Zeiger zeigen, und bringt die
  Uhrzeit ein paar Aufgaben später noch einmal.

## So lernt man mit der App

### Sechs Stufen – von leicht nach schwer

| Stufe | Uhrzeiten | Punkte |
|:-:|---|:-:|
| 1 | volle Stunden – 3:00 | 10 |
| 2 | halbe Stunden – 3:30 | 15 |
| 3 | Viertelstunden – 3:15 und 3:45 | 20 |
| 4 | 3:10, 3:20, 3:40, 3:50 | 25 |
| 5 | Fünf-Minuten-Schritte – 3:05, 3:25, 3:35, 3:55 | 30 |
| 6 | einzelne Minuten – 3:07, 3:52 … | 40 |

Eine neue Stufe kommt erst, wenn die alte wirklich sitzt (sieben von acht richtig, mit
verschiedenen Uhrzeiten). Dann wird sie **sanft eingeblendet**: Zuerst zeigt die App
zwei Beispiele mit Erklärung, danach kommt die neue Stufe nur ab und zu dran und
wird erst mit wachsender Sicherheit häufiger. Zwischendurch kommen immer wieder leichte
Uhrzeiten – „Das kannst du schon!“.

### Uhrzeiten in Worten

Sobald eine Stufe sicher sitzt (auch noch in einer späteren Übungsrunde), kommen
dieselben Uhrzeiten auch **in Worten**: „Viertel nach zehn“, „halb vier“, „zehn vor
drei“. Diese Aufgaben sind eingestreut und bringen 5 Bonuspunkte. Ein Lautsprecher-Knopf
liest die Antworten vor.

<p align="center">
  <img src="docs/screenshots/clock-text.png" alt="Uhrzeiten in Worten: drei Antworten wie 'Fünfundzwanzig vor zehn'" width="360">
  &nbsp;
  <img src="docs/screenshots/trophy.png" alt="Pokal am Ende eines Durchgangs" width="360">
</p>

### Durchgänge, Pokale, Sterne und Abzeichen

- Ein **Durchgang** endet, wenn der Punkte-Balken voll ist. Das Ziel passt sich dem
  Können an: am Anfang 100 Punkte, später mehr – so dauert ein Durchgang immer etwa
  zehn richtige Antworten. Am Ende gibt es **immer einen Pokal**, egal wie viele Fehler
  dabei waren.
- Für je fünf richtige Antworten gibt es einen **Stern**.
- Wenn eine Stufe sicher sitzt, gibt es ein **Abzeichen**, z. B. „Halbe Stunden erkennst
  du schon sicher.“
- Drei richtige Antworten hintereinander werden kurz gefeiert.

### Hilfe, wenn es hakt

- Der **?-Knopf** blendet Hilfen an der Uhr ein: Minutenzahlen außen (05, 10, 15 …),
  farbige Viertel und den Bereich, in dem der Stundenzeiger steht. Mit Hilfe gelöste
  Aufgaben bringen halbe Punkte.
- Nach einem Fehler erklärt die App genau **einen** Punkt, passend zum Fehler – zum
  Beispiel: „Der kurze Zeiger ist noch nicht bei der 4. Die Stunde ist noch 3.“
- Bei zwei Fehlern hintereinander kommt ein Beispiel und eine leichte Aufgabe, nach drei
  Fehlern ein freundliches Pausenangebot.
- Die falschen Antworten sind keine Zufallszahlen, sondern typische Verwechslungen
  (Stunde zu früh gelesen, Viertel nach / Viertel vor vertauscht …). So lernt das Kind
  genau das, was oft schiefgeht.

<p align="center">
  <img src="docs/screenshots/clock-hint.png" alt="Erklärung nach einer falschen Antwort, mit Minutenzahlen und markiertem Zeigerweg" width="720">
</p>

### Für Eltern

- Auf der **Startseite** sieht man alle Pokale, Sterne und Abzeichen.
- Das **Zahnrad** im Uhr-Modul öffnet den Elternbereich: Stand jeder Stufe, Töne an/aus
  und „Fortschritt löschen“ (drei Sekunden gedrückt halten).
- Der Fortschritt bleibt **nur auf dem Gerät** gespeichert (im Browser). Es werden keine
  Daten verschickt. Wer im Browser die Websitedaten löscht, fängt wieder von vorne an.
- Tipp: Die Seite über das Browser-Menü „Zum Startbildschirm hinzufügen“ – dann startet sie
  wie eine App im Vollbild.
- Tipp: Kurze Übungsrunden von fünf bis zehn Minuten wirken besser als lange.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Startseite mit Pokalen, Sternen, Abzeichen und dem Modul 'Die Uhr'" width="720">
</p>

## Ideen für später

- Zeiger selbst stellen: die Uhrzeit wird genannt, das Kind zieht den Minutenzeiger.
- „Fünf vor halb vier“ und andere regionale Formulierungen als Zusatzlektion.
- Weitere Module neben der Uhr.

---

## Technik

Für alle, die mitbauen möchten.

- **Vite + TypeScript**, kein Framework. Die Uhr ist ein SVG.
- Die Lernlogik (Stufen, Freischaltung, Anteile, Wiederholungen, Punkte) steckt in
  [`src/modules/clock/engine.ts`](src/modules/clock/engine.ts) und ist mit **Vitest**
  getestet.
- Fortschritt liegt im `localStorage` des Browsers.
- Die Schrift [Fredoka](https://fonts.google.com/specimen/Fredoka) ist eingebettet
  (kein Abruf bei Google).
- Neue Module implementieren `LearningModule` aus
  [`src/modules/types.ts`](src/modules/types.ts) und werden in `src/main.ts` eingetragen.

```bash
npm install
npm run dev        # http://localhost:5173, im WLAN auch vom Tablet erreichbar
npm test           # Unit-Tests
npm run build      # statische Seite in dist/
```

Screenshots für diese README neu erzeugen (Dev-Server muss laufen; nutzt Playwright):

```bash
npx playwright install chromium   # einmalig
node scripts/screenshots.mjs http://localhost:5173
```

Der Name der App und des Kindes steht in [`src/config.ts`](src/config.ts).
Das Deployment (Docker + Terraform) beschreibt [`DEPLOY.md`](DEPLOY.md).

## Lizenz

[MIT](LICENSE)
