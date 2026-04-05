export default function ResultCard({ message, onReadAloud, onDismiss }) {
  if (!message) return null;

  return (
    <div className="result-card">
      <div className="result-card-header">
        <span className="result-card-icon">✅</span>
        <span className="result-card-title">All done!</span>
        <button className="result-card-dismiss" onClick={onDismiss} aria-label="Dismiss">✕</button>
      </div>
      <p className="result-card-message">{message}</p>
      <button className="result-card-read-btn" onClick={() => onReadAloud(message)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
        Read it to me again
      </button>
    </div>
  );
}
