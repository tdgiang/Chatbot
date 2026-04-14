export interface WidgetConfig {
  apiKey: string;
  apiUrl?: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  primaryColor?: string;
  position?: 'bottom-right' | 'bottom-left';
  welcomeMessage?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

declare global {
  interface Window {
    ChatbotConfig?: WidgetConfig;
    __chatbotWidgetMounted?: boolean;
  }
}
