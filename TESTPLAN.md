# Testplan

Automatisierte Regressionstests laufen mit Node ohne externe Abhängigkeiten:

```
npm test          # node --test test/*.test.mjs
npm run build      # erzeugt dist/app.html und dist/pages/
```

`build.mjs` prüft beim Bauen selbst, dass keine `import`/`export`-Reste im gebündelten
Skript übrig bleiben; `test/build.test.mjs` wiederholt diese Prüfung unabhängig und
kontrolliert zusätzlich, dass keine Netzwerkadresse im Artefakt steht und die
Versionsnummer eingesetzt wurde.

## Inkrement 1 – automatisiert abgedeckt

| Datei | Prüft |
|---|---|
| `test/model.test.mjs` | Kartenerzeugung, Bearbeiten, Löschen mit Wiederherstellung, Validierung beschädigter Dokumente, Schema-Migration/-Ablehnung, Zusammenführen nach Änderungsstempel, Erkennung doppelter Vorderseiten |
| `test/capture.test.mjs` | Schnellerfassung: Alternierung, ignorierte Leerzeilen, Tabulator-Zeilen, fehlende Rückseite wird als Warnung gemeldet statt eine Karte zu erzeugen |
| `test/csv.test.mjs` | Kodierungserkennung (UTF-8-BOM, Rückfall auf Windows-1252), Trennzeichenerkennung (Semikolon/Komma/Tab), Parser für Anführungszeichen/eingebettete Trennzeichen/Zeilenumbrüche, Überspringen von Zeilen ohne Vorderseite |
| `test/fileio.test.mjs` | **Abnahmekriterium „Export-Import-Durchlauf ergibt ein bitgleiches Dokument“**, Ablehnung beschädigter/unbekannter Dateien mit klarer Meldung, stabiler Dateiname |
| `test/storage.test.mjs` | Speicherschicht-Logik (Erststart vs. geräumter Speicher) über ein Speicher-Double; die echte IndexedDB-Anbindung läuft nur im Browser (siehe manuelle Prüfung unten) |

## Inkrement 2 – automatisiert abgedeckt

| Datei | Prüft |
|---|---|
| `test/model.test.mjs` | `applyLearningResult`: Kastenanstieg bis 5, Rücksetzung und Reparaturkiste bei Fehler, Kasten bleibt während der Reparatur eingefroren, Austritt erst nach vier richtigen in Folge mit gezieltem Sprung nach Kasten 2, ein Fehler in der Reparaturkiste setzt den Zähler zurück; `localDateIso` und `recordSession` (Buchung auf den lokalen Starttag, Bündelung mehrerer Sitzungen desselben Tages) |
| `test/learn.test.mjs` | `buildQueue`: Reihenfolgen (zufällig/Eingabereihenfolge/nach Kasten), Einstreuverhältnis 2:3 zwischen Reparatur- und Regulärkarten, Filter „nur markiert“; `createSessionQueue`: eine falsch beantwortete Karte erscheint frühestens nach drei weiteren Karten wieder, Sonderfall sehr kurzer Restwarteschlange, `remove` für die Korrekturfunktion |
| `test/bufferedwriter.test.mjs` | Bündelung schnell aufeinanderfolgender Schreibvorgänge zu einem verzögerten Aufruf, `flush()` erzwingt sofortiges Schreiben und verwirft den Timer |

Die Lernansicht selbst (`renderLearnView` in `src/js/views.js`) wurde wie in Inkrement 1 per
Chrome DevTools Protocol gegen `dist/app.html` gefahren: Sitzungseinrichtung inklusive
deaktiviertem Start bei leerem Filter, Umdrehen und Bewerten per Maus **und** Tastatur
(Leertaste, Pfeiltasten), die Korrektur innerhalb des 3-Sekunden-Fensters (inklusive Umbuchung
von Zähler und Wiedervorlage), vorzeitiges Beenden einer Sitzung, sowie der komplette Ablauf bis
zum Abschlussbildschirm mit anschließender Prüfung des tatsächlichen IndexedDB-Inhalts (Kasten-,
Reparatur- und Zählerstände sowie der geschriebene `sessions`-/`days`-Eintrag). Dabei zeigte sich
ein echter Fehler: `renderShell` baute bei jedem `ctx.render()` eine neue `#toast-region`, wodurch
ein gerade angezeigter Toast (insbesondere die Korrekturmeldung nach jeder Bewertung) sofort
wieder verschwand; behoben, indem die Toast-Region einmalig außerhalb der neu aufgebauten
Ansicht in `app.js` erzeugt wird. Anschließend außerdem die Toast-Position von unten nach oben
verschoben, da unten die Bedienelemente der Lernkarte im Daumenbereich liegen.

