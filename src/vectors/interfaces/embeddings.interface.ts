// Strongly typed metadata interfaces
export interface DocumentMetadata {
  readonly [key: string]: string | number | boolean | null | undefined;
}

export interface VectorDocument {
  readonly content: string;
  readonly metadata?: DocumentMetadata;
}

export interface SearchResult {
  readonly content: string;
  readonly metadata?: DocumentMetadata;
  readonly score: number;
}

export interface VectorSearchOptions {
  readonly filter?: DocumentMetadata;
  readonly scoreThreshold?: number;
}

// Collection info with proper typing instead of any
export interface CollectionInfo {
  readonly name: string;
  readonly vectorsCount: number;
  readonly indexedVectorsCount: number;
  readonly pointsCount: number;
  readonly segmentsCount: number;
  readonly config: {
    readonly vectorSize: number;
    readonly distance: 'Cosine' | 'Dot' | 'Euclid';
  };
  readonly status: 'green' | 'yellow' | 'red';
}

export interface IEmbeddings {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(documents: readonly string[]): Promise<number[][]>;
  getDimensions(): number;
}

export interface IVectorStore {
  addDocuments(documents: readonly VectorDocument[], collectionName: string): Promise<void>;

  similaritySearch(query: string, k: number, collectionName: string, options?: VectorSearchOptions): Promise<readonly SearchResult[]>;

  deleteCollection(collectionName: string): Promise<void>;

  getCollectionInfo(collectionName: string): Promise<CollectionInfo>;
}
