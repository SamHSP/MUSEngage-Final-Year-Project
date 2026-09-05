import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';
import App from './App.tsx';
import './lib/apiClient';
import { initializeSecurity } from './lib/initSecurity';
import { registerServiceWorker } from './lib/registerServiceWorker';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';

await initializeSecurity();

createRoot(document.getElementById('root')!).render(
    <ThemeProvider>
      <CssBaseline enableColorScheme />
      <HelmetProvider>
        <BrowserRouter>
          <AuthProvider>
            <NotificationProvider>
              <App />
            </NotificationProvider>
          </AuthProvider>
        </BrowserRouter>
      </HelmetProvider>
    </ThemeProvider>
);

registerServiceWorker();

