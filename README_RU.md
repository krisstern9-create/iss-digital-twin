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

### Документация

- Архитектура: `docs/architecture.md`
- Сценарии (User Stories): `docs/user-stories.md`
- Источники данных/ассетов: `docs/sources.md`

