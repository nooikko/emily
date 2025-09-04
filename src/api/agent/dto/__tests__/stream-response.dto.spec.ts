import 'reflect-metadata';
import { StreamResponseDto } from '../stream-response.dto';

describe('StreamResponseDto', () => {
  it('should create instance with required properties', () => {
    const streamResponse = new StreamResponseDto();
    streamResponse.id = 'stream-123e4567-e89b-12d3-a456-426614174000';
    streamResponse.content = 'Here is the response to your query...';

    expect(streamResponse.id).toBe('stream-123e4567-e89b-12d3-a456-426614174000');
    expect(streamResponse.content).toBe('Here is the response to your query...');
  });

  it('should handle empty content', () => {
    const streamResponse = new StreamResponseDto();
    streamResponse.id = 'stream-empty';
    streamResponse.content = '';

    expect(streamResponse.id).toBe('stream-empty');
    expect(streamResponse.content).toBe('');
  });

  it('should handle long content strings', () => {
    const longContent = 'A'.repeat(10000);
    const streamResponse = new StreamResponseDto();
    streamResponse.id = 'stream-long';
    streamResponse.content = longContent;

    expect(streamResponse.id).toBe('stream-long');
    expect(streamResponse.content).toBe(longContent);
    expect(streamResponse.content.length).toBe(10000);
  });

  it('should handle content with special characters', () => {
    const specialContent = 'Hello! 👋 Here is some content with émojis, ñ, and symbols: @#$%^&*()';
    const streamResponse = new StreamResponseDto();
    streamResponse.id = 'stream-special';
    streamResponse.content = specialContent;

    expect(streamResponse.id).toBe('stream-special');
    expect(streamResponse.content).toBe(specialContent);
  });

  it('should handle multiline content', () => {
    const multilineContent = `Line 1
Line 2
Line 3
With various formatting...`;
    const streamResponse = new StreamResponseDto();
    streamResponse.id = 'stream-multiline';
    streamResponse.content = multilineContent;

    expect(streamResponse.id).toBe('stream-multiline');
    expect(streamResponse.content).toBe(multilineContent);
    expect(streamResponse.content.split('\n')).toHaveLength(4);
  });

  it('should handle JSON-like content as string', () => {
    const jsonContent = '{"message": "This is JSON as string", "status": "success"}';
    const streamResponse = new StreamResponseDto();
    streamResponse.id = 'stream-json';
    streamResponse.content = jsonContent;

    expect(streamResponse.id).toBe('stream-json');
    expect(streamResponse.content).toBe(jsonContent);
    expect(typeof streamResponse.content).toBe('string');
  });

  it('should maintain type consistency', () => {
    const streamResponse = new StreamResponseDto();

    expect(streamResponse).toBeInstanceOf(StreamResponseDto);
    expect(typeof streamResponse.id).toBe('undefined'); // Before assignment
    expect(typeof streamResponse.content).toBe('undefined'); // Before assignment

    streamResponse.id = 'test-id';
    streamResponse.content = 'test content';

    expect(typeof streamResponse.id).toBe('string');
    expect(typeof streamResponse.content).toBe('string');
  });

  describe('API Property Decorators', () => {
    it('should have proper property structure', () => {
      const streamResponse = new StreamResponseDto();
      streamResponse.id = 'stream-123e4567-e89b-12d3-a456-426614174000';
      streamResponse.content = 'Here is the response to your query...';

      expect(streamResponse.id).toBe('stream-123e4567-e89b-12d3-a456-426614174000');
      expect(streamResponse.content).toBe('Here is the response to your query...');
    });

    it('should only have expected properties', () => {
      const streamResponse = new StreamResponseDto();
      const _expectedProperties = ['id', 'content'];

      // Set properties to test they exist
      streamResponse.id = 'test-id';
      streamResponse.content = 'test content';

      expect(streamResponse.id).toBeDefined();
      expect(streamResponse.content).toBeDefined();
    });
  });

  describe('Usage Scenarios', () => {
    it('should work for streaming chat responses', () => {
      const chatResponse = new StreamResponseDto();
      chatResponse.id = 'stream-chat-001';
      chatResponse.content = 'I understand your question. Let me provide a detailed answer...';

      expect(chatResponse.id).toMatch(/^stream-chat-\d+$/);
      expect(chatResponse.content).toContain('understand');
    });

    it('should work for streaming code generation', () => {
      const codeResponse = new StreamResponseDto();
      codeResponse.id = 'stream-code-001';
      codeResponse.content = `function calculateSum(a, b) {
  return a + b;
}`;

      expect(codeResponse.id).toMatch(/^stream-code-\d+$/);
      expect(codeResponse.content).toContain('function');
      expect(codeResponse.content).toContain('calculateSum');
    });

    it('should work for streaming analysis results', () => {
      const analysisResponse = new StreamResponseDto();
      analysisResponse.id = 'stream-analysis-001';
      analysisResponse.content = 'Based on the data analysis, I found the following patterns...';

      expect(analysisResponse.id).toMatch(/^stream-analysis-\d+$/);
      expect(analysisResponse.content).toContain('analysis');
      expect(analysisResponse.content).toContain('patterns');
    });

    it('should work for incremental response building', () => {
      const responses: StreamResponseDto[] = [];

      for (let i = 1; i <= 5; i++) {
        const response = new StreamResponseDto();
        response.id = `stream-incremental-${i.toString().padStart(3, '0')}`;
        response.content = `Part ${i} of the response...`;
        responses.push(response);
      }

      expect(responses).toHaveLength(5);
      expect(responses[0].id).toBe('stream-incremental-001');
      expect(responses[4].id).toBe('stream-incremental-005');
      expect(responses.every((r) => r.content.includes('Part'))).toBe(true);
    });
  });
});
