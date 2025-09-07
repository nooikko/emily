import { Document } from '@langchain/core/documents';
import { Test, TestingModule } from '@nestjs/testing';
import { VectorStoreService } from '../../../vectors/services/vector-store.service';
import { EdgeType, GraphMemory, GraphNode, NodeType } from '../graph.memory';

describe('GraphMemory', () => {
  let graphMemory: GraphMemory;
  let vectorStoreService: jest.Mocked<VectorStoreService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphMemory,
        {
          provide: VectorStoreService,
          useValue: {
            retrieveRelevantMemories: jest.fn(),
          },
        },
      ],
    }).compile();

    graphMemory = module.get<GraphMemory>(GraphMemory);
    vectorStoreService = module.get(VectorStoreService);
  });

  describe('Node Management', () => {
    it('should add a node to the graph', async () => {
      const node = await graphMemory.addNode({
        id: 'node1',
        type: NodeType.ENTITY,
        label: 'Test Entity',
        content: 'This is a test entity',
        properties: { key: 'value' },
        importance: 0.8,
      });

      expect(node).toBeDefined();
      expect(node.id).toBe('node1');
      expect(node.type).toBe(NodeType.ENTITY);
      expect(node.createdAt).toBeDefined();
      expect(node.updatedAt).toBeDefined();
    });

    it('should merge properties when adding duplicate node', async () => {
      await graphMemory.addNode({
        id: 'node1',
        type: NodeType.ENTITY,
        label: 'Test Entity',
        content: 'Original content',
        properties: { key1: 'value1' },
        importance: 0.5,
      });

      const updated = await graphMemory.addNode({
        id: 'node1',
        type: NodeType.ENTITY,
        label: 'Test Entity Updated',
        content: 'Updated content',
        properties: { key2: 'value2' },
        importance: 0.8,
      });

      expect(updated.importance).toBe(0.8); // Takes max importance
      expect(updated.properties).toEqual({ key1: 'value1', key2: 'value2' });
      expect(updated.content).toBe('Updated content');
    });

    it('should handle different node types', async () => {
      const entity = await graphMemory.addNode({
        id: 'entity1',
        type: NodeType.ENTITY,
        label: 'Person',
        content: 'John Doe',
        properties: {},
        importance: 0.7,
      });

      const concept = await graphMemory.addNode({
        id: 'concept1',
        type: NodeType.CONCEPT,
        label: 'AI',
        content: 'Artificial Intelligence',
        properties: {},
        importance: 0.9,
      });

      const event = await graphMemory.addNode({
        id: 'event1',
        type: NodeType.EVENT,
        label: 'Meeting',
        content: 'Team meeting at 3pm',
        properties: { time: '3pm' },
        importance: 0.6,
      });

      expect(entity.type).toBe(NodeType.ENTITY);
      expect(concept.type).toBe(NodeType.CONCEPT);
      expect(event.type).toBe(NodeType.EVENT);
    });
  });

  describe('Edge Management', () => {
    beforeEach(async () => {
      await graphMemory.addNode({
        id: 'node1',
        type: NodeType.ENTITY,
        label: 'Entity 1',
        content: 'Content 1',
        properties: {},
        importance: 0.5,
      });

      await graphMemory.addNode({
        id: 'node2',
        type: NodeType.ENTITY,
        label: 'Entity 2',
        content: 'Content 2',
        properties: {},
        importance: 0.5,
      });
    });

    it('should add an edge between nodes', async () => {
      const edge = await graphMemory.addEdge({
        sourceId: 'node1',
        targetId: 'node2',
        type: EdgeType.RELATES_TO,
        weight: 0.7,
        properties: { context: 'test' },
        bidirectional: false,
      });

      expect(edge).toBeDefined();
      expect(edge.id).toBe('node1-relates_to-node2');
      expect(edge.sourceId).toBe('node1');
      expect(edge.targetId).toBe('node2');
      expect(edge.weight).toBe(0.7);
    });

    it('should throw error when adding edge with non-existent nodes', async () => {
      await expect(
        graphMemory.addEdge({
          sourceId: 'nonexistent1',
          targetId: 'nonexistent2',
          type: EdgeType.RELATES_TO,
          weight: 0.5,
          properties: {},
          bidirectional: false,
        }),
      ).rejects.toThrow('Cannot add edge: one or both nodes do not exist');
    });

    it('should handle bidirectional edges', async () => {
      await graphMemory.addEdge({
        sourceId: 'node1',
        targetId: 'node2',
        type: EdgeType.SIMILAR_TO,
        weight: 0.9,
        properties: {},
        bidirectional: true,
      });

      // Both directions should be traversable
      const fromNode1 = await graphMemory.traverse('node1', { maxDepth: 1 });
      const fromNode2 = await graphMemory.traverse('node2', { maxDepth: 1 });

      expect(fromNode1.nodes).toHaveLength(2);
      expect(fromNode2.nodes).toHaveLength(2);
    });

    it('should merge edge properties when adding duplicate edge', async () => {
      await graphMemory.addEdge({
        sourceId: 'node1',
        targetId: 'node2',
        type: EdgeType.RELATES_TO,
        weight: 0.5,
        properties: { prop1: 'value1' },
        bidirectional: false,
      });

      const updated = await graphMemory.addEdge({
        sourceId: 'node1',
        targetId: 'node2',
        type: EdgeType.RELATES_TO,
        weight: 0.8,
        properties: { prop2: 'value2' },
        bidirectional: false,
      });

      expect(updated.weight).toBe(0.8); // Takes max weight
      expect(updated.properties).toEqual({ prop1: 'value1', prop2: 'value2' });
    });
  });

  describe('Node and Edge Extraction', () => {
    it('should extract entities from text', async () => {
      const text = 'John Smith met Sarah Johnson at Microsoft headquarters in Seattle.';
      const { nodes } = await graphMemory.extractNodesAndEdges(text, 'thread1');

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.some((n) => n.label === 'John')).toBe(true);
      expect(nodes.some((n) => n.label === 'Smith')).toBe(true);
      expect(nodes.some((n) => n.label === 'Sarah')).toBe(true);
      expect(nodes.some((n) => n.label === 'Microsoft')).toBe(true);
      expect(nodes.some((n) => n.label === 'Seattle')).toBe(true);
    });

    it('should create relationships between co-occurring entities', async () => {
      const text = 'Alice and Bob work together on Project X.';
      const { edges } = await graphMemory.extractNodesAndEdges(text);

      expect(edges.length).toBeGreaterThan(0);
      expect(edges.every((e) => e.type === EdgeType.RELATES_TO)).toBe(true);
      expect(edges.every((e) => e.bidirectional)).toBe(true);
    });

    it('should respect extraction configuration', async () => {
      const text = 'Test Entity appears in this text.';
      const { nodes } = await graphMemory.extractNodesAndEdges(text, 'thread1', {
        extractTypes: [NodeType.ENTITY],
        minConfidence: 0.8,
        mergeExisting: true,
      });

      expect(nodes.every((n) => n.type === NodeType.ENTITY)).toBe(true);
      expect(nodes.every((n) => (n.properties.confidence as number) >= 0.7)).toBe(true);
    });
  });

  describe('Graph Traversal', () => {
    beforeEach(async () => {
      // Create a small graph for testing
      await graphMemory.addNode({
        id: 'a',
        type: NodeType.ENTITY,
        label: 'A',
        content: 'Node A',
        properties: {},
        importance: 0.9,
      });

      await graphMemory.addNode({
        id: 'b',
        type: NodeType.ENTITY,
        label: 'B',
        content: 'Node B',
        properties: {},
        importance: 0.7,
      });

      await graphMemory.addNode({
        id: 'c',
        type: NodeType.CONCEPT,
        label: 'C',
        content: 'Node C',
        properties: {},
        importance: 0.5,
      });

      await graphMemory.addNode({
        id: 'd',
        type: NodeType.EVENT,
        label: 'D',
        content: 'Node D',
        properties: {},
        importance: 0.3,
      });

      await graphMemory.addEdge({
        sourceId: 'a',
        targetId: 'b',
        type: EdgeType.RELATES_TO,
        weight: 0.8,
        properties: {},
        bidirectional: false,
      });

      await graphMemory.addEdge({
        sourceId: 'b',
        targetId: 'c',
        type: EdgeType.SUPPORTS,
        weight: 0.6,
        properties: {},
        bidirectional: false,
      });

      await graphMemory.addEdge({
        sourceId: 'c',
        targetId: 'd',
        type: EdgeType.CAUSED_BY,
        weight: 0.4,
        properties: {},
        bidirectional: false,
      });
    });

    it('should traverse graph with depth limit', async () => {
      const result = await graphMemory.traverse('a', { maxDepth: 2 });

      expect(result.nodes).toHaveLength(3); // a, b, c (not d due to depth limit)
      expect(result.nodes.map((n) => n.id)).toContain('a');
      expect(result.nodes.map((n) => n.id)).toContain('b');
      expect(result.nodes.map((n) => n.id)).toContain('c');
      expect(result.nodes.map((n) => n.id)).not.toContain('d');
    });

    it('should filter by node types during traversal', async () => {
      const result = await graphMemory.traverse('a', {
        maxDepth: 3,
        nodeTypes: [NodeType.ENTITY],
      });

      expect(result.nodes).toHaveLength(2); // Only a and b (both entities)
      expect(result.nodes.every((n) => n.type === NodeType.ENTITY)).toBe(true);
    });

    it('should filter by edge types during traversal', async () => {
      const result = await graphMemory.traverse('a', {
        maxDepth: 3,
        edgeTypes: [EdgeType.RELATES_TO],
        includeEdges: true,
      });

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].type).toBe(EdgeType.RELATES_TO);
    });

    it('should respect weight threshold', async () => {
      const result = await graphMemory.traverse('a', {
        maxDepth: 3,
        minWeight: 0.7,
        includeEdges: true,
      });

      expect(result.edges.every((e) => e.weight >= 0.7)).toBe(true);
    });

    it('should sort by importance when requested', async () => {
      const result = await graphMemory.traverse('a', {
        maxDepth: 3,
        sortByImportance: true,
      });

      const importances = result.nodes.map((n) => n.importance);
      expect(importances).toEqual([...importances].sort((a, b) => b - a));
    });

    it('should throw error for non-existent start node', async () => {
      await expect(graphMemory.traverse('nonexistent', {})).rejects.toThrow('Start node nonexistent not found');
    });
  });

  describe('Path Finding', () => {
    beforeEach(async () => {
      // Create a graph with multiple paths
      for (let i = 1; i <= 5; i++) {
        await graphMemory.addNode({
          id: `node${i}`,
          type: NodeType.ENTITY,
          label: `Node ${i}`,
          content: `Content ${i}`,
          properties: {},
          importance: 0.5,
        });
      }

      // Create edges: 1->2->3->4->5 and 1->5 (shortcut)
      await graphMemory.addEdge({
        sourceId: 'node1',
        targetId: 'node2',
        type: EdgeType.FOLLOWS,
        weight: 0.8,
        properties: {},
        bidirectional: false,
      });

      await graphMemory.addEdge({
        sourceId: 'node2',
        targetId: 'node3',
        type: EdgeType.FOLLOWS,
        weight: 0.8,
        properties: {},
        bidirectional: false,
      });

      await graphMemory.addEdge({
        sourceId: 'node3',
        targetId: 'node4',
        type: EdgeType.FOLLOWS,
        weight: 0.8,
        properties: {},
        bidirectional: false,
      });

      await graphMemory.addEdge({
        sourceId: 'node4',
        targetId: 'node5',
        type: EdgeType.FOLLOWS,
        weight: 0.8,
        properties: {},
        bidirectional: false,
      });

      await graphMemory.addEdge({
        sourceId: 'node1',
        targetId: 'node5',
        type: EdgeType.RELATES_TO,
        weight: 0.9,
        properties: {},
        bidirectional: false,
      });
    });

    it('should find shortest path between nodes', async () => {
      const path = await graphMemory.findPath('node1', 'node5');

      expect(path).toBeDefined();
      expect(path![0].id).toBe('node1');
      expect(path![path!.length - 1].id).toBe('node5');
      expect(path!.length).toBe(2); // Shortest path is the direct edge
    });

    it('should respect edge type filters in path finding', async () => {
      const path = await graphMemory.findPath('node1', 'node5', {
        edgeTypes: [EdgeType.FOLLOWS],
      });

      expect(path).toBeDefined();
      expect(path!.length).toBe(5); // Must go through all nodes
    });

    it('should return null for unreachable nodes', async () => {
      await graphMemory.addNode({
        id: 'isolated',
        type: NodeType.ENTITY,
        label: 'Isolated',
        content: 'Isolated node',
        properties: {},
        importance: 0.5,
      });

      const path = await graphMemory.findPath('node1', 'isolated');
      expect(path).toBeNull();
    });

    it('should respect max depth in path finding', async () => {
      const path = await graphMemory.findPath('node1', 'node5', {
        maxDepth: 1,
        edgeTypes: [EdgeType.FOLLOWS],
      });

      expect(path).toBeNull(); // Can't reach in 1 step with FOLLOWS edges
    });
  });

  describe('Semantic Neighbors', () => {
    it('should find semantically similar nodes', async () => {
      await graphMemory.addNode({
        id: 'dog',
        type: NodeType.CONCEPT,
        label: 'Dog',
        content: 'A domestic canine animal',
        properties: {},
        importance: 0.7,
      });

      await graphMemory.addNode({
        id: 'cat',
        type: NodeType.CONCEPT,
        label: 'Cat',
        content: 'A domestic feline animal',
        properties: {},
        importance: 0.7,
      });

      vectorStoreService.retrieveRelevantMemories.mockResolvedValue([
        {
          pageContent: 'A domestic feline animal',
          metadata: { nodeId: 'cat' },
        },
      ] as Document[]);

      const neighbors = await graphMemory.getSemanticNeighbors('dog', 5);

      expect(vectorStoreService.retrieveRelevantMemories).toHaveBeenCalledWith('A domestic canine animal', undefined, { limit: 5 });
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].id).toBe('cat');
    });

    it('should handle vector store errors gracefully', async () => {
      await graphMemory.addNode({
        id: 'test',
        type: NodeType.ENTITY,
        label: 'Test',
        content: 'Test content',
        properties: {},
        importance: 0.5,
      });

      vectorStoreService.retrieveRelevantMemories.mockRejectedValue(new Error('Vector store error'));

      const neighbors = await graphMemory.getSemanticNeighbors('test', 5);
      expect(neighbors).toEqual([]);
    });

    it('should throw error for non-existent node', async () => {
      await expect(graphMemory.getSemanticNeighbors('nonexistent', 5)).rejects.toThrow('Node nonexistent not found');
    });
  });

  describe('Clustering', () => {
    beforeEach(async () => {
      // Create a graph with natural clusters
      // Cluster 1: People
      await graphMemory.addNode({
        id: 'alice',
        type: NodeType.ENTITY,
        label: 'Alice',
        content: 'Alice is a developer',
        properties: {},
        importance: 0.8,
      });

      await graphMemory.addNode({
        id: 'bob',
        type: NodeType.ENTITY,
        label: 'Bob',
        content: 'Bob is a designer',
        properties: {},
        importance: 0.7,
      });

      await graphMemory.addEdge({
        sourceId: 'alice',
        targetId: 'bob',
        type: EdgeType.INTERACTS_WITH,
        weight: 0.9,
        properties: {},
        bidirectional: true,
      });

      // Cluster 2: Locations
      await graphMemory.addNode({
        id: 'office',
        type: NodeType.LOCATION,
        label: 'Office',
        content: 'Main office building',
        properties: {},
        importance: 0.6,
      });

      await graphMemory.addNode({
        id: 'conference',
        type: NodeType.LOCATION,
        label: 'Conference Room',
        content: 'Conference room A',
        properties: {},
        importance: 0.5,
      });

      await graphMemory.addEdge({
        sourceId: 'office',
        targetId: 'conference',
        type: EdgeType.PART_OF,
        weight: 0.8,
        properties: {},
        bidirectional: false,
      });
    });

    it('should cluster strongly connected nodes', async () => {
      const clusters = await graphMemory.clusterNodes({
        minClusterSize: 2,
        similarityThreshold: 0.7,
      });

      expect(clusters.size).toBeGreaterThan(0);

      for (const [_clusterId, nodes] of clusters) {
        expect(nodes.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should filter clusters by node type', async () => {
      const clusters = await graphMemory.clusterNodes({
        nodeTypes: [NodeType.ENTITY],
        minClusterSize: 2,
      });

      for (const [_, nodes] of clusters) {
        expect(nodes.every((n) => n.type === NodeType.ENTITY)).toBe(true);
      }
    });

    it('should respect minimum cluster size', async () => {
      const clusters = await graphMemory.clusterNodes({
        minClusterSize: 3,
        similarityThreshold: 0.5,
      });

      for (const [_, nodes] of clusters) {
        expect(nodes.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('Graph Statistics', () => {
    beforeEach(async () => {
      await graphMemory.addNode({
        id: 'n1',
        type: NodeType.ENTITY,
        label: 'N1',
        content: 'Node 1',
        properties: {},
        importance: 0.5,
      });

      await graphMemory.addNode({
        id: 'n2',
        type: NodeType.CONCEPT,
        label: 'N2',
        content: 'Node 2',
        properties: {},
        importance: 0.5,
      });

      await graphMemory.addNode({
        id: 'n3',
        type: NodeType.EVENT,
        label: 'N3',
        content: 'Node 3',
        properties: {},
        importance: 0.5,
      });

      await graphMemory.addEdge({
        sourceId: 'n1',
        targetId: 'n2',
        type: EdgeType.RELATES_TO,
        weight: 0.5,
        properties: {},
        bidirectional: true,
      });

      await graphMemory.addEdge({
        sourceId: 'n2',
        targetId: 'n3',
        type: EdgeType.CAUSED_BY,
        weight: 0.5,
        properties: {},
        bidirectional: false,
      });
    });

    it('should calculate graph statistics correctly', () => {
      const stats = graphMemory.getStatistics();

      expect(stats.nodeCount).toBe(3);
      expect(stats.edgeCount).toBe(2);
      expect(stats.nodeTypes.get(NodeType.ENTITY)).toBe(1);
      expect(stats.nodeTypes.get(NodeType.CONCEPT)).toBe(1);
      expect(stats.nodeTypes.get(NodeType.EVENT)).toBe(1);
      expect(stats.edgeTypes.get(EdgeType.RELATES_TO)).toBe(1);
      expect(stats.edgeTypes.get(EdgeType.CAUSED_BY)).toBe(1);
      expect(stats.avgDegree).toBeGreaterThan(0);
    });

    it('should handle empty graph statistics', async () => {
      await graphMemory.clearGraph();
      const stats = graphMemory.getStatistics();

      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
      expect(stats.avgDegree).toBe(0);
      expect(stats.maxDegree).toBe(0);
    });
  });

  describe('Graph Import/Export', () => {
    it('should export graph to JSON', async () => {
      await graphMemory.addNode({
        id: 'export1',
        type: NodeType.ENTITY,
        label: 'Export Test',
        content: 'Test export',
        properties: { test: true },
        importance: 0.5,
      });

      await graphMemory.addNode({
        id: 'export2',
        type: NodeType.CONCEPT,
        label: 'Export Test 2',
        content: 'Test export 2',
        properties: {},
        importance: 0.6,
      });

      await graphMemory.addEdge({
        sourceId: 'export1',
        targetId: 'export2',
        type: EdgeType.RELATES_TO,
        weight: 0.7,
        properties: { exported: true },
        bidirectional: false,
      });

      const exported = graphMemory.exportToJSON();

      expect(exported.nodes).toHaveLength(2);
      expect(exported.edges).toHaveLength(1);
      expect(exported.nodes[0].id).toBe('export1');
      expect(exported.edges[0].sourceId).toBe('export1');
    });

    it('should import graph from JSON', async () => {
      const data = {
        nodes: [
          {
            id: 'import1',
            type: NodeType.ENTITY,
            label: 'Import Test',
            content: 'Test import',
            properties: {},
            importance: 0.5,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          } as GraphNode,
        ],
        edges: [
          {
            id: 'edge1',
            sourceId: 'import1',
            targetId: 'import1',
            type: EdgeType.RELATES_TO,
            weight: 0.5,
            properties: {},
            createdAt: Date.now(),
            bidirectional: false,
          },
        ],
      };

      // First add the node so edge can be added
      await graphMemory.addNode(data.nodes[0]);

      await graphMemory.importFromJSON(data);

      const stats = graphMemory.getStatistics();
      expect(stats.nodeCount).toBe(1);
      expect(stats.edgeCount).toBe(1);
    });
  });

  describe('Graph Cleanup', () => {
    beforeEach(async () => {
      await graphMemory.addNode({
        id: 'thread1-node',
        type: NodeType.ENTITY,
        label: 'Thread 1 Node',
        content: 'Node in thread 1',
        properties: {},
        importance: 0.5,
        threadId: 'thread1',
      });

      await graphMemory.addNode({
        id: 'thread2-node',
        type: NodeType.ENTITY,
        label: 'Thread 2 Node',
        content: 'Node in thread 2',
        properties: {},
        importance: 0.5,
        threadId: 'thread2',
      });

      await graphMemory.addNode({
        id: 'global-node',
        type: NodeType.CONCEPT,
        label: 'Global Node',
        content: 'Global node',
        properties: {},
        importance: 0.5,
      });
    });

    it('should clear entire graph', async () => {
      await graphMemory.clearGraph();

      const stats = graphMemory.getStatistics();
      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
    });

    it('should clear thread-specific nodes', async () => {
      await graphMemory.clearThreadGraph('thread1');

      const stats = graphMemory.getStatistics();
      expect(stats.nodeCount).toBe(2); // thread2-node and global-node remain

      const result = await graphMemory.traverse('thread2-node', {});
      expect(result.nodes[0].id).toBe('thread2-node');
    });

    it('should handle clearing non-existent thread', async () => {
      await graphMemory.clearThreadGraph('nonexistent');

      const stats = graphMemory.getStatistics();
      expect(stats.nodeCount).toBe(3); // All nodes remain
    });
  });
});
