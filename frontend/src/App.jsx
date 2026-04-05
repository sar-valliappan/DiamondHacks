import { useState, useRef, useCallback, useEffect } from 'react'
import VoiceButton from './components/VoiceButton'
import NarrationFeed from './components/NarrationFeed'
import ConfirmationModal from './components/ConfirmationModal'
import StatusDisplay from './components/StatusDisplay'
import { speakText } from './components/NarrationFeed'

const API_BASE = 'http://localhost:8000'

// Demo preset tasks for presenter buttons
const DEMO_TASKS = [
  { label: '💊 Prescription', task: 'I need to refill my prescription on CVS pharmacy website' },
  { label: '⚡ Pay Bill', task: 'Help me pay my electricity bill on SDG&E website' },
  { label: '🩺 Find Doctor', task: 'Find me a doctor who takes Medicare near San Diego' },
]

let narrationIdCounter = 0

export default function App() {
  const [agentState, setAgentState] = useState('idle') // idle | listening | processing | working | waiting | completed | error
  const [narrations, setNarrations] = useState([])
  const [confirmation, setConfirmation] = useState(null) // { question, taskId }
  const [currentTaskId, setCurrentTaskId] = useState(null)
  const eventSourceRef = useRef(null)

  // Close SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
    }
  }, [])

  const addNarration = useCallback((message, type = 'narration') => {
    setNarrations(prev => [...prev, { id: ++narrationIdCounter, message, type }])
  }, [])

  const startTask = useCallback(async (spokenRequest) => {
    // Close any existing SSE
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setAgentState('processing')
    setNarrations([])
    setConfirmation(null)

    let taskId
    try {
      const res = await fetch(`${API_BASE}/api/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spoken_request: spokenRequest }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      taskId = data.task_id
      setCurrentTaskId(taskId)
    } catch (err) {
      setAgentState('error')
      addNarration("I'm sorry, I couldn't connect to the server. Please make sure it's running and try again.", 'error')
      return
    }

    // Open SSE stream
    const es = new EventSource(`${API_BASE}/api/stream/${taskId}`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      let data
      try { data = JSON.parse(event.data) } catch { return }

      switch (data.type) {
        case 'processing':
          setAgentState('processing')
          if (data.message) addNarration(data.message)
          break

        case 'narration':
          setAgentState('working')
          if (data.message) addNarration(data.message, 'narration')
          break

        case 'confirmation_required':
          setAgentState('waiting')
          setConfirmation({ question: data.message, taskId })
          break

        case 'confirmation_received':
          setConfirmation(null)
          setAgentState('working')
          break

        case 'completed':
          setAgentState('completed')
          if (data.message) addNarration(data.message, 'completed')
          es.close()
          // Return to idle after 8 seconds
          setTimeout(() => setAgentState('idle'), 8000)
          break

        case 'error':
          setAgentState('error')
          if (data.message) addNarration(data.message, 'error')
          es.close()
          setTimeout(() => setAgentState('idle'), 6000)
          break

        case 'stream_end':
          es.close()
          if (agentState !== 'completed' && agentState !== 'error') {
            setAgentState('idle')
          }
          break
      }
    }

    es.onerror = () => {
      es.close()
      setAgentState(prev => {
        if (prev === 'working' || prev === 'processing') {
          addNarration("I lost connection. Please try again.", 'error')
          return 'error'
        }
        return prev
      })
    }
  }, [addNarration])

  const handleConfirm = useCallback(async () => {
    if (!confirmation) return
    const { taskId } = confirmation
    setConfirmation(null)
    setAgentState('working')
    speakText("Got it, going ahead!")
    try {
      await fetch(`${API_BASE}/api/confirm/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      })
    } catch (err) {
      console.error('Confirm failed:', err)
    }
  }, [confirmation])

  const handleReject = useCallback(async () => {
    if (!confirmation) return
    const { taskId } = confirmation
    setConfirmation(null)
    setAgentState('working')
    speakText("Okay, I stopped. Let me know if you want to try something else.")
    try {
      await fetch(`${API_BASE}/api/confirm/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: false }),
      })
    } catch (err) {
      console.error('Reject failed:', err)
    }
  }, [confirmation])

  // Map agentState to status display
  const statusMap = {
    idle: 'idle',
    processing: 'processing',
    working: 'working',
    waiting: 'waiting',
    completed: 'completed',
    error: 'error',
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(160deg, #f0f7ff 0%, #e8f4fd 40%, #f5f9ff 100%)',
      }}
    >
      {/* Decorative background blobs */}
      <div
        aria-hidden
        style={{
          position: 'fixed', top: -80, right: -80, width: 340, height: 340,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(74,158,222,0.10) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'fixed', bottom: -60, left: -60, width: 280, height: 280,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(76,175,125,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Main layout */}
      <main className="flex-1 flex flex-col items-center justify-between px-6 py-10 gap-8 max-w-2xl mx-auto w-full">

        {/* Header */}
        <header className="flex flex-col items-center gap-2 text-center">
          <div
            className="rounded-2xl flex items-center justify-center mb-1"
            style={{
              width: 64, height: 64,
              background: 'linear-gradient(135deg, #4a9ede, #2277bc)',
              boxShadow: '0 4px 20px rgba(74,158,222,0.3)',
              fontSize: '2rem',
            }}
          >
            🧭
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: '2.2rem',
              fontWeight: 900,
              color: '#1a2a3a',
              letterSpacing: '-0.02em',
              fontFamily: "'Lora', Georgia, serif",
            }}
          >
            Navigator
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '1.1rem',
              color: '#4a6080',
              fontWeight: 500,
            }}
          >
            Your helper on the web
          </p>
        </header>

        {/* Center — Voice Button */}
        <div className="flex-1 flex flex-col items-center justify-center gap-10 w-full py-4">
          <VoiceButton
            onTranscript={startTask}
            agentState={agentState}
          />

          {/* Narration Feed */}
          {narrations.length > 0 && (
            <NarrationFeed narrations={narrations} />
          )}

          {/* Welcome message when idle */}
          {agentState === 'idle' && narrations.length === 0 && (
            <div
              className="text-center fade-in max-w-sm"
              style={{ color: '#4a6080', fontSize: '1.05rem', lineHeight: 1.6 }}
            >
              <p style={{ margin: 0 }}>
                Just tap the big button above and tell me what you need help with on the web. I'll take care of it for you.
              </p>
            </div>
          )}
        </div>

        {/* Bottom status */}
        <footer className="flex flex-col items-center gap-4 w-full">
          <StatusDisplay status={statusMap[agentState] || 'idle'} />
        </footer>
      </main>

      {/* Confirmation Modal */}
      {confirmation && (
        <ConfirmationModal
          question={confirmation.question}
          onConfirm={handleConfirm}
          onReject={handleReject}
        />
      )}

      {/* Demo presenter buttons — subtle, bottom corner */}
      <div
        className="fixed bottom-4 right-4 flex flex-col gap-2 items-end"
        style={{ zIndex: 40 }}
      >
        <p
          style={{
            margin: 0, fontSize: '0.65rem', color: '#aab8c8',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            fontWeight: 700,
          }}
        >
          Demo presets
        </p>
        {DEMO_TASKS.map(({ label, task }) => (
          <button
            key={label}
            onClick={() => startTask(task)}
            disabled={agentState === 'working' || agentState === 'processing'}
            className="rounded-xl transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              padding: '7px 14px',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: 'rgba(255,255,255,0.85)',
              border: '1.5px solid rgba(74,158,222,0.25)',
              color: '#2277bc',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 10px rgba(74,158,222,0.12)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}