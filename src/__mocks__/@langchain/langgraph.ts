// Mock implementation of @langchain/langgraph for testing

// Define proper mock types
interface MockAnnotationConfig {
  default?: () => unknown;
  reducer?: (current: unknown, update: unknown) => unknown;
  value?: unknown;
}

interface MockAnnotation {
  default: () => unknown;
  reducer: (current: unknown, update: unknown) => unknown;
  value: unknown;
}

// Mock Annotation function and class
function createAnnotation(config: MockAnnotationConfig = {}): MockAnnotation {
  return {
    default: config.default || (() => null),
    reducer: config.reducer || ((current: unknown, update: unknown) => update ?? current),
    value: config.value || null,
  };
}

// Define types for root config
type MockRootConfig = Record<string, unknown | MockAnnotationConfig>;

interface MockAnnotationRoot {
  State: Record<string, MockAnnotation>;
  new (
    value?: Record<string, unknown>,
  ): {
    value: Record<string, unknown>;
    getState(): Record<string, unknown>;
    updateState(updates: Record<string, unknown>): Record<string, unknown>;
  };
}

// Create Annotation as both a function and a class with static methods
export const Annotation = Object.assign(
  function (config?: MockAnnotationConfig) {
    return createAnnotation(config);
  },
  {
    Root: jest.fn().mockImplementation((rootConfig: MockRootConfig) => {
      const processedConfig: Record<string, MockAnnotation> = {};

      // Process each field in the root configuration
      for (const [key, value] of Object.entries(rootConfig)) {
        if (typeof value === 'function') {
          // If it's already an Annotation function call, call it and use result
          processedConfig[key] = (value as () => MockAnnotation)();
        } else if (typeof value === 'object' && value !== null) {
          // If it's a config object, create annotation from it
          processedConfig[key] = createAnnotation(value as MockAnnotationConfig);
        } else {
          // Otherwise create a default annotation
          processedConfig[key] = createAnnotation();
        }
      }

      return class MockAnnotationRoot {
        static State = processedConfig;
        public value: Record<string, unknown>;

        constructor(value: Record<string, unknown> = {}) {
          this.value = value;
          // Initialize with defaults
          for (const [key, config] of Object.entries(processedConfig)) {
            if (typeof config === 'object' && config !== null && 'default' in config) {
              const annotationConfig = config as MockAnnotation;
              if (typeof annotationConfig.default === 'function') {
                this.value[key] = annotationConfig.default();
              }
            }
          }
        }
        getState(): Record<string, unknown> {
          return this.value;
        }
        updateState(updates: Record<string, unknown>): Record<string, unknown> {
          this.value = { ...this.value, ...updates };
          return this.value;
        }
      } as MockAnnotationRoot;
    }),
  },
);

// Define types for StateGraph
type MockNodeFunction = (state: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
type MockConditionalFunction = (state: Record<string, unknown>) => string;
type MockEdgeMapping = Record<string, string>;
type MockEdgeEntry = string[] | [MockConditionalFunction, MockEdgeMapping?];

interface MockCompiledGraph {
  invoke: jest.MockedFunction<(initialState: Record<string, unknown>) => Promise<Record<string, unknown>>>;
  stream: jest.MockedFunction<() => AsyncGenerator<Record<string, unknown>>>;
  getGraph: jest.MockedFunction<() => { nodes: string[]; edges: [string, MockEdgeEntry][] }>;
}

// Mock StateGraph class
export class StateGraph {
  private nodes = new Map<string, MockNodeFunction>();
  private edges = new Map<string, MockEdgeEntry>();

  addNode(name: string, fn: MockNodeFunction): this {
    this.nodes.set(name, fn);
    return this;
  }

  addEdge(from: string, to: string): this {
    if (!this.edges.has(from)) {
      this.edges.set(from, []);
    }
    (this.edges.get(from) as string[])!.push(to);
    return this;
  }

  addConditionalEdges(from: string, fn: MockConditionalFunction, mapping?: MockEdgeMapping): this {
    this.edges.set(from, [fn, mapping]);
    return this;
  }

  setEntryPoint(_node: string): this {
    return this;
  }

  setFinishPoint(_node: string): this {
    return this;
  }

  compile(): MockCompiledGraph {
    return {
      invoke: jest.fn().mockImplementation(async (initialState: Record<string, unknown>) => {
        // Return a proper conversation state structure
        return {
          threadId: initialState.threadId,
          thread: initialState.thread,
          messages: initialState.messages || [],
          currentMessage: initialState.currentMessage,
          conversationPhase: 'completion',
          context: initialState.context || {},
          error: null,
        };
      }),
      stream: jest.fn().mockImplementation(async function* () {
        yield {
          messages: [],
          state: {},
        };
      }),
      getGraph: jest.fn().mockReturnValue({
        nodes: Array.from(this.nodes.keys()),
        edges: Array.from(this.edges.entries()),
      }),
    };
  }
}

// Mock constants
export const START = '__start__';
export const END = '__end__';

// Mock MemorySaver
export class MemorySaver {
  private memory = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.memory.get(key);
  }

  async put(key: string, value: unknown): Promise<unknown> {
    this.memory.set(key, value);
    return value;
  }

  async delete(key: string): Promise<boolean> {
    return this.memory.delete(key);
  }

  async list(): Promise<[string, unknown][]> {
    return Array.from(this.memory.entries());
  }
}

// Mock Checkpoint
export interface Checkpoint {
  v: number;
  id: string;
  ts: string;
  channel_values: Record<string, unknown>;
  channel_versions: Record<string, number>;
  versions_seen: Record<string, Record<string, number>>;
}

// Mock CheckpointTuple
export type CheckpointTuple = [Checkpoint, Record<string, unknown>];

// Mock BaseCheckpointSaver
export class BaseCheckpointSaver {
  async getTuple(_config: Record<string, unknown>): Promise<CheckpointTuple | null> {
    return null;
  }

  async putWrites(_config: Record<string, unknown>, _writes: unknown[], _taskId: string): Promise<void> {
    // Mock implementation
  }

  async put(_config: Record<string, unknown>, _checkpoint: Checkpoint, _metadata: Record<string, unknown>): Promise<void> {
    // Mock implementation
  }
}

// Mock MessagesAnnotation
export const MessagesAnnotation = Annotation.Root({
  messages: {
    reducer: (state: unknown[], action: unknown) => [...state, action],
    default: () => [],
  },
});

// Mock HumanMessage, AIMessage, SystemMessage if needed by tests
export { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
