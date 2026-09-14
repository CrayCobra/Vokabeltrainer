# CLAUDE.md — Vokabeltrainer

Diese Datei gehört ins Repo-Wurzelverzeichnis. Sie regelt die Zusammenarbeit; die fachliche Wahrheit steht in `vokabel-app-entwurf.md` im selben Verzeichnis. Bei Widersprüchen gilt der Entwurf, und der Widerspruch wird gemeldet statt stillschweigend aufgelöst.

## Zusammenarbeit

Antworte auf Deutsch, sachlich, ohne Aufzählungszeichen und ohne Zusammenfassung des gerade Geschriebenen. Triff keine Annahmen: fehlt eine Angabe, frag nach. Gibt es mehrere sinnvolle Lösungswege, hole kurz eine Entscheidung ein, statt direkt den wahrscheinlichsten umzusetzen. Widersprich, wenn eine Annahme im Auftrag nicht stimmt.

Bevor du Dateien änderst, löschst oder Operationen mit Potenzial für Datenverlust oder Rechteausweitung ausführst, die nicht ausdrücklich im Auftrag stehen, frag nach — auch im automatischen Modus. Das gilt besonders für `git`-Operationen, die Historie verändern, und für alles außerhalb des Projektverzeichnisses.

Entwicklungsrechner ist Windows; wähle Befehle und Skripte entsprechend und nimm nicht standardmäßig Bash an. Sag Bescheid, falls das für dieses Projekt nicht stimmt.

## Harte technische Regeln

Keine externen Laufzeitabhängigkeiten. Kein Framework, kein CDN, keine Webschrift, keine Icon-Bibliothek, kein Analyse- oder Fehlerdienst. Die App darf zur Laufzeit keinen einzigen Netzwerkaufruf machen; das ist ein Prüfkriterium, nicht eine Absichtserklärung. Symbole sind eigene, im Dokument eingebettete SVG.

Umgesetzt wird in modernem Vanilla-JavaScript ohne Transpilierung, das in aktuellen Versionen von Chrome, Edge, Firefox und Safari läuft, einschließlich iPadOS und Android. Das Ergebnis muss vollständig funktionieren, wenn die Datei über `file://` geöffnet wird; alles, was das verbietet, gehört ausschließlich in die Pages-Variante.

Es gibt keinen Build-Schritt mit fremden Werkzeugen. Ein eigenes Node-Skript ohne Abhängigkeiten fügt die Quellen zusammen und erzeugt die beiden Artefakte.

Primärspeicher ist IndexedDB. `localStorage` ist nur für Kleinigkeiten wie die zuletzt gewählte Oberflächensprache erlaubt und niemals für Karten oder Lernstand.

## Struktur und Bau

Die Quellen liegen getrennt unter `src/` (mindestens `index.html`, `app.css`, Module für Datenmodell, Speicher, Lernlogik, Ansichten, Übersetzungen). `build.mjs` erzeugt `dist/app.html` als eigenständige Einzeldatei mit allem inline und `dist/pages/` mit `index.html`, `sw.js`, `manifest.webmanifest` und Icons. Beide Artefakte stammen aus derselben Quelle und dürfen sich nur in Installierbarkeit und Offline-Cache unterscheiden. Die Versionsnummer wird beim Bauen eingesetzt und ist in der App sichtbar.

Der Service Worker cacht ausschließlich eigene Dateien und wird bei neuer Version sauber ersetzt, ohne dass Nutzerdaten berührt werden.

## Datenformat

Ein einziges JSON-Dokument für lokale Speicherung, Export und späteren Sync. Dateiendung `.vok.json`. Aufbau:

```json
{
  "schema": 1,
  "meta": { "app": "1.0.0", "created": "2026-09-14T10:00:00Z", "lastBackup": null },
  "profile": { "name": "", "uiLang": "de" },
  "deck": { "name": "Englisch 5. Klasse", "langA": "de", "langB": "en" },
  "cards": [
    { "id": "k7f2a1", "a": "Haus", "b": "house", "box": 1, "streak": 0,
      "repair": false, "marked": false, "seen": 0, "correct": 0, "wrong": 0,
      "lastSeen": null, "changed": "2026-09-14T10:00:00Z" }
  ],
  "days": [ { "date": "2026-09-14", "correct": 24, "wrong": 6, "seconds": 480 } ],
  "sessions": [ { "date": "2026-09-14T18:12:00Z", "mode": "test", "order": "random",
                  "direction": "ab", "goal": { "type": "count", "value": 30 },
                  "correct": 24, "wrong": 6, "seconds": 480 } ]
}
```

