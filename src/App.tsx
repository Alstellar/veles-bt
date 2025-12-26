import { useState, useEffect } from 'react';
import { MainLayout } from './components/layouts/MainLayout';
import { PopupView } from './components/views/PopupView';
import '@mantine/core/styles.css';

function App() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // Проверка параметра URL (?mode=fullscreen)
    const params = new URLSearchParams(window.location.search);
    setIsFullscreen(params.get('mode') === 'fullscreen');
  }, []);

  if (isFullscreen) {
    return <MainLayout />;
  }

  return <PopupView />;
}

export default App;