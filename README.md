# EasyBrowser — Your Helper on the Web

> **"Just speak. I'll take care of the rest."**

Navigator is a voice-first browser agent for people who struggle with the web — elderly users, people with disabilities, or anyone who finds modern websites confusing. You speak a request out loud. Navigator navigates the web for you, narrates everything it's doing in plain English, and always asks your permission before doing anything that can't be undone.

---

## Quick Start

### 1. Prerequisites
- Python 3.11+
- Node.js 18+
- [uv](https://astral.sh/uv) — Python package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Google Chrome (required for Web Speech API)
- A [Gemini API key](https://aistudio.google.com/app/apikey) (free tier works)
- A [Browser Use API key]
- An Eleven Labs API key

### 2. Setup
```bash
./setup.sh
```

This installs Python deps, Playwright Chromium, and npm packages.

### 3. Add your API key
```bash
# Edit backend/.env
GEMINI_API_KEY=your_actual_key_here
BROWSER_USE_API_KEY=your_actual_key_here
ELEVEN_LABS_API_KEY=your_actual_key_here
```

### 4. Run
```bash
./run.sh
```

Open **http://localhost:5173** in **Google Chrome**.

---

## How It Works

```
User speaks → Web Speech API → /api/task → NavigatorAgent
                                                  ↓
                                          Gemini cleans transcript
                                                  ↓
                                          browser-use browses web
                                                  ↓
                            ┌─── safe action ──→ Narrationifier → plain English
                            │
                            └─── risky action → Confirmation modal → user says YES/NO
                                                  ↓
                                          SSE stream → NarrationFeed → SpeechSynthesis
```

### Key safety feature: Human in the Loop
Before any irreversible action (form submission, purchase, sending a message), Navigator **pauses completely** and asks the user for explicit permission. The user can say "yes" or "no" aloud, or tap the giant YES/NO buttons. Nothing happens without consent.

---

## Architecture

```
navigator/
├── backend/
│   ├── main.py           FastAPI — SSE streaming, task management
│   ├── agent_runner.py   NavigatorAgent — orchestrates browser-use + narration
│   ├── simplifier.py     Narrationifier — Gemini translates tech → plain English
│   └── pyproject.toml    uv dependencies
└── frontend/
    └── src/
        ├── App.jsx                 Main layout, SSE consumer
        └── components/
            ├── VoiceButton.jsx     Giant mic button, Web Speech API
            ├── NarrationFeed.jsx   Last 4 narrations + SpeechSynthesis
            ├── ConfirmationModal.jsx Full-screen YES/NO with voice listening
            └── StatusDisplay.jsx   Simple status bar
```

### Backend endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health check |
| `/api/task` | POST | Start a task, returns `task_id` |
| `/api/stream/{task_id}` | GET | SSE stream of all events |
| `/api/confirm/{task_id}` | POST | Unblock a confirmation pause |
| `/api/task/{task_id}` | DELETE | Cancel a running task |

### SSE Event types
| Type | Meaning |
|---|---|
| `processing` | Cleaning up the voice transcript |
| `narration` | Plain English description (speak this aloud) |
| `confirmation_required` | Risky action — need YES or NO |
| `confirmation_received` | User responded |
| `completed` | Task done with summary |
| `error` | Friendly error message |
| `stream_end` | Stream closed |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Browser agent | [browser-use](https://github.com/browser-use/browser-use) |
| LLM (narration) | Gemini gemini-2.0-flash via `google-generativeai` |
| Backend | FastAPI + SSE |
| Frontend | React 18 + Tailwind CSS |
| Voice input | Eleven Labs API |
| Voice output | Eleven Labs API |
| Python deps | uv |

---

## Accessibility Design Principles

- **Minimum 18px font everywhere** — no squinting
- **One primary action** — the mic button. Nothing else to figure out.
- **Plain English only** — no error codes, no technical jargon
- **Giant confirmation buttons** (minimum 64px height) — touchscreen and arthritic-finger friendly  
- **Voice both ways** — speak your request, hear the response back
- **High contrast** — white background, blue accents, no dark-on-dark
- **Slow speech rate (0.85x)** — clear and unhurried

---

## Troubleshooting

**Voice not working?**
→ Must use Google Chrome. Safari/Firefox have limited Web Speech API support.
→ Check that your browser has microphone permission for localhost.

**Port already in use?**
→ Kill existing processes: `lsof -ti:8000 | xargs kill` and `lsof -ti:5173 | xargs kill`
