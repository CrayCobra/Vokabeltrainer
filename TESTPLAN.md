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

Die Ansichten (`src/js/views.js`, `src/js/app.js`) enthalten DOM-Code und werden absichtlich
nicht mit einer zusätzlichen Browser-Simulationsbibliothek automatisiert getestet, um keine
externe Abhängigkeit einzuführen. Sie wurden für diese Auslieferung stattdessen per Chrome
DevTools Protocol gegen `dist/app.html` gefahren (Stapel anlegen, Schnellerfassung, Markieren,
Löschen mit Rückgängig, Browser-Neustart mit gleichem Profil, geräumter Speicher mit aktiver
Erklärung samt Sicherungsangebot) – alle Schritte ohne JavaScript-Fehler und mit korrektem
Ergebnis. Vor jeder Veröffentlichung sollte das manuell wiederholt werden, siehe Prüfliste
unten.

## Manuelle Prüfliste vor jedem „fertig“ (Inkrement 1)

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

## Testpläne für Inkremente 2–6

Diese Inkremente existieren noch nicht; die folgenden Punkte legen fest, was jeweils mit
automatisierten `node --test`-Regressionstests abgedeckt wird, sobald die Funktion gebaut ist.
Grundlage sind die Abnahmekriterien aus CLAUDE.md und die Regeln aus
`vokabel-app-entwurf.md`.

### Inkrement 2 – Lernmodus, Kästen, Reparaturkiste

- Kastenübergänge: richtige Antwort hebt um einen Kasten (Obergrenze 5), falsche Antwort setzt
  auf Kasten 1, Streak auf 0, `repair: true`.
- Reparaturkiste: Karte verlässt sie erst nach vier aufeinanderfolgenden richtigen Antworten und
  landet dann in Kasten 2; ein einzelner Fehler setzt den Reparatur-Streak zurück auf 0.
- Ziehreihenfolge: zufällig, sequentiell, nach Kasten aufsteigend – jeweils mit Einstreuquote
  Reparatur- zu Regulärkarten von etwa 2:3 und der Regel, dass eine gerade falsch beantwortete
  Karte erst nach mindestens drei weiteren Karten wiederkehrt.
- Markierungsfilter schränkt die Sitzung ein, ohne den Kastenstand zu beeinflussen.
- Korrekturfenster von drei Sekunden nach einer Bewertung.
- Randfälle: leerer Stapel, Stapel mit genau einer Karte, alle Karten in der Reparaturkiste.

### Inkrement 3 – Testmodus und Zielarten

- Alle drei Zielarten (Dauer, Kartenanzahl, Trefferquote über Mindestanzahl) erkennen das
  Erreichen korrekt.
- Zeitziele sind pausierbar und verlängerbar (WCAG-2.2-Anforderung), Pausezeit zählt nicht mit.
- Testmodus wirkt auf Kästen/Reparaturkiste identisch zum Lernmodus (siehe Inkrement 2).
- Ergebnisbildschirm: korrekte Trefferquote, Dauer, Liste falscher Karten; „Übungsrunde mit
  falschen Karten starten“ übernimmt genau diese Kartenmenge.

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
