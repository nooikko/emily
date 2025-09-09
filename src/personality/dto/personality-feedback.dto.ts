import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { FeedbackType, InteractionContext } from '../entities/user-personality-preference.entity';

/**
 * DTO for feedback aspect scores
 */
export class FeedbackAspectsDto {
  @ApiPropertyOptional({
    description: 'How helpful was the personality in this interaction?',
    minimum: 1,
    maximum: 5,
    example: 4,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  helpfulness?: number;

  @ApiPropertyOptional({
    description: "How appropriate was the personality's tone?",
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  tone?: number;

  @ApiPropertyOptional({
    description: "How accurate were the personality's responses?",
    minimum: 1,
    maximum: 5,
    example: 4,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  accuracy?: number;

  @ApiPropertyOptional({
    description: "How clear were the personality's communications?",
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  clarity?: number;

  @ApiPropertyOptional({
    description: 'How engaging was the personality?',
    minimum: 1,
    maximum: 5,
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  engagement?: number;

  @ApiPropertyOptional({
    description: 'How well did the personality adapt to your needs?',
    minimum: 1,
    maximum: 5,
    example: 4,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  personalization?: number;
}

/**
 * DTO for submitting personality feedback
 */
export class SubmitPersonalityFeedbackDto {
  @ApiProperty({
    description: 'ID of the personality being rated',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  personalityId: string;

  @ApiProperty({
    description: 'Context where the interaction took place',
    enum: InteractionContext,
    example: InteractionContext.TECHNICAL,
  })
  @IsEnum(InteractionContext)
  @IsNotEmpty()
  interactionContext: InteractionContext;

  @ApiProperty({
    description: 'Type of feedback being provided',
    enum: FeedbackType,
    example: FeedbackType.RATING,
  })
  @IsEnum(FeedbackType)
  @IsNotEmpty()
  feedbackType: FeedbackType;

  @ApiPropertyOptional({
    description: 'Overall score for the personality (1-5)',
    minimum: 1,
    maximum: 5,
    example: 4,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  overallScore?: number;

  @ApiPropertyOptional({
    description: 'Detailed textual feedback',
    example: 'The personality was very helpful with coding questions but could be more concise.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({
    description: 'Detailed aspect-specific ratings',
    type: FeedbackAspectsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FeedbackAspectsDto)
  aspects?: FeedbackAspectsDto;

  @ApiPropertyOptional({
    description: 'Suggestions for improvement',
    example: ['Be more concise', 'Add more examples', 'Better error handling'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestions?: string[];

  @ApiPropertyOptional({
    description: 'Would you recommend this personality for similar contexts?',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  wouldRecommend?: boolean;

  @ApiPropertyOptional({
    description: 'Thread ID where the interaction occurred',
    example: '789e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  threadId?: string;

  @ApiPropertyOptional({
    description: 'Specific message ID that triggered the feedback',
    example: '456e7890-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  messageId?: string;
}

/**
 * DTO for behavioral feedback (implicit feedback from user interactions)
 */
export class BehavioralFeedbackDto {
  @ApiProperty({
    description: 'ID of the personality',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  personalityId: string;

  @ApiProperty({
    description: 'Interaction context',
    enum: InteractionContext,
    example: InteractionContext.GENERAL,
  })
  @IsEnum(InteractionContext)
  @IsNotEmpty()
  interactionContext: InteractionContext;

  @ApiProperty({
    description: 'Thread ID',
    example: '789e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  threadId: string;

  @ApiPropertyOptional({
    description: 'Average message length in characters',
    minimum: 0,
    example: 150,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  averageMessageLength?: number;

  @ApiPropertyOptional({
    description: 'Number of follow-up questions asked',
    minimum: 0,
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  followUpQuestions?: number;

  @ApiPropertyOptional({
    description: 'Conversation duration in minutes',
    minimum: 0,
    example: 25.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  conversationDuration?: number;

  @ApiPropertyOptional({
    description: 'Number of topic changes during conversation',
    minimum: 0,
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  topicChanges?: number;

  @ApiPropertyOptional({
    description: 'Detected satisfaction indicators (positive phrases, etc.)',
    minimum: 0,
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  satisfactionIndicators?: number;

  @ApiPropertyOptional({
    description: 'User complexity preference (1-5)',
    minimum: 1,
    maximum: 5,
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  complexityPreference?: number;

  @ApiPropertyOptional({
    description: 'Preferred communication style',
    enum: ['formal', 'casual', 'technical', 'friendly'],
    example: 'technical',
  })
  @IsOptional()
  @IsString()
  communicationStyle?: 'formal' | 'casual' | 'technical' | 'friendly';
}

/**
 * DTO for personality recommendation request
 */
export class PersonalityRecommendationRequestDto {
  @ApiProperty({
    description: 'Context for which to get personality recommendations',
    enum: InteractionContext,
    example: InteractionContext.TECHNICAL,
  })
  @IsEnum(InteractionContext)
  @IsNotEmpty()
  interactionContext: InteractionContext;

  @ApiPropertyOptional({
    description: 'Current conversation thread for context analysis',
    example: '789e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  threadId?: string;

  @ApiPropertyOptional({
    description: 'Number of recommendations to return',
    minimum: 1,
    maximum: 10,
    default: 3,
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Exclude specific personality IDs from recommendations',
    example: ['123e4567-e89b-12d3-a456-426614174000'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  excludePersonalities?: string[];

  @ApiPropertyOptional({
    description: 'Minimum confidence threshold for recommendations',
    minimum: 0,
    maximum: 1,
    default: 0.5,
    example: 0.7,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;
}

/**
 * DTO for personality recommendation response
 */
export class PersonalityRecommendationDto {
  @ApiProperty({
    description: 'Recommended personality ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  personalityId: string;

  @ApiProperty({
    description: 'Personality name',
    example: 'Technical Assistant',
  })
  personalityName: string;

  @ApiProperty({
    description: 'Recommendation confidence score',
    minimum: 0,
    maximum: 1,
    example: 0.85,
  })
  confidenceScore: number;

  @ApiProperty({
    description: 'Expected compatibility for the requested context',
    minimum: 0,
    maximum: 1,
    example: 0.92,
  })
  contextCompatibility: number;

  @ApiProperty({
    description: 'Reasons for this recommendation',
    example: ['High user satisfaction in technical contexts', 'Excellent code assistance ratings', 'Matches your communication preferences'],
    type: [String],
  })
  reasons: string[];

  @ApiPropertyOptional({
    description: 'Number of previous interactions with this personality',
    minimum: 0,
    example: 15,
  })
  previousInteractions?: number;

  @ApiPropertyOptional({
    description: 'Average user satisfaction with this personality',
    minimum: 0,
    maximum: 1,
    example: 0.88,
  })
  averageSatisfaction?: number;

  @ApiPropertyOptional({
    description: 'Performance trend for this personality',
    enum: ['improving', 'stable', 'declining'],
    example: 'improving',
  })
  performanceTrend?: 'improving' | 'stable' | 'declining';
}

/**
 * DTO for user preference profile
 */
export class UserPreferenceProfileDto {
  @ApiProperty({
    description: 'Top preferred personalities across all contexts',
    type: [PersonalityRecommendationDto],
  })
  topPreferences: PersonalityRecommendationDto[];

  @ApiProperty({
    description: 'Context-specific preferences',
    example: {
      [InteractionContext.TECHNICAL]: ['123e4567-e89b-12d3-a456-426614174000'],
      [InteractionContext.CREATIVE]: ['456e7890-e89b-12d3-a456-426614174000'],
    },
  })
  contextPreferences: Record<InteractionContext, string[]>;

  @ApiProperty({
    description: 'Overall learning confidence',
    minimum: 0,
    maximum: 1,
    example: 0.75,
  })
  learningConfidence: number;

  @ApiProperty({
    description: 'Total number of feedback interactions',
    minimum: 0,
    example: 42,
  })
  totalInteractions: number;

  @ApiProperty({
    description: 'User behavior patterns',
    example: {
      preferredComplexity: 3,
      communicationStyle: 'technical',
      averageSessionDuration: 30.5,
    },
  })
  behaviorPatterns: {
    preferredComplexity: number;
    communicationStyle: string;
    averageSessionDuration: number;
    mostActiveContext: InteractionContext;
    feedbackFrequency: number;
  };

  @ApiProperty({
    description: 'Recommendations for improving user experience',
    example: ['Try the Creative Assistant for brainstorming sessions', 'Your technical preferences are well-established'],
    type: [String],
  })
  recommendations: string[];
}
