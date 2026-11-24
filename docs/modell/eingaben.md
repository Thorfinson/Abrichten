# Modellblatt: Zahlen, die ein Mensch eingibt

Stand 2026-11-23. Lebenslauf am Ende. Wahrheit: die Eingabe selbst.

| Feld | Inhalt |
|---|---|
| Annahme | Eine Zahl, die jemand eingibt oder nicht anfasst, bleibt genau so. Ein Griff rundet die gezogene Strecke (ganze mm, ganze Grad) oder rastet aufs Raster, nie die Lage. Die Anzeige rundet auf Zehntel, in der Sprache der App. |
| Heimat | `utils/units.ts`: `parseNumber` (Textfelder), `numberFieldValue` (Browser-Zahlenfelder), `formatValue` (Anzeige, mm mit Zehnteln). `utils/handleRelease.ts`: was die 3D-Griffe beim Loslassen schreiben. |
| Regel Lesen | Komma oder Punkt als Dezimalzeichen. Ein einzelnes Zeichen mit genau drei Ziffern danach („1.200“, „1,000“) ist mehrdeutig und wird abgelehnt, nie geraten; mit führender 0 ist es dezimal („0.125“), mehrere Gruppen sind Tausender („1.234.567“); beide Zeichen: das letzte ist dezimal. Leerzeichen, Unicode-Minus, „mm“ am Ende erlaubt; alles andere ist keine Zahl und wird im Feld markiert. Browser-Zahlenfelder liest `numberFieldValue` (der Browser hat schon gelesen; leer ist null). |
| Regel Griffe | Nur die bewegte Achse ändert sich, um ganze Einheiten der gezogenen Strecke; ein Klick oder Zittern (unter 0,5 mm, in 2D unter 3 Pixeln) ändert nichts und gibt keinen Rückgängig-Schritt. Drehen wird um die Mitte des Teils gemessen. |
| Wächter | `tests/unit/input-numbers.test.mjs`: Prüffälle mit bekannter Antwort; kein Feld in `components/` liest Zahlen an den beiden Lesern vorbei (Ausnahmen mit Grund im Test). |
| Grenzen (nicht geprüft) | Liste der Standard-Dicken trennt an jedem Komma (Entscheidung offen). Leere Browser-Zahlenfelder ergeben in einigen Feldern 0 (Rechner, Kosten). Formeln (`utils/formulaEval.ts`: Punkt ist dort immer dezimal, Ergebnis auf Zehntel gerundet) und KI-Import (`services/sketch-parser.ts`) haben eigene Leser. Maßlinien an gedrehten Teilen beschriften die ungedrehte Breite. |
| Befunde | Review 23.11.2026, Geometrie Befund 1–3 (`fundament/befunde-app.json`: befund.geometrie.positionsfeld, .tausenderpunkt, .griff-rundet, .masslinien). |

Lebenslauf:
- 2026-11-23 angelegt mit dem Fix „Eingaben ändern nichts ungefragt“.
- 2026-11-23, nach der Zweitprüfung: „1.200“ wird nicht mehr als 1200 geraten, sondern abgelehnt (die App zeigt selbst Dezimalpunkte); Griffe runden die Strecke statt der Lage; 2D-Ziehen und Drehgriff unter dieselbe Regel. Überholt: „deutscher Tausenderpunkt bei Dreiergruppen“.
