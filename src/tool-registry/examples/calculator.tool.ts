import { z } from 'zod';
import { tool, ToolHandler, ToolVersion } from '../decorators/tool.decorator';

const CalculatorInputSchema = z.object({
  operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('Mathematical operation to perform'),
  a: z.number().describe('First number'),
  b: z.number().describe('Second number'),
});

/**
 * Example tool demonstrating the @tool decorator usage
 */
@tool({
  name: 'calculator',
  description: 'Performs basic mathematical operations',
  version: '1.0.0',
  category: 'math',
  tags: ['calculation', 'math', 'arithmetic'],
  author: 'Tool Registry System',
  schema: CalculatorInputSchema,
  rateLimit: {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
  },
})
@ToolVersion('1.0.0')
export class CalculatorTool {
  @ToolHandler()
  async execute(input: z.infer<typeof CalculatorInputSchema>) {
    const { operation, a, b } = input;
    
    switch (operation) {
      case 'add':
        return { result: a + b, operation: `${a} + ${b}` };
      case 'subtract':
        return { result: a - b, operation: `${a} - ${b}` };
      case 'multiply':
        return { result: a * b, operation: `${a} × ${b}` };
      case 'divide':
        if (b === 0) {
          throw new Error('Division by zero is not allowed');
        }
        return { result: a / b, operation: `${a} ÷ ${b}` };
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }
}

/**
 * Alternative: Method-level tool decorator
 */
export class MathTools {
  @tool({
    name: 'square_root',
    description: 'Calculate the square root of a number',
    version: '1.0.0',
    category: 'math',
    tags: ['math', 'root'],
    schema: z.object({
      number: z.number().min(0).describe('Number to calculate square root of'),
    }),
  })
  async calculateSquareRoot(input: { number: number }) {
    return {
      result: Math.sqrt(input.number),
      operation: `√${input.number}`,
    };
  }
  
  @tool({
    name: 'power',
    description: 'Calculate a number raised to a power',
    version: '1.0.0',
    category: 'math',
    tags: ['math', 'exponent'],
    schema: z.object({
      base: z.number().describe('Base number'),
      exponent: z.number().describe('Exponent'),
    }),
  })
  async calculatePower(input: { base: number; exponent: number }) {
    return {
      result: Math.pow(input.base, input.exponent),
      operation: `${input.base}^${input.exponent}`,
    };
  }
}