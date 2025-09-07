import { Injectable, Logger } from '@nestjs/common';
import { MetricMemory } from '../../observability/decorators/metric.decorator';
import { TraceAI } from '../../observability/decorators/trace.decorator';
import { VectorStoreService } from '../../vectors/services/vector-store.service';

/**
 * Node types in the memory graph
 */
export enum NodeType {
  ENTITY = 'entity',
  CONCEPT = 'concept',
  CONVERSATION = 'conversation',
  EVENT = 'event',
  TOPIC = 'topic',
  LOCATION = 'location',
  TIME = 'time',
}

/**
 * Edge types representing relationships in the graph
 */
export enum EdgeType {
  RELATES_TO = 'relates_to',
  MENTIONS = 'mentions',
  FOLLOWS = 'follows',
  CAUSED_BY = 'caused_by',
  PART_OF = 'part_of',
  CONTRADICTS = 'contradicts',
  SUPPORTS = 'supports',
  DEPENDS_ON = 'depends_on',
  SIMILAR_TO = 'similar_to',
  OPPOSITE_OF = 'opposite_of',
  LOCATED_AT = 'located_at',
  OCCURRED_AT = 'occurred_at',
  INTERACTS_WITH = 'interacts_with',
}

/**
 * Graph node representing an entity, concept, or conversation element
 */
export interface GraphNode {
  /** Unique identifier for the node */
  id: string;
  /** Type of the node */
  type: NodeType;
  /** Display name or label */
  label: string;
  /** Detailed content or description */
  content: string;
  /** Additional properties */
  properties: Record<string, unknown>;
  /** Timestamp when node was created */
  createdAt: number;
  /** Timestamp when node was last updated */
  updatedAt: number;
  /** Importance or centrality score */
  importance: number;
  /** Thread ID if conversation-specific */
  threadId?: string;
}

/**
 * Graph edge representing a relationship between nodes
 */
export interface GraphEdge {
  /** Unique identifier for the edge */
  id: string;
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Type of relationship */
  type: EdgeType;
  /** Strength or weight of the relationship (0-1) */
  weight: number;
  /** Additional properties describing the relationship */
  properties: Record<string, unknown>;
  /** Timestamp when edge was created */
  createdAt: number;
  /** Direction of the edge (bidirectional by default) */
  bidirectional: boolean;
}

/**
 * Graph traversal options
 */
export interface TraversalOptions {
  /** Maximum depth to traverse */
  maxDepth?: number;
  /** Maximum number of nodes to return */
  maxNodes?: number;
  /** Filter by node types */
  nodeTypes?: NodeType[];
  /** Filter by edge types */
  edgeTypes?: EdgeType[];
  /** Minimum edge weight threshold */
  minWeight?: number;
  /** Whether to include edge information */
  includeEdges?: boolean;
  /** Sort by importance/centrality */
  sortByImportance?: boolean;
  /** Thread ID filter */
  threadId?: string;
}

/**
 * Graph query result
 */
export interface GraphQueryResult {
  /** Nodes found in the query */
  nodes: GraphNode[];
  /** Edges connecting the nodes */
  edges: GraphEdge[];
  /** Paths between nodes (if applicable) */
  paths?: GraphNode[][];
  /** Query execution time in ms */
  executionTime: number;
}

/**
 * Node extraction configuration
 */
export interface NodeExtractionConfig {
  /** Types of nodes to extract */
  extractTypes?: NodeType[];
  /** Minimum confidence threshold for extraction */
  minConfidence?: number;
  /** Whether to merge with existing nodes */
  mergeExisting?: boolean;
  /** Custom extraction prompt */
  customPrompt?: string;
}

/**
 * GraphMemory implements a graph-based memory system for tracking
 * relationships between entities, concepts, and conversations.
 * It provides graph traversal, relationship extraction, and
 * semantic clustering capabilities.
 */
@Injectable()
export class GraphMemory {
  private readonly logger = new Logger(GraphMemory.name);

  // In-memory graph storage (could be replaced with graph DB)
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private adjacencyList: Map<string, Set<string>> = new Map();
  private reverseAdjacencyList: Map<string, Set<string>> = new Map();

