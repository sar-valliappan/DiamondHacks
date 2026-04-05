import { useState, useEffect, useRef, useCallback } from "react";
import VoiceButton from "./components/VoiceButton";
import NarrationFeed from "./components/NarrationFeed";
import ConfirmationModal from "./components/ConfirmationModal";
import StatusDisplay from "./components/StatusDisplay";
import LanguageSelector, { LANGUAGES } from "./components/LanguageSelector";
import SimplifiedView from "./components/SimplifiedView";
import LandingPage from "./components/LandingPage";
import ResultCard from "./components/ResultCard";

const API = "";

const DEMO_TASKS = [
  { label: "💊 Refill Prescription", task: "I need to refill my prescription on CVS pharmacy website" },
  { label: "⚡ Pay Electricity Bill", task: "Help me pay my electricity bill on SDG&E website" },
  { label: "🏥 Find a Doctor", task: "Find me a doctor who takes Medicare near San Diego" },
];

const HEARTBEAT_PHRASES = {
  "en": [
    "Still working on it, hang tight…",
    "Almost there, the page is loading…",
    "Give me just a moment…",
    "Still on it, nearly done…",
    "Loading, won't be long…",
  ],
  "es": [
    "Todavía trabajando en eso, espera un momento…",
    "Casi listo, la página está cargando…",
    "Dame solo un momento…",
    "Sigo en ello, casi terminado…",
    "Cargando, no tardará mucho…",
  ],
  "zh": [
    "还在处理中，请稍等…",
    "快好了，页面正在加载…",
    "给我一点时间…",
    "还在进行中，快完成了…",
    "正在加载，不会太久…",
  ],
  "fr": [
    "Je travaille encore dessus, patientez…",
    "Presque là, la page se charge…",
    "Donnez-moi juste un instant…",
    "J'y suis encore, presque terminé…",
    "Chargement en cours, ce ne sera pas long…",
  ],
  "de": [
    "Ich arbeite noch daran, einen Moment…",
    "Fast fertig, die Seite lädt…",
    "Gib mir nur einen Augenblick…",
    "Bin noch dabei, fast geschafft…",
    "Lädt gerade, dauert nicht mehr lange…",
  ],
  "ja": [
    "まだ作業中です、少しお待ちください…",
    "もうすぐです、ページが読み込まれています…",
    "少しだけ時間をください…",
    "まだ続けています、もうすぐ終わります…",
    "読み込み中です、もうすぐです…",
  ],
  "ko": [
    "아직 작업 중입니다, 잠시만요…",
    "거의 다 됐어요, 페이지가 로딩 중이에요…",
    "잠깐만 기다려 주세요…",
    "계속 진행 중이에요, 거의 끝났어요…",
    "로딩 중이에요, 얼마 안 걸려요…",
  ],
  "pt": [
    "Ainda trabalhando nisso, aguarde…",
    "Quase lá, a página está carregando…",
    "Me dê só um momento…",
    "Ainda nisso, quase terminando…",
    "Carregando, não vai demorar…",
  ],
  "ar": [
    "لا زلت أعمل على ذلك، انتظر قليلاً…",
    "تقريباً انتهيت، الصفحة تحمّل…",
    "أعطني لحظة فقط…",
    "لا زلت أعمل، سأنتهي قريباً…",
    "جارٍ التحميل، لن يستغرق وقتاً طويلاً…",
  ],
  "hi": [
    "अभी काम हो रहा है, थोड़ा रुकिए…",
    "बस थोड़ा सा, पेज लोड हो रहा है…",
    "बस एक पल दीजिए…",
    "अभी भी जारी है, लगभग हो गया…",
    "लोड हो रहा है, ज़्यादा देर नहीं लगेगी…",
  ],
  "vi": [
    "Vẫn đang xử lý, chờ một chút…",
    "Gần xong rồi, trang đang tải…",
    "Cho tôi một chút thôi…",
    "Vẫn đang làm, sắp xong rồi…",
    "Đang tải, không lâu đâu…",
  ],
  "tl": [
    "Nagtatrabaho pa rin, sandali lang…",
    "Malapit na, nag-lo-load ang pahina…",
    "Bigyan mo ako ng isang sandali…",
    "Nagpapatuloy pa rin, malapit nang matapos…",
    "Nag-lo-load, hindi na magtatagal…",
  ],
};

function getHeartbeatPhrases(langCode) {
  const base = (langCode || "en").split("-")[0].toLowerCase();
  return HEARTBEAT_PHRASES[base] || HEARTBEAT_PHRASES["en"];
}

// Font size levels: [narration-feed font, idle-hint font]
const FONT_SIZES = ["normal", "large", "xlarge"];

