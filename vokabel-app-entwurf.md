# Vokabeltrainer — Entwurf und technische Lösung

Stand: 14.09.2026, Version 0.1 des Entwurfs. Grundlage sind die getroffenen Entscheidungen; offene Punkte stehen am Ende.

## 1. Rahmen

Die App ist ein digitaler Karteikasten für ein Kind ab Klasse 5, weitergebbar an andere Kinder, ohne Installation nutzbar und ohne dauerhafte Betreuungspflicht durch den Ersteller. Sie läuft vollständig im Browser, hält alle Daten lokal auf dem Gerät und nutzt eine Exportdatei als offizielles Sicherungs- und Transportmedium. Es gibt genau ein Profil pro Installation – aber innerhalb dieses einen Profils mehrere Stapel nebeneinander, weil an einer weiterführenden Schule mehrere Fremdsprachen eher die Regel als die Ausnahme sind. „Ein Profil" heißt also kein Mehrbenutzerbetrieb auf einem Gerät, nicht ein Stapel pro Gerät; wer Englisch und Französisch parallel lernt, wechselt zwischen zwei Stapeln im selben Profil, statt Exportdateien hin- und herzuladen.

Verbindlich entschieden: sitzungsbasierte Kästen ohne Kalenderfälligkeiten, Antwort ausschließlich durch Umdrehen und Selbsteinschätzung, Abfragerichtung pro Sitzung wählbar bei einem gemeinsamen Kastenstand je Karte, Karte besteht nur aus Text A und Text B, keine Töne und keine Vibration, Lernserie mit einem Joker-Tag pro Woche, Oberfläche vollständig übersetzt einschließlich Latein, Auslieferung als eigenständige HTML-Datei und parallel als installierbare Web-App, mehrere Stapel pro Profil mit einer geräteweiten (nicht stapelweisen) Lernserie.

## 2. Lernlogik

Jede Karte trägt einen Kastenstand von 1 bis 5, einen Zähler der aufeinanderfolgenden richtigen Antworten und ein Kennzeichen, ob sie in der Reparaturkiste liegt. Neue Karten starten in Kasten 1. Eine richtige Antwort hebt die Karte um einen Kasten, höchstens bis 5. Eine falsche Antwort setzt sie auf Kasten 1 zurück, setzt den Zähler auf null und legt sie in die Reparaturkiste. Aus der Reparaturkiste kommt sie erst heraus, wenn sie viermal hintereinander richtig war; ein einziger Fehler setzt den Zähler wieder auf null. Verlässt sie die Kiste, landet sie in Kasten 2, damit der Aufwand sichtbar belohnt wird und nicht bei null endet.

Die Reihenfolge innerhalb einer Sitzung folgt dem gewählten Modus: zufällig, sequentiell in Eingabereihenfolge oder nach Kästen von niedrig nach hoch. In allen drei Modi gilt eine Vorfahrtsregel: Karten aus der Reparaturkiste werden bevorzugt gezogen, aber nicht am Stück, sondern eingestreut im Verhältnis von etwa zwei Reparaturkarten auf drei reguläre Karten, damit die Sitzung nicht zur Strafrunde wird. Eine gerade falsch beantwortete Karte erscheint frühestens nach drei weiteren Karten wieder, sonst merkt man sich nur die Bildschirmposition statt der Vokabel.

Markierte Karten sind ein eigener, vom Kasten unabhängiger Filter. Eine Sitzung kann auf markierte Karten eingeschränkt werden, ohne dass die Markierung den Kastenstand beeinflusst.

Jede Sitzung bezieht sich auf genau einen Stapel: die Kartenauswahl (Reihenfolge, Einstreuen, Markierungsfilter) läuft ausschließlich über die Karten des gerade aktiven Stapels, nie stapelübergreifend.

Weil die Selbsteinschätzung ohne Tippprüfung auskommt, braucht sie einen Schutz gegen versehentliche Klicks: nach der Bewertung bleibt drei Sekunden lang ein unauffälliger Korrekturweg sichtbar, danach ist die Bewertung endgültig. Zurückspringen über mehrere Karten gibt es bewusst nicht.

## 3. Testmodus

