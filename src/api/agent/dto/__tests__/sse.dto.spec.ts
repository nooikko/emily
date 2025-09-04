import 'reflect-metadata';
import { SseErrorMessage, SseMessage, SseMessageData, type SseMessageUnion } from '../sse.dto';

describe('SseMessageData', () => {
  it('should create instance with all properties', () => {
    const data = new SseMessageData();
    data.id = 'sse-123';
    data.type = 'ai';
    data.content = 'Processing your request...';

    expect(data.id).toBe('sse-123');
    expect(data.type).toBe('ai');
    expect(data.content).toBe('Processing your request...');
  });

  it('should create instance without optional type property', () => {
    const data = new SseMessageData();
    data.id = 'sse-456';
    data.content = 'Content without type';

    expect(data.id).toBe('sse-456');
    expect(data.type).toBeUndefined();
    expect(data.content).toBe('Content without type');
  });

  it('should support all valid type values', () => {
    const types: Array<'ai' | 'tool'> = ['ai', 'tool'];

    types.forEach((type) => {
      const data = new SseMessageData();
      data.id = `sse-${type}`;
      data.type = type;
      data.content = `${type} content`;

      expect(data.type).toBe(type);
      expect(data.content).toBe(`${type} content`);
    });
  });

  it('should have proper property structure for API documentation', () => {
    const data = new SseMessageData();

    // Test that properties can be set correctly
    data.id = 'sse-123e4567-e89b-12d3-a456-426614174000';
    data.type = 'ai';
    data.content = 'Processing your request...';

    expect(data.id).toBe('sse-123e4567-e89b-12d3-a456-426614174000');
    expect(data.type).toBe('ai');
    expect(data.content).toBe('Processing your request...');
  });

  it('should support optional type property', () => {
    const data = new SseMessageData();
    data.id = 'test-id';
    data.content = 'test content';
    // type is optional

    expect(data.type).toBeUndefined();
    expect(data.id).toBeDefined();
    expect(data.content).toBeDefined();
  });

  it('should support valid type enum values', () => {
    const validTypes: Array<'ai' | 'tool'> = ['ai', 'tool'];

    validTypes.forEach((type) => {
      const data = new SseMessageData();
      data.type = type;
      expect(data.type).toBe(type);
    });
  });
});

describe('SseMessage', () => {
  it('should create instance with complete data', () => {
    const messageData = new SseMessageData();
    messageData.id = 'sse-789';
    messageData.type = 'ai';
    messageData.content = 'AI response content';

    const message = new SseMessage();
    message.data = messageData;
    message.type = 'message';

    expect(message.data).toBe(messageData);
    expect(message.type).toBe('message');
    expect(message.data.id).toBe('sse-789');
    expect(message.data.type).toBe('ai');
    expect(message.data.content).toBe('AI response content');
  });

  it('should support all valid message types', () => {
    const types: Array<'message' | 'done' | 'error'> = ['message', 'done', 'error'];

    types.forEach((type) => {
      const messageData = new SseMessageData();
      messageData.id = `sse-${type}`;
      messageData.content = `${type} content`;

      const message = new SseMessage();
      message.data = messageData;
      message.type = type;

      expect(message.type).toBe(type);
      expect(message.data.content).toBe(`${type} content`);
    });
  });

  it('should handle message with data without type', () => {
    const messageData = new SseMessageData();
    messageData.id = 'sse-no-type';
    messageData.content = 'Content without data type';

    const message = new SseMessage();
    message.data = messageData;
    message.type = 'message';

    expect(message.data.type).toBeUndefined();
    expect(message.data.content).toBe('Content without data type');
    expect(message.type).toBe('message');
  });

  it('should have proper property structure', () => {
    const message = new SseMessage();
    const data = new SseMessageData();
    data.id = 'test-id';
    data.content = 'test content';

    message.data = data;
    message.type = 'message';

    expect(message.data).toBe(data);
    expect(message.type).toBe('message');
  });

  it('should support all valid message types', () => {
    const validTypes: Array<'message' | 'done' | 'error'> = ['message', 'done', 'error'];

    validTypes.forEach((type) => {
      const message = new SseMessage();
      message.type = type;
      expect(message.type).toBe(type);
    });
  });
});

