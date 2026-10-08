# Changelog

Alle nennenswerten Änderungen an Leonies Lernwelt. Das Format folgt
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Seit Oktober 2026 tragen
Releases eine Kalenderversion `YYYY.MM.MICRO` (siehe [DEPLOY.md](DEPLOY.md)) und den
Git-Tag `v<Version>`; ältere Einträge sind nach Datum gegliedert.

## 2026.10.4 – 2026-10-08

### Behoben

- **Doppeltipp auf „Weiter“ beantwortet nicht mehr die nächste Aufgabe:** Verschwindet
  „Weiter“, rücken die neuen Antworten (oder „Fertig“) an seine Stelle. Ein zweiter Tipp
  traf sie und zählte als Fehler, ohne dass die Aufgabe zu sehen war. Neue Antworten
  reagieren jetzt erst nach einem halben Augenblick (0,5 s) – in allen Bereichen.

## 2026.10.3 – 2026-10-07

### Hinzugefügt

- **Deutsche Erklärungen mit eigener Stimme:** Die geführten Beispiele, die Hilfe und die
  festen Sätze kommen als Aufnahme vom Server (männliche Lehrer-Stimme, erzeugt mit
  Gemini TTS) statt von der Sprachausgabe des Geräts. Die rund 320 Sätze kommen in den
  nächsten Tagen nach und nach dazu; was (noch) nicht aufgenommen ist, etwa
  Fehlererklärungen, spricht wie bisher das Gerät.

### Geändert

- **Feste Beispiele:** Die geführten Beispiele kommen aus einer festen Auswahl je Stufe
  (z. B. der Hund, die Katze, das Auto; bei der Uhr 3:00, 7:00, 12:00) statt zufällig –
  so lassen sie sich vorab aufnehmen. Geübt wird weiter mit allen Wörtern und Uhrzeiten.
- **Uhrzeiten werden eindeutig vorgelesen:** „7:30“ als „7 Uhr 30“ statt nach Gutdünken der
  Stimme („halb sieben“).
- **Hilfe beim Zeigerstellen** nennt die Zielzeit nur auf dem Bildschirm: „Schau auf die
  Zielzeit. Zieh zuerst den langen orangen Zeiger …“.

## 2026.10.2 – 2026-10-07

### Geändert

- **Beispiele ohne „Schau mal“:** Die Erklärung endet mit „Die richtige Antwort ist …“ –
  dann leuchtet die Antwort auf. Ein falscher Tipp danach wird vorgelesen: „Der leuchtende
  Knopf ist richtig.“
- **Fehler in normalen Aufgaben werden nicht mehr von selbst vorgelesen** (wie vor
  2026.10.1); der Lautsprecher liest sie auf Wunsch vor. „Weiter“ wartet weiter kurz.

## 2026.10.1 – 2026-10-07

### Geändert

- **Erst zuhören, dann tippen:** Geführte Beispiele werden sofort vorgelesen. Die
  Antworten reagieren erst nach einem kurzen Moment, und der richtige Knopf leuchtet
  erst, wenn die Erklärung vorgelesen ist (ohne Ton nach einer kurzen Lesezeit). Ein
  falscher Tipp vorher zählt nicht als Fehler. Nach einem Fehler und bei der Hilfe wird
  die Erklärung ebenfalls vorgelesen; „Weiter“ ist nach einem kurzen Moment aktiv.
- **Vorlesen stoppen:** Während etwas vorgelesen wird, stoppt der Lautsprecher-Knopf das
  Vorlesen.
- **Versionen:** Releases heißen jetzt `Jahr.Monat.Zähler` und werden beim Deploy getaggt.

## 2026-10-05

### Hinzugefügt

- **Englische Wörter mit eigener Stimme:** Die Wörter in „Farben, Zahlen, Tiere“ kommen
  als Aufnahme vom Server (britische Lehrerinnen-Stimme, erzeugt mit Gemini TTS) statt
  aus der oft blechernen Sprachausgabe des Geräts. Ohne Verbindung spricht wie bisher das
  Gerät.

