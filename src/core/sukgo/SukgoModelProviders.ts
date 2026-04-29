import { spawn } from 'child_process';

import type { CodexProvider } from '../agent/CodexProvider';
import { buildProcessEnv } from '../settings/env';
import type {
  AgentEvent,
  CodexianSettings,
  EvidenceBundle,
  ReasoningEffort,
  SukgoProviderId,
} from '../types';

export interface ModelProviderRequest {
  prompt: string;
  cwd: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  evidence: EvidenceBundle;
  activeNotePath?: string;
  activeNoteContent?: string;
  selectedText?: string;
  pinnedNotes?: Array<{ path: string; content: string }>;
}

export interface ModelProvider {
  id: SukgoProviderId;
  displayName: string;
  query(request: ModelProviderRequest): AsyncGenerator<AgentEvent>;
}

export function createSukgoModelProvider(
  providerId: SukgoProviderId,
  agent: CodexProvider,
  settings: CodexianSettings,
): ModelProvider {
  if (providerId === 'codex') return new CodexModelProvider(agent, settings);
  if (providerId === 'openrouter') return new OpenAiCompatibleProvider('openrouter', 'OpenRouter', settings);
  if (providerId === 'zai') return new OpenAiCompatibleProvider('zai', 'z.ai', settings);
  if (providerId === 'gemini') return new GeminiProvider(settings);
  if (providerId === 'ollama') return new OllamaProvider(settings);
  return new ClaudeCliProvider(settings);
}

class CodexModelProvider implements ModelProvider {
  id: SukgoProviderId = 'codex';
  displayName = 'Codex';

  constructor(private agent: CodexProvider, private settings: CodexianSettings) {}

  async *query(request: ModelProviderRequest): AsyncGenerator<AgentEvent> {
    yield* this.agent.query({
      prompt: request.prompt,
      cwd: request.cwd,
      activeNotePath: request.activeNotePath,
      activeNoteContent: request.activeNoteContent,
      selectedText: request.selectedText,
      pinnedNotes: request.pinnedNotes,
      model: request.model || this.settings.codexModel,
      reasoningEffort: request.reasoningEffort,
    });
  }
}

class OpenAiCompatibleProvider implements ModelProvider {
  constructor(
    public id: Extract<SukgoProviderId, 'openrouter' | 'zai'>,
    public displayName: string,
    private settings: CodexianSettings,
  ) {}

  async *query(request: ModelProviderRequest): AsyncGenerator<AgentEvent> {
    const config = this.settings.sukgoProviderConfig;
    const env = buildProcessEnv(this.settings.environmentVariables);
    const apiKeyEnv = this.id === 'openrouter' ? config.openRouterApiKeyEnv : config.zAiApiKeyEnv;
    const baseUrl = this.id === 'openrouter' ? config.openRouterBaseUrl : resolveChatCompletionsUrl(config.zAiBaseUrl);
    const apiKey = env[apiKeyEnv];
    const model = request.model || this.settings.sukgoProviderModels[this.id] || '';
    if (!apiKey) {
      yield { type: 'error', content: `${this.displayName} API key is missing. Set ${apiKeyEnv} in Codexian environment variables.` };
      yield { type: 'done' };
      return;
    }
    if (!model) {
      yield { type: 'error', content: `${this.displayName} model is empty. Configure the Sukgo provider model in settings.` };
      yield { type: 'done' };
      return;
    }

    try {
      yield { type: 'progress', content: `${this.displayName} 요청 중...` };
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are an Obsidian Sukgo reasoning provider. Answer in Korean unless the source requires another language.' },
            { role: 'user', content: request.prompt },
          ],
          temperature: 0.2,
        }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
      const json = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
      yield { type: 'text', content: json.choices?.[0]?.message?.content?.trim() || '' };
    } catch (error) {
      yield { type: 'error', content: error instanceof Error ? error.message : String(error) };
    }
    yield { type: 'done' };
  }
}

function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/g, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

class GeminiProvider implements ModelProvider {
  id: SukgoProviderId = 'gemini';
  displayName = 'Gemini';

  constructor(private settings: CodexianSettings) {}

  async *query(request: ModelProviderRequest): AsyncGenerator<AgentEvent> {
    const env = buildProcessEnv(this.settings.environmentVariables);
    const apiKeyEnv = this.settings.sukgoProviderConfig.geminiApiKeyEnv;
    const apiKey = env[apiKeyEnv];
    const model = request.model || this.settings.sukgoProviderModels.gemini || 'gemini-2.5-pro';
    if (!apiKey) {
      yield { type: 'error', content: `Gemini API key is missing. Set ${apiKeyEnv} in Codexian environment variables.` };
      yield { type: 'done' };
      return;
    }

    try {
      yield { type: 'progress', content: 'Gemini 요청 중...' };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
        }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
      const json = JSON.parse(text) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      yield { type: 'text', content: json.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '' };
    } catch (error) {
      yield { type: 'error', content: error instanceof Error ? error.message : String(error) };
    }
    yield { type: 'done' };
  }
}

class OllamaProvider implements ModelProvider {
  id: SukgoProviderId = 'ollama';
  displayName = 'Ollama';

  constructor(private settings: CodexianSettings) {}

  async *query(request: ModelProviderRequest): AsyncGenerator<AgentEvent> {
    const model = request.model || this.settings.sukgoProviderModels.ollama || 'llama3.1';
    const baseUrl = this.settings.sukgoProviderConfig.ollamaBaseUrl.replace(/\/+$/g, '');
    try {
      yield { type: 'progress', content: 'Ollama 요청 중...' };
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: request.prompt, stream: false }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
      const json = JSON.parse(text) as { response?: string };
      yield { type: 'text', content: json.response?.trim() || '' };
    } catch (error) {
      yield { type: 'error', content: error instanceof Error ? error.message : String(error) };
    }
    yield { type: 'done' };
  }
}

class ClaudeCliProvider implements ModelProvider {
  id: SukgoProviderId = 'claude';
  displayName = 'Claude CLI';

  constructor(private settings: CodexianSettings) {}

  async *query(request: ModelProviderRequest): AsyncGenerator<AgentEvent> {
    const command = this.settings.sukgoProviderConfig.claudeCliPath.trim() || 'claude';
    const args = request.model ? ['-p', request.prompt, '--model', request.model] : ['-p', request.prompt];
    yield* runCliProvider(command, args, buildProcessEnv(this.settings.environmentVariables), request.cwd, this.displayName);
  }
}

async function *runCliProvider(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  displayName: string,
): AsyncGenerator<AgentEvent> {
  yield { type: 'progress', content: `${displayName} 실행 중...` };
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  let done = false;
  let code: number | null = null;

  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.on('error', (error) => {
    stderr += error.message;
    done = true;
  });
  child.on('close', (exitCode) => {
    code = exitCode;
    done = true;
  });

  while (!done) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  if (code && code !== 0) {
    yield { type: 'error', content: `${displayName} exited with code ${code}.\n${stderr.trim()}` };
  } else if (stderr.trim() && !stdout.trim()) {
    yield { type: 'error', content: stderr.trim() };
  } else {
    yield { type: 'text', content: stdout.trim() };
  }
  yield { type: 'done' };
}
