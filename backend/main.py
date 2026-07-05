"""
ClassifyAI API — backend for AI-assisted CSV categorization.

Design principle: the model always sees the COMPLETE dataset in a single pass.
We never batch or fragment the input. The only concession to real limits is on
the OUTPUT side: if the model's response is truncated (it produced fewer lines
than there are rows), we ask it to RESUME from where it stopped — still sending
the whole dataset for context — rather than silently padding missing rows with
"Unknown". Rows that genuinely cannot be completed are flagged as such so the
user knows to review them, instead of being hidden.

The Gemini API key is read once from the GEMINI_API_KEY environment variable on
the server (set as a Render secret). It is never sent from the client and never
appears in any request or response body.
"""
from __future__ import annotations

import io
import os

import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google import genai

from prompts import (
    CATEGORY_SUGGESTION_PROMPT,
    CATEGORY_CRITIQUE_PROMPT,
    CATEGORY_ASSIGNMENT_PROMPT,
    CATEGORY_ASSIGNMENT_RESUME_PROMPT,
)

app = FastAPI(title="ClassifyAI API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your deployed frontend origin in production
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_NAME = "gemini-2.5-flash"
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB
# How many completion (resume) attempts to make if the output comes back short.
MAX_RESUME_ATTEMPTS = 4

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Server is missing GEMINI_API_KEY. Set it in the backend's environment variables.",
        )
    try:
        _client = genai.Client(api_key=api_key)
        return _client
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Could not initialize Gemini client: {exc}")


def _call_gemini(client: genai.Client, contents: str) -> str:
    try:
        response = client.models.generate_content(model=MODEL_NAME, contents=contents)
        text = (response.text or "").strip()
        if not text:
            raise HTTPException(status_code=502, detail="Gemini returned an empty response.")
        return text
    except HTTPException:
        raise
    except Exception as exc:
        error_text = str(exc)
        if "429" in error_text or "RESOURCE_EXHAUSTED" in error_text or "quota" in error_text.lower():
            raise HTTPException(
                status_code=503,
                detail="ClassifyAI is temporarily at capacity. Please try again in a minute.",
            )
        raise HTTPException(status_code=502, detail=f"Gemini request failed: {exc}")


async def _read_csv(file: UploadFile) -> pd.DataFrame:
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (15 MB limit).")
    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}")
    if df.empty:
        raise HTTPException(status_code=400, detail="The uploaded CSV has no rows.")
    return df


def _parse_categories(text: str) -> list[dict]:
    categories: list[dict] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if "|" in line:
            name, _, desc = line.partition("|")
        else:
            name, desc = line, ""
        name = name.strip()
        desc = desc.strip()
        if name and name.lower() not in seen:
            seen.add(name.lower())
            categories.append({"name": name, "description": desc})
    if not any(c["name"].lower() == "unknown" for c in categories):
        categories.append({
            "name": "Unknown",
            "description": "Anything that doesn't clearly belong in the groups above",
        })
    return categories


def _parse_assignment_lines(
    text: str, valid_categories: set[str]
) -> tuple[list[str], list[str], list[str]]:
    """Parse Category|Confidence|Reason lines. Returns (labels, confidences, reasons)."""
    valid_confidence = {"High", "Medium", "Low"}
    labels: list[str] = []
    confidences: list[str] = []
    reasons: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split("|")]
        cat = parts[0] if len(parts) > 0 else ""
        conf = parts[1].capitalize() if len(parts) > 1 else ""
        reason = parts[2] if len(parts) > 2 else ""
        if cat not in valid_categories:
            cat = "Unknown"
        if conf not in valid_confidence:
            conf = "Medium"
        labels.append(cat)
        confidences.append(conf)
        reasons.append(reason)
    return labels, confidences, reasons


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/suggest-categories")
async def suggest_categories(
    file: UploadFile = File(...),
    critique: str = Form("false"),
):
    """Suggest categories over the whole dataset. If critique=true, run a second
    self-audit pass (Layer 2) that repairs overlap/gaps/vagueness."""
    df = await _read_csv(file)
    client = _get_client()
    csv_text = df.to_csv(index=False)

    text = _call_gemini(client, CATEGORY_SUGGESTION_PROMPT.format(csv_text=csv_text))
    categories = _parse_categories(text)
    if not categories:
        raise HTTPException(status_code=502, detail="Gemini did not return any categories.")

    refined = False
    if critique.strip().lower() in ("1", "true", "yes"):
        cat_block = "\n".join(f"{c['name']} | {c['description']}" for c in categories)
        critique_text = _call_gemini(
            client,
            CATEGORY_CRITIQUE_PROMPT.format(categories=cat_block, csv_text=csv_text),
        )
        critiqued = _parse_categories(critique_text)
        if critiqued:
            before = {c["name"].lower() for c in categories}
            after = {c["name"].lower() for c in critiqued}
            refined = before != after
            categories = critiqued

    return {"categories": categories, "refined": refined}


@app.post("/api/assign-categories")
async def assign_categories(
    categories: str = Form(...),  # newline-separated names
    file: UploadFile = File(...),
):
    df = await _read_csv(file)
    client = _get_client()
    category_list = [c.strip() for c in categories.split("\n") if c.strip()]
    if not category_list:
        raise HTTPException(status_code=400, detail="No categories provided.")
    if "Unknown" not in category_list:
        category_list.append("Unknown")

    row_count = len(df)
    csv_text = df.to_csv(index=False)
    valid_categories = set(category_list)

    # First pass: the model sees the ENTIRE dataset at once.
    contents = CATEGORY_ASSIGNMENT_PROMPT.format(
        categories=", ".join(category_list),
        csv_text=csv_text,
        row_count=row_count,
    )
    labels, confidences, reasons = _parse_assignment_lines(
        _call_gemini(client, contents), valid_categories
    )

    # If the OUTPUT was truncated (fewer lines than rows), resume from where it
    # stopped — still sending the whole dataset for context — instead of padding.
    attempts = 0
    while len(labels) < row_count and attempts < MAX_RESUME_ATTEMPTS:
        attempts += 1
        done = len(labels)
        remaining = row_count - done
        resume_contents = CATEGORY_ASSIGNMENT_RESUME_PROMPT.format(
            categories=", ".join(category_list),
            csv_text=csv_text,
            row_count=row_count,
            done_count=done,
            resume_at=done + 1,
            remaining_count=remaining,
        )
        more_l, more_c, more_r = _parse_assignment_lines(
            _call_gemini(client, resume_contents), valid_categories
        )
        if not more_l:
            break  # model produced nothing usable; stop and flag the rest
        labels += more_l[:remaining]
        confidences += more_c[:remaining]
        reasons += more_r[:remaining]

    # Any rows still unfilled are flagged honestly rather than hidden.
    incomplete = max(0, row_count - len(labels))
    if incomplete:
        labels += ["Unknown"] * incomplete
        confidences += ["Low"] * incomplete
        reasons += ["Needs a human eye — ClassifyAI wasn't sure on this one"] * incomplete
    elif len(labels) > row_count:
        labels = labels[:row_count]
        confidences = confidences[:row_count]
        reasons = reasons[:row_count]

    result_df = df.copy()
    result_df["Category"] = labels
    result_df["Confidence"] = confidences
    result_df["Reason"] = reasons

    return JSONResponse(
        {
            "columns": list(result_df.columns),
            "rows": result_df.astype(object).where(pd.notnull(result_df), None).values.tolist(),
            "csv": result_df.to_csv(index=False),
            "row_count": len(result_df),
            "incomplete_count": incomplete,
        }
    )
