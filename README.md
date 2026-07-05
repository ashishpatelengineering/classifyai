# ClassifyAI — AI-assisted CSV categorization

ClassifyAI reads an entire CSV in a single pass, proposes categories that fit
the data, assigns every row a category with a confidence level and a short
reason, and lets a reviewer correct anything before export. It is a split
application: a React (Vite) frontend and a FastAPI backend.

The Gemini API key is configured once by the operator as a server-side
environment variable. End users never see, enter, or handle a key.

## Project structure

```
backend/    FastAPI service — three routes, no stored state, no stored API key
frontend/   React (Vite) single-page app that calls the backend
```

## How the API key and dataset flow works

- The Gemini key is set once as an environment variable (`GEMINI_API_KEY`) on
  the backend. Visitors never see or enter a key.
- The uploaded CSV is never written to the backend's disk. It is read into
  memory, processed, and returned in the response. Nothing is persisted.

## API routes

| Method | Path                      | Purpose                                            |
|--------|---------------------------|----------------------------------------------------|
| GET    | `/health`                 | Liveness check; returns `{"status": "ok"}`.        |
| POST   | `/api/suggest-categories` | Suggest categories for an uploaded CSV. Optional `critique` flag runs a second audit pass. |
| POST   | `/api/assign-categories`  | Assign every row to one of the supplied categories, with confidence and reason. |

## Requirements

- **Backend:** Python 3.11 (pinned to 3.11.9 for deploys).
- **Frontend:** Node.js 20.19+ or 22.12+ (required by Vite 8).
- A **Google Gemini API key** (`GEMINI_API_KEY`).

## Running locally

**1. Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
export GEMINI_API_KEY=your_key_here                # Windows: set GEMINI_API_KEY=your_key_here
uvicorn main:app --reload --port 8000
```
The backend is now on `http://localhost:8000`.

**2. Frontend** (in a second terminal)
```bash
cd frontend
npm install
cp .env.example .env    # defaults VITE_API_BASE_URL to http://localhost:8000
npm run dev
```
Open the URL Vite prints (default `http://localhost:5173`).

## Deploying to the cloud

The backend and frontend deploy separately. Deploy the backend first, because
the frontend needs the backend's public URL at build time.

### 1. Backend → Render

A `render.yaml` Blueprint is included in `backend/`. It sets the root directory
to `backend`, pins Python 3.11.9, and declares `GEMINI_API_KEY` as a required
secret. **Important:** `render.yaml` is only read by the **Blueprint** flow
(Option A). A service created manually via **New → Web Service** (Option B)
ignores it, so you must set those values by hand.

**Option A — Blueprint (recommended):**
1. Push the project to a GitHub or GitLab repository.
2. In the Render dashboard: **New → Blueprint**, then connect the repository.
   Render reads `backend/render.yaml` automatically.
3. When prompted, enter the value for `GEMINI_API_KEY`. Render stores it as a
   secret; it is never written to your repository.
4. Click **Apply**. Note the service URL, e.g.
   `https://classifyai-api.onrender.com`.

