import { useEffect, useRef } from "react";

export default function ConfirmationModal({ message, onConfirm, onReject }) {
  const recognitionRef = useRef(null);

  // Listen for voice yes/no
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onresult = (e) => {
      const word = e.results[0][0].transcript.toLowerCase().trim();
      if (["yes", "yeah", "yep", "go ahead", "sure", "okay", "ok", "do it"].some(w => word.includes(w))) {
        onConfirm();
      } else if (["no", "nope", "stop", "cancel", "don't", "abort"].some(w => word.includes(w))) {
        onReject();
      } else {
        // Try again
        try { rec.start(); } catch {}
      }
    };
    rec.onend = () => {};

    // Start listening after a pause (let TTS finish first)
    const timer = setTimeout(() => {
      try { rec.start(); } catch {}
    }, 2500);

    recognitionRef.current = rec;
    return () => {
      clearTimeout(timer);
      try { rec.stop(); } catch {}
    };
  }, [onConfirm, onReject]);

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-icon">🤔</div>
        <p className="modal-question">{message}</p>
        <p className="modal-voice-hint">You can also say "Yes" or "No"</p>
        <div className="modal-actions">
          <button className="modal-btn yes" onClick={onConfirm}>
            ✓ YES, go ahead
          </button>
          <button className="modal-btn no" onClick={onReject}>
            ✕ NO, stop
          </button>
        </div>
      </div>
    </div>
  );
}