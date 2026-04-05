import { useEffect, useRef, useCallback } from 'react'
import { speakText } from './NarrationFeed'

export default function ConfirmationModal({ question, onConfirm, onReject }) {
  const recognitionRef = useRef(null)
  const hasSpoken = useRef(false)

  // Speak the question when modal appears
  useEffect(() => {
    if (question && !hasSpoken.current) {
      hasSpoken.current = true
      speakText(question)
    }
    return () => {
      hasSpoken.current = false
      stopVoiceListening()
    }
  }, [question])

  // Start voice listening for yes/no after speaking
  useEffect(() => {
    if (!question) return
    // Start listening after a short delay (let TTS finish)
    const timer = setTimeout(() => startVoiceListening(), 2500)
    return () => clearTimeout(timer)
  }, [question])

  const stopVoiceListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) {}
      recognitionRef.current = null
    }
  }, [])

  const startVoiceListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      const heard = event.results[0][0].transcript.toLowerCase().trim()
      const yesWords = ['yes', 'yeah', 'yep', 'sure', 'go ahead', 'okay', 'ok', 'confirm', 'do it', 'please', 'absolutely']
      const noWords = ['no', 'nope', 'stop', 'cancel', 'don\'t', 'abort', 'wait', 'hold on', 'no thanks']
      if (yesWords.some(w => heard.includes(w))) {
        stopVoiceListening()
        onConfirm()
      } else if (noWords.some(w => heard.includes(w))) {
        stopVoiceListening()
        onReject()
      }
    }

    recognition.onerror = () => {}
    recognition.onend = () => {}

    try { recognition.start() } catch (e) {}
  }, [onConfirm, onReject, stopVoiceListening])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 fade-in"
      style={{ background: 'rgba(10,30,60,0.72)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-lg rounded-3xl p-8 flex flex-col items-center gap-8 fade-in-up"
        style={{
          background: '#ffffff',
          boxShadow: '0 32px 80px rgba(10,30,60,0.28)',
          border: '2px solid rgba(74,158,222,0.2)',
        }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="rounded-full flex items-center justify-center"
            style={{ width: 72, height: 72, background: 'rgba(74,158,222,0.1)', fontSize: '2.2rem' }}
          >
            🤔
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: '1.05rem',
              fontWeight: 700,
              color: '#4a9ede',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            I need your permission
          </h2>
        </div>

        {/* Question */}
        <p
          className="text-center"
          style={{
            margin: 0,
            fontSize: '1.35rem',
            lineHeight: 1.6,
            fontWeight: 600,
            color: '#1a2a3a',
          }}
        >
          {question}
        </p>

        {/* Voice hint */}
        <p style={{ margin: 0, fontSize: '0.95rem', color: '#7a90a8', textAlign: 'center' }}>
          You can tap the buttons below or just say <strong>"Yes"</strong> or <strong>"No"</strong>
        </p>

        {/* Buttons */}
        <div className="flex gap-4 w-full">
          <button
            onClick={onReject}
            className="flex-1 rounded-2xl font-bold transition-all duration-150 active:scale-95 hover:scale-102"
            style={{
              padding: '20px 16px',
              fontSize: '1.3rem',
              background: 'rgba(224,82,82,0.08)',
              border: '2.5px solid rgba(224,82,82,0.3)',
              color: '#b83636',
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(224,82,82,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(224,82,82,0.08)'}
          >
            🚫 NO, stop
          </button>

          <button
            onClick={onConfirm}
            className="flex-1 rounded-2xl font-bold transition-all duration-150 active:scale-95"
            style={{
              padding: '20px 16px',
              fontSize: '1.3rem',
              background: 'linear-gradient(135deg, #4caf7d, #357a57)',
              border: '2.5px solid transparent',
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(76,175,125,0.35)',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            ✅ YES, go ahead
          </button>
        </div>
      </div>
    </div>
  )
}