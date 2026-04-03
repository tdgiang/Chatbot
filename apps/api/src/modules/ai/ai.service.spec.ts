import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { GroqProvider } from './providers/groq.provider';
import { OllamaProvider } from './providers/ollama.provider';

const mockMessages = [{ role: 'USER' as const, content: 'Hello' }];

describe('AiService', () => {
  let service: AiService;
  let groq: { chat: jest.Mock; chatStream: jest.Mock; embed: jest.Mock };
  let ollama: { chat: jest.Mock; chatStream: jest.Mock; embed: jest.Mock };

  function buildService(provider: 'groq' | 'ollama') {
    return Test.createTestingModule({
      providers: [
        AiService,
        { provide: ConfigService, useValue: { get: (key: string) => key === 'AI_PROVIDER' ? provider : undefined } },
        { provide: GroqProvider, useValue: groq },
        { provide: OllamaProvider, useValue: ollama },
      ],
    }).compile().then(m => m.get<AiService>(AiService));
  }

  beforeEach(() => {
    groq = {
      chat: jest.fn().mockResolvedValue('groq-response'),
      chatStream: jest.fn(),
      embed: jest.fn().mockRejectedValue(new Error('Groq no embed')),
    };
    ollama = {
      chat: jest.fn().mockResolvedValue('ollama-response'),
      chatStream: jest.fn(),
      embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };
  });

  it('uses GroqProvider when AI_PROVIDER=groq', async () => {
    service = await buildService('groq');
    const result = await service.chat(mockMessages);
    expect(result).toBe('groq-response');
    expect(groq.chat).toHaveBeenCalledTimes(1);
    expect(ollama.chat).not.toHaveBeenCalled();
  });

  it('uses OllamaProvider when AI_PROVIDER=ollama', async () => {
    service = await buildService('ollama');
    const result = await service.chat(mockMessages);
    expect(result).toBe('ollama-response');
    expect(ollama.chat).toHaveBeenCalledTimes(1);
    expect(groq.chat).not.toHaveBeenCalled();
  });

  it('returns fallback message when provider throws', async () => {
    groq.chat.mockRejectedValue(new Error('API down'));
    service = await buildService('groq');
    const result = await service.chat(mockMessages);
    expect(result).toBe('Xin lỗi, hệ thống đang bận. Vui lòng thử lại sau.');
  });

  it('embed always uses OllamaProvider regardless of AI_PROVIDER', async () => {
    service = await buildService('groq');
    const result = await service.embed('test text');
    expect(ollama.embed).toHaveBeenCalledWith('test text');
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('embed returns empty array when Ollama fails', async () => {
    ollama.embed.mockRejectedValue(new Error('Ollama down'));
    service = await buildService('groq');
    const result = await service.embed('test text');
    expect(result).toEqual([]);
  });
});
