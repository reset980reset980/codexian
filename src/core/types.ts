export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type PermissionMode = 'review' | 'auto' | 'yolo';
export type SukgoExecutionMode = 'single' | 'parallel' | 'auto';
export type SukgoProviderId = 'codex' | 'claude' | 'zai' | 'gemini' | 'openrouter' | 'ollama';
export type SukgoExternalEvidenceMode = 'summary' | 'excerpt' | 'link-only';
export type ImageMode =
  | 'infographic'
  | 'poster'
  | 'cartoon'
  | 'concept'
  | 'diagram'
  | 'thumbnail'
  | 'avatar'
  | 'product'
  | 'ecommerce'
  | 'ui';
export type VisualOutputType = 'png' | 'svg';

export interface MemoryMapEntry {
  path: string;
  title: string;
  folder: string;
  tags: string[];
  links: string[];
  headings: string[];
  keywords: string[];
  terms: Record<string, number>;
  length: number;
  mtime: number;
}

export interface MemoryMapIndex {
  version: 2;
  builtAt: number;
  entries: MemoryMapEntry[];
}

export interface MemoryMapResult {
  path: string;
  title: string;
  score: number;
  reasons: string[];
}

export interface CodexianSettings {
  codexCliPath: string;
  codexModel: string;
  reasoningEffort: ReasoningEffort;
  permissionMode: PermissionMode;
  autoIncludeActiveNote: boolean;
  pinnedNotePaths: string[];
  excludedNotePaths: string[];
  environmentVariables: string;
  mediaFolder: string;
  sukgoFolder: string;
  sukgoExecutionMode: SukgoExecutionMode;
  sukgoDebateProfile: string;
  sukgoDebateProvider: SukgoProviderId;
  sukgoExternalEvidenceEnabled: boolean;
  sukgoExternalEvidenceMode: SukgoExternalEvidenceMode;
  sukgoExternalEvidenceMaxChars: number;
  sukgoProviderModels: Partial<Record<SukgoProviderId, string>>;
  sukgoProviderConfig: {
    claudeCliPath: string;
    zAiApiKeyEnv: string;
    zAiBaseUrl: string;
    geminiApiKeyEnv: string;
    openRouterApiKeyEnv: string;
    openRouterBaseUrl: string;
    ollamaBaseUrl: string;
  };
  omx: {
    enabled: boolean;
    lastDoctorStatus: 'unknown' | 'pass' | 'warn' | 'fail';
    lastCheckedAt: number | null;
  };
  blockedCommands: {
    unix: string[];
    windows: string[];
  };
  allowedExportPaths: string[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: number;
}

export interface AgentQuery {
  prompt: string;
  cwd: string;
  activeNotePath?: string;
  activeNoteContent?: string;
  selectedText?: string;
  pinnedNotes?: Array<{ path: string; content: string }>;
  model?: string;
  reasoningEffort?: ReasoningEffort;
}

export type EvidenceSourceType = 'obsidian-note' | 'web-url' | 'youtube' | 'pdf' | 'paper';

export interface EvidenceSource {
  id: string;
  type: EvidenceSourceType;
  title: string;
  url?: string;
  path?: string;
  content: string;
  summary?: string;
  capturedAt: number;
  error?: string;
}

export interface EvidenceBundle {
  topic: string;
  activeNote?: EvidenceSource;
  selectedText?: string;
  pinnedNotes: EvidenceSource[];
  relatedNotes: EvidenceSource[];
  externalSources: EvidenceSource[];
}

export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'progress'; content: string }
  | { type: 'error'; content: string }
  | { type: 'done' };

export interface AgentProvider {
  query(input: AgentQuery): AsyncGenerator<AgentEvent>;
  cancel(): void;
  resetSession(): void;
  getSessionId(): string | null;
  setSessionId(id: string | null): void;
}

export const DEFAULT_SETTINGS: CodexianSettings = {
  codexCliPath: '',
  codexModel: 'gpt-5.5',
  reasoningEffort: 'high',
  permissionMode: 'review',
  autoIncludeActiveNote: true,
  pinnedNotePaths: [],
  excludedNotePaths: [],
  environmentVariables: '',
  mediaFolder: 'attachments/codexian',
  sukgoFolder: 'Sukgo',
  sukgoExecutionMode: 'single',
  sukgoDebateProfile: 'quick-3',
  sukgoDebateProvider: 'codex',
  sukgoExternalEvidenceEnabled: true,
  sukgoExternalEvidenceMode: 'summary',
  sukgoExternalEvidenceMaxChars: 6000,
  sukgoProviderModels: {
    codex: '',
    claude: '',
    zai: 'glm-4.7',
    gemini: 'gemini-2.5-pro',
    openrouter: '',
    ollama: 'llama3.1',
  },
  sukgoProviderConfig: {
    claudeCliPath: '',
    zAiApiKeyEnv: 'ZAI_API_KEY',
    zAiBaseUrl: 'https://api.z.ai/api/coding/paas/v4',
    geminiApiKeyEnv: 'GEMINI_API_KEY',
    openRouterApiKeyEnv: 'OPENROUTER_API_KEY',
    openRouterBaseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    ollamaBaseUrl: 'http://localhost:11434',
  },
  omx: {
    enabled: false,
    lastDoctorStatus: 'unknown',
    lastCheckedAt: null,
  },
  blockedCommands: {
    unix: ['rm -rf', 'chmod 777', 'chmod -R 777'],
    windows: ['Remove-Item -Recurse -Force', 'rd /s /q', 'del /s /q', 'format', 'diskpart'],
  },
  allowedExportPaths: [],
};
