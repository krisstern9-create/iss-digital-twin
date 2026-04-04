## 🛰️ ISS Digital Twin (МКС/РОСС) — README (RU)

Интерактивный 3D‑прототип цифрового двойника модульной орбитальной станции: конфигурация модулей, параметризация (орбита/ориентация), симуляция стыковки и расширения, визуализация параметров орбиты по открытым данным (TLE).

### Стек

- **Frontend**: React + Vite + React Three Fiber (Three.js)
- **Backend**: FastAPI (Python)
- **DB**: SQLite (`backend/digital_twin.db`)

### Быстрый запуск

Backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Адреса по умолчанию:

- Backend: `http://localhost:8000` (Swagger: `http://localhost:8000/docs`)
- Frontend: `http://localhost:5173`

### Переменные окружения (опционально)

Frontend:

- `VITE_API_URL` — базовый URL API (по умолчанию `http://localhost:8000`)

Backend:

- `GET /api/ai/forecast` — тот же трек, что у `/api/predict/track`, плюс встроенный текстовый разбор траектории (эвристика «orbit-orchestrator-v1», без внешнего LLM).
- `CORS_ORIGINS` — разрешённые origin для CORS, через запятую (по умолчанию `http://localhost:5173,http://localhost:3000`)
- `DATABASE_PATH` — путь к файлу SQLite (по умолчанию `backend/digital_twin.db`)
- `TLE_CACHE_SECONDS` — TTL кеша TLE Celestrak в секундах (по умолчанию `3600`, минимум `60`)
- `TLE_REQUEST_TIMEOUT_SEC` — таймаут HTTP к Celestrak (по умолчанию `12`)
- `STATIONS_CATALOG_MAX` — максимум станций из каталога TLE (по умолчанию `8`, от `1` до `40`)
- `LOG_LEVEL` — уровень логов (`INFO`, `DEBUG`, …)
- `PORT` — порт при запуске `python main.py` (по умолчанию `8000`)
- `DT_SECURE_KEY`, `DT_SCOS_SEED` — как раньше (крипто/демо SCOS)

### Документация

- Архитектура: `docs/architecture.md`
- Сценарии (User Stories): `docs/user-stories.md`
- Источники данных/ассетов: `docs/sources.md`

