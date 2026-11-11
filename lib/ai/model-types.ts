export interface ModelChoice { id: string; name: string }
export interface AIModelStatus {
  configured: boolean;
  provider?: string;
  model?: string;
  remote?: boolean;
  models?: ModelChoice[];
  modelSource?: 'copilot-live' | 'configured' | 'sdk-catalog';
  providerLabel?: string;
  checkedAt?: string;
  warning?: string;
  error?: string;
}
