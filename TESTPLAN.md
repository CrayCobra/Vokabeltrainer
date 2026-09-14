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

## Inkrement 4 – automatisiert abgedeckt

| Datei | Prüft |
|---|---|
| `test/stats.test.mjs` | `computeCurrentStreak`: ununterbrochene Tage, ein Fehltag pro Kalenderwoche (Joker) bricht nicht, zählt aber selbst nicht mit, zwei Fehltage in derselben Woche brechen die Serie, der heutige Tag bricht nie (auch inaktiv), leere Historie ergibt 0, eine Serie über eine Monats- **und** Jahresgrenze hinweg (Woche Mo 30.12.2024–So 5.1.2025, Neujahr als Jokertag); `computeLongestStreak`: findet eine vergangene, längere Serie unabhängig vom aktuellen (kürzeren) Stand; `isCurrentWeekJokerAvailable`: verfügbar ohne Fehltag seit Montag, verbraucht nach dem ersten Fehltag, der heutige Tag wird nicht geprüft; `heatmapLevel` an allen Schwellenwerten; `buildHeatmapWeeks`: Wochenzahl/-ausrichtung, letzte Woche endet bei heute, Tage nach heute als `future` ohne Stufe; `boxDistribution` (Kästen, Reparaturkiste, Gesamtzahl) |

Alle Datumsannahmen in den Tests (welcher Wochentag ein bestimmtes Datum ist) wurden vor dem
Schreiben mit `new Date(...).getDay()` gegen echte Kalenderdaten geprüft, nicht nur angenommen.

Die Statistik-Ansicht wurde per Chrome DevTools Protocol gegen `dist/app.html` gefahren: dazu
wurden zehn lückenlos aufeinanderfolgende Tage (heute und neun zuvor) sowie unterschiedliche
Kastenstände direkt in IndexedDB eingesetzt (ein realistischer mehrwöchiger Testablauf ließe
sich nicht in einer einzelnen Sitzung durchspielen) und nach einem echten Neuladen der Seite
geprüft: aktuelle und längste Serie zeigen beide 10, der Wochenjoker gilt als verfügbar, die
Kastenverteilung zeigt die eingesetzten Werte korrekt inklusive Reparaturkisten-Größe. Die
Heatmap enthält bei 26 Wochen 182 Zellen, von denen die nach heute liegenden korrekt als nicht
anklickbare Platzhalter ohne Datenanspruch gerendert werden (bei einem Montag als „heute“ sind
das die restlichen sechs Tage der laufenden Woche); ein Klick auf eine Zelle aktualisiert die
Detailzeile mit Datum sowie richtigen/falschen Karten. Bei 375px Breite blendet `app.css` die
ältesten 14 der 26 Wochen aus, sodass genau 12 sichtbar bleiben, wie im Entwurf für Smartphones
gefordert.

**Bewusste Abweichung von der 44-Pixel-Regel der Prüfliste:** Die Heatmap-Felder sind kleiner
als 44px, weil ein Kalenderraster mit bis zu 26 Wochen als kompaktes Gitter sonst nicht
darstellbar wäre. Datum sowie richtige/falsche Karten stehen vollständig im `aria-label` jeder
Zelle (für Screenreader unabhängig von der optischen Größe) und zusätzlich als gut lesbarer Text
in der Detailzeile nach Fokus oder Klick; die Bedienung ist damit nicht an das Treffen der
kleinen Fläche gebunden.

## Inkrement 5 – automatisiert abgedeckt

Sämtliche Texte liegen in `src/js/i18n-de.js` (Grundsprache, entspricht wortgleich dem vorher
fest im Code stehenden Text), `i18n-en.js`, `i18n-es.js`, `i18n-fr.js` und `i18n-la.js`, alle
über denselben Schlüsselsatz. `src/js/i18n.js` übersetzt (`translate(lang, key, params)`,
Rückfall auf Deutsch, dann auf den nackten Schlüssel), `src/js/uilang.js` verwaltet die Wahl in
`localStorage` (Kleinigkeit im Sinne von CLAUDE.md, nicht im `.vok.json`) mit Browsersprache als
Vorschlag beim Erststart. `model.js`-Fehler tragen jetzt `i18nKey`/`i18nParams` (`ValidationError`)
statt fertigen deutschen Texts, `testgoal.js`s Fortschritts-/Zielbeschreibungen ebenso – beide
Module bleiben damit ohne Sprachzugriff, wie es die Modultrennung in CLAUDE.md vorsieht
(„Module für Datenmodell … und Übersetzungen“). `views.js` selbst enthält keinen sichtbaren
Text mehr als Literal, jede Ausgabe läuft über `ctx.t(schlüssel, parameter)`.