Vor dem Start wählt man Richtung, Reihenfolge und genau ein Ziel: eine Dauer, eine Kartenanzahl oder eine Trefferquote, die über eine Mindestzahl von Karten gehalten werden muss. Das Ziel ist während der Sitzung als Fortschritt sichtbar, nicht als Countdown-Druck. Zeitziele sind jederzeit pausierbar und verlängerbar, weil WCAG 2.2 für Zeitlimits eine Anpassungsmöglichkeit verlangt; das ist kein Komfort, sondern eine Zugänglichkeitsanforderung.

Der Test wirkt auf den Lernstand genauso wie eine Übungsrunde: Eine falsche Antwort setzt die Karte auf Kasten 1 und in die Reparaturkiste, eine richtige hebt sie einen Kasten beziehungsweise zählt als eine der vier nötigen richtigen Antworten, wenn sie bereits in der Reparaturkiste liegt. Der Unterschied zwischen Lernen und Test liegt damit allein in Zielsetzung, Ablauf und Auswertung, nicht in der Wirkung auf die Kästen. Das hält die Regel für das Kind erklärbar: was zählt, zählt immer.

Am Ende steht ein Ergebnisbildschirm mit erreichtem Ziel, Trefferquote, Dauer und der Liste der falsch beantworteten Karten, aus der heraus man direkt eine Übungsrunde starten kann.

## 4. Statistik

Die Lernserie zählt Kalendertage, an denen mindestens eine abgeschlossene Sitzung stattfand – geräteweit über alle Stapel hinweg, nicht je Stapel. Wer heute nur Französisch gelernt hat, hält die Serie damit auch für Latein am Leben; das entspricht der Sache besser als getrennte Serien, weil das eigentliche Ziel „heute etwas gelernt" ist, unabhängig von der Sprache. Pro Kalenderwoche von Montag bis Sonntag darf genau ein Tag ohne Sitzung übersprungen werden, ohne dass die Serie bricht; der Joker verbraucht sich automatisch und wird im Dashboard sichtbar als verbraucht oder verfügbar angezeigt. Zwei Fehltage in derselben Woche brechen die Serie. Neben der laufenden Serie steht die längste jemals erreichte Serie.

Die Heatmap zeigt pro Kalendertag die Anzahl richtiger Karten in fünf Intensitätsstufen, ebenfalls geräteweit über alle Stapel summiert. Auf dem Smartphone werden zwölf Wochen dargestellt, auf größeren Bildschirmen 26 Wochen, beides seitlich scrollbar. Jede Zelle nennt beim Antippen Datum, richtige und falsche Karten. Wichtig ist die Farbwahl: die Stufen müssen sich auch bei Rot-Grün-Schwäche unterscheiden, deshalb eine einfarbige Skala mit steigender Sättigung statt Rot-nach-Grün.

Ergänzend zeigt das Dashboard die Verteilung der Karten des aktiven Stapels auf die fünf Kästen als Balken, die aktuelle Größe seiner Reparaturkiste und seine Gesamtzahl an Karten – das bleibt zwangsläufig je Stapel, weil Kastenstände an einzelnen Karten hängen und ein Stapel-übergreifender Balken sonst nur Sprachen vermischen würde, die nichts miteinander zu tun haben.

## 5. Editor

Der Schwerpunkt liegt auf schneller Eingabe. Das Hauptwerkzeug ist ein großes Textfeld, das zeilenweise abwechselnd Vorder- und Rückseite liest. Eine Vorschau zeigt laufend, wie viele Karten entstehen und wo eine Zeile fehlt. Leere Zeilen dürfen als optische Trenner verwendet werden und werden ignoriert. Enthält eine Zeile einen Tabulator, gelten die beiden Teile als A und B derselben Karte, was das Einfügen aus Tabellen abdeckt. Karten entstehen erst beim Übernehmen, vorher ist jede Änderung folgenlos.

Der CSV-Import erkennt Trennzeichen und Kodierung automatisch, weil Excel im deutschen Gebietsschema Semikolon und je nach Version keine UTF-8-Kodierung schreibt, was sonst Umlaute und lateinische Makronen zerstört. Vor dem Übernehmen erscheint eine Vorschau der ersten Zeilen mit Spaltenzuordnung. Existiert eine Vorderseite bereits, fragt die App einmalig, ob überspringen, ersetzen oder trotzdem anlegen gelten soll.

