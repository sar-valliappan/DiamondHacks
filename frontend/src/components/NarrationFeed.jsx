import { useEffect, useRef } from 'react'

const speakText = (text) => {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()

  // Small pause before speaking
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.85
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // Pick best voice: prefer Google US English or Samantha
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v =>
      v.name === 'Google US English' ||
      v.name === 'Samantha' ||
      v.name === 'Karen' ||
      v.name === 'Victoria'
    ) || voices.find(v =>
      v.lang === 'en-US' && v.name.toLowerCase().includes('female')
    ) || voices.find(v =>
      v.lang === 'en-US'
    ) || voices[0]

    if (preferred) utterance.voice = preferred
    window.speechSynthesis.speak(utterance)
  }, 300)
}

// Entry icons by message type/content
const getEntryStyle = (msg, type) => {
  if (type === 'completed') return { emoji: '✅', bg: 'rgba(76,175,125,0.10)', border: 'rgba(76,175,125,0.25)', color: '#357a57' }
  if (type === 'error') return { emoji: '⚠️', bg: 'rgba(224,82,82,0.08)', border: 'rgba(224,82,82,0.2)', color: '#b83636' }
  if (msg.toLowerCase().includes('listen') || msg.toLowerCase().includes('hear'))
    return { emoji: '👂', bg: 'rgba(74,158,222,0.08)', border: 'rgba(74,158,222,0.18)', color: '#2277bc' }
  if (msg.toLowerCase().includes('click') || msg.toLowerCase().includes('button'))
    return { emoji: '🖱️', bg: 'rgba(74,158,222,0.08)', border: 'rgba(74,158,222,0.18)', color: '#2277bc' }
  if (msg.toLowerCase().includes('find') || msg.toLowerCase().includes('search') || msg.toLowerCase().includes('look'))
    return { emoji: '🔍', bg: 'rgba(74,158,222,0.08)', border: 'rgba(74,158,222,0.18)', color: '#2277bc' }
  if (msg.toLowerCase().includes('open') || msg.toLowerCase().includes('navigat') || msg.toLowerCase().includes('go to'))
    return { emoji: '🌐', bg: 'rgba(74,158,222,0.08)', border: 'rgba(74,158,222,0.18)', color: '#2277bc' }
  if (msg.toLowerCase().includes('read') || msg.toLowerCase().includes('found') || msg.toLowerCase().includes('see'))
    return { emoji: '📖', bg: 'rgba(74,158,222,0.08)', border: 'rgba(74,158,222,0.18)', color: '#2277bc' }
  return { emoji: '💬', bg: 'rgba(74,158,222,0.08)', border: 'rgba(74,158,222,0.18)', color: '#2277bc' }
}

export default function NarrationFeed({ narrations, onSpeak }) {
  const prevLengthRef = useRef(0)

  // Auto-speak new narrations
  useEffect(() => {
    if (narrations.length > prevLengthRef.current) {
      const newest = narrations[narrations.length - 1]
      if (newest && newest.message) {
        speakText(newest.message)
        if (onSpeak) onSpeak(newest.message)
      }
    }
    prevLengthRef.current = narrations.length
  }, [narrations, onSpeak])

  // Show last 4 narrations, most recent first
  const visible = [...narrations].reverse().slice(0, 4)

  if (visible.length === 0) return null

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col gap-3 px-2">
      {visible.map((entry, i) => {
        const style = getEntryStyle(entry.message || '', entry.type)
        const isNewest = i === 0
        return (
          <div
            key={entry.id}
            className="fade-in-up flex items-start gap-3 rounded-2xl px-5 py-4 transition-all duration-300"
            style={{
              background: style.bg,
              border: `1.5px solid ${style.border}`,
              opacity: isNewest ? 1 : 0.55 - i * 0.1,
              transform: `scale(${isNewest ? 1 : 0.97 - i * 0.01})`,
              animationDelay: `${i * 0.05}s`,
            }}
          >
            <span style={{ fontSize: '1.3rem', lineHeight: 1, marginTop: 2 }}>{style.emoji}</span>
            <p
              style={{
                margin: 0,
                fontSize: isNewest ? '1.1rem' : '0.97rem',
                lineHeight: 1.55,
                color: style.color,
                fontWeight: isNewest ? 600 : 500,
              }}
            >
              {entry.message}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export { speakText }