  constructor(private readonly vectorStoreService: VectorStoreService) {}

  /**
   * Add a node to the graph
   */
  @TraceAI({
    name: 'memory.graph_add_node',
    operation: 'graph_update',
  })
  @MetricMemory({
    memoryType: 'graph',
    operation: 'add_node',
    measureDuration: true,
    trackSuccessRate: true,
  })
  async addNode(node: Omit<GraphNode, 'createdAt' | 'updatedAt'>): Promise<GraphNode> {
    const now = Date.now();
    const fullNode: GraphNode = {
      ...node,
      createdAt: now,
      updatedAt: now,
    };

    // Check if node exists and merge if needed
    const existing = this.nodes.get(node.id);
    if (existing) {
      fullNode.createdAt = existing.createdAt;
      fullNode.importance = Math.max(existing.importance, node.importance);
      fullNode.properties = { ...existing.properties, ...node.properties };
    }

    this.nodes.set(node.id, fullNode);

    // Initialize adjacency lists if needed
    if (!this.adjacencyList.has(node.id)) {
      this.adjacencyList.set(node.id, new Set());
    }
    if (!this.reverseAdjacencyList.has(node.id)) {
      this.reverseAdjacencyList.set(node.id, new Set());
    }

    this.logger.debug(`Added node ${node.id} of type ${node.type}`);
    return fullNode;
  }

  /**
   * Add an edge to the graph
   */
  @TraceAI({
    name: 'memory.graph_add_edge',
    operation: 'graph_update',
  })
  @MetricMemory({
    memoryType: 'graph',
    operation: 'add_edge',
    measureDuration: true,
    trackSuccessRate: true,
  })
  async addEdge(edge: Omit<GraphEdge, 'id' | 'createdAt'>): Promise<GraphEdge> {
    const edgeId = `${edge.sourceId}-${edge.type}-${edge.targetId}`;
    const now = Date.now();

    const fullEdge: GraphEdge = {
      ...edge,
      id: edgeId,
      createdAt: now,
    };

    // Check if both nodes exist
    if (!this.nodes.has(edge.sourceId) || !this.nodes.has(edge.targetId)) {
      throw new Error('Cannot add edge: one or both nodes do not exist');
    }

    // Update or merge with existing edge
    const existing = this.edges.get(edgeId);
    if (existing) {
      fullEdge.weight = Math.max(existing.weight, edge.weight);
      fullEdge.properties = { ...existing.properties, ...edge.properties };
      fullEdge.createdAt = existing.createdAt;
    }

    this.edges.set(edgeId, fullEdge);

    // Update adjacency lists
    this.adjacencyList.get(edge.sourceId)?.add(edge.targetId);
    this.reverseAdjacencyList.get(edge.targetId)?.add(edge.sourceId);

    if (edge.bidirectional) {
      this.adjacencyList.get(edge.targetId)?.add(edge.sourceId);
      this.reverseAdjacencyList.get(edge.sourceId)?.add(edge.targetId);
    }

    // Update node importance based on connections
    this.updateNodeImportance(edge.sourceId);
    this.updateNodeImportance(edge.targetId);

    this.logger.debug(`Added edge ${edgeId} with weight ${edge.weight}`);
    return fullEdge;
  }