## Inkrement 3 – automatisiert abgedeckt

| Datei | Prüft |
|---|---|
| `test/testgoal.test.mjs` | `isGoalReached`/`describeGoalProgress` für alle drei Zielarten: Kartenanzahl (richtige plus falsche Antworten), Dauer (aktive Millisekunden gegen Sekundenziel), Trefferquote (Mindestanzahl UND Quote müssen gleichzeitig erfüllt sein); `formatDuration`, `describeGoalLabel` |
| `test/learn.test.mjs` | `enqueueMany` (Wiederholung des Stapels, wenn die Warteschlange leer, das Ziel aber noch nicht erreicht ist) |

Der Testmodus teilt sich die Kastenlogik, die Warteschlange und das Korrekturfenster mit dem
Lernmodus (Inkrement 2) über gemeinsam genutzten Code (`applyLearningResult`, `buildQueue`,
`createSessionQueue`, das per Chrome DevTools Protocol geprüfte `buildFlipCard`-Widget in
`views.js`) und wird dadurch bereits von dessen Tests mitabgedeckt. Zusätzlich per DevTools
Protocol gegen `dist/app.html` gefahren: Umschalten zwischen den drei Zielarten (passende
Zusatzfelder ein-/ausgeblendet), ein Test mit einem Kartenanzahl-Ziel über der Stapelgröße (der
Stapel wiederholt sich nachweisbar, Fortschritt zählt korrekt weiter, „Ziel erreicht ✓“
erscheint erst bei Erreichen), der Ergebnisbildschirm (Ziel, Trefferquote, Dauer, Liste falscher
Karten), „Übungsrunde mit falschen Karten starten“ (wechselt korrekt in eine neue Lernsitzung
mit genau dieser Kartenmenge), ein Zeitziel mit Pause (Fortschrittsanzeige friert ein, Karte wird
ausgeblendet), Verlängern (+2 Minuten erhöht das sichtbare Ziel sofort) und die tatsächliche
Sitzungsdauer in IndexedDB (Pausenzeit korrekt ausgeklammert), sowie das Wegnavigieren mitten in
einer Testsitzung (Sitzung wird mit dem bisherigen Stand protokolliert, ein erneuter Aufruf der
Ansicht zeigt eine frische Einrichtung statt des alten Standes).

Dabei zeigten sich zwei echte Fehler. Erstens fehlte `testgoal.js` in `build.mjs`s
`MODULE_ORDER`: die gebündelte Datei war syntaktisch gültig (der eigene Regex-„Bundler“ entfernt
import-Zeilen unabhängig davon, ob das Modul tatsächlich mitgebaut wurde), verwies zur Laufzeit
aber auf nicht definierte Namen (`ReferenceError: describeGoalProgress is not defined`) – von den
`node --test`-Tests unbemerkt, da sie echte ES-Module importieren und nie das Bündel selbst
ausführen. Behoben, indem `build.mjs` vor dem Bündeln jetzt `validateModuleGraph()` ausführt: sie
gleicht die Dateien in `src/js/` mit `MODULE_ORDER` ab (nichts vergessen, nichts Verwaistes) und
prüft, dass jedes `import`-Ziel einer Datei in `MODULE_ORDER` vor dieser Datei steht. Ein
künftiges Vergessen lässt den Bau jetzt fehlschlagen, statt eine kaputte Datei stillschweigend
auszuliefern; `test/build.test.mjs` führt `build.mjs` ohnehin bei jedem Testlauf real aus und
deckt einen Rückfall damit automatisch ab. Zweitens fiel beim Umsetzen auf, dass
`aria-labelledby="learn-heading"` während der laufenden Lernsitzung (nicht aber bei Einrichtung
oder Abschluss) ins Leere zeigte, weil die aktive Sitzung nie eine Überschrift mit dieser ID
rendert hat; behoben mit einer visuell verborgenen `<h2>`, das Muster gilt jetzt auch für den
Testmodus.