**Option B — Manual Web Service:**
1. Push the project to a repository.
2. **New → Web Service**, connect the repository.
3. **Language:** select **Python 3** (the backend is a FastAPI/uvicorn app;
   do not pick Node — that's the frontend, which deploys separately).
4. Set **Root Directory** to `backend`.
5. **Build Command:** `pip install -r requirements.txt`
   **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. **Instance type:** Free.
7. Under **Environment**, add two variables:
   - `GEMINI_API_KEY` — your Gemini key.
   - `PYTHON_VERSION` — `3.11.9` (matches the version the project is pinned to).
8. Deploy and note the service URL.

Verify the backend is up by visiting `https://<your-service>.onrender.com/health`
— it should return `{"status": "ok"}`.

### 2. Frontend → Cloudflare Pages (or Vercel)

**Cloudflare Pages**
1. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → connect
   to Git**, then select the repository.
2. **Framework preset:** none (Vite). **Root directory:** `frontend`.
   **Build command:** `npm run build`. **Build output directory:** `dist`.
3. Under **Environment variables (build)**, add:
   - `VITE_API_BASE_URL` — your Render backend URL from the previous step (no
     trailing slash).
   - `NODE_VERSION` — `20.19.0` (or newer). Vite 8 requires Node 20.19+/22.12+,
     and Cloudflare Pages otherwise defaults to an older Node that fails the
     build.
4. Deploy. You will get a `*.pages.dev` URL, with an optional custom domain.

> Vite inlines `VITE_*` variables at build time, so if you change
> `VITE_API_BASE_URL` later you must trigger a fresh build for it to take effect.

**Vercel (alternative)** — a `vercel.json` is included in `frontend/`:
1. Import the repository and set the **Root Directory** to `frontend`.
2. Add the `VITE_API_BASE_URL` environment variable (your Render backend URL).
3. Deploy.

### 3. Lock down CORS (do this once both are live)

The backend ships with `allow_origins=["*"]` for easy first setup. Once you know
the frontend's URL, restrict it. In `backend/main.py`, change:
```python
allow_origins=["*"]
```
to your frontend origin, e.g.:
```python
allow_origins=["https://classifyai.pages.dev"]
```
Commit and redeploy the backend.

### Troubleshooting the backend deploy

**`ERROR: Could not open requirements file: ... 'requirements.txt'`**
Render is running the build from the repository root instead of `backend/`.
The `requirements.txt` file lives in `backend/`, so the service's **Root
Directory** must be set to `backend`. Fix it in the service's **Settings →
Root Directory**, set it to `backend`, then **Manual Deploy → Deploy latest
commit**.

**Wrong Python version (e.g. "Using Python version 3.14.x (default)")**
The `PYTHON_VERSION` variable isn't being applied. On a **manually created**
Web Service, `render.yaml` is ignored — the dashboard fields are authoritative.
Add `PYTHON_VERSION` = `3.11.9` under **Environment** and redeploy.

**Note:** `render.yaml` only takes effect through the **Blueprint** flow
(**New → Blueprint**). A service created via **New → Web Service** does *not*
read `render.yaml`; you must set Root Directory, environment variables, and the
build/start commands manually (see Option B above). If you'd rather not manage
those by hand, delete the manual service and recreate it as a Blueprint.

**Render detects Poetry**
This project uses `pip` with `requirements.txt`, not Poetry. Once **Root
Directory** is `backend`, Render finds `requirements.txt` and uses pip. There is
no `pyproject.toml`, so no Poetry configuration is needed.

## Operational notes

- The Gemini key lives only in the backend host's environment variables. It is
  never committed to the repository and never sent to or stored by the frontend.
- **Free-tier behaviour:** Render's free instance sleeps after 15 minutes idle
  and takes roughly 30–60 seconds to cold-start on the next request. Cloudflare
  Pages serves the static frontend with no sleep.
- **Upload limit:** the backend rejects files larger than 15 MB.

## Features

All of the following preserve the single-pass design: the model sees the
**entire dataset at once** (no batching, no dropped columns).

1. **Per-row reasoning.** Assignment returns `Category | Confidence | Reason`.
   Each row carries a short justification, shown inline in the results table and
   included in the exported CSV. For a low-confidence row, the model names the
   competing category in the reason.

2. **Category self-audit (optional).** A toggle in the categories step runs a
   second whole-dataset pass that audits the proposed scheme for overlap, gaps,
   vagueness, and redundancy, and returns a corrected set. The UI flags when the
   audit changed anything.

3. **Editable categories.** Before running, rename any category, remove ones you
   don't need, or add your own. The catch-all `Unknown` category cannot be
   renamed or removed.

4. **Reviewer workflow.** The results view offers full-text search, per-category
   confidence bars, and bulk re-labelling of the currently filtered rows. A
   manual change is recorded as High confidence with a "You set this one"
   reason; reselecting a row's original category restores the model's original
   confidence and reason, so the export cleanly distinguishes model decisions
   from reviewer decisions.

### Handling of truncated output

The input is never fragmented. At large row counts the model's *response* can be
cut off. Rather than padding missing rows with `Unknown`, the backend asks the
model to resume from where it stopped — still sending the full dataset for
context — for a few attempts. Any rows that still cannot be completed are
reported in the response (`incomplete_count`) and surfaced in the UI for review.