describe('SseErrorMessage', () => {
  it('should create instance with error data', () => {
    const errorMessage = new SseErrorMessage();
    errorMessage.type = 'error';
    errorMessage.data = { message: 'Failed to process request' };

    expect(errorMessage.type).toBe('error');
    expect(errorMessage.data.message).toBe('Failed to process request');
  });

  it('should handle different error messages', () => {
    const errorMessages = ['Connection timeout', 'Invalid request format', 'Service unavailable', 'Authentication failed'];

    errorMessages.forEach((errorMsg) => {
      const errorMessage = new SseErrorMessage();
      errorMessage.type = 'error';
      errorMessage.data = { message: errorMsg };

      expect(errorMessage.data.message).toBe(errorMsg);
      expect(errorMessage.type).toBe('error');
    });
  });

  it('should have proper property structure for errors', () => {
    const errorMessage = new SseErrorMessage();
    errorMessage.type = 'error';
    errorMessage.data = { message: 'Test error message' };

    expect(errorMessage.type).toBe('error');
    expect(errorMessage.data.message).toBe('Test error message');
  });

  it('should enforce error type constraint', () => {
    const errorMessage = new SseErrorMessage();
    errorMessage.type = 'error'; // Should only accept 'error'

    expect(errorMessage.type).toBe('error');
  });
});

describe('SseMessageUnion Type', () => {
  it('should accept SseMessage instances', () => {
    const messageData = new SseMessageData();
    messageData.id = 'sse-union-1';
    messageData.content = 'Union test content';

    const message = new SseMessage();
    message.data = messageData;
    message.type = 'message';

    const unionMessage: SseMessageUnion = message;

    expect(unionMessage).toBe(message);
    expect('data' in unionMessage).toBe(true);
    expect(unionMessage.type).toBe('message');
  });

  it('should accept SseErrorMessage instances', () => {
    const errorMessage = new SseErrorMessage();
    errorMessage.type = 'error';
    errorMessage.data = { message: 'Union error test' };

    const unionMessage: SseMessageUnion = errorMessage;

    expect(unionMessage).toBe(errorMessage);
    expect(unionMessage.type).toBe('error');
    expect('data' in unionMessage).toBe(true);
  });

  it('should differentiate between message types at runtime', () => {
    const regularMessage: SseMessageUnion = new SseMessage();
    regularMessage.type = 'message';
    regularMessage.data = new SseMessageData();

    const errorMessage: SseMessageUnion = new SseErrorMessage();
    errorMessage.type = 'error';
    errorMessage.data = { message: 'Error occurred' };

    // Type guards
    expect(regularMessage.type).toBe('message');
    expect(errorMessage.type).toBe('error');

    if (regularMessage.type === 'message') {
      expect(regularMessage.data).toBeInstanceOf(SseMessageData);
    }

    if (errorMessage.type === 'error') {
      expect(typeof errorMessage.data).toBe('object');
      expect('message' in errorMessage.data).toBe(true);
    }
  });

  it('should handle type checking for all valid message types', () => {
    const messageTypes: Array<'message' | 'done' | 'error'> = ['message', 'done', 'error'];

    messageTypes.forEach((msgType) => {
      if (msgType === 'error') {
        const errorMessage: SseMessageUnion = new SseErrorMessage();
        errorMessage.type = 'error';
        errorMessage.data = { message: `${msgType} message` };

        expect(errorMessage.type).toBe(msgType);
      } else {
        const regularMessage: SseMessageUnion = new SseMessage();
        regularMessage.type = msgType;
        regularMessage.data = new SseMessageData();
        regularMessage.data.id = `sse-${msgType}`;
        regularMessage.data.content = `${msgType} content`;

        expect(regularMessage.type).toBe(msgType);
      }
    });
  });
});
