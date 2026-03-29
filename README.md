# iss-digital-twin
Интерактивный 3D цифровой двойник модульной космической станции (МКС/РОСС) с параметрическим интерфейсом, симуляцией орбиты по TLE и валидацией команд. Для конкурса «Цифровой прорыв».

# 🛰️ ISS Digital Twin

> Interactive 3D Digital Twin of Modular Space Station (ISS/ROSS)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10+-blue)](backend/)
[![React](https://img.shields.io/badge/React-18+-blue)](frontend/)
[![Cesium](https://img.shields.io/badge/Cesium.js-1.100+-blue)](https://cesium.com/)

🏆 Участник конкурса «Цифровой прорыв» 2026 | Track: Космические технологии

## ✨ Особенности

- 🌍 **3D визуализация**: Интерактивная модель станции в космическом окружении (Cesium.js)
- 🔄 **Стыковка и расширение**: Анимация процессов сближения, стыковки и добавления модулей
- 🎛️ **Параметрический интерфейс**: Управление высотой орбиты, ориентацией, составом модулей
- 📡 **Открытые данные**: NORAD TLE (Celestrak) для расчёта орбиты, NASA 3D Resources для моделей
- 🔐 **Intent-Gating**: Валидация команд перед исполнением (уникальная фича безопасности)
- 🔗 **Crypto-Audit**: Цепочка хэшей для проверки целостности операций
- 🌐 **Мультиязычность**: Интерфейс и документация на русском и английском

## 🚀 Быстрый старт

```bash
# Клонировать репозиторий
git clone https://github.com/your-username/iss-digital-twin.git
cd iss-digital-twin

# Запустить бэкенд
cd backend && pip install -r requirements.txt && uvicorn main:app --reload

# Запустить фронтенд
cd frontend && npm install && npm run dev
```
