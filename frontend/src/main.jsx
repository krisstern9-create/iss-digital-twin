import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import * as Cesium from 'cesium'

// Делаем Cesium доступным глобально для 3D функциональности
window.Cesium = Cesium

// Устанавливаем базовый URL для ассетов Cesium (воркеры, изображения, CSS виджеты)
window.CESIUM_BASE_URL = '/cesium/'

// Точка входа приложения - рендерим App компонент
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)