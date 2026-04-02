# Architecture

## Components

- **Frontend**: React + Vite + React Three Fiber (Three.js). UI controls + 3D scene.
- **Backend**: FastAPI. Open-data orbit (TLE), modules state (SQLite), audit log (hash chain).
- **Database**: SQLite (`backend/digital_twin.db`) for station modules + audit trail + TLE cache.

## Data flow (high-level)

```mermaid
flowchart LR
  UI[React UI\n(sliders, buttons, language)] -->|HTTP| API[FastAPI]
  Scene[3D Scene\n(R3F/Three.js)] --> UI

  API --> DB[(SQLite)]
  API -->|Fetch TLE| CelesTrak[CelesTrak\nNORAD TLE]

  DB --> API
  API --> UI

  subgraph Backend responsibilities
    API
    DB
  end
```

## Key endpoints

- `GET /api/station/position`: current position (Skyfield if available, otherwise simplified fallback).
- `GET /api/station/modules`: modules list (id, type, attached/visible, position).
- `PUT /api/station/modules/{id}/visibility`: show/hide module.
- `PUT /api/station/modules/{id}/attach`: attach/detach module.
- `POST /api/station/dock`: intent-gated docking event (audit trail).
- `POST /api/station/expand`: expansion event (audit trail).
- `GET /api/audit/log`, `GET /api/audit/verify`: audit chain inspection.

