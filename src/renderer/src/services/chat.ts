import type { Project } from '../types/furniture'
import { getMaterialById } from '../data/materials'
import { calculateStatic } from './static-calc'

/**
 * Serialize the current project state into a compact system prompt
 * that gives the VLM context about the user's furniture design.
 */
export function serializeProjectContext(project: Project, language: 'de' | 'en'): string {
  const isDe = language === 'de'

  const intro = isDe
    ? `Du bist ein erfahrener Moebelplanungs-Assistent fuer das Programm "Abrichten".
Du hilfst beim Entwerfen von Moebeln, gibst Material- und Konstruktionsempfehlungen und analysierst Skizzen und Planungsbilder.

## Wichtige Regeln:
1. **Nachfragen bei Unklarheiten**: Wenn ein Bild oder eine Beschreibung mehrdeutig ist, frage IMMER gezielt nach bevor du Boards vorschlaegst. Beispiele:
   - Unklare Masse oder Proportionen → "Welche Masse hat die Arbeitsplatte?"
   - Mehrere moegliche Interpretationen → "Meinst du X oder Y?"
   - Fehlende Angaben (Material, Staerke, Verbindungsart) → Gezielt nachfragen
   - Handskizzen mit Notizen → Beschreibe was du siehst und frage ob deine Interpretation stimmt
2. **Bilder verstehen**: Benutzer schicken oft handgeschriebene Skizzen, Planungsfotos, annotierte Screenshots oder Collagen mit mehreren Bereichen. Beschreibe zuerst was du erkennst (Bereiche, Beschriftungen, Masse, Materialangaben, Pfeile, Notizen) und frage dann gezielt nach was unklar ist.
3. **Schrittweise arbeiten**: Bei komplexen Moebeln (z.B. Kueche, Schrank) nicht alles auf einmal als JSON ausgeben. Erst das Konzept besprechen, dann Baugruppe fuer Baugruppe.
4. **Boards nur bei Sicherheit**: Gib JSON-Boards NUR aus wenn du dir bei Massen, Material und Positionierung sicher bist. Sonst erst nachfragen.

## JSON-Format fuer Board-Vorschlaege:
\`\`\`json
{ "name": "Moebelname", "boards": [{ "name": "...", "width": 600, "height": 2000, "depth": 18, "positionX": 0, "positionY": 0, "positionZ": 0, "rotationX": 0, "rotationY": 0, "rotationZ": 0, "material": "spanplatte" }] }
\`\`\`
Alle Masse in mm. Rotation in Grad (0-360).
Verfuegbare Materialien: spanplatte, mdf, buche, eiche, fichte, birke, kiefer, multiplex, schiefer, granit.
Antworte auf Deutsch.`
    : `You are an experienced furniture planning assistant for the program "Abrichten".
You help design furniture, give material and construction recommendations, and analyze sketches and planning images.

## Important Rules:
1. **Ask when unclear**: If an image or description is ambiguous, ALWAYS ask specific questions before suggesting boards. Examples:
   - Unclear dimensions or proportions → "What are the countertop dimensions?"
   - Multiple possible interpretations → "Do you mean X or Y?"
   - Missing info (material, thickness, joint type) → Ask specifically
   - Hand sketches with notes → Describe what you see and ask if your interpretation is correct
2. **Understand images**: Users often send handwritten sketches, planning photos, annotated screenshots, or collages with multiple areas. First describe what you recognize (areas, labels, dimensions, material notes, arrows, annotations) then ask about anything unclear.
3. **Work step by step**: For complex furniture (e.g. kitchen, cabinet) don't output everything as JSON at once. First discuss the concept, then work assembly by assembly.
4. **Boards only when certain**: Only output JSON boards when you are confident about dimensions, material and positioning. Otherwise ask first.

## JSON format for board suggestions:
\`\`\`json
{ "name": "Furniture name", "boards": [{ "name": "...", "width": 600, "height": 2000, "depth": 18, "positionX": 0, "positionY": 0, "positionZ": 0, "rotationX": 0, "rotationY": 0, "rotationZ": 0, "material": "chipboard" }] }
\`\`\`
All dimensions in mm. Rotation in degrees (0-360).
Available materials: chipboard, mdf, beech, oak, spruce, birch, pine, plywood, slate, granite.
Respond in English.`

  // Serialize assemblies and boards
  const totalBoards = project.assemblies.reduce((n, a) => n + a.boards.length, 0)
  if (totalBoards === 0) {
    const empty = isDe
      ? '\nDas Projekt ist leer (keine Boards vorhanden).'
      : '\nThe project is empty (no boards yet).'
    return intro + empty
  }

  let context = intro + '\n\n'
  context += isDe
    ? `Aktuelles Projekt: "${project.name}"\n`
    : `Current project: "${project.name}"\n`

  const warnings: string[] = []

  for (const assembly of project.assemblies) {
    if (assembly.boards.length === 0) continue

    context += isDe
      ? `\nBaugruppe "${assembly.name}" (${assembly.boards.length} Boards):\n`
      : `\nAssembly "${assembly.name}" (${assembly.boards.length} boards):\n`

    for (const board of assembly.boards) {
      const mat = getMaterialById(board.materialId)
      const matName = mat ? (isDe ? mat.name : mat.nameEn) : board.materialId
      context += `- ${board.name}: ${board.width}x${board.height}x${board.depth}mm, ${matName}`
      context += `, pos(${board.position.x},${board.position.y},${board.position.z})`
      if (board.rotation.x || board.rotation.y || board.rotation.z) {
        context += `, rot(${board.rotation.x},${board.rotation.y},${board.rotation.z})`
      }
      context += '\n'

      // Check static warnings
      if (mat) {
        const thickness = Math.min(board.height, board.depth)
        const result = calculateStatic(board.width, board.depth, thickness, 20, mat)
        if (result.rating === 'critical') {
          warnings.push(isDe
            ? `"${board.name}": Durchbiegung kritisch, min. ${result.minThicknessMm}mm empfohlen (aktuell ${result.currentThicknessMm}mm)`
            : `"${board.name}": Critical deflection, min. ${result.minThicknessMm}mm recommended (current ${result.currentThicknessMm}mm)`)
        } else if (result.rating === 'warning') {
          warnings.push(isDe
            ? `"${board.name}": Durchbiegung grenzwertig, ${result.minThicknessMm}mm empfohlen`
            : `"${board.name}": Borderline deflection, ${result.minThicknessMm}mm recommended`)
        }
        if (result.isStone && result.stoneNeedsSupport) {
          warnings.push(isDe
            ? `"${board.name}": Stein braucht Unterkonstruktion`
            : `"${board.name}": Stone needs substructure support`)
        }
      }
    }
  }

  if (warnings.length > 0) {
    context += isDe ? '\nStatik-Warnungen:\n' : '\nStructural warnings:\n'
    for (const w of warnings) {
      context += `- ${w}\n`
    }
  }

  return context
}
