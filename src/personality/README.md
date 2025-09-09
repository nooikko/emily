# Personality Profile Management System

A comprehensive LangChain-integrated personality management system for single-user NestJS applications. This system enables users to create, manage, and switch between different AI personalities with configurable traits and behaviors.

## Features

### Core Functionality
- ✅ **Multiple AI Personalities**: Create and manage different AI personas (coding assistant, creative writer, research analyst, etc.)
- ✅ **LangChain Integration**: Full integration with LangChain's PromptTemplate and FewShotPromptTemplate
- ✅ **Dynamic Personality Switching**: Switch between personalities based on context or user preference
- ✅ **Trait-based Configuration**: Define personality traits with weights and descriptions
- ✅ **Template Management**: Compile and cache LangChain templates for optimal performance
- ✅ **Few-shot Learning**: Support for personality examples and demonstrations
- ✅ **Usage Analytics**: Track personality usage patterns and effectiveness
- ✅ **Recommendation Engine**: AI-powered personality recommendations based on context
- ✅ **Validation System**: Comprehensive validation for personality configurations

### System Architecture
- **Entity**: PersonalityProfile (TypeORM entity with built-in validation)
- **Services**: PersonalityProfileService, PersonalityTemplateService, PersonalitySeedService
- **Controller**: PersonalityProfileController (REST API with Swagger documentation)
- **DTOs**: Comprehensive validation with class-validator
- **Integration**: LangChain PromptTemplate and FewShotPromptTemplate

## File Structure

```
src/personality/
├── entities/
│   └── personality-profile.entity.ts       # TypeORM entity with validation methods
├── dto/
│   ├── create-personality-profile.dto.ts   # Creation DTOs with validation
│   ├── update-personality-profile.dto.ts   # Update DTOs
│   └── personality-response.dto.ts         # Response DTOs for API
├── services/
│   ├── personality-profile.service.ts      # CRUD operations and business logic
│   ├── personality-template.service.ts     # LangChain template compilation
│   └── personality-seed.service.ts         # Default personalities seeding
├── controllers/
│   └── personality-profile.controller.ts   # REST API endpoints
├── interfaces/
│   └── personality.interface.ts            # TypeScript interfaces
├── __tests__/
│   ├── personality-profile.entity.spec.ts  # Entity unit tests
│   └── create-personality-profile.dto.spec.ts # DTO validation tests
├── personality-profile.module.ts           # NestJS module configuration
└── README.md                               # This documentation
```

## API Endpoints

### Core CRUD Operations
- `POST /api/personality-profiles` - Create new personality
- `GET /api/personality-profiles` - List all personalities (with filtering)
- `GET /api/personality-profiles/:id` - Get specific personality
- `PATCH /api/personality-profiles/:id` - Update personality
- `DELETE /api/personality-profiles/:id` - Delete personality

### Advanced Features
- `GET /api/personality-profiles/current` - Get active personality
- `POST /api/personality-profiles/switch` - Switch personality
- `GET /api/personality-profiles/recommendations` - Get personality recommendations
- `GET /api/personality-profiles/:id/validate` - Validate personality configuration
- `GET /api/personality-profiles/:id/usage-stats` - Get usage statistics
- `POST /api/personality-profiles/bulk-import` - Import multiple personalities
- `GET /api/personality-profiles/export/all` - Export all personalities

## Usage Examples

### Creating a Coding Assistant Personality

```typescript
const codingAssistant = {
  name: 'Professional Coding Assistant',
  description: 'Expert-level coding assistance with professional communication',
  category: 'technical',
  tags: ['coding', 'professional', 'architecture'],
  traits: [
    {
      name: 'tone',
      value: 'professional',
      weight: 0.8,
      description: 'Maintains professional communication style'
    },
    {
      name: 'expertise_level',
      value: 'expert',
      weight: 0.9,
      description: 'Provides expert-level technical knowledge'
    },
    {
      name: 'verbosity',
      value: 'detailed',
      weight: 0.7,
      description: 'Provides comprehensive explanations'
    }
  ],
  promptTemplates: [
    {
      type: 'system',
      template: 'You are a {expertise_level} software development assistant. Your communication is {tone} and {verbosity}. Provide clean, maintainable code solutions with best practices.',
      inputVariables: ['expertise_level', 'tone', 'verbosity'],
      priority: 1
    }
  ],
  examples: [
    {
      input: 'How do I implement error handling in Express?',
      output: 'I\'ll help you implement robust error handling in Express...',
      metadata: { includeInFewShot: true, difficulty: 'intermediate' }
    }
  ]
};
```