- **Englisch: „Farben, Zahlen, Tiere“** – das erste Englisch-Modul. Sieben kleine Stufen:
  Farben, Zahlen 1–5, Haustiere, Zahlen 6–10, Zootiere, weitere Farben mit 11 und 12,
  Zahlen 13–20. Wort hören (britisches Englisch) und das Bild antippen; bekannte Wörter
  auch lesen oder zum Bild das Wort wählen. Neue Wörter kommen zu zweit oder dritt mit
  einem Beispiel. Ohne englische Stimme auf dem Gerät werden die Wörter gelesen.

- **Deutsch: „Der, die, das“** – das erste Deutsch-Modul, nach den Schulbuchseiten zu
  bestimmtem und unbestimmtem Artikel. Vier Stufen: „der, die oder das?“, „ein oder
  eine?“ (anfangs mit „der Apfel“ als Brücke), „Nomen entdecken“ (einzelne Wörter, später
  im Satz) und „Kennen wir es schon?“ (Da ist ein Ball. Der Ball ist schön.). Wörter mit
  Bild, Fehler ohne Punktabzug, ein Pokal nach zehn Aufgaben, Sterne, Abzeichen und
  Wochenpunkte wie bei der Uhr.

### Geändert

- **Die Uhr sieht erst fertig aus, wenn sie es ist:** Die Modulkarte zählt alle 35
  Lernziele der Uhr statt nur der sechs Stufen beim Ablesen („8 von 35 Lernzielen
  sicher“); „Sicher gelernt“ erscheint erst bei allen. Je Übungsart ein Lolly, der sich
  wie ein Uhrzeiger füllt, und darunter das nächste Ziel („Zeiger stellen – halbe
  Stunden“). Eine ganz sichere Übungsart wird nach dem Durchgang eigens genannt. Deutsch
  und Englisch zeigen ebenso „Lernziele“ und das nächste Ziel. Abzeichen, Sterne und
  Pokale bleiben, wie sie sind.

- **Mehr Abwechslung in „Kennen wir es schon?“:** viele verschiedene Sätze über ein Bild,
  der Artikel mal am Satzanfang, mal mitten im Satz. In jeder dritten Geschichte kommt im
  zweiten Satz etwas Neues dazu („Eine Katze ist auch auf dem Bild.“) – die Stelle der
  Lücke verrät die Lösung nicht mehr. Jeder Satz zeigt das Bild seiner Sache.
- Nach einer richtigen Antwort wartet die nächste Aufgabe, bis das Vorlesen fertig ist –
  die Erklärung wird nicht mehr mittendrin abgeschnitten (Uhr und Deutsch).
- Die Ziele eines Moduls zeigen die Süßigkeit seines Bereichs (in Mathe Lollies statt
  Bonbons), und jedes Abzeichen in der Liste trägt die Süßigkeit seines Bereichs statt
  der Medaille.

## 2026-10-04

### Hinzugefügt

- **Impressum und Datenschutzhinweis** als eigene Seiten, verlinkt bei der Anmeldung und
  unten auf der Übersicht; lesbar ohne Anmeldung.
- **Profil löschen:** auf der Übersicht unten, mit PIN bestätigt. Löscht Profil,
  Spielstand und Bestenlisten-Eintrag sofort auf dem Server und auf dem Gerät.
- Beim Anlegen eines Profils rät ein Hinweis zu einem Spitznamen, weil der Name in der
  Bestenliste für alle mit Profil sichtbar ist.

### Geändert

- Der Webserver speichert keine Zugriffsprotokolle mit IP-Adressen mehr. Die Zähler gegen
  PIN-Durchprobieren verwerfen IP-Adressen spätestens 70 Minuten nach dem letzten
  Versuch.

- **Bestenliste dieser Woche** auf dem Dashboard unter den Lernbereichen (nur mit
  Profil): Platz 1 bis 3 mit Pokalen in Gold, Silber und Bronze, darunter der eigene
  Platz. Es zählen die Punkte der laufenden Woche; montags beginnt die Liste neu. Bei
  Gleichstand teilen sich Profile einen Platz. Der Server zählt die Punkte selbst, so
  kann ein Gerät mit veraltetem Spielstand sie nicht mehr zurücksetzen.
