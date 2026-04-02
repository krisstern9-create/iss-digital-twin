# 🛰️ ISS Digital Twin (ISS/ROSS)

Интерактивный 3D‑прототип цифрового двойника модульной орбитальной станции: конфигурация модулей, параметризация (орбита/ориентация), симуляция стыковки и расширения, визуализация орбиты по открытым данным (TLE).

> Interactive 3D digital twin prototype of a modular orbital station: modules configuration, parameterization (orbit/orientation), docking/expansion simulation, and open-data orbit visualization (TLE).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10+-blue)](backend/)
[![React](https://img.shields.io/badge/React-18+-blue)](frontend/)
[![Three.js](https://img.shields.io/badge/Three.js-r3f-blue)](https://threejs.org/)

🏆 Участник конкурса «Цифровой прорыв» 2026 | Track: Космические технологии

## ✨ Особенности

- 🌍 **3D визуализация**: Интерактивная сцена станции в космическом окружении (React Three Fiber / Three.js)
- 🔄 **Стыковка и расширение**: Анимация процессов сближения, стыковки и добавления модулей
- 🎛️ **Параметрический интерфейс**: Управление высотой орбиты, ориентацией, составом модулей
- 📡 **Открытые данные**: NORAD TLE (CelesTrak) для расчёта положения/прогноза
- 🔐 **Intent-Gating**: Валидация команд перед исполнением (уникальная фича безопасности)
- 🔗 **Crypto-Audit**: Цепочка хэшей для проверки целостности операций
- 🌐 **Мультиязычность**: Интерфейс и документация на русском и английском

## 📚 Документация

- **Русская версия README**: `README_RU.md`
- **Архитектура**: `docs/architecture.md`
- **User Stories**: `docs/user-stories.md`
- **Источники данных/моделей**: `docs/sources.md`

## 🚀 Быстрый старт

```bash
# Запустить бэкенд
cd backend && pip install -r requirements.txt && uvicorn main:app --reload

# Запустить фронтенд
cd frontend && npm install && npm run dev
```

По умолчанию:

- **Backend**: `http://localhost:8000` (Swagger: `http://localhost:8000/docs`)
- **Frontend**: `http://localhost:5173`

### Переменные окружения (опционально)

Frontend:

- `VITE_API_URL` — базовый URL API (по умолчанию `http://localhost:8000`)
