# Modellblatt: Selbstprüfung der Statik (Notbremse)

Stand 2026-11-23, Nacht. Lebenslauf am Ende. Wahrheit: Erhaltung der Kraft; ein Möbel gleicht sich selbst.

| Feld | Inhalt |
|---|---|
| Annahme | Last fließt von Brett zu Brett nach unten, ein Brett nach dem anderen (Reihenfolge von oben nach unten). Tragen sich Bretter gegenseitig (Kreis), muss die Rechnung den Kreis an einer Stelle aufbrechen; Last an ein schon gerechnetes Brett geht dann verloren. Das Modell rechnet das Ganze nicht gemeinsam (das ist Paket 7). |
| Heimat | `services/static-sim.ts`: `simulateStatics` (zwei Läufe, Vergleich), `simulateOnce`, `processingOrder`, `canonicalLists`, `StaticBalance`, `BoardStatic.unsure`. `services/static-fe.ts`: Kontaktlöser ohne Gedächtnis. |
| Regel Gleichheit | Gleichstand nach Kennung des Bretts, Listen je Brett nach Kennung und Lage geordnet, „steht“/„steht ruhig“ in Runden: Ergebnis unabhängig vom Platz in der Datei. Kein Warmstart des Kontaktlösers: unabhängig von früheren Rechnungen. |
| Regel Bilanz | hinein (Eigengewicht, Nutzlast, aufgelegte Lasten) = am Boden + im Kreis verworfen + steckt in Brettern ohne Weg zum Boden. Geht Last verloren, zeigt die Übersicht „Unsicher: … kg kommen nicht am Boden an“, ebenso Legende und KI. |
| Regel unsicher | „kreis“ mit Richtung: Brett gab Last im Kreis ab, die nicht gezählt wurde („gab“), oder ihm fehlt sie („fehlt“), ab 0,05 kg je Paar. „folge“: Brett trägt (auch über weitere Bretter) Last von einem Brett, dem Last fehlt. „wahl“: Mit umgekehrter Wahl im Kreis kommt ein anderes Ergebnis heraus (anderer Zustand, Auslastung ±1 % oder Last ±0,5 kg und 2 %); beide Werte stehen da. Zählung kritisch/Warnung/ohne Auflager kommt aus dem ersten Lauf. Paare einer Verbindung werden nach Kennung geordnet, nicht nach der Reihenfolge des Anklickens. |
| Wächter | `tests/unit/statics-selfcheck.test.mjs`: Reihenfolge umgekehrt = gleich, frühere Läufe = gleich, Bilanz geht auf, zwei lose Hälften (A1) unsicher, Regal ohne Kreis sauber. Vorher rot: `fixes/statik/vorher-prueffaelle.txt`. |
| Grenzen (nicht geprüft) | Ob ein Ergebnis physikalisch stimmt, prüft die Notbremse nicht: sie sagt nur, wo es nicht tragen kann. Wand auf Luft heißt weiter „nicht geprüft“ (wird jetzt gezählt und bei „Nur Probleme“ gezeigt). Nutzlast auf jedem liegenden Stück, Sicherheitsbeiwerte, Kippen, Aussteifung: unverändert (Paket 7, Entscheidungen des Eigentümers). Bekannter Fehlwert (Zweitprüfung, Skript): Bei einem Pfosten kommt eine viel zu hohe Auslastung aus dem Rechennetz – ein Balken gibt seine Last in einem nur wenige Millimeter schmalen Streifen ab, und eine Netzlinie knapp unter der Oberkante vervielfacht sie; über die volle Auflage verteilt wäre sie gering. Die Notbremse macht den Wert fest, statt ihn je nach Reihenfolge zwischen ok und kritisch springen zu lassen; behoben wird er an der Wurzel (Paket 7). Rechenzeit: kalt ~0,3 s statt 0,17 s, nach Änderung der Nutzlast ~0,23 s statt 0,07 s (kein Warmstart, zwei Läufe). |
| Befunde | Review 23.11.2026, Statik A1–A3, C1 (`fundament/befunde-app.json`: befund.statik.reihenfolge, .lastverlust, .phantomstuetze, .zustaende). |

Lebenslauf:
- 2026-11-23 angelegt mit dem Fix „Statik sagt unsicher“.
- 2026-11-23, nach der Zweitprüfung: ein Gerät am Boden richtig verbucht; Richtung bei „kreis“; „folge“ für alles darunter; Schwellen für „wahl“; Verbindungen unabhängig von A/B.
