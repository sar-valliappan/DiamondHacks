import { useRef } from "react";

export default function NarrationFeed({ narrations }) {
  const prevLengthRef = useRef(0);

  if (narrations.length === 0) {
    return (
      <div className="narration-feed empty">
        <p className="narration-hint">Tap the button and tell me what you need</p>
      </div>
    );
  }

  return (
    <div className="narration-feed">
      {narrations.map((n, i) => (
        <div
          key={n.id}
          className={`narration-entry ${i === 0 ? "narration-new" : "narration-old"}`}
        >
          <div className="narration-dot" style={{ opacity: i === 0 ? 1 : 0.25 }} />
          <p className="narration-text" style={{ opacity: i === 0 ? 1 : Math.max(0.35, 0.7 - i * 0.12) }}>
            {n.message}
          </p>
        </div>
      ))}
    </div>
  );
}