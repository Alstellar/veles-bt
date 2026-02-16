// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications' // 1. Импорт компонента
import App from './App.tsx'
import { LogService } from './services/LogService'

// Стили
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css'; // 2. Импорт стилей уведомлений
import './index.css'

LogService.initialize()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider>
      <Notifications /> {/* 3. Подключение компонента */}
      <App />
    </MantineProvider>
  </React.StrictMode>,
)
