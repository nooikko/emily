import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePersonalityProfileDto, CreatePersonalityPromptTemplateDto, CreatePersonalityTraitDto } from '../dto/create-personality-profile.dto';

describe('CreatePersonalityProfileDto', () => {
  describe('validation', () => {
    it('should validate a complete, valid personality profile', async () => {
      const dto = plainToInstance(CreatePersonalityProfileDto, {
        name: 'Test Personality',
        description: 'A comprehensive test personality for validation testing',
        traits: [
          {
            name: 'tone',
            value: 'professional',
            weight: 0.8,
            description: 'Professional communication style',
          },
        ],
        promptTemplates: [
          {
            type: 'system',
            template: 'You are a {tone} assistant.',
            inputVariables: ['tone'],
            priority: 1,
          },
        ],
        category: 'assistant',
        tags: ['test', 'professional'],
        isActive: false,
        metadata: { version: '1.0' },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when name is too short', async () => {
      const dto = plainToInstance(CreatePersonalityProfileDto, {
        name: 'A',
        description: 'A comprehensive test personality for validation testing',
        traits: [
          {
            name: 'tone',
            value: 'professional',
            weight: 0.8,
          },
        ],
        promptTemplates: [
          {
            type: 'system',
            template: 'You are a {tone} assistant.',
            inputVariables: ['tone'],
            priority: 1,
          },
        ],
        category: 'assistant',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('name');
      expect(errors[0].constraints?.minLength).toBeDefined();
    });

    it('should fail validation when description is too short', async () => {
      const dto = plainToInstance(CreatePersonalityProfileDto, {
        name: 'Test Personality',
        description: 'Too short',
        traits: [
          {
            name: 'tone',
            value: 'professional',
            weight: 0.8,
          },
        ],
        promptTemplates: [
          {
            type: 'system',
            template: 'You are a {tone} assistant.',
            inputVariables: ['tone'],
            priority: 1,
          },
        ],
        category: 'assistant',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('description');
      expect(errors[0].constraints?.minLength).toBeDefined();
    });

    it('should fail validation when traits array is empty', async () => {
      const dto = plainToInstance(CreatePersonalityProfileDto, {
        name: 'Test Personality',
        description: 'A comprehensive test personality for validation testing',
        traits: [],
        promptTemplates: [
          {
            type: 'system',
            template: 'You are a {tone} assistant.',
            inputVariables: ['tone'],
            priority: 1,
          },
        ],
        category: 'assistant',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('traits');
      expect(errors[0].constraints?.arrayMinSize).toBeDefined();
    });

    it('should fail validation when promptTemplates array is empty', async () => {
      const dto = plainToInstance(CreatePersonalityProfileDto, {
        name: 'Test Personality',
        description: 'A comprehensive test personality for validation testing',
        traits: [
          {
            name: 'tone',
            value: 'professional',
            weight: 0.8,
          },
        ],
        promptTemplates: [],
        category: 'assistant',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('promptTemplates');
      expect(errors[0].constraints?.arrayMinSize).toBeDefined();
    });

    it('should fail validation for invalid category', async () => {
      const dto = plainToInstance(CreatePersonalityProfileDto, {
        name: 'Test Personality',
        description: 'A comprehensive test personality for validation testing',
        traits: [
          {
            name: 'tone',
            value: 'professional',
            weight: 0.8,
          },
        ],
        promptTemplates: [
          {
            type: 'system',
            template: 'You are a {tone} assistant.',
            inputVariables: ['tone'],
            priority: 1,
          },
        ],
        category: 'invalid_category',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('category');
      expect(errors[0].constraints?.isEnum).toBeDefined();
    });
  });
});

describe('CreatePersonalityTraitDto', () => {
  it('should validate a valid trait', async () => {
    const dto = plainToInstance(CreatePersonalityTraitDto, {
      name: 'tone',
      value: 'professional',
      weight: 0.8,
      description: 'Professional communication style',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail validation when weight is out of range', async () => {
    const dto = plainToInstance(CreatePersonalityTraitDto, {
      name: 'tone',
      value: 'professional',
      weight: 1.5,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('weight');
    expect(errors[0].constraints?.max).toBeDefined();
  });

  it('should fail validation when name is empty', async () => {
    const dto = plainToInstance(CreatePersonalityTraitDto, {
      name: '',
      value: 'professional',
      weight: 0.8,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
    expect(errors[0].constraints?.isNotEmpty).toBeDefined();
  });
});

describe('CreatePersonalityPromptTemplateDto', () => {
  it('should validate a valid prompt template', async () => {
    const dto = plainToInstance(CreatePersonalityPromptTemplateDto, {
      type: 'system',
      template: 'You are a {tone} assistant with {expertise_level} knowledge.',
      inputVariables: ['tone', 'expertise_level'],
      priority: 1,
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail validation for invalid type', async () => {
    const dto = plainToInstance(CreatePersonalityPromptTemplateDto, {
      type: 'invalid_type',
      template: 'You are a {tone} assistant.',
      inputVariables: ['tone'],
      priority: 1,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('type');
    expect(errors[0].constraints?.isEnum).toBeDefined();
  });

  it('should fail validation when template is too short', async () => {
    const dto = plainToInstance(CreatePersonalityPromptTemplateDto, {
      type: 'system',
      template: 'Short',
      inputVariables: ['tone'],
      priority: 1,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('template');
    expect(errors[0].constraints?.minLength).toBeDefined();
  });

  it('should fail validation when inputVariables is not an array', async () => {
    const dto = plainToInstance(CreatePersonalityPromptTemplateDto, {
      type: 'system',
      template: 'You are a {tone} assistant.',
      inputVariables: 'not_an_array',
      priority: 1,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('inputVariables');
    expect(errors[0].constraints?.isArray).toBeDefined();
  });

  it('should fail validation when priority is negative', async () => {
    const dto = plainToInstance(CreatePersonalityPromptTemplateDto, {
      type: 'system',
      template: 'You are a {tone} assistant.',
      inputVariables: ['tone'],
      priority: -1,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('priority');
    expect(errors[0].constraints?.min).toBeDefined();
  });
});
