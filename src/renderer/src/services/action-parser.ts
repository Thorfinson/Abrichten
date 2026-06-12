import { parseSketchResponse } from './sketch-parser'
import type { Board } from '../types/furniture'

export interface BoardAction {
  name: string
  boards: Omit<Board, 'id'>[]
}

/**
 * Extract board actions from a VLM response text.
 * Looks for JSON blocks containing a "boards" array.
 * Returns null if no valid board actions found.
 */
export function extractBoardActions(text: string): BoardAction | null {
  // Try to find JSON code blocks first (```json ... ``` or ``` ... ```)
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const result = tryParseBoards(match[1].trim())
    if (result) return result
  }

  // Fallback: try to find any JSON object that contains "boards"
  // Use a bracket-counting approach instead of regex for nested JSON
  const boardsIdx = text.indexOf('"boards"')
  if (boardsIdx >= 0) {
    // Walk backwards to find the opening {
    let braceStart = -1
    for (let i = boardsIdx - 1; i >= 0; i--) {
      if (text[i] === '{') {
        braceStart = i
        break
      }
    }
    if (braceStart >= 0) {
      // Walk forward with brace counting to find matching }
      let depth = 0
      for (let i = braceStart; i < text.length; i++) {
        if (text[i] === '{') depth++
        if (text[i] === '}') depth--
        if (depth === 0) {
          const jsonStr = text.slice(braceStart, i + 1)
          const result = tryParseBoards(jsonStr)
          if (result) return result
          break
        }
      }
    }
  }

  return null
}

function tryParseBoards(jsonStr: string): BoardAction | null {
  try {
    // First try direct JSON.parse for clean JSON
    const obj = JSON.parse(jsonStr)
    if (obj.boards && Array.isArray(obj.boards) && obj.boards.length > 0) {
      // Use parseSketchResponse for material mapping and validation
      const parsed = parseSketchResponse(jsonStr)
      if (parsed.boards.length > 0) {
        return { name: parsed.name, boards: parsed.boards }
      }
    }
  } catch {
    // Try parseSketchResponse which has its own JSON extraction logic
    try {
      const parsed = parseSketchResponse(jsonStr)
      if (parsed.boards.length > 0) {
        return { name: parsed.name, boards: parsed.boards }
      }
    } catch {
      // Not valid board JSON
    }
  }
  return null
}
