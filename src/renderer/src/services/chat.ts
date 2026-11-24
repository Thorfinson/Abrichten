import type { Project } from '../types/furniture'
import { getMaterialById } from '../data/materials'
import { activeAssemblies, activeJoints } from '../utils/activeParts'
import { partLabels, partTitle } from '../utils/partLabel'
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

/**
 * Air the statics did not count for this board (services/static-sim SupportAir), for the AI:
 * why a support is missing, or a joint that connects nothing. Empty when none.
 */
function airNote(r: BoardStatic, nameOf: (id: string) => string, isDe: boolean): string[] {
  return (r.air ?? []).map((a) => {
    const mm = a.mm.toFixed(1), by = nameOf(a.by)
    if (a.kind === 'joint') {
      return isDe
        ? `Verbindung vom Typ ${a.jointType} über ${mm} mm Luft zu "${by}" – verbindet nicht (nur ein Kleberbett bis 5 mm oder ein Beschlag mit passendem Bereich „Überbrückt Spalt“ erklärt Luft)`
        : `joint of type ${a.jointType} across ${mm} mm of air to "${by}" – connects nothing (only a glue bed up to 5 mm or hardware with a fitting "Bridges gap" range explains air)`
    }
    return isDe ? `Luft ${mm} mm zu "${by}", kein Auflager` : `air ${mm} mm to "${by}", no support`
  })
}

/** One line on a critical, warning or unsupported board, or one with a joint across air, for the AI; null for the others. */
function staticNote(name: string, r: BoardStatic | undefined, isDe: boolean, nameOf: (id: string) => string = (id) => id): string | null {
  if (!r) return null
  const air = airNote(r, nameOf, isDe)
  // carried in a loop where load was not counted: say so, whatever the rating (services/static-sim BoardStatic.unsure)
  const unsure = (r.unsure ?? []).map((u) => u.reason === 'wahl'
    ? (isDe
      ? `unsicher: hängt davon ab, wie ein Kreis aufgebrochen wird (andersherum ${Math.round((u.uOther ?? 0) * 100)} %, Last ${Math.abs(u.kg)} kg anders)`
      : `unsure: depends on how a loop is broken (the other way ${Math.round((u.uOther ?? 0) * 100)} %, load ${Math.abs(u.kg)} kg different)`)
    : u.reason === 'folge'
      ? (isDe ? `unsicher: bekommt Last von ${u.count ?? 1} Teil(en) darüber (u. a. "${nameOf(u.withId)}"), denen zusammen ${u.kg} kg aus Kreisen fehlen` : `unsure: carries load from ${u.count ?? 1} part(s) above (e.g. "${nameOf(u.withId)}") that miss ${u.kg} kg from loops together`)
      : u.role === 'fehlt'
        ? (isDe ? `unsicher: ${u.kg} kg von "${nameOf(u.withId)}" fehlen hier (Kreis)` : `unsure: ${u.kg} kg from "${nameOf(u.withId)}" are missing here (loop)`)
        : (isDe ? `unsicher: gibt ${u.kg} kg im Kreis an "${nameOf(u.withId)}", dort nicht gezählt` : `unsure: hands ${u.kg} kg in a loop to "${nameOf(u.withId)}", not counted there`))
  if (r.status === 'unsupported') {
    return (isDe
      ? `"${name}": kein ausreichendes Auflager (fällt, kippt oder liegt nur auf einem schmalen Punkt)`
      : `"${name}": no adequate support (falls, tips or rests on one narrow point)`) + ([...air, ...unsure].length ? `; ${[...air, ...unsure].join('; ')}` : '')
  }
  if (r.status !== 'critical' && r.status !== 'warning') {
    const joints = [...air.filter((_, i) => r.air?.[i]?.kind === 'joint'), ...unsure]
    return joints.length ? `"${name}": ${joints.join('; ')}` : null
  }
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
      ? `Mindestdicke ${r.minThicknessMm} mm (aktuell ${Math.round(r.thicknessMm * 10) / 10} mm)`
      : `minimum thickness ${r.minThicknessMm} mm (current ${Math.round(r.thicknessMm * 10) / 10} mm)`)
  }
  parts.push(...air, ...unsure)
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
  // the part labels the user sees on every list and print ("Herd 2"), so they can be referred to
  const labels = partLabels(project.assemblies)
  const titles = new Map(project.assemblies.flatMap((a) => a.boards).map((b) => [b.id, partTitle(labels.get(b.id), b.name)]))
  const titleOf = (id: string): string => titles.get(id) ?? id
  context += isDe
    ? 'Jedes Bauteil beginnt mit seiner Teilenummer (Kurzwort der Baugruppe und Nummer, z. B. "Herd 2"), so wie sie in allen Listen und auf den Teilen steht.\n'
    : 'Each part starts with its part number (the assembly\'s short word and a number, e.g. "Herd 2"), as on every list and on the parts.\n'

  const warnings: string[] = []
  // The load simulation sees the same boards as the 3D heat map: visible assemblies
  const sim = simulateStatics(activeAssemblies(project).flatMap((a) => a.boards), {
    payloadKg, customMaterials: project.customMaterials, customHardware: project.customHardware, hardwareBridges: project.hardwareBridges,
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
      context += `- ${partTitle(labels.get(board.id), board.name)}: ${board.width}x${board.height}x${board.depth}mm, ${matName}`
      context += `, pos(${board.position.x},${board.position.y},${board.position.z})`
      if (board.rotation.x || board.rotation.y || board.rotation.z) {
        context += `, rot(${board.rotation.x},${board.rotation.y},${board.rotation.z})`
      }
      context += '\n'

      // Same simulation as the static heat map and the static summary
      const note = staticNote(partTitle(labels.get(board.id), board.name), sim.results.get(board.id), isDe, titleOf)
      if (note) warnings.push(note)
    }
  }

  if (warnings.length > 0) {
    context += isDe
      ? `\nStatik-Warnungen (Lastsimulation, ${payloadKg} kg Nutzlast je Fachboden; 2D-FE-Modell je Bauteil; Auslastung = Spannung / Festigkeit unter Dauerlast an der ungünstigsten Stelle, Durchbiegung mit Kriechen, 100 % = Bruch):\n`
      : `\nStructural warnings (load simulation, ${payloadKg} kg payload per shelf; 2D finite-element model per part; utilisation = stress / strength under permanent load at the worst point, deflection including creep, 100 % = breaks):\n`
    for (const w of warnings) {
      context += `- ${w}\n`
    }
  }
  // the self-check of the whole run: load that does not reach the floor makes every number above unsure
  const lostKg = (sim.balance.droppedN + sim.balance.stuckN) / GRAVITY
  if (lostKg > 0.5) {
    const totalKg = sim.balance.inN / GRAVITY
    context += isDe
      ? `\nLastbilanz: ${lostKg.toFixed(1)} von ${totalKg.toFixed(0)} kg kommen nicht am Boden an (${(sim.balance.droppedN / GRAVITY).toFixed(1)} kg in Kreisen nicht gezählt, ${(sim.balance.stuckN / GRAVITY).toFixed(1)} kg in Teilen ohne Auflager). Die Statik ist unsicher; „ok“ ist kein Beleg.\n`
      : `\nLoad balance: ${lostKg.toFixed(1)} of ${totalKg.toFixed(0)} kg do not reach the floor (${(sim.balance.droppedN / GRAVITY).toFixed(1)} kg not counted in loops, ${(sim.balance.stuckN / GRAVITY).toFixed(1)} kg in parts without support). The statics are unsure; "ok" is no proof.\n`
  }

  return context
}
