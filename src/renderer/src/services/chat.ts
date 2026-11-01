import type { Project } from '../types/furniture'
import { getMaterialById } from '../data/materials'
import { activeAssemblies, activeJoints } from '../utils/activeParts'
import { GRAVITY } from './static-calc'
import { simulateStatics, type BoardStatic } from './static-sim'

/** Payload per shelf assumed for the structural notes when the caller passes none (kg). */
const CONTEXT_LOAD_KG = 20

/** Where the field axes are measured from (the board's min corner: left, back, bottom). */
const FROM: Record<'x' | 'y' | 'z', [string, string]> = {
  x: ['von links', 'from the left'],
  y: ['von unten', 'from the bottom'],
  z: ['von hinten', 'from the back']
}

/** Where a board is used most: both coordinates on its face, and for standing panels what governs. */
function hotSpot(r: BoardStatic, isDe: boolean): string {
  const [a, b] = r.field.axes
  const part = (axis: 'x' | 'y' | 'z', v: number): string => `${Math.round(v)} mm ${FROM[axis][isDe ? 0 : 1]}`
  const at = `${part(a, r.maxLocal.a)} / ${part(b, r.maxLocal.b)}`
  if (r.governing === 'buckling') return `${at} (${isDe ? 'Knicken' : 'buckling'})`
  return r.model === 'plane' ? `${at} (${isDe ? 'Spannung in der Plattenebene' : 'in-plane stress'})` : at
}

/** One line on a critical, warning or unsupported board for the AI; null for the others. */
function staticNote(name: string, r: BoardStatic | undefined, isDe: boolean): string | null {
  if (!r) return null
  if (r.status === 'unsupported') {
    return isDe
      ? `"${name}": kein ausreichendes Auflager (fällt, kippt oder liegt nur auf einem schmalen Punkt)`
      : `"${name}": no adequate support (falls, tips or rests on one narrow point)`
  }
  if (r.status !== 'critical' && r.status !== 'warning') return null
  const u = Math.round(r.uMax * 100)
  const level = r.uMax >= 1 ? (isDe ? 'bricht' : 'breaks') : r.status === 'critical' ? (isDe ? 'kritisch' : 'critical') : (isDe ? 'Warnung' : 'warning')
  const where = hotSpot(r, isDe)
  const parts = [isDe ? `Auslastung ${u} % (${level}) bei ${where}` : `utilisation ${u} % (${level}) at ${where}`]
  if (r.allowableDeflectionMm > 0) {
    const d = r.deflectionMm.toFixed(1), allow = r.allowableDeflectionMm.toFixed(1), span = Math.round(r.spanMm)
    parts.push(isDe
      ? `Durchbiegung ${d} mm (zulässig ${allow} mm, ${r.cantilever ? 'Kragarm' : 'Spannweite'} ${span} mm)`
      : `deflection ${d} mm (allowed ${allow} mm, ${r.cantilever ? 'cantilever' : 'span'} ${span} mm)`)
  }
  parts.push(isDe ? `Last ${(r.totalLoadN / GRAVITY).toFixed(0)} kg` : `load ${(r.totalLoadN / GRAVITY).toFixed(0)} kg`)
  if (r.minThicknessMm !== null) {
    parts.push(isDe
      ? `Mindestdicke ${r.minThicknessMm} mm (aktuell ${Math.round(r.thicknessMm)} mm)`
      : `minimum thickness ${r.minThicknessMm} mm (current ${Math.round(r.thicknessMm)} mm)`)
  }
  return `"${name}": ${parts.join(', ')}`
}

/**
 * Serialize the current project state into a compact system prompt
 * that gives the VLM context about the user's furniture design.
 * `payloadKg` is the payload per shelf of the load simulation behind the structural notes.
 */
export function serializeProjectContext(project: Project, language: 'de' | 'en', payloadKg = CONTEXT_LOAD_KG): string {
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
  // The load simulation sees the same boards as the 3D heat map: visible assemblies
  const sim = simulateStatics(activeAssemblies(project).flatMap((a) => a.boards), {
    payloadKg, customMaterials: project.customMaterials, customHardware: project.customHardware,
    joints: activeJoints(project).map((j) => j.joint)
  })

  for (const assembly of project.assemblies) {
    if (assembly.boards.length === 0) continue

    context += isDe
      ? `\nBaugruppe "${assembly.name}" (${assembly.boards.length} Boards):\n`
      : `\nAssembly "${assembly.name}" (${assembly.boards.length} boards):\n`

    for (const board of assembly.boards) {
      const mat = getMaterialById(board.materialId, project.customMaterials)
      const matName = mat ? (isDe ? mat.name : mat.nameEn) : board.materialId
      context += `- ${board.name}: ${board.width}x${board.height}x${board.depth}mm, ${matName}`
      context += `, pos(${board.position.x},${board.position.y},${board.position.z})`
      if (board.rotation.x || board.rotation.y || board.rotation.z) {
        context += `, rot(${board.rotation.x},${board.rotation.y},${board.rotation.z})`
      }
      context += '\n'

      // Same simulation as the static heat map and the static summary
      const note = staticNote(board.name, sim.results.get(board.id), isDe)
      if (note) warnings.push(note)
    }
  }

  if (warnings.length > 0) {
    context += isDe
      ? `\nStatik-Warnungen (Lastsimulation, ${payloadKg} kg Nutzlast je Fachboden; 2D-FE-Modell je Bauteil; Auslastung = Spannung / Festigkeit an der ungünstigsten Stelle, 100 % = Bruch):\n`
      : `\nStructural warnings (load simulation, ${payloadKg} kg payload per shelf; 2D finite-element model per part; utilisation = stress / strength at the worst point, 100 % = breaks):\n`
    for (const w of warnings) {
      context += `- ${w}\n`
    }
  }

  return context
}
