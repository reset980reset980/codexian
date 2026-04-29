import type { App, TFile } from 'obsidian';

import type { CodexProvider } from '../agent/CodexProvider';
import type { AgentEvent, MemoryMapResult } from '../types';
import type { SukgoTool } from './SukgoTools';

export interface RunSukgoRequest {
  app: App;
  agent: CodexProvider;
  vaultPath: string;
  outputFolder: string;
  tool: SukgoTool;
  topic: string;
  activeFile: TFile | null;
  activeNoteContent: string;
  selectedText?: string;
  pinnedNotes: Array<{ path: string; content: string }>;
  relatedNotes: Array<MemoryMapResult & { content?: string }>;
  onProgress?: (message: string) => void;
}

export interface RunSukgoResult {
  path: string;
  content: string;
}

export async function runSukgoAnalysis(request: RunSukgoRequest): Promise<RunSukgoResult> {
  const prompt = buildSukgoPrompt(request);
  let response = '';
  const errors: string[] = [];

  for await (const event of request.agent.query({
    prompt,
    cwd: request.vaultPath,
    activeNotePath: request.activeFile?.path,
    activeNoteContent: request.activeNoteContent,
    selectedText: request.selectedText,
    pinnedNotes: buildPinnedNotes(request),
  })) {
    handleAgentEvent(event, request.onProgress, (text) => {
      response += text;
    }, errors);
  }

  if (errors.length > 0 && !response.trim()) {
    throw new Error(errors.join('\n'));
  }

  const content = buildSukgoNote(request, response.trim() || errors.join('\n'));
  const path = await writeSukgoNote(request.app, request.outputFolder, request.tool, request.topic, content);
  return { path, content };
}

function handleAgentEvent(
  event: AgentEvent,
  onProgress: RunSukgoRequest['onProgress'],
  appendText: (text: string) => void,
  errors: string[],
): void {
  if (event.type === 'progress') onProgress?.(event.content);
  if (event.type === 'text') appendText(event.content);
  if (event.type === 'error') errors.push(event.content);
}

function buildPinnedNotes(request: RunSukgoRequest): Array<{ path: string; content: string }> {
  const related = request.relatedNotes
    .filter((note): note is MemoryMapResult & { content: string } => Boolean(note.content?.trim()))
    .map((note) => ({
      path: note.path,
      content: [
        `관련 노트 점수: ${note.score}`,
        `추천 이유: ${note.reasons.join(', ') || '없음'}`,
        '',
        note.content,
      ].join('\n'),
    }));

  return [...request.pinnedNotes, ...related];
}

function buildSukgoPrompt(request: RunSukgoRequest): string {
  const source = request.activeFile
    ? `활성 노트: ${request.activeFile.path}`
    : '사용 가능한 활성 노트가 없습니다.';
  const topic = request.topic.trim()
    || request.selectedText?.trim()
    || request.activeFile?.basename
    || '제목 없는 Obsidian 주제';

  return [
    'Obsidian 안에서 Sukgo 스타일의 구조화 사고 워크플로를 실행한다.',
    '활성 노트, 선택 텍스트, 고정 노트, 관련 메모리 맵 노트를 근거로 사용한다.',
    '노트 컨텍스트로 확정할 수 없는 부분은 가정이라고 명확히 표시한다.',
    '원문이 다른 언어를 분명히 요구하지 않는 한 한국어로 작성한다.',
    '',
    `도구: ${request.tool.name}`,
    `도구 목적: ${request.tool.shortDescription}`,
    `출처: ${source}`,
    `주제: ${topic}`,
    '',
    '프레임워크 지시:',
    request.tool.prompt,
    '',
    '출력 요구사항:',
    '- Obsidian 친화적인 Markdown을 사용한다.',
    '- 짧은 결론으로 시작한다.',
    '- 노트/컨텍스트에서 온 근거와 추론을 분리한다.',
    '- 구체적인 다음 행동 또는 질문으로 마무리한다.',
  ].join('\n');
}

function buildSukgoNote(request: RunSukgoRequest, response: string): string {
  const now = new Date();
  const topic = request.topic.trim() || request.activeFile?.basename || '제목 없음';
  const sourceLink = request.activeFile ? `[[${request.activeFile.path.replace(/\.md$/i, '')}]]` : '';
  const relatedLinks = request.relatedNotes.map((note) => `[[${note.path.replace(/\.md$/i, '')}]]`);

  return [
    '---',
    `title: ${yamlString(`${request.tool.name} - ${topic}`)}`,
    `tool: ${yamlString(request.tool.id)}`,
    'mode: codexian-sukgo',
    `topic: ${yamlString(topic)}`,
    `source: ${yamlString(request.activeFile?.path || '')}`,
    `created: ${now.toISOString()}`,
    'tags:',
    '  - sukgo',
    `  - sukgo/${request.tool.id}`,
    '  - codexian',
    '---',
    '',
    `# ${request.tool.name} - ${topic}`,
    '',
    sourceLink ? `> [!info]+ 출처\n> ${sourceLink}` : '',
    relatedLinks.length > 0 ? `> [!tip]- 관련 메모리 맵 노트\n${relatedLinks.map((link) => `> - ${link}`).join('\n')}` : '',
    '',
    response,
    '',
    '---',
    '',
    '> [!quote]- 숙고 메타데이터',
    `> Codexian 숙고 생성 시각: ${now.toLocaleString()}`,
    `> 도구: ${request.tool.name}`,
  ].filter((line) => line !== '').join('\n');
}

async function writeSukgoNote(
  app: App,
  outputFolder: string,
  tool: SukgoTool,
  topic: string,
  content: string,
): Promise<string> {
  const folder = normalizeFolder(outputFolder || 'Sukgo');
  await ensureFolder(app, folder);
  const timestamp = formatTimestamp(new Date());
  const slug = slugify(topic || tool.name);
  let path = `${folder}/${timestamp}_${tool.id}_${slug}.md`;
  let counter = 2;
  while (await app.vault.adapter.exists(path)) {
    path = `${folder}/${timestamp}_${tool.id}_${slug}_${counter}.md`;
    counter += 1;
  }
  await app.vault.create(path, content);
  return path;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const parts = folder.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!await app.vault.adapter.exists(current)) {
      await app.vault.createFolder(current);
    }
  }
}

function normalizeFolder(folder: string): string {
  return folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') || 'Sukgo';
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('');
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .replace(/[\\/:*?"<>|#^[\]]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return slug || 'untitled';
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
