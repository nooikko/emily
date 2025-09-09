// Mock implementation of @langchain/langgraph for testing

// Mock Annotation function and class
function createAnnotation(config: any = {}) {
  return {
    default: config.default || (() => null),
    reducer: config.reducer || ((current: any, update: any) => update ?? current),
    value: config.value || null
  };
}

// Create Annotation as both a function and a class with static methods
export const Annotation = Object.assign(
  function(config?: any) {
    return createAnnotation(config);
  },
  {
    Root: jest.fn().mockImplementation((rootConfig: any) => {
      const processedConfig: any = {};
      
      // Process each field in the root configuration
      for (const [key, value] of Object.entries(rootConfig)) {
        if (typeof value === 'function') {
          // If it's already an Annotation function call, use its result
          processedConfig[key] = value;
        } else if (typeof value === 'object' && value !== null) {
          // If it's a config object, keep it as is
          processedConfig[key] = value;
        } else {
          // Otherwise create a default annotation
          processedConfig[key] = createAnnotation();
        }
      }
      
      return class MockAnnotationRoot {
        static State = processedConfig;
        constructor(public value: any = {}) {
          // Initialize with defaults
          for (const [key, config] of Object.entries(processedConfig)) {
            if (typeof config === 'object' && config !== null && 'default' in config) {
              const annotationConfig = config as any;
              if (typeof annotationConfig.default === 'function') {
                this.value[key] = annotationConfig.default();
              }
            }
          }
        }
        getState() { return this.value; }
        updateState(updates: any) { 
          this.value = { ...this.value, ...updates };
          return this.value;
        }
      };
    })
  }
);

// Mock StateGraph class
export class StateGraph {
  private nodes = new Map<string, any>();
  private edges = new Map<string, any[]>();
  
  constructor(private stateSchema: any) {}

  addNode(name: string, fn: any) {
    this.nodes.set(name, fn);
    return this;
  }

  addEdge(from: string, to: string) {
    if (!this.edges.has(from)) {
      this.edges.set(from, []);
    }
    this.edges.get(from)!.push(to);
    return this;
  }

  addConditionalEdges(from: string, fn: any, mapping?: any) {
    this.edges.set(from, [fn, mapping]);
    return this;
  }

  setEntryPoint(node: string) {
    return this;
  }

  setFinishPoint(node: string) {
    return this;
  }

  compile() {
    return {
      invoke: jest.fn().mockResolvedValue({
        messages: [],
        state: {}
      }),
      stream: jest.fn().mockImplementation(async function* () {
        yield {
          messages: [],
          state: {}
        };
      }),
      getGraph: jest.fn().mockReturnValue({
        nodes: Array.from(this.nodes.keys()),
        edges: Array.from(this.edges.entries())
      })
    };
  }
}

// Mock constants
export const START = '__start__';
export const END = '__end__';

// Mock MemorySaver
export class MemorySaver {
  private memory = new Map<string, any>();

  async get(key: string) {
    return this.memory.get(key);
  }

  async put(key: string, value: any) {
    this.memory.set(key, value);
    return value;
  }

  async delete(key: string) {
    return this.memory.delete(key);
  }

  async list() {
    return Array.from(this.memory.entries());
  }
}

// Mock Checkpoint
export interface Checkpoint {
  v: number;
  id: string;
  ts: string;
  channel_values: Record<string, any>;
  channel_versions: Record<string, number>;
  versions_seen: Record<string, Record<string, number>>;
}

// Mock CheckpointTuple
export type CheckpointTuple = [Checkpoint, Record<string, any>];

// Mock BaseCheckpointSaver
export class BaseCheckpointSaver {
  async getTuple(config: any): Promise<CheckpointTuple | null> {
    return null;
  }

  async putWrites(config: any, writes: any[], taskId: string): Promise<void> {
    // Mock implementation
  }

  async put(config: any, checkpoint: Checkpoint, metadata: any): Promise<void> {
    // Mock implementation
  }
}

// Mock MessagesAnnotation
export const MessagesAnnotation = Annotation.Root({
  messages: {
    reducer: (state: any[], action: any) => [...state, action],
    default: () => []
  }
});

// Mock HumanMessage, AIMessage, SystemMessage if needed by tests
export { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';