Die Kartenliste bietet Suche, Filter nach Kasten, Reparaturkiste und Markierung, Bearbeiten direkt in der Zeile, Mehrfachauswahl und Löschen mit Rückgängig-Möglichkeit bis zum Verlassen der Ansicht.

## 6. Datenmodell

Alles liegt in einem einzigen JSON-Dokument, das identisch für lokale Speicherung, Export und späteren Sync verwendet wird. Ein Profil enthält mehrere Stapel (`decks[]`); jede Karte und jede Sitzung gehört über `deckId` zu genau einem davon. `days[]` bleibt bewusst ohne `deckId` – die Lernserie und die Heatmap sind geräteweite, stapelübergreifende Statistik (siehe Kapitel 4).

| Feld | Inhalt |
|---|---|
| `schema` | Versionsnummer für Migrationen (2: mehrere Stapel) |
| `profile` | Anzeigename, Oberflächensprache, `activeDeckId` (zuletzt gewählter Stapel) |
| `decks[]` | `id`, `name`, Bezeichnung Sprache A und B, `changed` |
| `cards[]` | `id`, `deckId`, `a`, `b`, `box`, `streak`, `repair`, `marked`, `seen`, `correct`, `wrong`, `lastSeen`, `changed` |
| `days[]` | Datum, richtige und falsche Karten, Lerndauer in Sekunden – geräteweit, nicht je Stapel |
| `sessions[]` | Datum, Modus, `deckId`, Richtung, Ziel, Ergebnis |
| `meta` | Erstellung, letzte Sicherung, App-Version |

Karten-IDs sind kurze Zufallszeichenketten, damit zwei Geräte unabhängig Karten anlegen können, ohne zu kollidieren; Stapel-IDs folgen demselben Muster. Ein Datensatz mit 1000 Karten liegt grob bei 120 bis 150 Kilobyte unkomprimiert; das ist für jede der vorgesehenen Speicherarten unkritisch, auch mit mehreren Stapeln in einer Datei.

Schema 1 (ein einzelnes `deck`-Objekt statt `decks[]`, Karten ohne `deckId`) wird beim Import automatisch migriert: der bisherige Stapel wird zu `decks[0]`, alle vorhandenen Karten erhalten dessen `deckId`, `profile.activeDeckId` zeigt darauf. Bestehende Exportdateien bleiben also lesbar.

## 7. Speicherung und Sicherung

Primärspeicher ist IndexedDB, geschrieben nach jeder bewerteten Karte, aber gebündelt, damit die Oberfläche flüssig bleibt. Beim ersten Start fordert die App über `navigator.storage.persist()` dauerhaften Speicher an, soweit der Browser das unterstützt. Darauf verlassen darf man sich nicht: Safari räumt Speicher von Seiten, die längere Zeit nicht benutzt werden, nach meiner Kenntnis nach sieben Tagen ab, mit Ausnahme installierter Web-Apps. Ich habe die aktuell geltende Regel nicht verifiziert und würde das vor Fertigstellung prüfen.

Deshalb ist die Exportdatei kein Nebenschauplatz, sondern der eigentliche Datenträger. Die App zeigt dauerhaft, wann zuletzt gesichert wurde, und erinnert nach einer festzulegenden Anzahl von Sitzungen oder Tagen deutlich sichtbar. Der Import bietet zwei Wege mit Vorschau: vollständig ersetzen oder zusammenführen, wobei bei gleicher Karten-ID der jüngere Änderungsstempel gewinnt.

Die Speicherschicht ist hinter einer schmalen Schnittstelle gekapselt, die laden, speichern und Statusinformationen kennt. Version 1 liefert die Implementierungen für lokalen Speicher und Datei. Ein Adapter für einen Token-Dienst oder einen eigenen Endpunkt ist vorgesehen, wird aber bewusst nicht mitgeliefert, damit niemand eine Verfügbarkeit erwartet, für die niemand einsteht. Falls er später aktiviert wird, gilt: clientseitig mit Passphrase verschlüsselt, und der lokale Stand bleibt führend.

## 8. Auslieferung

Aus einer Quelle entstehen zwei Artefakte. Erstens eine eigenständige HTML-Datei mit vollständig eingebettetem Code, die per Doppelklick, aus einer Cloud-Ablage oder vom Stick läuft und die weitergegeben wird. Zweitens ein Ordner für GitHub Pages mit derselben Anwendung plus Manifest und Service Worker, wodurch die App installierbar und echt offlinefähig wird; ein Service Worker lässt sich nicht aus einer eingebetteten Ressource registrieren, deshalb die zweite Variante.