export default function App() {
  const [view, setView]                 = useState("landing");
  const [status, setStatus]             = useState("idle");
  const [narrations, setNarrations]     = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const [taskId, setTaskId]             = useState(null);
  const [liveUrl, setLiveUrl]           = useState(null);
  const [langCode, setLangCode]         = useState("en-US");
  const [focusMode, setFocusMode]       = useState(false);
  const [textInput, setTextInput]       = useState("");
  const [lastResult, setLastResult]     = useState(null);   // feature 3: result card
  const [fontSize, setFontSize]         = useState(0);      // feature 5: 0=normal,1=large,2=xlarge

  const eventSourceRef     = useRef(null);
  const synthRef           = useRef(window.speechSynthesis);
  const voicesRef          = useRef([]);
  const busyRef            = useRef(false);
  const speakQueueRef      = useRef([]);
  const isSpeakingRef      = useRef(false);
  const lastNarrationTime  = useRef(Date.now());
  const heartbeatTimer     = useRef(null);
  const heartbeatPhraseIdx = useRef(0);

  useEffect(() => {
    const load = () => { voicesRef.current = synthRef.current.getVoices(); };
    load();
    synthRef.current.onvoiceschanged = load;
  }, []);

  // ── Speech queue ───────────────────────────────────────────────────
  const processQueue = useCallback(() => {
    if (isSpeakingRef.current || speakQueueRef.current.length === 0) return;
    const { text, lang } = speakQueueRef.current.shift();
    isSpeakingRef.current = true;

    const utt  = new SpeechSynthesisUtterance(text);
    utt.rate   = 0.78;
    utt.pitch  = 1.0;
    const voices   = voicesRef.current;
    const baseLang = lang.split("-")[0];
    const voice =
      voices.find(v => v.lang === lang && v.name.includes("Google")) ||
      voices.find(v => v.lang === lang) ||
      voices.find(v => v.lang.startsWith(baseLang) && v.name.includes("Google")) ||
      voices.find(v => v.lang.startsWith(baseLang)) ||
      voices.find(v => v.lang.startsWith("en")) ||
      voices[0];
    if (voice) utt.voice = voice;
    utt.lang   = lang;
    utt.onend  = () => { isSpeakingRef.current = false; setTimeout(processQueue, 350); };
    utt.onerror = () => { isSpeakingRef.current = false; setTimeout(processQueue, 350); };
    synthRef.current.speak(utt);
  }, []);

  const speak = useCallback((text) => {
    if (!text) return;
    speakQueueRef.current.push({ text, lang: langCode });
    processQueue();
  }, [langCode, processQueue]);

  useEffect(() => {
    synthRef.current.cancel();
    speakQueueRef.current = [];
    isSpeakingRef.current = false;
  }, [langCode]);

  // ── Feature 2: Heartbeat during long silences ──────────────────────
  const startHeartbeat = useCallback(() => {
    clearInterval(heartbeatTimer.current);
    lastNarrationTime.current = Date.now();
    heartbeatTimer.current = setInterval(() => {
      const elapsed = Date.now() - lastNarrationTime.current;
      if (elapsed >= 6000) {
        const phrases = getHeartbeatPhrases(langCode);
        const phrase = phrases[heartbeatPhraseIdx.current % phrases.length];
        heartbeatPhraseIdx.current++;
        speak(phrase);
        lastNarrationTime.current = Date.now();
      }
    }, 2000);
  }, [speak]);

  const stopHeartbeat = useCallback(() => {
    clearInterval(heartbeatTimer.current);
  }, []);

  const addNarration = useCallback((message) => {
    setNarrations(prev => [{ message, id: Date.now() }, ...prev].slice(0, 20));
    speak(message);
    lastNarrationTime.current = Date.now();
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
        lastNarrationTime.current = Date.now();
        break;
      case "confirmation_received": setStatus("working"); setConfirmation(null); break;
      case "completed":
        stopHeartbeat();
        setStatus("idle");
        setLastResult(data.message);   // show result card
        addNarration(data.message);
        setTaskId(null);
        busyRef.current = false;
        eventSourceRef.current?.close(); eventSourceRef.current = null;
        break;
      case "error":
        stopHeartbeat();
        setStatus("idle");
        addNarration(data.message || "Something went wrong. Please try again.");
        setTaskId(null); busyRef.current = false;
        eventSourceRef.current?.close(); eventSourceRef.current = null;
        break;
      case "stream_end":
        stopHeartbeat();
        if (status !== "idle") setStatus("idle");
        break;
    }
  }, [taskId, addNarration, speak, status, stopHeartbeat]);

  const startTask = useCallback(async (spokenRequest) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus("processing"); setNarrations([]); setConfirmation(null);
    setLiveUrl(null); setLastResult(null);
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
      startHeartbeat();
      const es = new EventSource(`${API}/api/stream/${task_id}`);
      eventSourceRef.current = es;
      es.onmessage = handleEvent;
      es.onerror = () => {
        stopHeartbeat();
        setStatus("idle"); busyRef.current = false;
        es.close(); eventSourceRef.current = null;
      };
    } catch {
      stopHeartbeat();
      setStatus("idle"); busyRef.current = false;
      addNarration("I'm sorry, I couldn't connect. Please make sure the app is running and try again.");
    }
  }, [handleEvent, addNarration, langCode, startHeartbeat, stopHeartbeat]);

  useEffect(() => {
    if (eventSourceRef.current) eventSourceRef.current.onmessage = handleEvent;
  }, [handleEvent]);

  // ── Feature 6: Stop task ───────────────────────────────────────────
  const stopTask = useCallback(async () => {
    const tid = taskId;
    stopHeartbeat();
    eventSourceRef.current?.close(); eventSourceRef.current = null;
    busyRef.current = false;
    setStatus("idle"); setTaskId(null); setConfirmation(null);
    synthRef.current.cancel(); speakQueueRef.current = []; isSpeakingRef.current = false;
    if (tid) {
      try { await fetch(`${API}/api/task/${tid}`, { method: "DELETE" }); } catch {}
    }
    addNarration("Stopped. Tap the button whenever you're ready for something new.");
  }, [taskId, stopHeartbeat, addNarration]);

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

  const handleTextSubmit = useCallback((e) => {
    e.preventDefault();
    const val = textInput.trim();
    if (!val || status !== "idle") return;
    setTextInput("");
    startTask(val);
  }, [textInput, status, startTask]);

  const isActive = status !== "idle";

  // ── Landing ────────────────────────────────────────────────────────
  if (view === "landing") {
    return <LandingPage onGetStarted={() => setView("app")} />;
  }

  return (
    <div className={`app-shell font-size-${FONT_SIZES[fontSize]}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button className="logo-back-btn" onClick={() => setView("landing")} title="Back to home">
            <div className="logo-mark">N</div>
          </button>
          <div>
            <div className="logo-name">Navigator</div>
            <div className="logo-sub">Your helper on the web</div>
          </div>
        </div>

        {liveUrl && (
          <div className="topbar-center">
            <VoiceButton
              status={status}
              onTranscript={startTask}
              onListenStart={() => setStatus("listening")}
              langCode={langCode}
            />
            <form className="topbar-text-form" onSubmit={handleTextSubmit}>
              <input
                className="topbar-text-input"
                type="text"
                placeholder="Or type a new request…"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                disabled={isActive}
              />
              <button
                className="topbar-text-send"
                type="submit"
                disabled={!textInput.trim() || isActive}
                aria-label="Send"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </form>
          </div>
        )}

        <div className="topbar-right">
          {/* Feature 5: text size buttons */}
          <div className="font-size-controls">
            {FONT_SIZES.map((_, i) => (
              <button
                key={i}
                className={`font-size-btn ${fontSize === i ? "active" : ""}`}
                onClick={() => setFontSize(i)}
                aria-label={`Text size ${i + 1}`}
                style={{ fontSize: 11 + i * 3 }}
              >
                A
              </button>
            ))}
          </div>
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
                  <button
                    className={`simplify-toggle-btn ${focusMode ? "active" : ""}`}
                    onClick={() => setFocusMode(f => !f)}
                  >
                    {focusMode ? "⊞ Full Page" : "👓 Reader Mode"}
                  </button>
                </div>
                {focusMode ? (
                  <SimplifiedView narrations={narrations} onExit={() => setFocusMode(false)} />
                ) : (
                  <iframe
                    src={liveUrl}
                    className="live-browser-frame"
                    title="Navigator live browser"
                    allow="clipboard-read; clipboard-write"
                  />
                )}
              </div>
            </div>
            <div className="split-right">
              <div className="split-right-header">What I'm doing</div>
              <NarrationFeed narrations={narrations} />
              {lastResult && (
                <div className="split-right-result">
                  <ResultCard
                    message={lastResult}
                    onReadAloud={speak}
                    onDismiss={() => setLastResult(null)}
                  />
                </div>
              )}
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
                  {LANGUAGES.find(l => l.code === langCode)?.hint || "Tap to speak, or type below"}
                </p>
              )}
              <form className="center-text-form" onSubmit={handleTextSubmit}>
                <input
                  className="center-text-input"
                  type="text"
                  placeholder="Or type your request here…"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  disabled={isActive}
                />
                <button
                  className="center-text-send"
                  type="submit"
                  disabled={!textInput.trim() || isActive}
                  aria-label="Send"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </form>
            </div>
            {lastResult && (
              <div className="center-result">
                <ResultCard
                  message={lastResult}
                  onReadAloud={speak}
                  onDismiss={() => setLastResult(null)}
                />
              </div>
            )}
            {narrations.length > 0 && (
              <div className="narration-list">
                <NarrationFeed narrations={narrations} />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Feature 6: Stop button — always visible during active task */}
      {isActive && (
        <button className="stop-btn" onClick={stopTask} aria-label="Stop">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="3" />
          </svg>
          Stop
        </button>
      )}

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
