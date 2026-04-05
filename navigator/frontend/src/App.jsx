import { useState, useEffect, useRef, useCallback } from "react";
import VoiceButton from "./components/VoiceButton";
import NarrationFeed from "./components/NarrationFeed";
import ConfirmationModal from "./components/ConfirmationModal";
import StatusDisplay from "./components/StatusDisplay";

const API = "http://localhost:8000";

const DEMO_TASKS = [
  { label: "💊 Refill Prescription", task: "I need to refill my prescription on CVS pharmacy website" },
  { label: "⚡ Pay Electricity Bill", task: "Help me pay my electricity bill on SDG&E website" },
  { label: "🏥 Find a Doctor", task: "Find me a doctor who takes Medicare near San Diego" },
];

export default function App() {
  const [status, setStatus] = useState("idle");
  const [narrations, setNarrations] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [liveUrl, setLiveUrl] = useState(null);
  const eventSourceRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const voicesRef = useRef([]);
  const busyRef = useRef(false);

  useEffect(() => {
    const loadVoices = () => { voicesRef.current = synthRef.current.getVoices(); };
    loadVoices();
    synthRef.current.onvoiceschanged = loadVoices;
  }, []);

  const speak = useCallback((text) => {
    if (!text) return;
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.85;
    utt.pitch = 1.0;
    const voices = voicesRef.current;
    const preferred =
      voices.find(v => v.name.includes("Google US English")) ||
      voices.find(v => v.name === "Samantha") ||
      voices.find(v => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")) ||
      voices.find(v => v.lang.startsWith("en")) ||
      voices[0];
    if (preferred) utt.voice = preferred;
    synthRef.current.speak(utt);
  }, []);

  const addNarration = useCallback((message) => {
    setNarrations(prev => [{ message, id: Date.now() }, ...prev].slice(0, 20));
    speak(message);
  }, [speak]);

  const handleEvent = useCallback((event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "live_url":
        setLiveUrl(data.url);
        break;
      case "processing":
        setStatus("processing");
        addNarration(data.message);
        break;
      case "narration":
        setStatus("working");
        addNarration(data.message);
        break;
      case "confirmation_required":
        setStatus("waiting");
        setConfirmation({ message: data.message, taskId });
        speak(data.message);
        break;
      case "confirmation_received":
        setStatus("working");
        setConfirmation(null);
        break;
      case "completed":
        setStatus("idle");
        addNarration(data.message);
        setTaskId(null);
        busyRef.current = false;
        if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
        break;
      case "error":
        setStatus("idle");
        addNarration(data.message || "Something went wrong. Please try again.");
        setTaskId(null);
        busyRef.current = false;
        if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
        break;
      case "stream_end":
        if (status !== "idle") setStatus("idle");
        break;
    }
  }, [taskId, addNarration, speak, status]);

  const startTask = useCallback(async (spokenRequest) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus("processing");
    setNarrations([]);
    setConfirmation(null);
    setLiveUrl(null);

    try {
      const res = await fetch(`${API}/api/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spoken_request: spokenRequest }),
      });
      const { task_id } = await res.json();
      setTaskId(task_id);

      const es = new EventSource(`${API}/api/stream/${task_id}`);
      eventSourceRef.current = es;
      es.onmessage = handleEvent;
      es.onerror = () => {
        setStatus("idle");
        busyRef.current = false;
        es.close();
        eventSourceRef.current = null;
      };
    } catch {
      setStatus("idle");
      busyRef.current = false;
      addNarration("I'm sorry, I couldn't connect. Please make sure the app is running and try again.");
    }
  }, [handleEvent, addNarration]);

  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.onmessage = handleEvent;
    }
  }, [handleEvent]);

  const handleConfirm = useCallback(async (confirmed) => {
    const tid = confirmation?.taskId || taskId;
    if (!tid) return;
    setConfirmation(null);
    setStatus("working");
    try {
      await fetch(`${API}/api/confirm/${tid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
      });
    } catch {
      addNarration("Something went wrong. Please try again.");
    }
  }, [confirmation, taskId, addNarration]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo-mark">N</div>
          <div>
            <div className="logo-name">Navigator</div>
            <div className="logo-sub">Your helper on the web</div>
          </div>
        </div>
        <div className="topbar-right">
          <StatusDisplay status={status} />
        </div>
      </header>

      <main className="main-content">
        {liveUrl ? (
          /* ── Split view: browser left, narrations right ── */
          <div className="split-layout">
            <div className="split-left">
              <div className="split-voice-row">
                <VoiceButton status={status} onTranscript={startTask} onListenStart={() => setStatus("listening")} />
              </div>
              <div className="live-browser-wrap">
                <div className="live-browser-label">
                  <span className="live-dot" />
                  Live browser
                </div>
                <iframe
                  src={liveUrl}
                  className="live-browser-frame"
                  title="Navigator live browser"
                  allow="clipboard-read; clipboard-write"
                />
              </div>
            </div>
            <div className="split-right">
              <div className="split-right-header">What I'm doing</div>
              <NarrationFeed narrations={narrations} />
            </div>
          </div>
        ) : (
          /* ── Centered idle view ── */
          <div className="center-col">
            <VoiceButton status={status} onTranscript={startTask} onListenStart={() => setStatus("listening")} />
            <NarrationFeed narrations={narrations} />
          </div>
        )}
      </main>

      <div className="demo-tray">
        <span className="demo-label">Demo presets</span>
        {DEMO_TASKS.map(d => (
          <button key={d.label} className="demo-btn" onClick={() => startTask(d.task)}>
            {d.label}
          </button>
        ))}
      </div>

      {confirmation && (
        <ConfirmationModal
          message={confirmation.message}
          onConfirm={() => handleConfirm(true)}
          onReject={() => handleConfirm(false)}
        />
      )}
    </div>
  );
}