  /**
   * Extract nodes and relationships from text
   */
  @TraceAI({
    name: 'memory.graph_extract',
    operation: 'graph_extraction',
  })
  @MetricMemory({
    memoryType: 'graph',
    operation: 'extract',
    measureDuration: true,
    trackSuccessRate: true,
  })
  async extractNodesAndEdges(
    text: string,
    threadId?: string,
    config: NodeExtractionConfig = {},
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const { minConfidence = 0.7 } = config;

    // This would typically use NLP/LLM for extraction
    // For now, we'll create a simple implementation
    const extractedNodes: GraphNode[] = [];
    const extractedEdges: GraphEdge[] = [];

    // Simple entity extraction (would be replaced with LLM call)
    const words = text.split(/\s+/);
    const entities = new Set<string>();

    // Extract capitalized words as entities (simplified)
    for (const word of words) {
      if (word.length > 2 && /^[A-Z]/.test(word)) {
        entities.add(word.replace(/[^a-zA-Z0-9]/g, ''));
      }
    }

    // Create nodes for extracted entities
    for (const entity of entities) {
      const nodeId = `entity-${entity.toLowerCase()}`;
      const node = await this.addNode({
        id: nodeId,
        type: NodeType.ENTITY,
        label: entity,
        content: `Entity: ${entity}`,
        properties: {
          extractedFrom: text.substring(0, 100),
          confidence: minConfidence,
          threadId,
        },
        importance: 0.5,
        threadId,
      });
      extractedNodes.push(node);
    }

    // Create relationships between co-occurring entities
    const entityArray = Array.from(entities);
    for (let i = 0; i < entityArray.length - 1; i++) {
      for (let j = i + 1; j < entityArray.length; j++) {
        const sourceId = `entity-${entityArray[i].toLowerCase()}`;
        const targetId = `entity-${entityArray[j].toLowerCase()}`;

        const edge = await this.addEdge({
          sourceId,
          targetId,
          type: EdgeType.RELATES_TO,
          weight: 0.5,
          properties: {
            coOccurrence: true,
            context: text.substring(0, 50),
          },
          bidirectional: true,
        });
        extractedEdges.push(edge);
      }
    }

    this.logger.debug(`Extracted ${extractedNodes.length} nodes and ${extractedEdges.length} edges from text`);
    return { nodes: extractedNodes, edges: extractedEdges };
  }

