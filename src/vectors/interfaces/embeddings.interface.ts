export interface IEmbeddings {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(documents: string[]): Promise<number[][]>;
  getDimensions(): number;
}

export interface IVectorStore {
  addDocuments(documents: Array<{ content: string; metadata?: Record<string, any> }>, collectionName: string): Promise<void>;

  similaritySearch(
    query: string,
    k: number,
    collectionName: string,
    filter?: Record<string, any>,
  ): Promise<Array<{ content: string; metadata?: Record<string, any>; score: number }>>;

  deleteCollection(collectionName: string): Promise<void>;

  getCollectionInfo(collectionName: string): Promise<any>;
}
