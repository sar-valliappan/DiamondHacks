"""
main.py — Navigator FastAPI backend
SSE streaming, task management, human-in-the-loop confirmation endpoints.
"""

import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agent_runner import NavigatorAgent

load_dotenv()

# ─── Shared state ──────────────────────────────────────────────────────────────
# In production you'd use Redis; for hackathon single-process is fine.

_agent = NavigatorAgent()

# task_id -> asyncio.Queue of event dicts
_task_queues: dict[str, asyncio.Queue] = {}

# task_id -> asyncio.Task (the background coroutine)
_task_handles: dict[str, asyncio.Task] = {}


# ─── App setup ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Clean up any running tasks on shutdown
    for task in _task_handles.values():
        task.cancel()


app = FastAPI(title="Navigator", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request/Response models ───────────────────────────────────────────────────

class TaskRequest(BaseModel):
    spoken_request: str


class ConfirmRequest(BaseModel):
    confirmed: bool


class TaskResponse(BaseModel):
    task_id: str


# ─── Background task runner ────────────────────────────────────────────────────

async def _run_agent_task(task_id: str, spoken_request: str):
    """Runs the agent and pushes events into the task's queue."""
    queue = _task_queues[task_id]
    try:
        async for event in _agent.run(spoken_request, task_id):
            await queue.put(event)
    except Exception as exc:
        await queue.put({"type": "error", "message": f"Unexpected error: {exc}"})
    finally:
        # Sentinel: signals the SSE generator to close
        await queue.put(None)


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Navigator"}


@app.post("/api/task", response_model=TaskResponse)
async def start_task(body: TaskRequest):
    """Start a new Navigator task. Returns a task_id for SSE streaming."""
    if not body.spoken_request.strip():
        raise HTTPException(status_code=400, detail="spoken_request cannot be empty")

    task_id = str(uuid.uuid4())
    _task_queues[task_id] = asyncio.Queue()

    bg_task = asyncio.create_task(
        _run_agent_task(task_id, body.spoken_request),
        name=f"navigator-{task_id}",
    )
    _task_handles[task_id] = bg_task

    return TaskResponse(task_id=task_id)


@app.get("/api/stream/{task_id}")
async def stream_task(task_id: str):
    """SSE stream for a running task. Frontend listens here for all events."""
    queue = _task_queues.get(task_id)
    if queue is None:
        raise HTTPException(status_code=404, detail="Task not found")

    async def event_generator() -> AsyncGenerator[dict, None]:
        try:
            while True:
                event = await asyncio.wait_for(queue.get(), timeout=60.0)
                if event is None:
                    # Task finished
                    yield {"data": json.dumps({"type": "stream_end"})}
                    break
                yield {"data": json.dumps(event)}
        except asyncio.TimeoutError:
            yield {
                "data": json.dumps({
                    "type": "error",
                    "message": "I'm sorry, this is taking longer than expected. Please try again.",
                })
            }
        finally:
            _task_queues.pop(task_id, None)
            task = _task_handles.pop(task_id, None)
            if task and not task.done():
                task.cancel()

    return EventSourceResponse(event_generator())


@app.post("/api/confirm/{task_id}")
async def confirm_action(task_id: str, body: ConfirmRequest):
    """
    Called when the user taps YES or NO on the confirmation modal.
    Unblocks the agent's confirmation_required pause.
    """
    resolved = _agent.send_confirmation(task_id, body.confirmed)
    if not resolved:
        raise HTTPException(
            status_code=404,
            detail="No pending confirmation for this task",
        )
    return {"status": "ok", "confirmed": body.confirmed}


@app.delete("/api/task/{task_id}")
async def cancel_task(task_id: str):
    """Cancel a running task (e.g. user closes the page)."""
    task = _task_handles.pop(task_id, None)
    if task:
        task.cancel()
    _task_queues.pop(task_id, None)
    return {"status": "cancelled"}
