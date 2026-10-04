# Changelog

Alle nennenswerten Änderungen an Leonies Lernwelt. Das Format folgt
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Releases tragen keinen
Versionsnamen, sondern den Zeitstempel ihres Deploys (siehe [DEPLOY.md](DEPLOY.md));
deshalb ist dieses Changelog nach Datum gegliedert.

## 2026-10-04

### Hinzugefügt

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
