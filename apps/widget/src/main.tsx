import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { ChatWidget } from './ChatWidget';
import type { WidgetConfig } from './types';

function mount() {
  // Prevent double-mount
  if (window.__chatbotWidgetMounted) return;
  window.__chatbotWidgetMounted = true;

  const config: WidgetConfig = window.ChatbotConfig ?? { apiKey: '' };

  if (!config.apiKey) {
    console.warn('[ChatbotWidget] apiKey is required. Set window.ChatbotConfig = { apiKey: "sk-..." }');
    return;
  }

  // Create shadow host to isolate from host page CSS
  const host = document.createElement('div');
  host.id = 'chatbot-widget-root';
  document.body.appendChild(host);

  createRoot(host).render(
    <StrictMode>
      <ChatWidget config={config} />
    </StrictMode>
  );
}

// Mount after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
