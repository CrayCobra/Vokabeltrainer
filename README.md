# Vokabeltrainer

Digitaler Karteikasten, lokal im Browser, ohne Konto und ohne Internetverbindung zur
Laufzeit. Die fachliche Spezifikation steht in [`vokabel-app-entwurf.md`](vokabel-app-entwurf.md),
die Regeln für die Zusammenarbeit in [`CLAUDE.md`](CLAUDE.md).

Stand: Inkrement 3 (Datenmodell, Speicherschicht, Editor, Lernmodus mit Kästen und
Reparaturkiste, Testmodus mit den drei Zielarten).

## Bauen

```
node build.mjs
```

Erzeugt `dist/app.html` (eigenständige Einzeldatei, läuft per Doppelklick über `file://`)
und `dist/pages/` (Ordner für GitHub Pages mit Manifest und Service Worker).

## Testen

```
npm test
```

Führt die Regressionstests unter `test/` mit dem in Node eingebauten Testrunner aus, ohne
zusätzliche Pakete. Siehe [`TESTPLAN.md`](TESTPLAN.md) für Umfang und die manuelle
Prüfliste, die einen echten Browser voraussetzt.

## Quellstruktur

```
src/
  index.html          Grundgerüst, lädt js/app.js als ES-Modul (nur für lokale Entwicklung
                      über einen Webserver – file:// scheitert an ES-Modul-CORS-Regeln)
  app.css             Stylesheet, keine externen Schriften/Assets
  icon.svg            App-Symbol
  js/
    model.js          Datenmodell, Validierung, Migration, Zusammenführung, Kastenregeln
    csv.js            CSV-Import (Kodierung, Trennzeichen, Parser)
    capture.js        Schnellerfassung
    fileio.js         Export/Import als .vok.json
    storage.js        IndexedDB-Adapter + Speicher-Repository
    learn.js          Lernsitzung: Reihenfolgen, Einstreuen, Wiedervorlage
    testgoal.js       Zielarten des Testmodus: Fortschritt, Erreicht-Prüfung
    bufferedwriter.js Gebündeltes Schreiben (z. B. nach jeder Bewertung)
    icons.js          Eingebettete SVG-Symbole
    dom.js            Kleiner DOM-Bau-Helfer
    views.js          Ansichten
    app.js            Bootstrap, Routing, Zustand
build.mjs             Abhängigkeitsfreies Bau-Skript
```

Kein Framework, kein Build-Schritt mit fremden Werkzeugen, keine Laufzeitabhängigkeiten.
