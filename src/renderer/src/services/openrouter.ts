export interface OpenRouterModel {
  id: string
  name: string
  pricing: {
    prompt: string
    completion: string
  }
}

import { loadEnvConfig } from '../config/env'

const BASE_URL = loadEnvConfig().openRouterBaseUrl

/**
 * Fetch available vision-capable models from OpenRouter.
 */
export async function fetchVisionModels(apiKey: string): Promise<OpenRouterModel[]> {
  const res = await fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`)

  const data = await res.json()
  // Filter for models that support images/multimodal
  const models: OpenRouterModel[] = (data.data || [])
    .filter((m: any) =>
      m.architecture?.modality === 'text+image->text' ||
      m.context_length > 0 // fallback: include all if modality filter fails
    )
    .map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      pricing: {
        prompt: m.pricing?.prompt || '0',
        completion: m.pricing?.completion || '0'
      }
    }))
    .slice(0, 50) // limit to 50 models

  return models
}

/**
 * Send an image to OpenRouter for analysis and furniture extraction.
 */
export async function analyzeSketch(
  apiKey: string,
  modelId: string,
  imageBase64: string,
  language: 'de' | 'en'
): Promise<string> {
  const systemPrompt = language === 'de'
    ? `Du bist ein Moebeldesign-Assistent. Analysiere die Skizze und extrahiere die Moebelstuecke als JSON.
Antworte NUR mit einem JSON-Objekt im folgenden Format:
{
  "type": "Schrank|Regal|Kueche|Kommode|Tisch",
  "name": "Beschreibender Name",
  "boards": [
    {
      "name": "Seitenwand links",
      "width": 600,
      "height": 2000,
      "depth": 18,
      "positionX": 0,
      "positionY": 0,
      "positionZ": 0,
      "rotationX": 0,
      "rotationY": 0,
      "rotationZ": 0,
      "material": "spanplatte"
    }
  ]
}
Alle Masse in mm. Rotation in Grad (0-360). Schaetze realistische Moebelmasse wenn nicht erkennbar.`
    : `You are a furniture design assistant. Analyze the sketch and extract furniture pieces as JSON.
Respond ONLY with a JSON object in this format:
{
  "type": "Cabinet|Shelf|Kitchen|Dresser|Table",
  "name": "Descriptive name",
  "boards": [
    {
      "name": "Left side panel",
      "width": 600,
      "height": 2000,
      "depth": 18,
      "positionX": 0,
      "positionY": 0,
      "positionZ": 0,
      "rotationX": 0,
      "rotationY": 0,
      "rotationZ": 0,
      "material": "chipboard"
    }
  ]
}
All dimensions in mm. Rotation in degrees (0-360). Estimate realistic furniture dimensions if not clearly visible.`

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
            },
            {
              type: 'text',
              text: language === 'de'
                ? 'Analysiere diese Moebel-Skizze und gib die Bauteile als JSON zurueck.'
                : 'Analyze this furniture sketch and return the components as JSON.'
            }
          ]
        }
      ],
      max_tokens: 2000
    })
  })

  if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  image?: string
}

/**
 * Send chat messages to OpenRouter with streaming response.
 * Calls onChunk for each new text delta. Returns the full response text.
 */
export async function streamChat(
  apiKey: string,
  modelId: string,
  messages: ChatMessage[],
  systemPrompt: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const apiMessages: any[] = [{ role: 'system', content: systemPrompt }]

  for (const msg of messages) {
    if (msg.role === 'user' && msg.image) {
      apiMessages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${msg.image}` } },
          { type: 'text', text: msg.content }
        ]
      })
    } else {
      apiMessages.push({ role: msg.role, content: msg.content })
    }
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: apiMessages,
      max_tokens: 4000,
      stream: true
    }),
    signal
  })

  if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`)

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          fullText += delta
          onChunk(delta)
        }
      } catch {
        // Skip unparseable SSE chunks
      }
    }
  }

  return fullText
}
