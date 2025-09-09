import { Document } from '@langchain/core/documents';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Injectable } from '@nestjs/common';
import { TfIdf } from 'natural';
import { LangChainBaseService } from '../../common/base/langchain-base.service';
import type { ConversationContext } from '../../threads/services/conversation-state.service';
import type { PersonalityTrait } from '../entities/personality-profile.entity';

/**
 * Context analysis result interface
 */
export interface ContextAnalysisResult {
  /** Identified conversation intent/purpose */
  intent: ConversationIntent;
  /** Detected topics and their relevance scores */
  topics: Array<{ topic: string; relevance: number; keywords: string[] }>;
  /** Conversation complexity assessment */
  complexity: {
    level: 'low' | 'medium' | 'high' | 'expert';
    score: number;
    indicators: string[];
  };
  /** Emotional context analysis */
  emotionalContext: {
    sentiment: 'positive' | 'negative' | 'neutral';
    intensity: number;
    emotions: Array<{ emotion: string; confidence: number }>;
  };
  /** User behavior patterns */
  userPatterns: {
    communicationStyle: 'formal' | 'casual' | 'technical' | 'creative';
    preferredVerbosity: 'concise' | 'moderate' | 'detailed';
    expertiseLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    interactionPreferences: string[];
  };
  /** Switching trigger indicators */
  switchingTriggers: {
    shouldSwitch: boolean;
    confidence: number;
    reasons: string[];
    suggestedPersonalityTraits: PersonalityTrait[];
  };
  /** Analysis metadata */
  metadata: {
    analyzedAt: Date;
    messageCount: number;
    conversationDuration?: number;
    analysisVersion: string;
  };
}

/**
 * Conversation intent types
 */
export type ConversationIntent =
  | 'information_seeking'
  | 'problem_solving'
  | 'creative_assistance'
  | 'technical_support'
  | 'learning_teaching'
  | 'casual_conversation'
  | 'professional_consultation'
  | 'research_analysis'
  | 'decision_making'
  | 'entertainment'
  | 'emotional_support'
  | 'task_completion';

/**
 * Context indicators for personality switching
 */
interface ContextIndicator {
  type: 'topic_shift' | 'tone_change' | 'complexity_change' | 'user_preference' | 'conversation_phase';
  weight: number;
  description: string;
  keywords: string[];
  patterns: RegExp[];
}

/**
 * LangChain-based Personality Context Analyzer
 *
 * Uses advanced text analysis and LangChain document processing to analyze
 * conversation context for intelligent personality switching decisions.
 *
 * Key capabilities:
 * - Intent recognition using TF-IDF and keyword analysis
 * - Topic modeling with relevance scoring
 * - Conversation complexity assessment
 * - Emotional context analysis
 * - User behavior pattern detection
 * - Switching trigger identification
 */
@Injectable()
export class PersonalityContextAnalyzerService extends LangChainBaseService {
  private readonly textSplitter: RecursiveCharacterTextSplitter;
  private tfidf: TfIdf;