| Datei | Prüft |
|---|---|
| `test/i18n.test.mjs` | **Abnahmekriterium „alle fünf Sprachen vollständig“**: identische Schlüsselmenge in allen fünf Wörterbüchern, kein leerer/undefinierter Eintrag; `translate()` (Interpolation, fehlender Platzhalter bleibt sichtbar, Funktionsschlüssel für Pluralregeln, Rückfall auf Deutsch bei unbekannter Sprache, unbekannter Schlüssel liefert sich selbst statt zu crashen); Pluralfunktionen aller fünf Sprachen unterscheiden 1 von "mehreren" |
| `test/uilang.test.mjs` | Spracherkennung aus der Browsersprache, gespeicherte Wahl hat Vorrang, ungültige gespeicherte Werte werden verworfen |
| `test/no-hardcoded-text.test.mjs` | **Abnahmekriterium „kein sichtbarer Text mehr fest im Code“**: eine Liste vormals fest codierter deutscher UI-Sätze darf in `views.js`, `app.js`, `model.js`, `fileio.js`, `testgoal.js` und `index.html` nicht mehr auftauchen (Kommentare ausgenommen, die bleiben bewusst Deutsch); `views.js` muss deutlich über 100 `t(...)`-Aufrufe enthalten |
| `test/model.test.mjs`, `test/fileio.test.mjs` | `ValidationError` trägt den erwarteten `i18nKey`/`i18nParams` statt eines fertigen Satzes |
| `test/testgoal.test.mjs` | `describeGoalProgress`/`describeGoalLabel` liefern Schlüssel + Parameter; Rundreise-Prüfung, dass `translate('de', …)` bzw. `translate('en', …)` daraus wieder den erwarteten Satz ergibt |

Per Chrome DevTools Protocol gegen `dist/app.html` gefahren: Stapel anlegen und Karten in
Deutsch anlegen (Singular-Toast „1 Karte gelöscht.“ geprüft), auf Englisch umschalten
(Navigationsbeschriftungen, Plural-Toast „2 cards deleted.“), auf Spanisch, Französisch und
Latein umschalten (Navigationsbeschriftungen, Leerzustand-Text, `document.documentElement.lang`),
`localStorage` und `profile.uiLang` nach dem Umschalten geprüft, und ein echtes Neuladen der
Seite zeigt weiterhin die zuletzt gewählte Sprache (Latein). Makronen wurden dabei sichtbar
korrekt dargestellt (Screenshot geprüft).

Dabei zeigten sich drei echte, zusammenhängende Bugs – alle dieselbe Ursachenklasse wie das
`testgoal.js`-Problem aus Inkrement 3: der eigene Regex-„Bundler“ verlässt sich darauf, dass
nach dem Entfernen einer `import`-Zeile der importierte Name unverändert als gemeinsame
Top-Level-Bindung existiert, was bei mehreren, unabhängig voneinander plausiblen Mustern nicht
zutrifft.

1. Alle fünf `i18n-*.js`-Dateien exportierten ursprünglich `dict`; nach dem Bündeln gab es fünf
   `const dict`-Deklarationen in derselben Ebene – ein echter `SyntaxError`
   („already been declared“), von `test/build.test.mjs`s `vm.Script`-Prüfung sofort gefangen.
   Behoben durch eindeutige Namen (`dictDe`, `dictEn`, …).
2. Dieselben fünf Dateien definierten je eine eigene, nicht exportierte Hilfsfunktion
   `cardWord(n)` für die Pluralregel. Eine `function`-Redeklaration ist in JavaScript – anders
   als bei `const`/`let` – **kein** Fehler, sondern gültig: die zuletzt geladene Definition
   gewinnt still. Ergebnis: alle Pluralformen in allen fünf Sprachen hätten die lateinische
   Form genutzt, ohne dass irgendein Syntaxfehler oder ein `node:test` (die echten, isolierten
   ES-Module prüfen) das bemerkt hätte – nur ein Test gegen das tatsächliche Bündelverhalten
   deckt so etwas auf. Ebenso kollidierte `STORAGE_KEY` zwischen `theme.js` und `uilang.js`.
   Behoben durch eindeutige Namen und eine neue Prüfung `assertNoDuplicateTopLevelNames()` in
   `build.mjs`, die vor jedem Bauen alle Top-Level-Bezeichner alle Dateien vergleicht und bei
   Kollision (ob als Syntaxfehler erkennbar oder nicht) abbricht.