### Switching Personalities

```typescript
// Switch to coding assistant for technical discussions
const response = await personalityService.switchPersonality('coding-assistant-id', {
  conversationContext: 'User asking about REST API implementation',
  userPreferences: { responseLength: 'detailed', includeExamples: true }
});

// The compiled template is ready for immediate use
const systemPrompt = await response.systemTemplate.format({
  expertise_level: 'expert',
  tone: 'professional',
  verbosity: 'detailed'
});
```

### Getting Personality Recommendations

```typescript
const recommendations = await personalityService.recommendPersonalities(
  'I need help with creative writing and storytelling',
  3
);
// Returns: [{ personalityId: 'creative-writer-id', confidence: 0.92, reason: '...' }]
```

## Default Personalities

The system comes with 5 pre-configured personalities:

1. **Professional Coding Assistant** - Expert technical guidance with professional tone
2. **Creative Writing Mentor** - Inspiring support for creative expression and storytelling
3. **Research Analyst** - Data-driven insights with objective analysis
4. **Learning Companion** - Patient, adaptive educational support
5. **Casual Chat Buddy** - Friendly, conversational companion for informal discussions

## LangChain Integration

### Template Compilation
- **System Templates**: Core personality prompts with trait injection
- **Few-Shot Templates**: Example-based learning for personality consistency
- **User/Assistant Templates**: Conversation flow optimization
- **Template Caching**: 30-minute cache with LRU eviction for performance

### Validation System
- **Template Syntax**: Variable placeholder validation
- **Variable Consistency**: Ensures declared variables are used
- **Complexity Analysis**: Performance impact assessment
- **Configuration Completeness**: Required fields and structure validation

## Configuration

### Personality Traits
Define behavioral aspects with weighted importance:

```typescript
{
  name: 'tone',              // Trait identifier
  value: 'professional',     // Specific value
  weight: 0.8,              // Importance (0.0-1.0)
  description: 'Professional communication style'
}
```

### Prompt Templates
LangChain-compatible templates with variable injection:

```typescript
{
  type: 'system',           // Template type
  template: 'You are a {tone} assistant...',
  inputVariables: ['tone'], // Required variables
  priority: 1,              // Application order
  conditions: { context: 'coding' } // Optional conditions
}
```

## Testing

The module includes comprehensive tests:
- **Entity Tests**: Validation and method functionality
- **DTO Tests**: Input validation with class-validator
- **Integration Tests**: Full personality lifecycle testing

Run tests:
```bash
npm test src/personality
```

## Performance Features

- **Template Caching**: Compiled templates cached for 30 minutes
- **Lazy Loading**: Templates compiled on-demand
- **Background Seeding**: Default personalities loaded asynchronously
- **Optimized Queries**: Efficient database operations with TypeORM
- **Memory Management**: LRU cache eviction for template storage

## Security & Validation

- **Input Sanitization**: All inputs validated with class-validator
- **Template Safety**: Variable placeholder validation prevents injection
- **System Personality Protection**: System personalities cannot be deleted
- **Error Boundaries**: Graceful handling of template compilation errors
- **Type Safety**: Full TypeScript support with interfaces

## Integration Points

### With Agent Module
The personality system integrates with the agent module to provide context-aware AI behavior:

```typescript
// In your agent service
const currentPersonality = await this.personalityService.getCurrentPersonality();
if (currentPersonality) {
  const prompt = await currentPersonality.systemTemplate.format(contextVariables);
  // Use prompt in your LangChain chains
}
```

### With Configuration Module
Personalities can be managed through the unified configuration system for environment-specific setups.

## Extensibility

The system is designed for easy extension:
- **Custom Trait Types**: Add new personality trait definitions
- **Template Types**: Extend beyond system/user/assistant templates  
- **Recommendation Algorithms**: Implement custom recommendation logic
- **Export/Import Formats**: Support additional configuration formats
- **Analytics**: Enhanced usage tracking and performance metrics

This personality system provides a robust foundation for creating sophisticated, context-aware AI interactions while maintaining the flexibility to adapt to specific use cases.