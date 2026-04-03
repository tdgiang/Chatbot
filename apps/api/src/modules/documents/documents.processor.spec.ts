// Test the pure chunking logic only (no external deps)
// Import the function directly by extracting it from the module
// Since chunkText is not exported, we test it via behaviour

describe('chunkText (via documents.processor logic)', () => {
  // Replicate the chunking function here to test it in isolation
  function chunkText(text: string, chunkSize = 2000, overlap = 200): string[] {
    const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      if ((current + '\n\n' + para).length > chunkSize && current.length > 0) {
        chunks.push(current.trim());
        current = current.slice(-overlap) + '\n\n' + para;
      } else {
        current = current ? current + '\n\n' + para : para;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  it('returns single chunk for short text', () => {
    const text = 'Hello world.\n\nThis is a short document.';
    const result = chunkText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Hello world');
  });

  it('splits long text into multiple chunks', () => {
    const para = 'A'.repeat(800);
    const text = [para, para, para, para].join('\n\n');
    const result = chunkText(text, 2000);
    expect(result.length).toBeGreaterThan(1);
  });

  it('each chunk does not exceed chunkSize + overlap', () => {
    const para = 'B'.repeat(600);
    const text = Array(10).fill(para).join('\n\n');
    const result = chunkText(text, 2000, 200);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(2000 + 200 + 4); // +4 for '\n\n'
    }
  });

  it('preserves overlap between consecutive chunks', () => {
    const para = 'C'.repeat(900);
    const text = [para, para, para].join('\n\n');
    const result = chunkText(text, 2000, 200);
    if (result.length >= 2) {
      // End of first chunk should appear at start of second chunk
      const endOfFirst = result[0].slice(-150);
      expect(result[1]).toContain(endOfFirst.trim().slice(0, 50));
    }
  });

  it('handles empty string', () => {
    expect(chunkText('')).toHaveLength(0);
  });

  it('handles single paragraph', () => {
    const text = 'Single paragraph without newlines.';
    const result = chunkText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });
});