- **Anmeldung:** Ist der Name beim Anmelden noch nicht vergeben, wechselt die App
  automatisch zu „Profil anlegen“. Die eben eingegebene PIN zählt als erste Eingabe, die
  zweite PIN-Eingabe legt das Profil direkt an.
- **Die Uhr:** Zeiger nach 24-Stunden-Zeiten stellen („Stelle die Uhr auf 21:30“) und die
  Uhrzeit mit Tageszeit eintippen („Es ist Abend.“ → 21:30).
- **Die Uhr:** Zeiger stellen (aus „12:30“ oder aus Worten), Uhrzeit auf großem Tastenfeld
  eintippen, Vormittag, Abend, Mittag und Mitternacht mit Bildern, „fünf vor halb“ als
  Zusatzlektion und ab und zu „erst sagen, dann aufdecken“.
- **Die Uhr:** Nachmittagszeiten mit dem Hinweis „Es ist Nachmittag“, vorgelesen.
- Profile mit Name und vierstelliger PIN: Der Spielstand liegt auf dem Server und ist auf
  jedem Gerät da; Spielen ohne Anmeldung nur auf diesem Gerät bleibt möglich.
- Installierbare App (PWA): startet vom Home-Bildschirm im Vollbild und funktioniert
  offline. Neue Versionen werden automatisch übernommen, nie mitten in einer Übung.
- Versionsanzeige auf dem Dashboard.
- Lernbereiche als Süßigkeiten: Dashboard → Lernbereich → Modul, mit einem
  „Hier weiter“-Vorschlag. Mathe enthält die Uhr; Deutsch, Musik, HSU und Englisch folgen.
- Lernfortschritt über Meisterschaftspunkte statt über Tage, mit kurzem Aufwärmen auf
  schwächeren Stufen zu Beginn jeder Sitzung.
- Layout für Handys und Tablets im Hoch- und Querformat.
- Erstes Modul **„Die Uhr“**: Zeigeruhr lesen in Stufen mit schrittweiser Einführung,
  Wiederholungen, passenden Ablenkern und deutschen Uhrzeit-Formulierungen; Runden mit
  Pokalen und Abzeichen.

### Geändert

- **Die Uhr:** Nach einer falschen Antwort ist die angetippte Antwort rot mit ✗, die
  anderen falschen Antworten sind ausgegraut, die richtige bleibt grün mit ✓. Nach einer
  richtigen Antwort sind die anderen Antworten ebenfalls ausgegraut.
- **Die Uhr:** Bei vollen Stunden nennt die Aufgabe zum Zeigerstellen nur den
  Stundenzeiger; der Minutenzeiger steht schon auf der 12.
- Der Server meldet beim Anmelden einen unbekannten Namen jetzt eigens, statt wie bei
  einer falschen PIN zu antworten. Solche Versuche zählen weiter gegen das Limit pro
  IP-Adresse.
- Titel, Begrüßung und Pokal-Dialog nennen das angemeldete Profil („Patricks Lernwelt“,
  „Hallo Patrick!“). Ohne Profil heißt die App neutral „Meine Lernwelt“.
- Neuer Name: Leonies Lernwelt unter [lernwelt.nieda.de](https://lernwelt.nieda.de).

### Behoben

- Auf schmalen Handys im Hochformat sind die Karten auf dem Dashboard und in den
  Lernbereichen nicht mehr breiter als der Bildschirm; die Seite lässt sich nicht mehr
  seitlich verschieben.
- Ungespeicherte Änderungen bleiben bei einem ungültigen Gerätetoken erhalten; veraltete
  Serverdaten werden nicht mehr übernommen.
- **Die Uhr:** Getippte Ziffern werden wie auf einer Digitaluhr gelesen: drei Ziffern als
  H:MM („100“ → 1:00), vier als HH:MM.
- **Die Uhr:** Vorlesen, offene Dialoge und ausgeblendete Tabs zählen nicht mehr zur
  Antwortzeit für den Schnelligkeitsbonus.
- PIN-Sperre und Profil-Obergrenze halten auch bei parallelen Anfragen.
- Dialoge überstehen Escape und die Android-Zurück-Taste.
- Beim Deploy antwortet die Seite nur noch etwa 2 statt 30 Sekunden mit 404.
