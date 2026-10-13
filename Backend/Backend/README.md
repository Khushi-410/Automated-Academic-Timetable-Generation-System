# Academic timetable backend

Steps 1 through 4 provide FastAPI, local frontend CORS, interactive API docs,
validated coordinator configuration, DFIS presets, OR-Tools timetable generation,
locked regeneration, complete schedule validation, SQLite drafts, and validated
publication. The frontend is connected through its API adapter.

## Run in PyCharm

1. Open this `Backend` folder as the project.
2. Open **Settings > Project > Python Interpreter** (or **Settings > Python >
   Interpreter**, depending on your PyCharm version).
3. Select the existing interpreter at `.venv\Scripts\python.exe`.
4. Right-click `main.py` and choose **Run 'main'**. Use the backend folder as
   the working directory. The development server automatically reloads changes.
5. Open <http://127.0.0.1:8000/docs> and try **GET /api/health**.

Expected health response:

```json
{"status": "ok", "service": "academic-timetable-backend"}
```

Press the red Stop button in PyCharm to stop the server. Run only one instance
on port 8000 at a time.

## Recreate the environment

Python 3.13 is used for the initial environment. From PowerShell in `Backend`,
with Python installed and available on PATH:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

If Python is managed through uv instead:

```powershell
uv venv --python 3.13 .venv
uv pip install --python .venv\Scripts\python.exe -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

`requirements.in` lists direct dependencies. `requirements.txt` locks the
resolved versions used for this project.

## Configuration

The defaults allow the local Vite and Next.js development origins. To change
them, copy `.env.example` to `.env`, edit it, and restart the server. Environment
variables override values in `.env`. `CORS_ORIGINS` must be a JSON array.

Frontend configuration:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

The frontend appends `/api/...` when calling endpoints. Generation, validation,
draft saving/reopening/updating, and validated publication are available.

## Structure

```text
Backend/
  main.py                  # PyCharm run entry point
  requirements.in          # Direct dependencies
  requirements.txt         # Locked dependencies
  .env.example             # Optional local configuration
  app/
    main.py                # App assembly, CORS, error handlers
    core/config.py         # Environment settings
    api/routes/health.py   # GET /api/health
    api/routes/configuration.py  # Presets and configuration validation
    api/routes/timetable.py # POST /api/generate and /api/validate
    api/routes/saved.py     # Drafts and publication
    models/scheduling.py   # Coordinator configuration models
    models/timetable.py    # Session and generation contracts
    services/presets.py    # DFIS demo data
    services/calendar.py   # Periods, availability, session identity
    services/scheduler.py  # OR-Tools scheduling and diagnostics
    services/validation.py # Complete schedule conflict checks
    services/storage.py    # SQLite persistence and publication validation
  contracts/configuration.ts    # Frontend configuration types
  contracts/timetable.ts   # Frontend schedule and result types
  examples/                # JSON request examples
  API_CONTRACT.md           # Frontend integration contract
  tests/                   # Configuration and ASGI request checks
```

## Try the Step 2 endpoints

In `/docs`, execute `GET /api/presets/dfis`. Copy the full JSON response,
then paste it directly into the request body for `POST /api/config/validate`.
The expected counts are 3 theory periods, 2 practical sessions, and 4 practical
periods. This checks input validity only; it does not generate a timetable.

Use `GET /api/presets/dfis-impossible` to load a well-formed configuration
whose theory faculty member is available for only two of the three required
periods. The later solver will diagnose this shortfall.

Send `API_CONTRACT.md`, `contracts/configuration.ts`, and the example JSON
files to the frontend developers so they can align their configuration forms.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Tests exercise configuration validation and actual ASGI request handling
without opening a network port or needing an additional test dependency.

## Generate the first timetable

Restart the server after dependency changes. In `/docs`, expand
`POST /api/generate`, select the DFIS example, click **Try it out**, and
**Execute**. Expect `status: "feasible"` and five session objects: three
theory sessions and two practical sessions, each occupying two periods.

Select the impossible example to see an `infeasible` result with a diagnostic
explaining three weekly theory periods versus two available faculty periods.
Full request bodies are saved under `examples/` if you prefer copying JSON.

For manual edits, submit `{ "config": ..., "sessions": [...] }` to
`POST /api/validate`. For locked regeneration, send selected sessions in
`lockedSessions` to `POST /api/generate`.

See `API_CONTRACT.md` for status handling, period construction, lock behaviour,
preference metrics, and service limits. The engine's CP-SAT calls follow the
[official OR-Tools solver guide](https://developers.google.com/optimization/cp/cp_solver).

## Next steps

An optional LLM can explain the evidence-based diagnostics in plain language.
Core generation and failure handling do not need an AI-provider API key.

## Saved timetables

`POST /api/timetables` saves `{name, config, sessions}` and returns HTTP 201.
`GET /api/timetables` lists records and `GET /api/timetables/{id}` reopens one.
`PUT /api/timetables/{id}` accepts any nonempty subset of name/config/sessions.
Changes return a published record to draft and recompute validation.
`POST /api/timetables/{id}/publish` validates the stored snapshot before marking
it published. Incomplete drafts may be saved but cannot be published.

The default database is `Backend/data/timetables.sqlite3`, ignored by Git.
Override with `DATABASE_PATH` if needed. The database is created on the first
storage request and survives process restarts.
