import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { getApiKey, getModelId } from '../layout/SettingsDialog'
import { streamChat, type ChatMessage } from '../../services/openrouter'
import { serializeProjectContext } from '../../services/chat'
import { extractBoardActions, type BoardAction } from '../../services/action-parser'
import type { Board } from '../../types/furniture'

const CHAT_STORAGE_KEY = 'abrichten-chat-history'

interface DisplayMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  image?: string
  actions?: BoardAction | null
  actionsApplied?: boolean
}

/** Load chat from localStorage, re-parse actions from text to pick up parser fixes */
function loadChatHistory(): { messages: DisplayMessage[]; history: ChatMessage[] } {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      const messages: DisplayMessage[] = (data.messages || []).map((m: DisplayMessage) => {
        // Re-parse actions from assistant message text so parser fixes apply
        if (m.role === 'assistant' && m.content) {
          const actions = extractBoardActions(m.content)
          return { ...m, actions, actionsApplied: false }
        }
        return m
      })
      return {
        messages,
        history: data.history || []
      }
    }
  } catch { /* ignore */ }
  return { messages: [], history: [] }
}

/** Save chat to localStorage */
function saveChatHistory(messages: DisplayMessage[], history: ChatMessage[]) {
  try {
    // Don't save images in localStorage (too large), strip them
    const cleanMessages = messages.map((m) => ({ ...m, image: undefined }))
    const cleanHistory = history.map((h) => ({ ...h, image: undefined }))
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
      messages: cleanMessages,
      history: cleanHistory
    }))
  } catch { /* storage full, ignore */ }
}

