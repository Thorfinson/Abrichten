import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/useProjectStore'
import { useUIStore } from '../../store/useUIStore'
import { getApiKey, getModelId } from '../layout/SettingsDialog'
import { streamChat, type ChatMessage } from '../../services/openrouter'
import { serializeProjectContext } from '../../services/chat'
import { extractBoardActions, type BoardAction } from '../../services/action-parser'
import { Button } from '../ui/Dialog'

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

  // Closing the panel mid-reply unmounts it: stop the request and save what
  // arrived so far plus a note, so the reply is never lost silently.
  const latestRef = useRef({ messages, chatHistory })
  latestRef.current = { messages, chatHistory }
  useEffect(() => () => {
    if (!abortRef.current) return
    abortRef.current.abort()
    abortRef.current = null
    const { messages: shown, chatHistory: history } = latestRef.current
    const last = shown[shown.length - 1]
    const partial = last?.role === 'assistant' ? last.content : ''
    saveChatHistory(
      [...shown, { role: 'system', content: t('ui.chatAborted') }],
      partial ? [...history, { role: 'assistant', content: partial }] : history
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      const systemPrompt = serializeProjectContext(project, project.language, useUIStore.getState().staticLoadKg)

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
    <div role="dialog" aria-label={t('ai.title')} className="fixed right-0 z-50 w-80 border-l border-chrome-border bg-chrome-bg text-chrome-text flex flex-col shadow-2xl select-text top-9 bottom-7 [color-scheme:dark]">
      {/* Header: the AI purple is the accent (top rule + icon), the rest is chrome */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-chrome-border border-t-2 border-t-ai shrink-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-ai" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" /><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
          </svg>
          {t('ai.title')}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleNewChat} title={t('ai.chat.newChat')}>
            {t('ai.chat.newChat')}
          </Button>
          <button
            type="button"
            onClick={() => setShowChatPanel(false)}
            aria-label={t('ui.close')}
            title={t('ui.close')}
            className="flex h-7 w-7 items-center justify-center rounded text-chrome-muted outline-none hover:bg-chrome-hover hover:text-chrome-text focus-visible:ring-2 focus-visible:ring-action"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Context indicator */}
      <div className="px-3 py-1 text-[10px] text-chrome-hint border-b border-chrome-border bg-chrome-deep/60">
        {t('ai.chat.context')}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {!apiKey || !modelId ? (
          <div className="flex flex-col items-center gap-3 mt-6 px-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ai-dim/60 text-ai">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" /><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
              </svg>
            </span>
            <p className="text-sm font-medium text-chrome-text">{t('ai.noApiKey')}</p>
            <p className="text-xs text-chrome-muted">
              {t('ai.configureKey')}
            </p>
            <Button
              variant="primary"
              onClick={() => { setShowChatPanel(false); setSettingsOpen(true) }}
              className="mt-1"
            >
              {t('ai.openSettings')}
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-chrome-hint mt-4 text-center">{t('ai.chat.placeholder')}</p>
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
        <div className="border-t border-chrome-border p-2 shrink-0">
          {/* Image preview */}
          {imagePreview && (
            <div className="mb-2 relative inline-block">
              <img
                src={imagePreview}
                alt="Upload"
                className="h-16 rounded border border-chrome-border object-cover"
              />
              <button
                type="button"
                onClick={removeImage}
                aria-label={t('actions.delete')}
                className="absolute -top-1 -right-1 w-4 h-4 bg-chrome-surface text-chrome-text border border-chrome-divider hover:bg-danger rounded-full text-[10px] leading-none flex items-center justify-center"
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
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded bg-chrome-surface hover:bg-chrome-hover text-chrome-secondary outline-none focus-visible:ring-2 focus-visible:ring-action"
              title={t('ai.chat.uploadImage')}
              aria-label={t('ai.chat.uploadImage')}
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
              aria-label={t('ai.chat.placeholder')}
              rows={1}
              className="flex-1 text-sm bg-chrome-deep border border-chrome-border text-chrome-text placeholder:text-chrome-hint rounded px-2 py-1.5 resize-none outline-none focus:border-action"
            />

            {/* Send / Stop */}
            {streaming ? (
              <button
                onClick={handleStop}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded bg-chrome-surface hover:bg-chrome-hover text-danger outline-none focus-visible:ring-2 focus-visible:ring-action"
                title={t('ai.chat.stop')}
                aria-label={t('ai.chat.stop')}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && !imageBase64}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded bg-action enabled:hover:bg-action-hover text-action-text disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-action-hover"
                title={t('ai.chat.send')}
                aria-label={t('ai.chat.send')}
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
        <span className="text-[10px] text-chrome-muted bg-chrome-deep border border-chrome-border px-2 py-0.5 rounded-full">
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
            ? 'bg-chrome-surface text-chrome-text'
            : 'bg-chrome-deep text-chrome-text border border-chrome-border border-l-2 border-l-ai/70'
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
        {/* Boards the parser had to drop (unusable values) — say why instead of hiding them */}
        {message.actions?.skipped?.length ? (
          <div className="mt-2 text-xs text-accent">
            {t('store.aiBoardsSkipped', { count: message.actions.skipped.length, reasons: message.actions.skipped.join('; ') })}
          </div>
        ) : null}

        {message.actions && message.actions.boards.length > 0 && (
          <Button
            size="sm"
            onClick={() => onApply(message.actions!, msgIdx)}
            className={`mt-2 w-full ${message.actionsApplied ? 'text-success' : 'ring-1 ring-ai/50'}`}
          >
            {message.actionsApplied
              ? `↻ ${t('ai.chat.apply')} (${message.actions.boards.length} Boards)`
              : `${t('ai.chat.apply')} (${message.actions.boards.length} Boards)`
            }
          </Button>
        )}
      </div>
    </div>
  )
}
