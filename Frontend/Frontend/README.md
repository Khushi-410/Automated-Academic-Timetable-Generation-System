# Acadence - Automated Academic Timetable Frontend

Coordinator-facing frontend for the hackathon's **Automated Academic Timetable Generation System**. It covers configuration, solver generation states, timetable review, manual validation, locking, draft persistence, publication, print/PDF, and CSV export.

## Start locally

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

The bundled workspace runtime can also run `pnpm` at:

```text
C:\Users\Visham Kumar\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd
```

Build the production bundle with:

```bash
pnpm build
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_USE_MOCK_API` | `true` | Uses the local mock adapter when anything except `false`. |
| `VITE_API_BASE_URL` | empty | Base URL for FastAPI, for example `http://localhost:8000`. |

## Mock mode

`VITE_USE_MOCK_API=true` is the default when no environment file exists. It provides:

- the M.Sc. DFIS feasible fixture with three theory periods and two two-period practical sessions;
- an impossible `DFIS103` fixture with an explicit faculty-availability diagnostic;
- localStorage-based draft persistence;
- lock-preserving regeneration for the supplied DFIS scenario;
- client-side validation for manual moves (overlap and capacity checks).

It deliberately does **not** pretend to solve arbitrary configurations. A non-preset configuration reports that the live scheduling service is required.

## Connect FastAPI

Set the following before starting Vite:

```env
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://localhost:8000
```

All requests live only in `src/services/api.ts`; components never call `fetch`. The exact shared schemas and endpoint list are in [API_CONTRACT.md](./API_CONTRACT.md).

## Frontend team handoff

- `src/types/timetable.ts`: stable frontend/backend TypeScript records.
- `src/services/api.ts`: mock and live adapters with the same interface.
- `src/components/Configuration.tsx`: timings, resources, groups/batches, faculty, teaching requirements, and commitments.
- `src/components/Timetable.tsx`: views, grid, session dialog, locking, diagnostics, CSV and print actions.

No AI-provider secret belongs in this frontend. Keep solver and optional explanation-service keys on the backend only.
