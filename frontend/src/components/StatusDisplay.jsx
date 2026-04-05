const STATUS_CONFIG = {
  idle: {
    dot: '#4caf7d',
    dotGlow: 'rgba(76,175,125,0.4)',
    label: 'Ready',
    message: 'Tap the button and tell me what you need',
  },
  listening: {
    dot: '#e05252',
    dotGlow: 'rgba(224,82,82,0.4)',
    label: 'Listening',
    message: "Go ahead, I'm all ears...",
  },
  processing: {
    dot: '#4a9ede',
    dotGlow: 'rgba(74,158,222,0.4)',
    label: 'Thinking',
    message: "Let me make sure I understand...",
  },
  working: {
    dot: '#4a9ede',
    dotGlow: 'rgba(74,158,222,0.4)',
    label: 'Working',
    message: "Give me a moment, I'm on it...",
  },
  waiting: {
    dot: '#f59e0b',
    dotGlow: 'rgba(245,158,11,0.4)',
    label: 'Need your help',
    message: "Please answer above to continue",
  },
  completed: {
    dot: '#4caf7d',
    dotGlow: 'rgba(76,175,125,0.4)',
    label: 'Done!',
    message: "All finished. Tap to do something else",
  },
  error: {
    dot: '#e05252',
    dotGlow: 'rgba(224,82,82,0.4)',
    label: 'Something went wrong',
    message: "Tap the button and try again",
  },
}

export default function StatusDisplay({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle
  const isPulsing = status === 'listening' || status === 'working' || status === 'processing'

  return (
    <div
      className="flex items-center gap-3 px-6 py-3 rounded-full transition-all duration-500"
      style={{
        background: 'rgba(255,255,255,0.85)',
        border: '1.5px solid rgba(74,158,222,0.15)',
        boxShadow: '0 2px 12px rgba(74,158,222,0.08)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Status dot */}
      <div className="relative flex-shrink-0" style={{ width: 14, height: 14 }}>
        {isPulsing && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: config.dot, opacity: 0.5 }}
          />
        )}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: config.dot,
            boxShadow: `0 0 8px ${config.dotGlow}`,
          }}
        />
      </div>

      {/* Text */}
      <div className="flex items-baseline gap-2">
        <span
          style={{
            fontSize: '0.9rem',
            fontWeight: 700,
            color: config.dot,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {config.label}
        </span>
        <span style={{ fontSize: '0.9rem', color: '#7a90a8', fontWeight: 500 }}>
          — {config.message}
        </span>
      </div>
    </div>
  )
}