`schema` wird bei jedem Formatwechsel erhöht; der Import migriert ältere Stände und verweigert neuere mit klarer Meldung. Karten-IDs sind kurze Zufallszeichenketten, keine laufenden Nummern.

## Randfälle, die bewusst zu behandeln sind

Tagesgrenze für Serie und Heatmap ist Mitternacht in der lokalen Zeitzone des Geräts; eine Sitzung, die über Mitternacht läuft, zählt für den Tag, an dem sie begonnen hat. Die Werte in `days` werden beim Schreiben aus dem lokalen Datum gebildet, nicht aus UTC.

Leerer Stapel, Stapel mit einer einzigen Karte, Karte mit leerer Rückseite, sehr lange Texte, die nicht auf den Bildschirm passen, Import einer Datei mit unbekanntem oder beschädigtem Inhalt, doppelte Vorderseiten beim Import, überschrittenes Speicherkontingent des Browsers und der Fall, dass der Browser den Speicher geräumt hat und die App leer startet. Der letzte Fall ist der wichtigste: dann muss die App nicht nur leer, sondern erklärend leer sein und aktiv anbieten, eine Sicherungsdatei zu laden.

## Inkremente und Abnahme

Inkrement 1 ist fertig, wenn Karten per Schnellerfassung und per CSV angelegt, bearbeitet, markiert und gelöscht werden können, der Stand einen Neustart des Browsers übersteht und ein Export-Import-Durchlauf ein bitgleiches Dokument ergibt.

Inkrement 2 ist fertig, wenn eine Lernsitzung in allen drei Reihenfolgen und beiden Richtungen läuft, die Kastenregeln einschließlich Reparaturkiste und Einstreuverhältnis nachweisbar greifen und eine Bewertung innerhalb von drei Sekunden korrigierbar ist.

Inkrement 3 ist fertig, wenn die drei Zielarten funktionieren, Zeitziele pausierbar und verlängerbar sind und das Ergebnis eine Übungsrunde mit den falschen Karten startet.

Inkrement 4 ist fertig, wenn Serie mit Wochenjoker, längste Serie, Heatmap und Kastenverteilung aus echten Daten stimmen, auch über Monatsgrenzen hinweg.

Inkrement 5 ist fertig, wenn kein sichtbarer Text mehr fest im Code steht und alle fünf Sprachen vollständig sind.

Inkrement 6 liefert beide Artefakte samt Installierbarkeit und Offline-Betrieb.

## Prüfliste vor jedem „fertig“

Textkontrast mindestens 4,5 zu 1, interaktive Flächen mindestens 44 Pixel, vollständige Bedienbarkeit per Tastatur mit sichtbarem Fokus, jede Wischgeste hat eine Tippalternative, `prefers-reduced-motion` wird beachtet, Darstellung bei 320 Pixel Breite und bei 200 Prozent Zoom bleibt benutzbar, in den Entwicklerwerkzeugen erscheint zur Laufzeit kein einziger Netzwerkaufruf, und `dist/app.html` läuft nach dem Herunterladen ohne Internetverbindung.

## Nicht bauen

Kein Sync-Adapter, keine Konten, keine Anmeldung, keine Rangliste, keine Punktewährung, keine Töne, keine Vibration, keine mehreren Profile, keine kalenderbasierte Fälligkeit, keine Tippeingabe mit automatischer Prüfung. Diese Punkte sind bewusst ausgeschlossen; wenn dir einer davon sinnvoll erscheint, schlag ihn vor, statt ihn einzubauen.

## Offen, vor Inkrement 3 beziehungsweise 5 zu klären

Ob einzelne Testergebnisse dauerhaft als Historie sichtbar bleiben oder nur in Serie und Heatmap einfließen. Das lateinische Begriffsglossar für die Oberfläche. Nach wie vielen Sitzungen oder Tagen die Sicherungserinnerung auffällig wird.