  constructor() {
    super('PersonalityContextAnalyzerService');

    // Initialize LangChain text splitter for conversation processing
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
      separators: ['\n\n', '\n', '. ', '? ', '! ', ' ', ''],
    });

    // Initialize TF-IDF for topic analysis
    this.tfidf = new TfIdf();

    // Define context indicators for personality switching
    this.contextIndicators = this.initializeContextIndicators();
  }

  /**
   * Analyze conversation context to determine personality switching needs
   */
  async analyzeConversationContext(
    messages: BaseMessage[],
    conversationContext?: ConversationContext,
    currentPersonalityId?: string,
  ): Promise<ContextAnalysisResult> {
    this.logExecution('analyzeConversationContext', {
      messageCount: messages.length,
      hasContext: !!conversationContext,
      currentPersonality: currentPersonalityId,
    });

    try {
      // Convert messages to documents for LangChain processing
      const documents = await this.messagesToDocuments(messages);

      // Split conversation into analyzable chunks
      const chunks = await this.textSplitter.splitDocuments(documents);

      // Extract conversation text for analysis
      const conversationText = messages.map((msg) => (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))).join('\n');

      // Perform parallel analysis using LangChain tracing
      const [intent, topics, complexity, emotionalContext, userPatterns] = await Promise.all([
        this.createTracedRunnable('identifyIntent', () => this.identifyIntent(conversationText, chunks)).invoke({}),
        this.createTracedRunnable('analyzeTopics', () => this.analyzeTopics(conversationText, chunks)).invoke({}),
        this.createTracedRunnable('assessComplexity', () => this.assessComplexity(conversationText, messages)).invoke({}),
        this.createTracedRunnable('analyzeEmotionalContext', () => this.analyzeEmotionalContext(conversationText)).invoke({}),
        this.createTracedRunnable('detectUserPatterns', () => this.detectUserPatterns(messages, conversationContext)).invoke({}),
      ]);

      // Determine switching triggers based on analysis
      const switchingTriggers = await this.createTracedRunnable('determineSwitchingTriggers', () =>
        this.determineSwitchingTriggers({ intent, topics, complexity, emotionalContext, userPatterns }, currentPersonalityId),
      ).invoke({});

      const result: ContextAnalysisResult = {
        intent,
        topics,
        complexity,
        emotionalContext,
        userPatterns,
        switchingTriggers,
        metadata: {
          analyzedAt: new Date(),
          messageCount: messages.length,
          conversationDuration: this.calculateConversationDuration(messages),
          analysisVersion: '1.0.0',
        },
      };

      this.logger.debug('Context analysis completed', {
        intent: result.intent,
        topicsCount: result.topics.length,
        complexity: result.complexity.level,
        shouldSwitch: result.switchingTriggers.shouldSwitch,
        confidence: result.switchingTriggers.confidence,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to analyze conversation context', error);
      // Return safe default analysis
      return this.createDefaultAnalysis(messages);
    }
  }

  /**
   * Analyze conversation context changes between messages
   */
  async analyzeContextChanges(
    previousMessages: BaseMessage[],
    newMessages: BaseMessage[],
    currentPersonalityId?: string,
  ): Promise<{
    significantChanges: boolean;
    changeIndicators: string[];
    recommendedAction: 'maintain' | 'adapt' | 'switch';
    confidence: number;
  }> {
    this.logExecution('analyzeContextChanges', {
      previousCount: previousMessages.length,
      newCount: newMessages.length,
      currentPersonality: currentPersonalityId,
    });

    try {
      // Analyze both conversation states
      const [previousAnalysis, currentAnalysis] = await Promise.all([
        this.analyzeConversationContext(previousMessages, undefined, currentPersonalityId),
        this.analyzeConversationContext(newMessages, undefined, currentPersonalityId),
      ]);

      // Compare analysis results
      const changes = this.compareAnalysisResults(previousAnalysis, currentAnalysis);

      // Determine recommended action
      const recommendedAction = this.determineRecommendedAction(changes);

      return {
        significantChanges: changes.length > 0,
        changeIndicators: changes,
        recommendedAction,
        confidence: this.calculateChangeConfidence(changes),
      };
    } catch (error) {
      this.logger.error('Failed to analyze context changes', error);
      return {
        significantChanges: false,
        changeIndicators: [],
        recommendedAction: 'maintain',
        confidence: 0,
      };
    }
  }

  /**
   * Extract conversation patterns for personality optimization
   */
  async extractConversationPatterns(
    messages: BaseMessage[],
    timeWindowMinutes = 30,
  ): Promise<{
    patterns: Array<{
      pattern: string;
      frequency: number;
      context: string;
      personalityImplication: string;
    }>;
    trendAnalysis: {
      topicTrends: Array<{ topic: string; trend: 'rising' | 'declining' | 'stable' }>;
      complexityTrend: 'increasing' | 'decreasing' | 'stable';
      engagementTrend: 'increasing' | 'decreasing' | 'stable';
    };
  }> {
    this.logExecution('extractConversationPatterns', {
      messageCount: messages.length,
      timeWindow: timeWindowMinutes,
    });

    // Filter messages within time window
    const timeThreshold = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const recentMessages = messages.filter((msg) => {
      const msgTime = msg.additional_kwargs?.timestamp as Date;
      return !msgTime || msgTime >= timeThreshold;
    });

    // Extract patterns using LangChain document processing
    const documents = await this.messagesToDocuments(recentMessages);
    const chunks = await this.textSplitter.splitDocuments(documents);

    // Analyze patterns
    const patterns = await this.identifyConversationPatterns(chunks);
    const trendAnalysis = await this.analyzeTrends(recentMessages);

    return {
      patterns,
      trendAnalysis,
    };
  }

  // Private helper methods

  /**
   * Convert BaseMessage array to LangChain Documents
   */
  private async messagesToDocuments(messages: BaseMessage[]): Promise<Document[]> {
    return messages.map((message, index) => {
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

      const role = message instanceof HumanMessage ? 'user' : message instanceof AIMessage ? 'assistant' : 'system';

      return new Document({
        pageContent: content,
        metadata: {
          role,
          messageIndex: index,
          timestamp: message.additional_kwargs?.timestamp || new Date(),
          ...message.additional_kwargs,
        },
      });
    });
  }

  /**
   * Identify conversation intent using TF-IDF and pattern matching
   */
  private async identifyIntent(conversationText: string, _chunks: Document[]): Promise<ConversationIntent> {
    // Intent keywords mapping
    const intentKeywords: Record<ConversationIntent, string[]> = {
      information_seeking: ['what', 'how', 'why', 'when', 'where', 'explain', 'tell me', 'information'],
      problem_solving: ['problem', 'issue', 'fix', 'solve', 'troubleshoot', 'debug', 'error'],
      creative_assistance: ['create', 'generate', 'design', 'brainstorm', 'creative', 'artistic', 'write'],
      technical_support: ['technical', 'code', 'programming', 'software', 'configure', 'setup'],
      learning_teaching: ['learn', 'teach', 'tutorial', 'lesson', 'understand', 'concept'],
      casual_conversation: ['chat', 'talk', 'casual', 'friendly', 'conversation'],
      professional_consultation: ['business', 'professional', 'consultation', 'advice', 'strategy'],
      research_analysis: ['research', 'analyze', 'study', 'investigate', 'data', 'analysis'],
      decision_making: ['decide', 'choice', 'option', 'recommendation', 'should I', 'better'],
      entertainment: ['fun', 'entertainment', 'joke', 'game', 'story', 'amusing'],
      emotional_support: ['help', 'support', 'feeling', 'emotion', 'difficult', 'stress'],
      task_completion: ['complete', 'finish', 'task', 'goal', 'accomplish', 'done'],
    };

    // Score each intent based on keyword presence
    const intentScores: Record<ConversationIntent, number> = {} as any;
    const text = conversationText.toLowerCase();

    for (const [intent, keywords] of Object.entries(intentKeywords)) {
      let score = 0;
      for (const keyword of keywords) {
        const matches = (text.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
        score += matches;
      }
      intentScores[intent as ConversationIntent] = score;
    }

    // Return intent with highest score
    const topIntent = Object.entries(intentScores).reduce((a, b) =>
      intentScores[a[0] as ConversationIntent] > intentScores[b[0] as ConversationIntent] ? a : b,
    )[0] as ConversationIntent;

    return topIntent || 'casual_conversation';
  }

  /**
   * Analyze conversation topics using TF-IDF
   */
  private async analyzeTopics(
    _conversationText: string,
    chunks: Document[],
  ): Promise<Array<{ topic: string; relevance: number; keywords: string[] }>> {
    // Clear previous documents
    this.tfidf = new TfIdf();

    // Add chunks to TF-IDF
    chunks.forEach((chunk) => {
      this.tfidf.addDocument(chunk.pageContent);
    });

    // Extract terms with highest TF-IDF scores
    const topics: Array<{ topic: string; relevance: number; keywords: string[] }> = [];

    if (chunks.length > 0) {
      this.tfidf
        .listTerms(0)
        .slice(0, 10)
        .forEach((item: any) => {
          if (item.tfidf > 0.1 && item.term.length > 2) {
            topics.push({
              topic: item.term,
              relevance: item.tfidf,
              keywords: [item.term],
            });
          }
        });
    }

    return topics.length > 0 ? topics : [{ topic: 'general', relevance: 1.0, keywords: ['conversation'] }];
  }

  /**
   * Assess conversation complexity
   */
  private async assessComplexity(
    conversationText: string,
    messages: BaseMessage[],
  ): Promise<{
    level: 'low' | 'medium' | 'high' | 'expert';
    score: number;
    indicators: string[];
  }> {
    const indicators: string[] = [];
    let score = 0;

    // Vocabulary complexity
    const words = conversationText.split(/\s+/);
    const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
    const vocabularyRatio = uniqueWords.size / words.length;
    if (vocabularyRatio > 0.7) {
      score += 20;
      indicators.push('High vocabulary diversity');
    }

    // Sentence length complexity
    const sentences = conversationText.split(/[.!?]+/);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
    if (avgSentenceLength > 20) {
      score += 15;
      indicators.push('Complex sentence structure');
    }

    // Technical term detection
    const technicalTerms = ['algorithm', 'implementation', 'architecture', 'framework', 'methodology'];
    const technicalCount = technicalTerms.filter((term) => conversationText.toLowerCase().includes(term)).length;
    if (technicalCount > 2) {
      score += 25;
      indicators.push('Technical terminology present');
    }

    // Message depth analysis
    if (messages.length > 10) {
      score += 10;
      indicators.push('Extended conversation depth');
    }

    // Determine complexity level
    let level: 'low' | 'medium' | 'high' | 'expert';
    if (score >= 50) {
      level = 'expert';
    } else if (score >= 30) {
      level = 'high';
    } else if (score >= 15) {
      level = 'medium';
    } else {
      level = 'low';
    }

    return { level, score, indicators };
  }

  /**
   * Analyze emotional context of conversation
   */
  private async analyzeEmotionalContext(conversationText: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    intensity: number;
    emotions: Array<{ emotion: string; confidence: number }>;
  }> {
    // Simple sentiment analysis - in production, would use more sophisticated NLP
    const positiveWords = ['good', 'great', 'excellent', 'happy', 'pleased', 'satisfied', 'wonderful'];
    const negativeWords = ['bad', 'terrible', 'awful', 'sad', 'angry', 'frustrated', 'disappointed'];
    const emotionalWords = ['excited', 'nervous', 'curious', 'confused', 'confident', 'worried'];

    const text = conversationText.toLowerCase();

    let positiveScore = 0;
    let negativeScore = 0;
    const detectedEmotions: Array<{ emotion: string; confidence: number }> = [];

    // Count positive/negative indicators
    positiveWords.forEach((word) => {
      const matches = (text.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
      positiveScore += matches;
    });

    negativeWords.forEach((word) => {
      const matches = (text.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
      negativeScore += matches;
    });

    // Detect specific emotions
    emotionalWords.forEach((emotion) => {
      const matches = (text.match(new RegExp(`\\b${emotion}\\b`, 'g')) || []).length;
      if (matches > 0) {
        detectedEmotions.push({
          emotion,
          confidence: Math.min(matches / 10, 1.0),
        });
      }
    });

    // Determine overall sentiment
    let sentiment: 'positive' | 'negative' | 'neutral';
    if (positiveScore > negativeScore) {
      sentiment = 'positive';
    } else if (negativeScore > positiveScore) {
      sentiment = 'negative';
    } else {
      sentiment = 'neutral';
    }

    const intensity = Math.min((positiveScore + negativeScore) / 10, 1.0);

    return { sentiment, intensity, emotions: detectedEmotions };
  }

  /**
   * Detect user communication patterns
   */
  private async detectUserPatterns(
    messages: BaseMessage[],
    _conversationContext?: ConversationContext,
  ): Promise<{
    communicationStyle: 'formal' | 'casual' | 'technical' | 'creative';
    preferredVerbosity: 'concise' | 'moderate' | 'detailed';
    expertiseLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    interactionPreferences: string[];
  }> {
    const userMessages = messages.filter((msg) => msg instanceof HumanMessage);
    const text = userMessages.map((msg) => (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))).join(' ');

    // Analyze communication style
    const formalIndicators = ['please', 'thank you', 'could you', 'would you', 'sir', 'madam'];
    const casualIndicators = ['hey', 'hi', 'yeah', 'ok', 'cool', 'awesome'];
    const technicalIndicators = ['function', 'variable', 'class', 'method', 'API', 'database'];
    const creativeIndicators = ['creative', 'imagine', 'design', 'artistic', 'story', 'idea'];

    const formalScore = this.countKeywords(text, formalIndicators);
    const casualScore = this.countKeywords(text, casualIndicators);
    const technicalScore = this.countKeywords(text, technicalIndicators);
    const creativeScore = this.countKeywords(text, creativeIndicators);

    const styleScores = { formal: formalScore, casual: casualScore, technical: technicalScore, creative: creativeScore };
    const communicationStyle = Object.entries(styleScores).reduce((a, b) =>
      styleScores[a[0] as keyof typeof styleScores] > styleScores[b[0] as keyof typeof styleScores] ? a : b,
    )[0] as 'formal' | 'casual' | 'technical' | 'creative';

    // Analyze verbosity
    const avgMessageLength =
      userMessages.length > 0
        ? userMessages.reduce((sum, msg) => {
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            return sum + content.length;
          }, 0) / userMessages.length
        : 0;

    let preferredVerbosity: 'concise' | 'moderate' | 'detailed';
    if (avgMessageLength < 50) {
      preferredVerbosity = 'concise';
    } else if (avgMessageLength < 200) {
      preferredVerbosity = 'moderate';
    } else {
      preferredVerbosity = 'detailed';
    }

    // Assess expertise level based on vocabulary and question complexity
    const expertiseIndicators = ['advanced', 'complex', 'sophisticated', 'architectural', 'systematic'];
    const beginnerIndicators = ['basic', 'simple', 'beginner', 'start', 'how to'];

    const expertiseScore = this.countKeywords(text, expertiseIndicators);
    const beginnerScore = this.countKeywords(text, beginnerIndicators);

    let expertiseLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    if (expertiseScore > beginnerScore && expertiseScore > 2) {
      expertiseLevel = 'expert';
    } else if (expertiseScore > beginnerScore) {
      expertiseLevel = 'advanced';
    } else if (beginnerScore > 0) {
      expertiseLevel = 'beginner';
    } else {
      expertiseLevel = 'intermediate';
    }

    // Extract interaction preferences
    const interactionPreferences: string[] = [];
    if (this.countKeywords(text, ['example', 'show me', 'demonstrate']) > 0) {
      interactionPreferences.push('examples_preferred');
    }
    if (this.countKeywords(text, ['step by step', 'detailed', 'explain']) > 0) {
      interactionPreferences.push('detailed_explanations');
    }
    if (this.countKeywords(text, ['quick', 'brief', 'summary']) > 0) {
      interactionPreferences.push('concise_responses');
    }

    return {
      communicationStyle,
      preferredVerbosity,
      expertiseLevel,
      interactionPreferences,
    };
  }

  /**
   * Determine switching triggers based on analysis results
   */
  private async determineSwitchingTriggers(
    analysis: {
      intent: ConversationIntent;
      topics: Array<{ topic: string; relevance: number; keywords: string[] }>;
      complexity: { level: string; score: number; indicators: string[] };
      emotionalContext: { sentiment: string; intensity: number; emotions: Array<{ emotion: string; confidence: number }> };
      userPatterns: any;
    },
    _currentPersonalityId?: string,
  ): Promise<{
    shouldSwitch: boolean;
    confidence: number;
    reasons: string[];
    suggestedPersonalityTraits: PersonalityTrait[];
  }> {
    const reasons: string[] = [];
    const suggestedTraits: PersonalityTrait[] = [];
    let switchScore = 0;

    // Analyze intent-based switching needs
    if (analysis.intent === 'technical_support' || analysis.intent === 'research_analysis') {
      switchScore += 30;
      reasons.push('Technical/analytical intent detected');
      suggestedTraits.push({
        name: 'expertise_level',
        value: 'expert',
        weight: 0.9,
        description: 'High expertise needed for technical assistance',
      });
    }

    // Analyze complexity-based switching
    if (analysis.complexity.level === 'expert' || analysis.complexity.level === 'high') {
      switchScore += 25;
      reasons.push('High conversation complexity detected');
      suggestedTraits.push({
        name: 'technical_depth',
        value: 'detailed',
        weight: 0.8,
        description: 'Detailed technical depth required',
      });
    }

    // Analyze emotional context switching needs
    if (analysis.emotionalContext.intensity > 0.7) {
      switchScore += 20;
      reasons.push('Strong emotional context requires empathetic response');
      suggestedTraits.push({
        name: 'empathy',
        value: 'high',
        weight: 0.9,
        description: 'High empathy needed for emotional support',
      });
    }

    // Analyze user pattern alignment
    if (analysis.userPatterns.communicationStyle === 'formal') {
      switchScore += 15;
      reasons.push('Formal communication style detected');
      suggestedTraits.push({
        name: 'formality',
        value: 'formal',
        weight: 0.7,
        description: 'Formal tone to match user communication style',
      });
    }

    // Topic-based switching
    const technicalTopics = analysis.topics.filter((t) => ['code', 'programming', 'technical', 'software', 'development'].includes(t.topic));
    if (technicalTopics.length > 0) {
      switchScore += 20;
      reasons.push('Technical topics identified');
      suggestedTraits.push({
        name: 'communication_style',
        value: 'technical',
        weight: 0.8,
        description: 'Technical communication style for programming topics',
      });
    }

    const shouldSwitch = switchScore >= 40; // Threshold for switching
    const confidence = Math.min(switchScore / 100, 1.0);

    return {
      shouldSwitch,
      confidence,
      reasons,
      suggestedPersonalityTraits: suggestedTraits,
    };
  }

  /**
   * Initialize context indicators for pattern recognition
   */
  private initializeContextIndicators(): ContextIndicator[] {
    return [
      {
        type: 'topic_shift',
        weight: 0.8,
        description: 'Conversation topic has significantly changed',
        keywords: ['now let me ask', 'changing topic', 'different question', 'another thing'],
        patterns: [/now let['']?s talk about/i, /switching gears/i, /on another note/i],
      },
      {
        type: 'tone_change',
        weight: 0.7,
        description: 'User tone has shifted requiring personality adaptation',
        keywords: ['seriously', 'joking aside', 'more formal', 'casually speaking'],
        patterns: [/but seriously/i, /on a serious note/i, /kidding aside/i],
      },
      {
        type: 'complexity_change',
        weight: 0.9,
        description: 'Conversation complexity has increased significantly',
        keywords: ['detailed explanation', 'technical details', 'advanced', 'complex'],
        patterns: [/more technical/i, /in depth/i, /detailed analysis/i],
      },
      {
        type: 'user_preference',
        weight: 0.8,
        description: 'User has expressed specific interaction preferences',
        keywords: ['prefer', 'like', 'better if', 'would rather'],
        patterns: [/i prefer/i, /i would like/i, /better if you/i],
      },
      {
        type: 'conversation_phase',
        weight: 0.6,
        description: 'Conversation has moved to a different phase',
        keywords: ['conclusion', 'summary', 'final question', 'wrap up'],
        patterns: [/to conclude/i, /in summary/i, /wrapping up/i],
      },
    ];
  }

  /**
   * Helper method to count keyword occurrences
   */
  private countKeywords(text: string, keywords: string[]): number {
    const lowerText = text.toLowerCase();
    return keywords.reduce((count, keyword) => {
      const matches = (lowerText.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
      return count + matches;
    }, 0);
  }

  /**
   * Calculate conversation duration from messages
   */
  private calculateConversationDuration(messages: BaseMessage[]): number | undefined {
    if (messages.length < 2) {
      return undefined;
    }

    const timestamps = messages
      .map((msg) => msg.additional_kwargs?.timestamp as Date)
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());

    if (timestamps.length < 2) {
      return undefined;
    }

    return timestamps[timestamps.length - 1].getTime() - timestamps[0].getTime();
  }

  /**
   * Create default analysis when analysis fails
   */
  private createDefaultAnalysis(messages: BaseMessage[]): ContextAnalysisResult {
    return {
      intent: 'casual_conversation',
      topics: [{ topic: 'general', relevance: 1.0, keywords: ['conversation'] }],
      complexity: { level: 'low', score: 0, indicators: [] },
      emotionalContext: { sentiment: 'neutral', intensity: 0, emotions: [] },
      userPatterns: {
        communicationStyle: 'casual',
        preferredVerbosity: 'moderate',
        expertiseLevel: 'intermediate',
        interactionPreferences: [],
      },
      switchingTriggers: {
        shouldSwitch: false,
        confidence: 0,
        reasons: [],
        suggestedPersonalityTraits: [],
      },
      metadata: {
        analyzedAt: new Date(),
        messageCount: messages.length,
        analysisVersion: '1.0.0',
      },
    };
  }

  /**
   * Compare two analysis results to identify changes
   */
  private compareAnalysisResults(previous: ContextAnalysisResult, current: ContextAnalysisResult): string[] {
    const changes: string[] = [];

    if (previous.intent !== current.intent) {
      changes.push(`Intent changed from ${previous.intent} to ${current.intent}`);
    }

    if (previous.complexity.level !== current.complexity.level) {
      changes.push(`Complexity changed from ${previous.complexity.level} to ${current.complexity.level}`);
    }

    if (previous.emotionalContext.sentiment !== current.emotionalContext.sentiment) {
      changes.push(`Sentiment changed from ${previous.emotionalContext.sentiment} to ${current.emotionalContext.sentiment}`);
    }

    if (previous.userPatterns.communicationStyle !== current.userPatterns.communicationStyle) {
      changes.push(`Communication style changed from ${previous.userPatterns.communicationStyle} to ${current.userPatterns.communicationStyle}`);
    }

    return changes;
  }

  /**
   * Determine recommended action based on changes
   */
  private determineRecommendedAction(changes: string[]): 'maintain' | 'adapt' | 'switch' {
    if (changes.length === 0) {
      return 'maintain';
    }
    if (changes.length <= 2) {
      return 'adapt';
    }
    return 'switch';
  }

  /**
   * Calculate confidence in change analysis
   */
  private calculateChangeConfidence(changes: string[]): number {
    return Math.min(changes.length / 4, 1.0);
  }

  /**
   * Identify conversation patterns from document chunks
   */
  private async identifyConversationPatterns(chunks: Document[]): Promise<
    Array<{
      pattern: string;
      frequency: number;
      context: string;
      personalityImplication: string;
    }>
  > {
    // Simplified pattern identification
    return [
      {
        pattern: 'Question-Answer Sequence',
        frequency: chunks.filter((c) => c.pageContent.includes('?')).length,
        context: 'Information seeking pattern',
        personalityImplication: 'Requires informative and patient personality',
      },
    ];
  }

  /**
   * Analyze conversation trends
   */
  private async analyzeTrends(_messages: BaseMessage[]): Promise<{
    topicTrends: Array<{ topic: string; trend: 'rising' | 'declining' | 'stable' }>;
    complexityTrend: 'increasing' | 'decreasing' | 'stable';
    engagementTrend: 'increasing' | 'decreasing' | 'stable';
  }> {
    // Simplified trend analysis
    return {
      topicTrends: [{ topic: 'general', trend: 'stable' }],
      complexityTrend: 'stable',
      engagementTrend: 'stable',
    };
  }
}
