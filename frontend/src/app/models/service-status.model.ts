export type ServiceState = 'UP' | 'DOWN' | 'UNKNOWN';

export interface ServiceStatus {
  name: string;
  baseUrl: string;
  endpoint: string;
  state: ServiceState;
  statusCode?: number;
  latencyMs?: number;
  message: string;
  checkedAt?: string;
}
