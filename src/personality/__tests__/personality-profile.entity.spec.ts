import { PersonalityProfile } from '../entities/personality-profile.entity';

describe('PersonalityProfile Entity', () => {
  let personalityProfile: PersonalityProfile;

  beforeEach(() => {
    personalityProfile = new PersonalityProfile();
    personalityProfile.id = 'test-id-123';
    personalityProfile.name = 'Test Personality';
    personalityProfile.description = 'A test personality for unit testing';
    personalityProfile.category = 'assistant';
    personalityProfile.tags = ['test', 'assistant'];
    personalityProfile.isActive = false;
    personalityProfile.isSystemPersonality = false;
    personalityProfile.metadata = {};
    personalityProfile.version = 1;
    personalityProfile.traits = [
      {
        name: 'tone',
        value: 'professional',
        weight: 0.8,
        description: 'Professional communication style',
      },
      {
        name: 'expertise_level',
        value: 'expert',
        weight: 0.9,
      },
    ];
    personalityProfile.promptTemplates = [
      {
        type: 'system',
        template: 'You are a {tone} assistant with {expertise_level} knowledge.',
        inputVariables: ['tone', 'expertise_level'],
        priority: 1,
      },
      {
        type: 'user',
        template: 'Please respond in a {tone} manner.',
        inputVariables: ['tone'],
        priority: 2,
      },
    ];
    personalityProfile.examples = [
      {
        input: 'Hello',
        output: 'Hello! How can I assist you professionally today?',
        metadata: { includeInFewShot: true },
      },
    ];
  });

  describe('getSystemPromptTemplate', () => {
    it('should return system template with highest priority', () => {
      const result = personalityProfile.getSystemPromptTemplate();

      expect(result).toBeDefined();
      expect(result?.type).toBe('system');
      expect(result?.priority).toBe(1);
    });

    it('should return undefined when no system template exists', () => {
      personalityProfile.promptTemplates = [
        {
          type: 'user',
          template: 'User template',
          inputVariables: [],
          priority: 1,
        },
      ];

      const result = personalityProfile.getSystemPromptTemplate();

      expect(result).toBeUndefined();
    });
  });

  describe('getFewShotExamples', () => {
    it('should return examples that should be included in few-shot', () => {
      const result = personalityProfile.getFewShotExamples();

      expect(result).toHaveLength(1);
      expect(result[0].input).toBe('Hello');
      expect(result[0].output).toBe('Hello! How can I assist you professionally today?');
    });

    it('should exclude examples marked as not for few-shot', () => {
      personalityProfile.examples.push({
        input: 'Exclude this',
        output: 'This should not be included',
        metadata: { includeInFewShot: false },
      });

      const result = personalityProfile.getFewShotExamples();

      expect(result).toHaveLength(1);
      expect(result[0].input).toBe('Hello');
    });

    it('should return empty array when no examples exist', () => {
      personalityProfile.examples = [];

      const result = personalityProfile.getFewShotExamples();

      expect(result).toHaveLength(0);
    });
  });

  describe('getTraitValue', () => {
    it('should return trait value when trait exists', () => {
      const result = personalityProfile.getTraitValue('tone');

      expect(result).toBe('professional');
    });

    it('should return undefined when trait does not exist', () => {
      const result = personalityProfile.getTraitValue('non_existent');

      expect(result).toBeUndefined();
    });

    it('should return default value when trait does not exist and default provided', () => {
      const result = personalityProfile.getTraitValue('non_existent', 'default');

      expect(result).toBe('default');
    });
  });

  describe('getTraitWeight', () => {
    it('should return trait weight when trait exists', () => {
      const result = personalityProfile.getTraitWeight('tone');

      expect(result).toBe(0.8);
    });

    it('should return 0 when trait does not exist', () => {
      const result = personalityProfile.getTraitWeight('non_existent');

      expect(result).toBe(0);
    });
  });

  describe('meetsConditions', () => {
    it('should return true when all tag conditions are met', () => {
      const conditions = { tags: ['test'] };

      const result = personalityProfile.meetsConditions(conditions);

      expect(result).toBe(true);
    });

    it('should return false when tag conditions are not met', () => {
      const conditions = { tags: ['nonexistent'] };

      const result = personalityProfile.meetsConditions(conditions);

      expect(result).toBe(false);
    });

    it('should return true when category condition is met', () => {
      const conditions = { category: 'assistant' };

      const result = personalityProfile.meetsConditions(conditions);

      expect(result).toBe(true);
    });

    it('should return false when category condition is not met', () => {
      const conditions = { category: 'creative' };

      const result = personalityProfile.meetsConditions(conditions);

      expect(result).toBe(false);
    });

    it('should return true when trait conditions are met', () => {
      const conditions = { traits: { tone: 'professional' } };

      const result = personalityProfile.meetsConditions(conditions);

      expect(result).toBe(true);
    });

    it('should return false when trait conditions are not met', () => {
      const conditions = { traits: { tone: 'casual' } };

      const result = personalityProfile.meetsConditions(conditions);

      expect(result).toBe(false);
    });
  });

  describe('validate', () => {
    it('should return no errors for valid personality', () => {
      const errors = personalityProfile.validate();

      expect(errors).toHaveLength(0);
    });

    it('should return error when name is missing', () => {
      personalityProfile.name = '';

      const errors = personalityProfile.validate();

      expect(errors).toContain('Name is required');
    });

    it('should return error when description is missing', () => {
      personalityProfile.description = '';

      const errors = personalityProfile.validate();

      expect(errors).toContain('Description is required');
    });

    it('should return error when category is missing', () => {
      personalityProfile.category = '';

      const errors = personalityProfile.validate();

      expect(errors).toContain('Category is required');
    });

    it('should return error when traits array is empty', () => {
      personalityProfile.traits = [];

      const errors = personalityProfile.validate();

      expect(errors).toContain('At least one personality trait is required');
    });

    it('should return error when trait has missing name', () => {
      personalityProfile.traits = [
        {
          name: '',
          value: 'professional',
          weight: 0.8,
        },
      ];

      const errors = personalityProfile.validate();

      expect(errors).toContain('Trait 0: name is required');
    });

    it('should return error when trait has invalid weight', () => {
      personalityProfile.traits = [
        {
          name: 'tone',
          value: 'professional',
          weight: 1.5,
        },
      ];

      const errors = personalityProfile.validate();

      expect(errors).toContain('Trait 0: weight must be between 0 and 1');
    });

    it('should return error when prompt templates array is empty', () => {
      personalityProfile.promptTemplates = [];

      const errors = personalityProfile.validate();

      expect(errors).toContain('At least one prompt template is required');
    });

    it('should return error when no system template exists', () => {
      personalityProfile.promptTemplates = [
        {
          type: 'user',
          template: 'User template',
          inputVariables: [],
          priority: 1,
        },
      ];

      const errors = personalityProfile.validate();

      expect(errors).toContain('At least one system prompt template is required');
    });

    it('should return error when template has missing content', () => {
      personalityProfile.promptTemplates = [
        {
          type: 'system',
          template: '',
          inputVariables: [],
          priority: 1,
        },
      ];

      const errors = personalityProfile.validate();

      expect(errors).toContain('Template 0: template content is required');
    });

    it('should return error when template has invalid input variables', () => {
      personalityProfile.promptTemplates = [
        {
          type: 'system',
          template: 'Valid template',
          inputVariables: 'invalid' as unknown as string[],
          priority: 1,
        },
      ];

      const errors = personalityProfile.validate();

      expect(errors).toContain('Template 0: inputVariables must be an array');
    });
  });
});
