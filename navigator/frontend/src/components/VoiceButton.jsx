import { useEffect, useRef, useState, useCallback } from "react";

export default function VoiceButton({ status, onTranscript, onListenStart, langCode = "en-US" }) {
  const recognitionRef  = useRef(null);
  const finalTranscript = useRef("");
  const silenceTimer    = useRef(null);
  const [error, setError] = useState(null);

  const isListening = status === "listening";
  const isWorking   = status === "processing" || status === "working";
  const isWaiting   = status === "waiting";
  const isIdle      = status === "idle";

  const submitAndStop = useCallback(() => {
    clearTimeout(silenceTimer.current);
    try { recognitionRef.current?.stop(); } catch {}
    const text = finalTranscript.current.trim();
    finalTranscript.current = "";
    if (text) onTranscript(text);
  }, [onTranscript]);

  // Re-create recognition instance whenever langCode changes
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setError("Voice not supported — use Chrome"); return; }

    // Stop any existing session before recreating
    try { recognitionRef.current?.stop(); } catch {}

    const rec = new SpeechRecognition();
    rec.continuous     = true;
    rec.interimResults = true;
    rec.lang           = langCode;

    rec.onresult = (e) => {
      clearTimeout(silenceTimer.current);
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
      }
      if (final.trim()) finalTranscript.current += final;

      // Auto-submit after 1.5s of silence
      silenceTimer.current = setTimeout(() => { submitAndStop(); }, 1500);
    };

    rec.onerror = (e) => {
      clearTimeout(silenceTimer.current);
      if (e.error === "not-allowed") {
        setError("Microphone access denied — check browser settings");
      } else if (e.error === "no-speech") {
        const text = finalTranscript.current.trim();
        finalTranscript.current = "";
        if (text) onTranscript(text);
      } else if (e.error !== "aborted") {
        setError("Couldn't hear you. Try again.");
        setTimeout(() => setError(null), 3000);
      }
    };

    rec.onend = () => {
      clearTimeout(silenceTimer.current);
      const text = finalTranscript.current.trim();
      finalTranscript.current = "";
      if (text) onTranscript(text);
    };

    recognitionRef.current = rec;
  }, [langCode, onTranscript, submitAndStop]);

  const handleClick = useCallback(() => {
    if (!isIdle) return;
    setError(null);
    finalTranscript.current = "";
    clearTimeout(silenceTimer.current);
    try {
      recognitionRef.current?.start();
      onListenStart();
    } catch {
      setError("Couldn't start microphone. Please try again.");
    }
  }, [isIdle, onListenStart]);

  useEffect(() => {
    if (!isListening) {
      clearTimeout(silenceTimer.current);
      try { recognitionRef.current?.stop(); } catch {}
    }
  }, [isListening]);

  const getLabel = () => {
    if (error)       return error;
    if (isListening) return "I'm listening...";
    if (isWorking)   return "Working on it...";
    if (isWaiting)   return "I need your help";
    return "Tap to speak";
  };

  const getBtnClass = () => {
    if (isListening) return "voice-btn listening";
    if (isWorking)   return "voice-btn working";
    if (isWaiting)   return "voice-btn waiting";
    return "voice-btn idle";
  };

  return (
    <div className="voice-btn-wrap">
      <button
        className={getBtnClass()}
        onClick={handleClick}
        disabled={!isIdle}
        aria-label={getLabel()}
      >
        {isWorking ? (
          <svg className="spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0014 0" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
        )}
      </button>
      <p className="voice-label">{getLabel()}</p>
    </div>
  );
}