## Nachtrag: manueller Hell/Dunkel-Umschalter

Der Entwurf (Abschnitt 9) verlangt, dass helles und dunkles Erscheinungsbild zusätzlich zur
Systemeinstellung manuell überschreibbar sind. Nachgezogen über eine neue Einstellungen-Ansicht
(`#einstellungen`, erreichbar über ein neues Zahnrad-Symbol im Kopfbereich neben „Sichern“ –
dieselbe Stelle, an der später die Wahl der Oberflächensprache aus Inkrement 5 hinzukommt).
Die Wahl liegt in `localStorage` (`theme.js`), nicht im `.vok.json`-Dokument, da es sich um eine
Geräteeinstellung und keinen Lernstand handelt.

| Datei | Prüft |
|---|---|
| `test/theme.test.mjs` | `loadThemePreference` (Vorgabe „system“, unbekannte Werte werden verworfen), `saveThemePreference` (schreibt light/dark, löscht den Eintrag bei „system“, verweigert unbekannte Werte), `applyThemePreference` (setzt/entfernt `data-theme` auf einem Fake-Wurzelelement) |

Per DevTools Protocol geprüft: Umschalten auf „Dunkel“ ändert `data-theme` und die berechnete
Hintergrundfarbe sofort, der Wert steht in `localStorage`; ein vollständiges Neuladen der Seite
(nicht nur ein erneutes Rendern) zeigt weiterhin Dunkel, ohne dass die Anwendung dafür geladen
sein muss – ein kleines Inline-Skript in `index.html` setzt `data-theme` vor dem Laden von
`app.css`, damit beim Start nicht kurz das falsche Erscheinungsbild aufblitzt (visuell nicht
zuverlässig per Screenshot verifizierbar, die Persistenz und der korrekte Zeitpunkt im
Dokumentquelltext aber schon); „Systemeinstellung folgen“ entfernt `data-theme` und den
`localStorage`-Eintrag wieder vollständig.

Die Ansichten enthalten DOM-Code und werden absichtlich nicht mit einer zusätzlichen
Browser-Simulationsbibliothek automatisiert getestet, um keine externe Abhängigkeit
einzuführen. Vor jeder Veröffentlichung sollte die DevTools-Protocol-Prüfung wiederholt werden,
siehe Prüfliste unten.

## Manuelle Prüfliste vor jedem „fertig“

Nicht automatisierbar ohne echten Browser bzw. echtes Gerät:

- `dist/app.html` per Doppelklick auf Windows, macOS, iPadOS und Android öffnen (Chrome, Edge,
  Firefox, Safari) und den kompletten Ablauf durchspielen: Stapel anlegen, Karten per
  Schnellerfassung und CSV anlegen, bearbeiten, markieren, löschen, Export, Import.
- Browser vollständig neu starten (nicht nur Tab neu laden) und prüfen, dass der Stand erhalten
  bleibt.
- Eine reale, aus Excel (deutsches Gebietsschema) exportierte CSV-Datei importieren und
  Umlaute/Sonderzeichen prüfen.
- Export-Datei per Doppelklick erneut importieren und mit der Originaldatei byteweise
  vergleichen.
- Tastaturbedienung: gesamte App ohne Maus bedienbar, Fokus jederzeit sichtbar.
- Kontrastprüfung mit einem Werkzeug der Wahl, mindestens 4,5:1 für Text.
- Darstellung bei 320px Breite und bei 200% Zoom.
- `prefers-reduced-motion` aktivieren und Toast-/Übergangsverhalten prüfen.
- Entwicklerwerkzeuge → Netzwerk-Tab: kein einziger Aufruf beim Öffnen von `dist/app.html`
  ohne Internetverbindung.
