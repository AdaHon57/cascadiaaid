export interface IntakeStatement {
  bind(...values: unknown[]): IntakeStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface IntakeDatabase {
  prepare(sql: string): IntakeStatement;
}
export interface IntakeBucket {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
  get(
    key: string,
  ): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}
export interface IntakeEnvironment {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  DB: IntakeDatabase;
  DOCUMENTS: IntakeBucket;
}
