# Modellblatt: Was das Laden an einer Datei ändert

Stand 2026-11-24, Nacht. Lebenslauf am Ende. Wahrheit: die Datei, wie sie gelesen wurde.

| Feld | Inhalt |
|---|---|
| Annahme | Die Prüfung beim Laden (`utils/validateProject.ts`) darf Ungültiges entfernen oder richtigstellen, aber nie still. Was sie ändert, steht nicht in der Datei: Der Stand gilt dann als ungespeichert. |
| Heimat | `utils/loadChanges.ts` `describeLoadChanges` (Vergleich gelesen ↔ geprüft), aufgerufen in `store/useProjectStore.ts` `loadProject`; Meldung in `services/projectFile.ts` `reportLoadChanges` für alle drei Wege (Datei öffnen, Auto-Sicherung beim Start, Startfrage „Datei laden“). |
| Regel | Gemeldet wird jedes entfernte Feld, jeder geänderte Wert und jede doppelte Kennung, je Teil oder Baugruppe mit ihrem Namen aus der Datei, in Worten („Arbeitsplatte: Last 1 entfernt (30 kg)“, „Boden: Ausschnitt 1, Tiefe 80 → 50“). Listen mit Kennung werden nach Kennung verglichen, ohne der Reihe nach (die Prüfung entfernt nur, sie ordnet nie um). Nicht gemeldet: was die Prüfung nur ergänzt (Standardwerte, Teilenummern), Werte, die in der Datei null sind, und bewusst abgeschaffte Felder (`highlight`). Die Liste steht in einem Fenster, das bleibt, bis man es schließt, und sich kopieren lässt. Danach gilt das Projekt als ungespeichert; „Verwerfen“ beim Schließen behält eine Fassung. |
| Wächter | `tests/unit/load-changes.test.mjs` (Last über dem Rand, Name mit Rand-Leerzeichen, Verbindung ins Leere, gültiges Projekt ohne Meldung), `tests/e2e/45-load-changes.spec.ts` (ungespeichert nach Änderung). Ein großes echtes Projekt (zwei Kopien): 0 Änderungen. |
| Grenzen (nicht geprüft) | Die Prüfung selbst ist unverändert: Sie verwirft weiter eine Last, die über ein schmaler gewordenes Brett ragt, statt sie mitzuführen (Befund Daten 2; wie Last beim Verkleinern mitgehen soll, ist eine Entscheidung). Doppelte Kennungen werden gemeldet, aber nicht aufgelöst (Befund Daten 10). Damit eigene Speicherungen ohne Meldung wieder laden, schreibt die App Namen so, wie die Prüfung sie hält (Teilname ohne Rand-Leerzeichen), und schneidet gespeicherte Kurzwörter nicht mehr auf 16 Zeichen (das war der Befund „Unterkonstruktio 12“, Daten 4). Die Meldung ist ein Hinweis, keine Rückfrage vor dem Laden. |
| Befunde | Review 23.11.2026, Daten 2, 10, 11 (`fundament/befunde-app.json`: befund.daten.laden-aendert). |

Lebenslauf:
- 2026-11-24 angelegt mit dem Fix „Laden meldet, was es ändert“.
- 2026-11-24, nach der Zweitprüfung: Startfrage meldet auch; Listen ohne Kennung der Reihe nach; doppelte Kennungen; Behälter im Pfad; Worte statt Feldnamen; Fenster statt Hinweiszeile; Verwerfen löscht die Auto-Sicherung nicht mehr; eigene Speicherungen laden ohne Meldung.
