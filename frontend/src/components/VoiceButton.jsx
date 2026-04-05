import { useState, useRef, useCallback } from 'react'

const MicIcon = () => (
  <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="18" y="4" width="16" height="26" rx="8" fill="currentColor"/>
    <path d="M10 24C10 33.941 17.059 42 26 42C34.941 42 42 33.941 42 24" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="26" y1="42" x2="26" y2="48" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="18" y1="48" x2="34" y2="48" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
  </svg>
)

const StopIcon = () => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="10" width="24" height="24" rx="4" fill="currentColor"/>
  </svg>
)

const SpinnerIcon = () => (
  <svg className="spin-gentle" width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="26" cy="26" r="20" stroke="currentColor" strokeWidth="4" strokeOpacity="0.2"/>
    <path d="M26 6C26 6 38 8 44 18" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
  </svg>
)

export default function VoiceButton({ onTranscript, agentState }) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef(null)

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Voice input isn't available in this browser. Please use Chrome.")
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onstart = () => {
      setIsListening(true)
      setTranscript('')
    }

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) final += t
        else interim += t
      }
      setTranscript(final || interim)
      if (final) {
        stopListening()
        onTranscript(final.trim())
      }
    }

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
      if (event.error === 'not-allowed') {
        alert("Please allow microphone access to use Navigator.")
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      if (transcript && recognitionRef.current) {
        onTranscript(transcript.trim())
      }
    }

    recognition.start()
  }, [onTranscript, stopListening, transcript])

  const handleClick = useCallback(() => {
    if (agentState === 'working') return
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }, [agentState, isListening, startListening, stopListening])

  const isWorking = agentState === 'working' || agentState === 'processing'
  const isIdle = agentState === 'idle'

  // Button appearance config per state
  let btnBg, btnShadow, btnLabel, btnIcon, ringClass
  if (isWorking) {
    btnBg = 'bg-blue-400'
    btnShadow = '0 0 0 0 rgba(74,158,222,0)'
    btnLabel = "I'm working on it..."
    btnIcon = <SpinnerIcon />
    ringClass = ''
  } else if (isListening) {
    btnBg = 'bg-red-400'
    btnShadow = ''
    btnLabel = "I'm listening..."
    btnIcon = <StopIcon />
    ringClass = 'pulse-ring'
  } else {
    btnBg = 'bg-blue-500'
    btnShadow = ''
    btnLabel = isIdle ? 'Tap to speak' : 'Tap to speak again'
    btnIcon = <MicIcon />
    ringClass = ''
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* The big button */}
      <div className="relative flex items-center justify-center">
        {/* Pulse rings */}
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-full bg-red-400 opacity-30 animate-ping" style={{animationDuration: '1.2s'}}/>
            <span className="absolute inset-0 rounded-full bg-red-300 opacity-20 animate-ping" style={{animationDuration: '1.8s', animationDelay: '0.3s'}}/>
          </>
        )}

        <button
          onClick={handleClick}
          disabled={isWorking}
          className={`
            relative z-10 rounded-full text-white transition-all duration-200
            flex items-center justify-center
            ${btnBg}
            ${isWorking ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:scale-105 active:scale-95'}
          `}
          style={{
            width: 160,
            height: 160,
            boxShadow: isListening
              ? '0 0 0 6px rgba(224,82,82,0.2), 0 8px 32px rgba(224,82,82,0.3)'
              : isWorking
              ? '0 0 0 6px rgba(74,158,222,0.15), 0 8px 32px rgba(74,158,222,0.25)'
              : '0 0 0 6px rgba(74,158,222,0.15), 0 8px 32px rgba(74,158,222,0.3)',
          }}
          aria-label={btnLabel}
        >
          {btnIcon}
        </button>
      </div>

      {/* Label below button */}
      <p
        className="text-center font-bold transition-all duration-300"
        style={{
          fontSize: '1.25rem',
          color: isListening ? '#b83636' : isWorking ? '#2277bc' : '#2277bc',
          letterSpacing: '0.01em',
        }}
      >
        {btnLabel}
      </p>

      {/* Live transcript preview */}
      {isListening && transcript && (
        <div
          className="fade-in-up text-center px-6 py-3 rounded-2xl max-w-sm"
          style={{
            background: 'rgba(74,158,222,0.08)',
            border: '1.5px solid rgba(74,158,222,0.2)',
            color: '#2277bc',
            fontSize: '1.05rem',
            fontStyle: 'italic',
          }}
        >
          "{transcript}"
        </div>
      )}
    </div>
  )
}