3. `i18n.js` importierte umbenennend (`import { dictDe as de }`); die Zeile wurde beim Bündeln
   vollständig entfernt, ohne die Umbenennung im restlichen Code nachzuziehen – zur Laufzeit im
   Browser `ReferenceError: de is not defined`, unmittelbar sichtbar als komplett leere Seite,
   aber ebenfalls nicht durch `vm.Script` (das nur Syntax prüft) oder `node:test` gefangen.
   Behoben durch Umimportieren ohne `as` und eine neue Prüfung in `validateModuleGraph()`, die
   `import … as …`-Zeilen von vornherein ablehnt.

Für Fall 2 und 3 reichte die statische Bündel-Prüfung nicht aus, da beides gültiges bzw. nur zur
Laufzeit fehlerhaftes JavaScript ergibt; erst der Chrome-DevTools-Protocol-Lauf gegen die
tatsächlich gebaute Datei hat sie sichtbar gemacht. Das bestätigt den mehrschichtigen Ansatz
dieses Testplans: `node:test` prüft die fachliche Logik an echten ES-Modulen, `build.mjs`s
eigene Prüfungen plus `test/build.test.mjs` prüfen das Bündeln selbst, und der DevTools-Lauf
prüft, dass die tatsächlich ausgelieferte Datei im Browser auch tut, was sie soll.

**Zur Abstimmung, nicht endgültig gesetzt:** Das lateinische Kernglossar für rund 30 Begriffe
ohne eingeführte moderne Entsprechung (Sessiō, Capsa, Seriēs, Venia Septimānālis, Probātiō u. a.)
ist ein Vorschlag – siehe die Zusammenfassung im Gespräch für die vollständige Liste mit
Begründung. Rückmeldung dazu fließt als gezielte Änderung an `i18n-la.js` ein, ohne die
Infrastruktur erneut anzufassen.

Die Ansichten enthalten DOM-Code und werden absichtlich nicht mit einer zusätzlichen
Browser-Simulationsbibliothek automatisiert getestet, um keine externe Abhängigkeit
einzuführen. Vor jeder Veröffentlichung sollte die DevTools-Protocol-Prüfung wiederholt werden,
siehe Prüfliste unten.

## Mehrere Stapel pro Profil – automatisiert abgedeckt

Nachträgliche Erweiterung nach Inkrement 6: ein Profil (weiterhin kein Mehrbenutzerbetrieb)
verwaltet mehrere Stapel nebeneinander, siehe `vokabel-app-entwurf.md` Kapitel 1, 4 und 6.
Schema wechselt von 1 auf 2 (`deck`-Einzelfeld → `decks[]`, Karten/Sitzungen mit `deckId`).

| Datei | Prüft |
|---|---|
| `test/model.test.mjs` | `createDeck`/`addDeck`/`applyDeckEdit`/`replaceDeck`/`getActiveDeck`/`setActiveDeck`; `deleteDeck` löscht kaskadierend die Karten des Stapels, verweigert das Löschen des letzten Stapels, `restoreDeck` macht beides rückgängig; `validateDocument` prüft `decks[]`/`activeDeckId`/Karten-`deckId`; `migrateDocument` hebt Schema 1 auf Schema 2 (ein bestehender Stapel wird zu `decks[0]`, Karten und Sitzungen erhalten dessen `deckId`); `mergeDocuments` führt Stapel nach Änderungsstempel zusammen und behält den aktiven Stapel, sofern er noch existiert; `findDuplicateFronts` erkennt Duplikate nur innerhalb desselben Stapels; `recordSession`/`days[]` bleiben geräteweit über alle Stapel hinweg |
| `test/icon-render.test.mjs`, `test/build.test.mjs`, `test/learn.test.mjs`, `test/fileio.test.mjs` | Unverändertes Verhalten nach der Umstellung auf `deckId` (Testkarten erhalten jetzt explizit eine `deckId`, `buildExportFilename` beruht auf `profile.name` statt einem einzelnen Stapelnamen) |