Das setzt voraus, dass nichts aus dem Netz nachgeladen wird: keine Bibliothek von einem CDN, keine Webschrift, keine Icon-Sammlung. Die Oberfläche verwendet Systemschriften und eigene SVG-Symbole. Der Bau geschieht durch ein kleines Node-Skript ohne externe Abhängigkeiten. Die Versionsnummer ist in der App sichtbar, damit bei Weitergabe klar ist, welcher Stand läuft.

## 9. Oberfläche

Gestaltungslinie ist ruhig und sachlich, mit klarer Typografie und starkem Kontrast; Textkontrast mindestens 4,5 zu 1, interaktive Flächen mindestens 44 Pixel Kantenlänge, was über dem Mindestwert von 24 Pixeln aus WCAG 2.2 liegt und den Empfehlungen von Apple mit 44 Punkt und Material Design mit 48 dp entspricht. Helles und dunkles Erscheinungsbild folgen der Systemeinstellung und lassen sich überschreiben.

Der Kopfbereich trägt eine Stapel-Auswahl (welcher der mehreren Stapel gerade aktiv ist) mit einer Schaltfläche daneben, um direkt dort einen neuen Stapel anzulegen; Umbenennen und Löschen vorhandener Stapel liegt in den Einstellungen, zusammen mit den anderen profilweiten, stapelunabhängigen Voreinstellungen.

Die Lernansicht zeigt die Karte groß und zentriert, die Bedienelemente unten im Daumenbereich. Umdrehen geschieht durch Tippen auf die Karte oder durch die Leertaste, Bewerten durch zwei deutlich getrennte Flächen oder die Pfeiltasten. Wischgesten sind eine zusätzliche Abkürzung, niemals der einzige Weg, da WCAG 2.2 für Ziehbewegungen eine Tippalternative verlangt. Bewegungsanimationen respektieren die Systemeinstellung für reduzierte Bewegung.

Die spielerischen Elemente bleiben bewusst sparsam und selbstbezogen: Fortschrittsbalken der Sitzung, ein kurzer sichtbarer Aufstieg beim Kastenwechsel, ein Abschlussbildschirm mit klaren Zahlen, Serie und Heatmap. Keine Bestenlisten, keine Punktewährung, keine Maskottchen. Die Forschungslage zeigt kleine bis mittlere positive Effekte von Gamification, stark abhängig vom Design, und warnt vor Vergleichsranglisten, die schwächere Lernende demotivieren.

## 10. Mehrsprachigkeit

Sämtliche Texte liegen in einer Schlüsseltabelle mit den Sprachen Deutsch, Englisch, Spanisch, Französisch und Latein; die Umschaltung wirkt sofort ohne Neuladen. Die Oberflächensprache ist unabhängig von den Sprachen des Stapels. Für Latein brauche ich vor der Umsetzung eine kurze Abstimmung über rund dreißig Begriffe, weil es für „Sitzung“, „Statistik“, „Kasten“ oder „Serie“ keine eingeführte moderne Entsprechung gibt und ich sonst frei erfinden müsste. Eingabe und Anzeige lateinischer Sonderzeichen einschließlich Makronen funktionieren in allen Sprachen.

## 11. Umsetzungsreihenfolge

Zuerst Datenmodell, Speicherschicht und Editor, weil ohne Karten nichts testbar ist. Danach der Lernmodus mit Kästen und Reparaturkiste, anschließend der Testmodus mit den drei Zielarten, danach das Dashboard mit Serie und Heatmap. Erst dann die Übersetzungen, weil sie sonst bei jeder Änderung nachgezogen werden müssen. Zum Schluss der Bau der beiden Artefakte und ein Durchgang für Barrierefreiheit und Kontraste auf echten Geräten.

## 12. Offene Punkte

Sollen einzelne Testergebnisse dauerhaft als Historie sichtbar bleiben oder nur in Serie und Heatmap einfließen?

Das lateinische Begriffsglossar ist abzustimmen.

Die Erinnerungsschwelle für die Sicherung ist festzulegen: nach wie vielen Sitzungen oder Tagen soll der Hinweis auffällig werden?
