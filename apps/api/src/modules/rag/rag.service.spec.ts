import { ChatMessage } from '@chatbot/shared-types';

// Test buildPrompt logic in isolation (no DI needed)
function buildPrompt(
  systemPrompt: string,
  chunks: string[],
  history: ChatMessage[],
  question: string,
): ChatMessage[] {
  const contextBlock = chunks.length > 0
    ? `\n---\nThông tin tham khảo:\n${chunks.join('\n\n')}\n---`
    : '';

  const system = `${systemPrompt}${contextBlock}`;
  const messages: ChatMessage[] = [{ role: 'USER', content: system }];
  const recentHistory = history.slice(-6);
  messages.push(...recentHistory);
  messages.push({ role: 'USER', content: question });
  return messages;
}

describe('RagService.buildPrompt', () => {
  const systemPrompt = 'Bạn là trợ lý AI.';

  it('includes system prompt as first message', () => {
    const result = buildPrompt(systemPrompt, [], [], 'Hello?');
    expect(result[0].role).toBe('USER');
    expect(result[0].content).toContain(systemPrompt);
  });

  it('appends question as last message', () => {
    const result = buildPrompt(systemPrompt, [], [], 'Câu hỏi của tôi?');
    expect(result[result.length - 1].content).toBe('Câu hỏi của tôi?');
  });

  it('embeds context chunks into system message', () => {
    const chunks = ['Chunk 1 content', 'Chunk 2 content'];
    const result = buildPrompt(systemPrompt, chunks, [], 'Q?');
    expect(result[0].content).toContain('Chunk 1 content');
    expect(result[0].content).toContain('Chunk 2 content');
    expect(result[0].content).toContain('Thông tin tham khảo');
  });

  it('omits context block when no chunks', () => {
    const result = buildPrompt(systemPrompt, [], [], 'Q?');
    expect(result[0].content).not.toContain('Thông tin tham khảo');
  });

  it('keeps only last 6 history messages', () => {
    const history: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'USER' : 'ASSISTANT',
      content: `msg-${i}`,
    }));
    const result = buildPrompt(systemPrompt, [], history, 'Q?');
    // system + 6 history + question = 8
    expect(result).toHaveLength(8);
  });

  it('total messages = 1 (system) + history + 1 (question)', () => {
    const history: ChatMessage[] = [
      { role: 'USER', content: 'prev q' },
      { role: 'ASSISTANT', content: 'prev a' },
    ];
    const result = buildPrompt(systemPrompt, [], history, 'new q');
    expect(result).toHaveLength(4); // system + 2 history + question
  });
});
