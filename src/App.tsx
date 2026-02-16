import { useState, useEffect, lazy, Suspense } from 'react';
import { Center, Loader } from '@mantine/core';

const MainLayout = lazy(() =>
  import('./components/layouts/MainLayout').then((module) => ({
    default: module.MainLayout
  }))
);

const PopupView = lazy(() =>
  import('./components/views/PopupView').then((module) => ({
    default: module.PopupView
  }))
);

function App() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // Проверка параметра URL (?mode=fullscreen)
    const params = new URLSearchParams(window.location.search);
    setIsFullscreen(params.get('mode') === 'fullscreen');
  }, []);

  return (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader type="dots" />
        </Center>
      }
    >
      {isFullscreen ? <MainLayout /> : <PopupView />}
    </Suspense>
  );
}

export default App;
