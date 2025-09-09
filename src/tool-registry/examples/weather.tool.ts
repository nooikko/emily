import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ToolHandler, tool } from '../decorators/tool.decorator';
import type { ToolExecutionContext } from '../interfaces/tool-registry.interface';
import { BaseStructuredTool } from '../utils/structured-tool.builder';

/**
 * Weather tool schema with comprehensive validation
 */
const WeatherSchema = z.object({
  location: z.string().min(1).describe('Location to get weather for'),
  units: z.enum(['celsius', 'fahrenheit', 'kelvin']).default('celsius').describe('Temperature units'),
  includeDetails: z.boolean().default(false).describe('Include detailed weather information'),
  forecastDays: z.number().int().min(1).max(7).optional().describe('Number of forecast days'),
});

type WeatherInput = z.infer<typeof WeatherSchema>;

interface WeatherResult {
  location: string;
  temperature: number;
  units: string;
  conditions: string;
  humidity?: number;
  windSpeed?: number;
  forecast?: Array<{
    day: string;
    temperature: number;
    conditions: string;
  }>;
}

/**
 * Example weather tool using BaseStructuredTool
 */
@Injectable()
@tool({
  name: 'weather_tool',
  description: 'Get current weather and forecast for a location',
  version: '1.0.0',
  category: 'weather',
  tags: ['weather', 'forecast', 'temperature'],
  schema: WeatherSchema,
})
export class WeatherTool extends BaseStructuredTool<WeatherInput, WeatherResult> {
  get name(): string {
    return 'weather_tool';
  }

  get description(): string {
    return 'Get current weather and optional forecast for any location with temperature in various units';
  }

  get schema() {
    return WeatherSchema;
  }

  constructor() {
    super();

    // Add custom validators
    this.addValidator(async (input) => {
      // Validate location format
      if (!/^[a-zA-Z\s,]+$/.test(input.location)) {
        this.logger.warn(`Invalid location format: ${input.location}`);
        return false;
      }
      return true;
    });

    // Add middleware for logging
    this.addMiddleware(async (input, next) => {
      this.logger.debug(`Getting weather for ${input.location}`);
      const result = await next();
      this.logger.debug(`Weather retrieved: ${result.temperature}°${result.units}`);
      return result;
    });

    // Set metadata
    this.setMetadata({
      author: 'Weather Service',
      rateLimit: {
        maxRequests: 60,
        windowMs: 60000,
      },
    });
  }

  protected async beforeExecute(input: WeatherInput, _context?: ToolExecutionContext): Promise<void> {
    this.logger.verbose(`Weather request for ${input.location} at ${new Date().toISOString()}`);
    // Could add caching logic here
  }

  @ToolHandler()
  protected async execute(input: WeatherInput, _context?: ToolExecutionContext): Promise<WeatherResult> {
    // This is mock implementation - in real scenario, call weather API
    const mockTemperatures: Record<string, number> = {
      'New York': 22,
      London: 15,
      Tokyo: 28,
      Sydney: 25,
      Paris: 18,
    };

    const baseTemp = mockTemperatures[input.location] || 20;

    // Convert temperature based on units
    let temperature = baseTemp;
    if (input.units === 'fahrenheit') {
      temperature = (baseTemp * 9) / 5 + 32;
    } else if (input.units === 'kelvin') {
      temperature = baseTemp + 273.15;
    }

    const result: WeatherResult = {
      location: input.location,
      temperature: Math.round(temperature * 10) / 10,
      units: input.units === 'celsius' ? 'C' : input.units === 'fahrenheit' ? 'F' : 'K',
      conditions: 'Partly Cloudy',
    };

    if (input.includeDetails) {
      result.humidity = 65;
      result.windSpeed = 12;
    }

    if (input.forecastDays) {
      result.forecast = [];
      for (let i = 1; i <= input.forecastDays; i++) {
        const forecastTemp = baseTemp + (Math.random() * 10 - 5);
        result.forecast.push({
          day: `Day ${i}`,
          temperature: Math.round(forecastTemp * 10) / 10,
          conditions: ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy'][Math.floor(Math.random() * 4)],
        });
      }
    }

    return result;
  }

  protected async afterExecute(_result: WeatherResult, context?: ToolExecutionContext): Promise<void> {
    // Could add metrics tracking here
    const executionTime = context?.endTime && context.startTime ? context.endTime - context.startTime : 0;

    this.logger.verbose(`Weather query completed in ${executionTime}ms`);
  }

  protected async onError(error: Error, context?: ToolExecutionContext): Promise<void> {
    this.logger.error(`Weather tool error for execution ${context?.executionId}:`, error);
    // Could add error reporting/alerting here
  }
}