  /**
   * Traverse the graph from a starting node
   */
  @TraceAI({
    name: 'memory.graph_traverse',
    operation: 'graph_query',
  })
  @MetricMemory({
    memoryType: 'graph',
    operation: 'traverse',
    measureDuration: true,
    trackSuccessRate: true,
  })
  async traverse(startNodeId: string, options: TraversalOptions = {}): Promise<GraphQueryResult> {
    const startTime = Date.now();
    const { maxDepth = 3, maxNodes = 50, nodeTypes, edgeTypes, minWeight = 0, includeEdges = true, sortByImportance = true, threadId } = options;

    if (!this.nodes.has(startNodeId)) {
      throw new Error(`Start node ${startNodeId} not found`);
    }

    const visitedNodes = new Set<string>();
    const resultNodes: GraphNode[] = [];
    const resultEdges: GraphEdge[] = [];
    const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: startNodeId, depth: 0 }];

    while (queue.length > 0 && resultNodes.length < maxNodes) {
      const { nodeId, depth } = queue.shift()!;

      if (visitedNodes.has(nodeId) || depth > maxDepth) {
        continue;
      }

      visitedNodes.add(nodeId);
      const node = this.nodes.get(nodeId);

      if (!node) {
        continue;
      }

      // Apply filters
      if (nodeTypes && !nodeTypes.includes(node.type)) {
        continue;
      }
      if (threadId && node.threadId !== threadId) {
        continue;
      }

      resultNodes.push(node);

      // Get connected nodes
      const neighbors = this.adjacencyList.get(nodeId) || new Set();

      for (const neighborId of neighbors) {
        if (depth < maxDepth) {
          // Check edge filters
          const _edgeId = `${nodeId}-${EdgeType.RELATES_TO}-${neighborId}`;
          const edge = this.findEdge(nodeId, neighborId);

          if (edge) {
            if (edgeTypes && !edgeTypes.includes(edge.type)) {
              continue;
            }
            if (edge.weight < minWeight) {
              continue;
            }

            if (includeEdges && !resultEdges.some((e) => e.id === edge.id)) {
              resultEdges.push(edge);
            }
          }

          queue.push({ nodeId: neighborId, depth: depth + 1 });
        }
      }
    }

    // Sort by importance if requested
    if (sortByImportance) {
      resultNodes.sort((a, b) => b.importance - a.importance);
    }

    const executionTime = Date.now() - startTime;

    this.logger.debug(`Traversed graph from ${startNodeId}: found ${resultNodes.length} nodes and ${resultEdges.length} edges in ${executionTime}ms`);

    return {
      nodes: resultNodes,
      edges: resultEdges,
      executionTime,
    };
  }

  /**
   * Find shortest path between two nodes
   */
  @TraceAI({
    name: 'memory.graph_find_path',
    operation: 'graph_query',
  })
  async findPath(startNodeId: string, endNodeId: string, options: { maxDepth?: number; edgeTypes?: EdgeType[] } = {}): Promise<GraphNode[] | null> {
    const { maxDepth = 10, edgeTypes } = options;

    if (!this.nodes.has(startNodeId) || !this.nodes.has(endNodeId)) {
      return null;
    }

    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: startNodeId, path: [startNodeId] }];

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (path.length > maxDepth) {
        continue;
      }
      if (visited.has(nodeId)) {
        continue;
      }

      visited.add(nodeId);

      if (nodeId === endNodeId) {
        // Found path - convert to nodes
        return path.map((id) => this.nodes.get(id)!).filter(Boolean);
      }

      const neighbors = this.adjacencyList.get(nodeId) || new Set();

      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          // Check edge type filter if provided
          if (edgeTypes) {
            const edge = this.findEdge(nodeId, neighborId);
            if (!edge || !edgeTypes.includes(edge.type)) {
              continue;
            }
          }

          queue.push({
            nodeId: neighborId,
            path: [...path, neighborId],
          });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Get related nodes using semantic similarity
   */
  @TraceAI({
    name: 'memory.graph_semantic_neighbors',
    operation: 'graph_query',
  })
  async getSemanticNeighbors(nodeId: string, limit = 10, threadId?: string): Promise<GraphNode[]> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    try {
      // Use vector store for semantic similarity
      const similarDocs = await this.vectorStoreService.retrieveRelevantMemories(node.content, threadId, { limit });

      const similarNodes: GraphNode[] = [];

      for (const doc of similarDocs) {
        // Try to find corresponding nodes
        const nodeIdFromDoc = doc.metadata?.nodeId as string;
        if (nodeIdFromDoc && nodeIdFromDoc !== nodeId) {
          const similarNode = this.nodes.get(nodeIdFromDoc);
          if (similarNode) {
            similarNodes.push(similarNode);
          }
        }
      }

      return similarNodes;
    } catch (error) {
      this.logger.error('Failed to get semantic neighbors:', error);
      return [];
    }
  }

  /**
   * Cluster nodes by similarity
   */
  @TraceAI({
    name: 'memory.graph_cluster',
    operation: 'graph_analysis',
  })
  async clusterNodes(
    options: { nodeTypes?: NodeType[]; minClusterSize?: number; similarityThreshold?: number } = {},
  ): Promise<Map<string, GraphNode[]>> {
    const { nodeTypes, minClusterSize = 2, similarityThreshold = 0.7 } = options;

    const clusters = new Map<string, GraphNode[]>();
    const processed = new Set<string>();

    for (const [nodeId, node] of this.nodes) {
      if (processed.has(nodeId)) {
        continue;
      }
      if (nodeTypes && !nodeTypes.includes(node.type)) {
        continue;
      }

      const cluster: GraphNode[] = [node];
      processed.add(nodeId);

      // Find strongly connected nodes
      const connected = await this.traverse(nodeId, {
        maxDepth: 2,
        minWeight: similarityThreshold,
        nodeTypes,
      });

      for (const connectedNode of connected.nodes) {
        if (!processed.has(connectedNode.id)) {
          cluster.push(connectedNode);
          processed.add(connectedNode.id);
        }
      }

      if (cluster.length >= minClusterSize) {
        const clusterId = `cluster-${clusters.size}`;
        clusters.set(clusterId, cluster);
      }
    }

    this.logger.debug(`Created ${clusters.size} clusters from ${this.nodes.size} nodes`);
    return clusters;
  }

  /**
   * Get graph statistics
   */
  getStatistics(): {
    nodeCount: number;
    edgeCount: number;
    nodeTypes: Map<NodeType, number>;
    edgeTypes: Map<EdgeType, number>;
    avgDegree: number;
    maxDegree: number;
  } {
    const nodeTypes = new Map<NodeType, number>();
    const edgeTypes = new Map<EdgeType, number>();
    let totalDegree = 0;
    let maxDegree = 0;

    for (const node of this.nodes.values()) {
      nodeTypes.set(node.type, (nodeTypes.get(node.type) || 0) + 1);

      const degree = (this.adjacencyList.get(node.id)?.size || 0) + (this.reverseAdjacencyList.get(node.id)?.size || 0);
      totalDegree += degree;
      maxDegree = Math.max(maxDegree, degree);
    }

    for (const edge of this.edges.values()) {
      edgeTypes.set(edge.type, (edgeTypes.get(edge.type) || 0) + 1);
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      nodeTypes,
      edgeTypes,
      avgDegree: this.nodes.size > 0 ? totalDegree / this.nodes.size : 0,
      maxDegree,
    };
  }

  /**
   * Clear the entire graph
   */
  async clearGraph(): Promise<void> {
    this.nodes.clear();
    this.edges.clear();
    this.adjacencyList.clear();
    this.reverseAdjacencyList.clear();
    this.logger.log('Graph memory cleared');
  }

  /**
   * Clear graph for a specific thread
   */
  async clearThreadGraph(threadId: string): Promise<void> {
    const nodesToRemove: string[] = [];

    for (const [nodeId, node] of this.nodes) {
      if (node.threadId === threadId) {
        nodesToRemove.push(nodeId);
      }
    }

    for (const nodeId of nodesToRemove) {
      this.removeNode(nodeId);
    }

    this.logger.log(`Cleared graph memory for thread ${threadId}`);
  }

  /**
   * Export graph to JSON format
   */
  exportToJSON(): {
    nodes: GraphNode[];
    edges: GraphEdge[];
  } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  /**
   * Import graph from JSON format
   */
  async importFromJSON(data: { nodes: GraphNode[]; edges: GraphEdge[] }): Promise<void> {
    // Clear existing graph
    await this.clearGraph();

    // Import nodes
    for (const node of data.nodes) {
      await this.addNode(node);
    }

    // Import edges
    for (const edge of data.edges) {
      await this.addEdge(edge);
    }

    this.logger.log(`Imported ${data.nodes.length} nodes and ${data.edges.length} edges`);
  }

  /**
   * Helper: Update node importance based on connections
   */
  private updateNodeImportance(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return;
    }

    const inDegree = this.reverseAdjacencyList.get(nodeId)?.size || 0;
    const outDegree = this.adjacencyList.get(nodeId)?.size || 0;

    // Simple PageRank-like importance calculation
    const importance = Math.min(1, (inDegree + outDegree) / 10);

    node.importance = Math.max(node.importance, importance);
    node.updatedAt = Date.now();
  }

  /**
   * Helper: Find edge between two nodes
   */
  private findEdge(sourceId: string, targetId: string): GraphEdge | null {
    // Try all edge types
    for (const edgeType of Object.values(EdgeType)) {
      const edgeId = `${sourceId}-${edgeType}-${targetId}`;
      const edge = this.edges.get(edgeId);
      if (edge) {
        return edge;
      }

      // Check reverse for bidirectional edges
      const reverseEdgeId = `${targetId}-${edgeType}-${sourceId}`;
      const reverseEdge = this.edges.get(reverseEdgeId);
      if (reverseEdge?.bidirectional) {
        return reverseEdge;
      }
    }
    return null;
  }

  /**
   * Helper: Remove a node and its edges
   */
  private removeNode(nodeId: string): void {
    // Remove all edges connected to this node
    const edgesToRemove: string[] = [];

    for (const [edgeId, edge] of this.edges) {
      if (edge.sourceId === nodeId || edge.targetId === nodeId) {
        edgesToRemove.push(edgeId);
      }
    }

    for (const edgeId of edgesToRemove) {
      this.edges.delete(edgeId);
    }

    // Update adjacency lists
    const neighbors = this.adjacencyList.get(nodeId) || new Set();
    for (const neighborId of neighbors) {
      this.reverseAdjacencyList.get(neighborId)?.delete(nodeId);
    }

    const reverseNeighbors = this.reverseAdjacencyList.get(nodeId) || new Set();
    for (const neighborId of reverseNeighbors) {
      this.adjacencyList.get(neighborId)?.delete(nodeId);
    }

    // Remove the node
    this.nodes.delete(nodeId);
    this.adjacencyList.delete(nodeId);
    this.reverseAdjacencyList.delete(nodeId);
  }
}
