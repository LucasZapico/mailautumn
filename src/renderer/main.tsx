import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ContextMenuProvider } from './components/ContextMenu';
import './index.css';
import { initTheme } from './lib/theme';
import { log } from './lib/logger';

// Apply default theme before first paint
initTheme();

log.info('Renderer starting');

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <ContextMenuProvider>
      <App />
    </ContextMenuProvider>
  </StrictMode>,
);