export function ChatPanel() {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const addAssembly = useProjectStore((s) => s.addAssembly)
  const addBoardsBatch = useProjectStore((s) => s.addBoardsBatch)
  const setShowChatPanel = useUIStore((s) => s.setShowChatPanel)
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)

  // Load saved chat on mount
  const [messages, setMessages] = useState<DisplayMessage[]>(() => loadChatHistory().messages)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => loadChatHistory().history)
  const [input, setInput] = useState('')
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const apiKey = getApiKey()
  const modelId = getModelId()

  // Save chat history whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory(messages, chatHistory)
    }
  }, [messages, chatHistory])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImagePreview(dataUrl)
      setImageBase64(dataUrl.split(',')[1])
    }
    reader.readAsDataURL(file)
  }, [])

  const removeImage = useCallback(() => {
    setImageBase64(null)
    setImagePreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text && !imageBase64) return
    if (!apiKey || !modelId) return
    if (streaming) return

    const userContent = text || (imageBase64 ? t('ai.chat.imageUploaded') : '')

    // Add user message to display
    const userMsg: DisplayMessage = {
      role: 'user',
      content: userContent,
      image: imagePreview || undefined
    }
    setMessages((prev) => [...prev, userMsg])

    // Build chat history entry
    const historyEntry: ChatMessage = {
      role: 'user',
      content: userContent,
      image: imageBase64 || undefined
    }
    const newHistory = [...chatHistory, historyEntry]
    setChatHistory(newHistory)

    // Clear input
    setInput('')
    removeImage()

    // Start streaming
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller

    // Add empty assistant message
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const systemPrompt = serializeProjectContext(project, project.language)

      const fullText = await streamChat(
        apiKey,
        modelId,
        newHistory,
        systemPrompt,
        (chunk) => {
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + chunk }
            }
            return updated
          })
        },
        controller.signal
      )

      // Parse board actions from complete response
      const actions = extractBoardActions(fullText)

      // Update final assistant message with actions
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: fullText, actions }
        }
        return updated
      })

      // 20c: If no board actions parsed, add a hint message
      if (!actions && fullText.length > 50) {
        const lang = project.language ?? 'de'
        const hint = lang === 'de'
          ? 'Keine Bauteile erkannt. Frage mich: "Erstelle einen Schrank mit genauen Maßen als JSON"'
          : 'No board definitions detected. Try: "Create a cabinet with exact dimensions as JSON"'
        setMessages((prev) => [...prev, { role: 'system', content: hint }])
      }

      // Add to chat history
      setChatHistory((prev) => [...prev, { role: 'assistant', content: fullText }])
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: last.content || `${t('ai.chat.error')}: ${err.message}`
            }
          }
          return updated
        })
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, imageBase64, imagePreview, apiKey, modelId, streaming, chatHistory, project, t, removeImage])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleApplyBoards = useCallback((action: BoardAction, msgIdx: number) => {
    // Use addBoardsBatch for atomic undo (all boards in one history step)
    const assemblyId = addAssembly(action.name)
    addBoardsBatch(assemblyId, action.boards)
    // Mark the action as applied so the button changes
    setMessages((prev) => {
      const updated = [...prev]
      if (updated[msgIdx]) {
        updated[msgIdx] = { ...updated[msgIdx], actionsApplied: true }
      }
      return [
        ...updated,
        {
          role: 'system' as const,
          content: t('ai.chat.applied', { count: action.boards.length })
        }
      ]
    })
  }, [addAssembly, addBoardsBatch, t])

  const handleNewChat = useCallback(() => {
    setMessages([])
    setChatHistory([])
    setInput('')
    removeImage()
    localStorage.removeItem(CHAT_STORAGE_KEY)
    if (streaming) {
      abortRef.current?.abort()
    }
  }, [removeImage, streaming])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className="fixed right-0 z-50 w-80 border-l border-gray-200 bg-white flex flex-col shadow-xl select-text top-9 bottom-6">
      {/* Header */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-gray-200 bg-gray-50 shrink-0">
        <span className="text-sm font-semibold text-purple-700">{t('ai.title')}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300"
            title={t('ai.chat.newChat')}
          >
            {t('ai.chat.newChat')}
          </button>
          <button
            onClick={() => setShowChatPanel(false)}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Context indicator */}
      <div className="px-3 py-1 text-[10px] text-gray-400 border-b border-gray-100 bg-gray-50/50">
        {t('ai.chat.context')}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {!apiKey || !modelId ? (
          <div className="flex flex-col items-center gap-3 mt-6 px-2 text-center">
            <span className="text-4xl">✦</span>
            <p className="text-sm font-medium text-gray-700">{t('ai.noApiKey')}</p>
            <p className="text-xs text-gray-500">
              {t('ai.configureKey')}
            </p>
            <button
              onClick={() => { setShowChatPanel(false); setSettingsOpen(true) }}
              className="mt-1 px-4 py-2 text-sm rounded bg-purple-600 text-white hover:bg-purple-700"
            >
              {t('ai.openSettings')}
            </button>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-gray-400 mt-4 text-center">{t('ai.chat.placeholder')}</p>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              msgIdx={i}
              onApply={handleApplyBoards}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {apiKey && modelId && (
        <div className="border-t border-gray-200 p-2 shrink-0">
          {/* Image preview */}
          {imagePreview && (
            <div className="mb-2 relative inline-block">
              <img
                src={imagePreview}
                alt="Upload"
                className="h-16 rounded border border-gray-200 object-cover"
              />
              <button
                onClick={removeImage}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center"
              >
                &times;
              </button>
            </div>
          )}

          <div className="flex gap-1">
            {/* Image upload */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-500"
              title={t('ai.chat.uploadImage')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            {/* Text input */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('ai.chat.placeholder')}
              rows={1}
              className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400"
            />

            {/* Send / Stop */}
            {streaming ? (
              <button
                onClick={handleStop}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded bg-red-500 hover:bg-red-600 text-white"
                title={t('ai.chat.stop')}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && !imageBase64}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-40"
                title={t('ai.chat.send')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Single chat message bubble */
function MessageBubble({
  message,
  msgIdx,
  onApply
}: {
  message: DisplayMessage
  msgIdx: number
  onApply: (action: BoardAction, msgIdx: number) => void
}) {
  const { t } = useTranslation()

  if (message.role === 'system') {
    return (
      <div className="text-center">
        <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-purple-600 text-white'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        {/* Image */}
        {message.image && (
          <img
            src={message.image}
            alt="Upload"
            className="max-h-32 rounded mb-1 object-contain"
          />
        )}

        {/* Text content — selectable and copyable */}
        <div className="whitespace-pre-wrap break-words cursor-text">{message.content}</div>

        {/* Apply boards button — always available for re-import */}
        {message.actions && (
          <button
            onClick={() => onApply(message.actions!, msgIdx)}
            className={`mt-2 text-xs px-3 py-1 rounded w-full ${
              message.actionsApplied
                ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {message.actionsApplied
              ? `↻ ${t('ai.chat.apply')} (${message.actions.boards.length} Boards)`
              : `${t('ai.chat.apply')} (${message.actions.boards.length} Boards)`
            }
          </button>
        )}
      </div>
    </div>
  )
}
