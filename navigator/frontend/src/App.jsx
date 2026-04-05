import { useState, useEffect, useRef, useCallback } from "react";
import VoiceButton from "./components/VoiceButton";
import NarrationFeed from "./components/NarrationFeed";
import ConfirmationModal from "./components/ConfirmationModal";
import StatusDisplay from "./components/StatusDisplay";
import LanguageSelector, { LANGUAGES } from "./components/LanguageSelector";

const API = "http://localhost:8000";

const DEMO_TASKS = [
  { label: "💊 Refill Prescription", task: "I need to refill my prescription on CVS pharmacy website" },
  { label: "⚡ Pay Electricity Bill", task: "Help me pay my electricity bill on SDG&E website" },
  { label: "🏥 Find a Doctor", task: "Find me a doctor who takes Medicare near San Diego" },
];

export default function App() {
  const [status, setStatus]             = useState("idle");
  const [narrations, setNarrations]     = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const [taskId, setTaskId]             = useState(null);
  const [liveUrl, setLiveUrl]           = useState(null);
  const [langCode, setLangCode]         = useState("en-US");

  const eventSourceRef = useRef(null);
  const synthRef       = useRef(window.speechSynthesis);
  const voicesRef      = useRef([]);
  const busyRef        = useRef(false);
  const speakQueueRef  = useRef([]);
  const isSpeakingRef  = useRef(false);

  // Load available voices
  useEffect(() => {
    const load = () => { voicesRef.current = synthRef.current.getVoices(); };
    load();
    synthRef.current.onvoiceschanged = load;
  }, []);

  // ── Speech queue: prevents overlap & controls rate ─────────────────
  const processQueue = useCallback(() => {
    if (isSpeakingRef.current || speakQueueRef.current.length === 0) return;
    const { text, lang } = speakQueueRef.current.shift();
    isSpeakingRef.current = true;

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate  = 0.78;   // Slightly slower than before — clear but not sluggish
    utt.pitch = 1.0;

    // Pick best voice for the selected language
    const voices = voicesRef.current;
    const baseLang = lang.split("-")[0];

    const voice =
      voices.find(v => v.lang === lang && v.name.includes("Google")) ||
      voices.find(v => v.lang === lang) ||
      voices.find(v => v.lang.startsWith(baseLang) && v.name.includes("Google")) ||
      voices.find(v => v.lang.startsWith(baseLang)) ||
      voices.find(v => v.lang.startsWith("en")) ||
      voices[0];

    if (voice) utt.voice = voice;
    utt.lang = lang;

    utt.onend = () => {
      isSpeakingRef.current = false;
      // Small pause between messages so they don't blur together
      setTimeout(processQueue, 350);
    };
    utt.onerror = () => {
      isSpeakingRef.current = false;
      setTimeout(processQueue, 350);
    };

    synthRef.current.speak(utt);
  }, []);

  const speak = useCallback((text) => {
    if (!text) return;
    speakQueueRef.current.push({ text, lang: langCode });
    processQueue();
  }, [langCode, processQueue]);

  // When language changes, stop current speech and clear queue
  useEffect(() => {
    synthRef.current.cancel();
    speakQueueRef.current = [];
    isSpeakingRef.current = false;
  }, [langCode]);

  const addNarration = useCallback((message) => {
    setNarrations(prev => [{ message, id: Date.now() }, ...prev].slice(0, 20));
    speak(message);
  }, [speak]);

  const handleEvent = useCallback((event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "live_url":   setLiveUrl(data.url); break;
      case "processing": setStatus("processing"); addNarration(data.message); break;
      case "narration":  setStatus("working");    addNarration(data.message); break;
      case "confirmation_required":
        setStatus("waiting");
        setConfirmation({ message: data.message, taskId });
        speak(data.message);
        break;
      case "confirmation_received": setStatus("working"); setConfirmation(null); break;
      case "completed":
        setStatus("idle"); addNarration(data.message); setTaskId(null);
        busyRef.current = false;
        eventSourceRef.current?.close(); eventSourceRef.current = null;
        break;
      case "error":
        setStatus("idle");
        addNarration(data.message || "Something went wrong. Please try again.");
        setTaskId(null); busyRef.current = false;
        eventSourceRef.current?.close(); eventSourceRef.current = null;
        break;
      case "stream_end": if (status !== "idle") setStatus("idle"); break;
    }
  }, [taskId, addNarration, speak, status]);

  const startTask = useCallback(async (spokenRequest) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus("processing"); setNarrations([]); setConfirmation(null); setLiveUrl(null);
    // Clear speech queue for new task
    synthRef.current.cancel();
    speakQueueRef.current = [];
    isSpeakingRef.current = false;

    try {
      const res = await fetch(`${API}/api/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spoken_request: spokenRequest, language: langCode }),
      });
      const { task_id } = await res.json();
      setTaskId(task_id);
      const es = new EventSource(`${API}/api/stream/${task_id}`);
      eventSourceRef.current = es;
      es.onmessage = handleEvent;
      es.onerror = () => { setStatus("idle"); busyRef.current = false; es.close(); eventSourceRef.current = null; };
    } catch {
      setStatus("idle"); busyRef.current = false;
      addNarration("I'm sorry, I couldn't connect. Please make sure the app is running and try again.");
    }
  }, [handleEvent, addNarration, langCode]);

  useEffect(() => {
    if (eventSourceRef.current) eventSourceRef.current.onmessage = handleEvent;
  }, [handleEvent]);

  const handleConfirm = useCallback(async (confirmed) => {
    const tid = confirmation?.taskId || taskId;
    if (!tid) return;
    setConfirmation(null); setStatus("working");
    try {
      await fetch(`${API}/api/confirm/${tid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
      });
    } catch { addNarration("Something went wrong. Please try again."); }
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

        {liveUrl && (
          <div className="topbar-mic">
            <VoiceButton
              status={status}
              onTranscript={startTask}
              onListenStart={() => setStatus("listening")}
              langCode={langCode}
            />
          </div>
        )}

        <div className="topbar-right">
          <LanguageSelector value={langCode} onChange={setLangCode} />
          <StatusDisplay status={status} />
        </div>
      </header>

      <main className="main-content">
        {liveUrl ? (
          <div className="split-layout">
            <div className="split-left">
              <div className="live-browser-wrap">
                <div className="live-browser-label">
                  <span className="live-dot" />Live browser
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
          <div className="center-col">
            <div className="center-hero">
              <VoiceButton
                status={status}
                onTranscript={startTask}
                onListenStart={() => setStatus("listening")}
                langCode={langCode}
              />
              {narrations.length === 0 && (
                <p className="idle-hint">
                  {LANGUAGES.find(l => l.code === langCode)?.hint || "Tap the button and tell me what you need"}
                </p>
              )}
            </div>
            {narrations.length > 0 && (
              <div className="narration-list">
                <NarrationFeed narrations={narrations} />
              </div>
            )}
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
          langCode={langCode}
        />
      )}
    </div>
  );
}