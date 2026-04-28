# User Test Report: code-reviewer and knowledge-retriever

**Date:** 2026-04-28
**Workspace:** `/Users/shaoqi/projects/osapiens-tasks/test-dir`

---

## Contents

- [Scope](#scope)
- [Skills Used](#skills-used)
- [Session](#session)
- [Setup Fixture: app.py](#setup-fixture-apppy)

---

## Scope

End-to-end test of `code-reviewer` and `knowledge-retriever` inside a live Codex session. The workspace started empty; a FastAPI + OpenAI file was created as a fixture so the code reviewer had something realistic to inspect.

`openai-docs` (built-in) was incidentally activated during fixture setup and is excluded from this report.

---

## Skills Used

- **`code-reviewer`** — triggered by a request to review a Python file. Reviewed for correctness, security, and operational risk.
- **`knowledge-retriever`** — triggered by a question about internal docs. Searched local workspace, then Notion.

---

## Session

### 1. Create a test fixture

**User**
```
create a python file to implement a fastapi server with openai api
```

**Codex**

Checked the workspace (empty). Used the `openai-docs` built-in skill to confirm current API shape, then created `app.py`.

> Created `app.py` with two endpoints:
> - `GET /health`
> - `POST /generate` — calls the OpenAI Responses API, reads `OPENAI_API_KEY` from the environment, defaults to model `gpt-5` (overridable via `OPENAI_MODEL`)
>
> Verified syntax with `python3 -m py_compile app.py`. Not started — requires installed packages and a real API key.

---

### 2. Code review

**User**
```
code review the python file
```

**Codex**

Opened the `code-reviewer` skill instructions and read `app.py`. Reviewed in security-first order.

> **Findings**
>
> | Severity | Issue | Location |
> |---|---|---|
> | Critical | No authentication on `/generate` — anyone who can reach this server can spend your OpenAI quota | `app.py:59` |
> | High | Permissive CORS with `allow_credentials=True` and `origins=*` — risky for a deployed API | `app.py:24` |
> | Medium | Client can pass arbitrary model name — callers can pick expensive or unsupported models | `app.py:36, 63` |
> | Medium | No per-request timeout or retry policy on the OpenAI call — slow upstream can tie up workers | `app.py:62` |
>
> **Suggestions**
> - Add `requirements.txt` or `pyproject.toml` for reproducible installs
> - Return a generic `500` for missing `OPENAI_API_KEY` rather than exposing config state
>
> **Verdict:** `REQUEST_CHANGES` — fine as a local demo, not safe for deployment.

---

### 3. Knowledge retrieval

**User**
```
can you check if there is any knowledge about openai api in my docs
```

**Codex**

Activated `knowledge-retriever`. Checked local workspace first — only `app.py` and skill config files, no project docs. Then searched Notion for `OpenAI API`, `OpenAI Responses API`, and `FastAPI OpenAI`.

> **Found in Notion**
>
> | Page | What it contains |
> |---|---|
> | [Coleo News Radar](https://www.notion.so/2f69f1f329ba8091a8dec73c6442093b) | Uses OpenAI API for entity extraction in a Chrome extension |
> | [News Knowledge Graph Project](https://www.notion.so/3439f1f329ba8104a0bfe76f28b0445b) | Ollama-first extraction, falls back to OpenAI/Anthropic |
> | [LLM Inference & Optimization](https://www.notion.so/34d9f1f329ba811baaf3c04bba9b5480) | Responses API mentioned in vLLM/frontend roadmap context |
> | [Technical Deep-Dive Archive](https://www.notion.so/3399f1f329ba81f29a67cbde5d742519) | AI architecture notes referencing Responses API and FastAPI |
>
> **Security observation:** Notion search surfaced pages (`config`, `bbook_maker`) containing what appeared to be raw OpenAI API keys in plaintext. Keys were not reproduced here. Rotate those keys and store secrets in environment variables or a secrets manager.
>
> **Finding:** OpenAI-related knowledge exists in Notion, but no dedicated "OpenAI API with FastAPI" implementation guide was found.

---

## Setup Fixture: app.py

Created as a test fixture only — not part of the evaluated skill scope.

```python
"""FastAPI server that calls the OpenAI Responses API.

Install:
    pip install fastapi uvicorn openai

Run:
    export OPENAI_API_KEY="your_api_key_here"
    uvicorn app:app --reload
"""

from functools import lru_cache
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import APIError, APIConnectionError, AuthenticationError, AsyncOpenAI, RateLimitError
from pydantic import BaseModel, Field


DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-5")

app = FastAPI(title="OpenAI FastAPI Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=20_000)
    instructions: str | None = Field(default=None, max_length=4_000)
    model: str | None = Field(default=None, min_length=1)
    max_output_tokens: int | None = Field(default=512, ge=1, le=8_192)


class GenerateResponse(BaseModel):
    id: str
    model: str
    text: str


@lru_cache
def get_openai_client() -> AsyncOpenAI:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")

    return AsyncOpenAI()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest) -> GenerateResponse:
    try:
        response = await get_openai_client().responses.create(
            model=request.model or DEFAULT_MODEL,
            instructions=request.instructions,
            input=request.prompt,
            max_output_tokens=request.max_output_tokens,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except AuthenticationError as exc:
        raise HTTPException(status_code=401, detail="OpenAI authentication failed") from exc
    except RateLimitError as exc:
        raise HTTPException(status_code=429, detail="OpenAI rate limit exceeded") from exc
    except APIConnectionError as exc:
        raise HTTPException(status_code=502, detail="Could not connect to OpenAI") from exc
    except APIError as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {exc.message}") from exc

    return GenerateResponse(
        id=response.id,
        model=response.model,
        text=response.output_text,
    )
```