- Browser-Speicherkontingent künstlich ausschöpfen (DevTools-Storage-Override) und prüfen,
  dass die Fehlermeldung beim Speichern erscheint statt eines stillen Datenverlusts.
- `dist/pages/` auf einem echten GitHub-Pages-Deploy installieren und Offline-Start testen
  (volle Prüfung ist Abnahmekriterium von Inkrement 6, ein Rauchtest jetzt schon sinnvoll).
- Lernsitzung auf einem echten Touchgerät: Tippen zum Umdrehen, beide Bewertungsflächen groß
  genug und gut unterscheidbar, Korrekturmeldung rechtzeitig lesbar und antippbar.
- Sehr lange Kartentexte in der Lernansicht (Umbruch statt Überlauf) und eine Karte mit leerer
  Rückseite (zeigt „(leer)“ statt einer leeren Fläche).
- Einstreuverhältnis und Wiedervorlage bei einem Stapel mit sehr vielen Reparaturkarten (mehr
  Reparatur- als Regulärkarten) optisch gegenprüfen.
- Testmodus mit Zeitziel über die volle Dauer laufen lassen (nicht nur wenige Sekunden wie im
  automatisierten Lauf), inklusive mehrfachem Pausieren/Fortsetzen über mehrere Minuten.
- Trefferquote-Ziel mit tatsächlich schwankender Quote durchspielen (unter das Ziel fallen, wieder
  darüber steigen) und die Anzeige dabei beobachten.

## Testpläne für Inkremente 4–6

Diese Inkremente existieren noch nicht; die folgenden Punkte legen fest, was jeweils mit
automatisierten `node --test`-Regressionstests abgedeckt wird, sobald die Funktion gebaut ist.
Grundlage sind die Abnahmekriterien aus CLAUDE.md und die Regeln aus
`vokabel-app-entwurf.md`.

### Inkrement 4 – Statistik

- Lernserie: Kalendertage mit mindestens einer abgeschlossenen Sitzung, ein Joker pro
  Kalenderwoche (Montag–Sonntag), zwei Fehltage in derselben Woche brechen die Serie,
  Tests über Monats- und Jahresgrenzen hinweg.
- Tagesgrenze ist Mitternacht in der lokalen Zeitzone; eine Sitzung über Mitternacht zählt für
  den Starttag.
- Heatmap-Intensitätsstufen aus echten Tageswerten, inklusive Randfall „kein Eintrag für einen
  Tag“.
- Kastenverteilung und Reparaturkisten-Größe aus dem aktuellen Kartenbestand.

### Inkrement 5 – Mehrsprachigkeit

- Vollständigkeitstest: jeder Schlüssel der Referenzsprache (Deutsch) existiert in allen fünf
  Sprachen und umgekehrt (keine verwaisten Schlüssel).
- Kein sichtbarer Text mehr als Literal im Code (Grep-Regression gegen `src/js/views.js`).
- Umschaltung wirkt sofort ohne Neuladen; Oberflächensprache ist unabhängig von den
  Stapelsprachen.

### Inkrement 6 – Auslieferung als zwei Artefakte

- `dist/app.html` und `dist/pages/` entstehen aus derselben Quelle und unterscheiden sich laut
  Diff nur in Installierbarkeit/Offline-Cache-Anteilen (bereits in `test/build.test.mjs`
  angelegt, wird hier vertieft).
- Service Worker ersetzt sich bei neuer Versionsnummer sauber, ohne `IndexedDB`-Daten zu
  berühren (Cache-Name-Wechsel, alte Caches werden gelöscht).
- Manifest ist valide und referenziert nur eigene Dateien.
- Vollständige manuelle Geräteprüfliste (siehe oben) auf echten iPadOS-/Android-/Desktop-Geräten,
  inklusive Installation und Offline-Start nach Deinstallation der Internetverbindung.
