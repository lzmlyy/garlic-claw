export interface McpEventQueryDto {
  limit?: string;
  level?: string;
  type?: string;
  keyword?: string;
  cursor?: string;
}

export interface McpServerDto {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  envEntries?: Array<{
    key: string;
    source?: 'env-ref' | 'literal' | 'stored-secret';
    value: string;
    hasStoredValue?: boolean;
  }>;
  eventLog?: {
    maxFileSizeMb?: number;
  };
}