Manuell im eingebetteten Browser-Tool gegen `dist/app.html` durchgespielt (siehe Gesprächsverlauf
statt Chrome-DevTools-Protocol-Log): zwei Stapel angelegt, Karten getrennt über die
Schnellerfassung erfasst, Kartenliste/Statistik/Kastenverteilung zeigen nur die Karten des
jeweils aktiven Stapels, Stapel im Einstellungen-Bereich umbenannt und gelöscht mit
funktionierendem Rückgängig-Toast, eine Lernsitzung im aktiven Stapel durchgespielt und
anschließend der tatsächliche IndexedDB-Inhalt geprüft: `sessions[].deckId` korrekt gesetzt,
`days[]` geräteweit (nicht je Stapel) aktualisiert, Kastenstände nur der gelernten Karten erhöht.
Nicht geprüft (siehe Prüfliste unten für echte Geräte): CSV-Import in einen von zwei Stapeln,
Zusammenführen zweier Exportdateien mit unterschiedlichen Stapeln auf einem echten zweiten Gerät.

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
- Echte mehrwöchige Nutzung beobachten (nicht nur eingesetzte Testdaten): Serie, längster Stand
  und Wochenjoker-Anzeige bleiben über echte Tageswechsel hinweg korrekt, insbesondere um
  Mitternacht und beim ersten Öffnen an einem neuen Tag.
- Heatmap auf einem echten Touchgerät: kleine Felder lassen sich trotzdem treffen, Zoomen auf
  200% bleibt bedienbar, Scrollen funktioniert per Wischgeste zusätzlich zur Tastatur.
- Farbstufen der Heatmap mit einem Rot-Grün-Schwäche-Simulator gegenprüfen.
- Jede der fünf Sprachen einmal vollständig durchklicken (Erfassung, Lernen, Testen, Import,
  Statistik) und auf Textumbrüche/abgeschnittene Beschriftungen achten – längere Übersetzungen
  (Französisch, Spanisch) können enger bemessene Flächen sprengen.
- Lateinisches Glossar mit einer fachkundigen Person durchsprechen, sobald die Rückmeldung aus
  der Abstimmung vorliegt.
- Eingabe lateinischer Sonderzeichen (Makronen) in Karteninhalte prüfen, nicht nur deren Anzeige
  in der Oberfläche.

## Inkrement 6 – Auslieferung als zwei Artefakte

Automatisiert durch `test/build.test.mjs` und `test/icon-render.test.mjs`:

- `dist/app.html` und `dist/pages/` entstehen aus derselben Quelle; Skript und CSS sind in
  beiden Artefakten byteidentisch, der Unterschied beschränkt sich auf Manifest, Service Worker,
  apple-touch-icon und die Registrierung selbst.
- Service Worker ersetzt sich bei neuer Versionsnummer sauber: ein gemockter Worker-Kontext
  (eigenes In-Memory-`caches`, kein echter Browser) prüft, dass `install` einen neuen
  Cache-Eintrag anlegt und `activate` jeden Cache-Namen außer dem aktuellen löscht, ohne
  `IndexedDB` zu berühren (der Mock kennt `IndexedDB` gar nicht).
- Manifest ist valide JSON, referenziert nur eigene, tatsächlich vorhandene Dateien ohne externe
  URLs und enthält mindestens ein 512×512-PNG-Icon.
- Die PNG-Icons (192, 512, apple-touch-icon 180) werden aus derselben prozeduralen Zeichnung wie
  `src/icon.svg` gerendert (`build/icon-render.mjs` + `build/png.mjs`, ohne externe
  Bild-Bibliothek), haben eine gültige PNG-Signatur und die erwarteten Abmessungen; ein Test
  vergleicht die Kernfarben mit `icon.svg`, damit beide Zeichnungen nicht unbemerkt auseinander-
  laufen.

Nicht automatisierbar, bleibt manuelle Prüfung (siehe Prüfliste oben):

- Echte Service-Worker-Registrierung, Installation und Offline-Start in einem echten Browser.
  Die im Projekt verfügbare eingebettete Browser-Sandbox lehnt Service-Worker-Registrierung
  grundsätzlich ab (`TypeError: ... An unknown error occurred when fetching the script.`, auch
  bei korrektem Content-Type und erreichbarem `sw.js`) – das ist eine Einschränkung dieser
  Testumgebung, keine geprüfte Browser-Inkompatibilität der App.
- `dist/pages/` auf einem echten GitHub-Pages-Deploy installieren und Offline-Start auf
  iPadOS/Android/Desktop testen, inklusive Update-Verhalten bei neuer Version.
- Repository-Einstellung „Settings → Pages → Source: GitHub Actions“ ist ein einmaliger,
  manueller Schritt außerhalb dieses Bau-Skripts; `.github/workflows/deploy-pages.yml` baut und
  veröffentlicht danach bei jedem Push auf `main` automatisch.
