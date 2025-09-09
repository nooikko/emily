import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonalityProfileController } from './controllers/personality-profile.controller';
import { PersonalityProfile } from './entities/personality-profile.entity';
import { UserPersonalityPreference } from './entities/user-personality-preference.entity';
import { PersonalityProfileService } from './services/personality-profile.service';
import { PersonalityTemplateService } from './services/personality-template.service';
import { PersonalityInjectionService } from './services/personality-injection.service';
import { PersonalitySeedService } from './services/personality-seed.service';
import { PersonalityContextAnalyzerService } from './services/personality-context-analyzer.service';
import { PersonalityCompatibilityScorerService } from './services/personality-compatibility-scorer.service';
import { PersonalitySwitchingOrchestratorService } from './services/personality-switching-orchestrator.service';
import { PersonalityTransitionSmootherService } from './services/personality-transition-smoother.service';
import { PersonalityStateTrackerService } from './services/personality-state-tracker.service';
import { ContextAwarePersonalitySwitchingService } from './services/context-aware-personality-switching.service';
import { UserPreferenceLearningService } from './services/user-preference-learning.service';
import { PreferenceRecommendationEngine } from './services/preference-recommendation.engine';
import { PersonalityHubIntegrationService } from './services/personality-hub-integration.service';
import { UserPreferencePersistenceService } from './services/user-preference-persistence.service';
import { ConversationThread } from '../threads/entities/conversation-thread.entity';

/**
 * Personality Profile Module
 * 
 * Provides comprehensive personality management for AI interactions with
 * advanced context-aware switching capabilities and intelligent user preference learning.
 * Integrates with LangChain for dynamic prompt template management and supports 
 * multiple AI personas with different traits and behaviors.
 * 
 * Features:
 * - Multi-personality support with trait-based configuration
 * - LangChain prompt template integration
 * - Dynamic personality injection with ConditionalPromptSelector
 * - Context-aware personality switching system
 * - Advanced user preference learning system
 * - AI-powered personality recommendations
 * - LangChain Hub integration for template sharing
 * - Conversation state tracking and analysis
 * - Personality compatibility scoring
 * - Smooth personality transitions
 * - Performance monitoring and analytics
 * - Few-shot learning examples
 * - Usage analytics and recommendations
 * - Comprehensive preference persistence and backup
 * - REST API with comprehensive Swagger documentation
 * 
 * This module enables users to:
 * - Create custom AI personalities (coding assistant, creative writer, etc.)
 * - Automatically switch between personalities based on conversation context
 * - Provide feedback on personality interactions for continuous learning
 * - Get AI-powered recommendations for optimal personality selection
 * - Share and discover personality templates via LangChain Hub
 * - Track conversation flow and personality consistency
 * - Monitor personality performance and effectiveness
 * - Build personalized user preference profiles over time
 * - Backup and restore preference learning data
 * - Smooth transitions between different personality modes
 * - Import/export personality configurations
 * 
 * Architecture:
 * - Entities: PersonalityProfile, UserPersonalityPreference (TypeORM with validation)
 * - Core Services: PersonalityProfileService, PersonalityTemplateService
 * - Context-Aware Services: Context analyzer, compatibility scorer, orchestrator
 * - Transition Services: Transition smoother, state tracker
 * - Preference Learning Services: UserPreferenceLearningService, PreferenceRecommendationEngine
 * - Hub Integration: PersonalityHubIntegrationService
 * - Persistence Services: UserPreferencePersistenceService
 * - Main Service: ContextAwarePersonalitySwitchingService
 * - Controller: PersonalityProfileController (REST API)
 * - DTOs: Comprehensive validation with class-validator
 * - Integration: LangChain PromptTemplate, FewShotPromptTemplate, and Hub
 */
@Module({
  imports: [
    // Register entities with TypeORM
    TypeOrmModule.forFeature([PersonalityProfile, UserPersonalityPreference, ConversationThread]),
  ],
  controllers: [
    // REST API controller with Swagger documentation
    PersonalityProfileController,
  ],
  providers: [
    // Core business logic services
    PersonalityProfileService,
    PersonalityTemplateService,
    PersonalityInjectionService,
    PersonalitySeedService,
    
    // Context-aware switching system services
    PersonalityContextAnalyzerService,
    PersonalityCompatibilityScorerService,
    PersonalitySwitchingOrchestratorService,
    PersonalityTransitionSmootherService,
    PersonalityStateTrackerService,
    
    // Main orchestrating service for context-aware switching
    ContextAwarePersonalitySwitchingService,
    
    // User preference learning system services
    UserPreferenceLearningService,
    PreferenceRecommendationEngine,
    PersonalityHubIntegrationService,
    UserPreferencePersistenceService,
  ],
  exports: [
    // Export core services for use in other modules
    PersonalityProfileService,
    PersonalityTemplateService,
    PersonalityInjectionService,
    
    // Export context-aware switching services
    PersonalityContextAnalyzerService,
    PersonalityCompatibilityScorerService,
    PersonalitySwitchingOrchestratorService,
    PersonalityTransitionSmootherService,
    PersonalityStateTrackerService,
    
    // Export main service
    ContextAwarePersonalitySwitchingService,
    
    // Export preference learning services
    UserPreferenceLearningService,
    PreferenceRecommendationEngine,
    PersonalityHubIntegrationService,
    UserPreferencePersistenceService,
  ],
})
export class PersonalityProfileModule {
  /**
   * Module initialization
   * 
   * This module can be imported into other modules that need personality
   * functionality, such as:
   * - AgentModule (for personality-aware AI conversations)
   * - ChatModule (for context-aware personality switching)
   * - ThreadsModule (for conversation state integration)
   * - ConfigModule (for personality-based configuration)
   * 
   * The module provides:
   * 1. Core personality management (CRUD operations)
   * 2. LangChain template integration
   * 3. Context-aware automatic switching
   * 4. Performance monitoring and analytics
   * 5. Smooth transition handling
   * 6. State tracking across conversations
   */
}