# Vokabeltrainer

Digitaler Karteikasten, lokal im Browser, ohne Konto und ohne Internetverbindung zur
Laufzeit. Die fachliche Spezifikation steht in [`vokabel-app-entwurf.md`](vokabel-app-entwurf.md),
die Regeln für die Zusammenarbeit in [`CLAUDE.md`](CLAUDE.md).

Stand: Inkrement 5 (Datenmodell, Speicherschicht, Editor, Lernmodus mit Kästen und
Reparaturkiste, Testmodus mit den drei Zielarten, manuell überschreibbares Hell/Dunkel,
Statistik mit Lernserie, Heatmap und Kastenverteilung, vollständige Mehrsprachigkeit in
Deutsch, Englisch, Spanisch, Französisch und Latein).

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
    theme.js          Hell/Dunkel-Übersteuerung (localStorage, geräteweit)
    stats.js          Lernserie mit Wochenjoker, Heatmap-Aufbereitung, Kastenverteilung
    i18n.js           Übersetzungskern (Nachschlagen, Interpolation, Rückfall auf Deutsch)
    i18n-de.js        Deutsch (Grundsprache)
    i18n-en.js        Englisch
    i18n-es.js        Spanisch
    i18n-fr.js        Französisch
    i18n-la.js        Latein
    uilang.js         Oberflächensprache (localStorage, geräteweit)
    icons.js          Eingebettete SVG-Symbole
    dom.js            Kleiner DOM-Bau-Helfer
    views.js          Ansichten
    app.js            Bootstrap, Routing, Zustand
build.mjs             Abhängigkeitsfreies Bau-Skript
```

Kein Framework, kein Build-Schritt mit fremden Werkzeugen, keine Laufzeitabhängigkeiten.
