import type { App, TFile } from 'obsidian';

import type { CodexProvider } from '../agent/CodexProvider';
import type { AgentEvent, CodexianSettings, EvidenceBundle, EvidenceSource, MemoryMapResult, SukgoProviderId } from '../types';
import type { SukgoDebateProfile, SukgoDebateResponse, SukgoDebateRole } from './SukgoDebateProfiles';
import { createSukgoModelProvider } from './SukgoModelProviders';
import type { SukgoTool } from './SukgoTools';

export interface RunSukgoRequest {
  app: App;
  agent: CodexProvider;
  settings: CodexianSettings;
  vaultPath: string;
  outputFolder: string;
  tool: SukgoTool;
  providerId: SukgoProviderId;
  topic: string;
  activeFile: TFile | null;
  activeNoteContent: string;
  selectedText?: string;
  pinnedNotes: Array<{ path: string; content: string }>;
  relatedNotes: Array<MemoryMapResult & { content?: string }>;
  externalSources: EvidenceSource[];
  onProgress?: (message: string) => void;
}

export interface RunSukgoResult {
  path: string;
  content: string;
}

export interface RunSukgoDebateRequest extends RunSukgoRequest {
  profile: SukgoDebateProfile;
}

export async function runSukgoAnalysis(request: RunSukgoRequest): Promise<RunSukgoResult> {
  const prompt = buildSukgoPrompt(request);
  const { response, errors } = await runAgentPrompt(request, prompt);

  if (errors.length > 0 && !response.trim()) {
    throw new Error(errors.join('\n'));
  }

  const content = buildSukgoNote(request, response.trim() || errors.join('\n'));
  const path = await writeSukgoNote(request.app, request.outputFolder, request.tool, request.topic, content);
  return { path, content };
}

export async function runSukgoDebate(request: RunSukgoDebateRequest): Promise<RunSukgoResult> {
  const roleSettled = await Promise.allSettled(
    request.profile.roles.map((role) => runSukgoDebateRole(request, role)),
  );
  const roleResponses = roleSettled.map((result, index): SukgoDebateResponse => {
    const role = request.profile.roles[index];
    if (result.status === 'fulfilled') return result.value;
    return {
      roleId: role.id,
      roleName: role.name,
      provider: role.provider,
      model: role.model || 'current',
      content: '',
      errors: [result.reason instanceof Error ? result.reason.message : String(result.reason)],
    };
  });

  const synthesizerPrompt = buildSukgoSynthesisPrompt(request, roleResponses);
  const synthesis = await runAgentPrompt(
    request,
    synthesizerPrompt,
    request.profile.synthesizer,
    `중재: ${request.profile.synthesizer.name}`,
  );
  const synthesized = synthesis.response.trim() || buildFallbackDebateSummary(roleResponses, synthesis.errors);
  const content = buildSukgoDebateNote(request, roleResponses, synthesized, synthesis.errors);
  const path = await writeSukgoDebateNote(request.app, request.outputFolder, request.tool, request.topic, content);
  return { path, content };
}

async function runSukgoDebateRole(
  request: RunSukgoDebateRequest,
  role: SukgoDebateRole,
): Promise<SukgoDebateResponse> {
  const resolvedRole = resolveRole(request, role);
  const prompt = buildSukgoRolePrompt(request, role);
  const { response, errors } = await runAgentPrompt(request, prompt, resolvedRole, `역할: ${role.name}`);
  return {
    roleId: role.id,
    roleName: role.name,
    provider: resolvedRole.provider,
    model: resolvedRole.model || 'current',
    content: response.trim(),
    errors,
  };
}

async function runAgentPrompt(
  request: RunSukgoRequest,
  prompt: string,
  role?: SukgoDebateRole,
  progressPrefix?: string,
): Promise<{ response: string; errors: string[] }> {
  let response = '';
  const errors: string[] = [];
  const resolvedRole = role || resolveSingleRunRole(request);
  const provider = createSukgoModelProvider(resolvedRole.provider, request.agent, request.settings);

  for await (const event of provider.query({
    prompt,
    cwd: request.vaultPath,
    evidence: buildEvidenceBundle(request),
    activeNotePath: request.activeFile?.path,
    activeNoteContent: request.activeNoteContent,
    selectedText: request.selectedText,
    pinnedNotes: buildPinnedNotes(request),
    model: resolvedRole.model,
    reasoningEffort: resolvedRole.reasoningEffort,
  })) {
    handleAgentEvent(event, (message) => {
      request.onProgress?.(progressPrefix ? `${progressPrefix} - ${message}` : message);
    }, (text) => {
      response += text;
    }, errors);
  }

  return { response, errors };
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

function resolveSingleRunRole(request: RunSukgoRequest): SukgoDebateRole {
  const provider = request.providerId;
  return {
    id: 'single',
    name: '단일 실행',
    provider,
    model: provider === 'codex'
      ? request.settings.codexModel
      : request.settings.sukgoProviderModels[provider] || '',
    reasoningEffort: request.settings.reasoningEffort,
    systemPrompt: 'Run a single Sukgo analysis.',
    outputFocus: '최종 분석',
  };
}

function resolveRole(request: RunSukgoRequest, role: SukgoDebateRole): SukgoDebateRole {
  const provider = request.providerId || role.provider;
  return {
    ...role,
    provider,
    model: role.model || (provider === 'codex'
      ? request.settings.codexModel
      : request.settings.sukgoProviderModels[provider] || ''),
  };
}

function buildEvidenceBundle(request: RunSukgoRequest): EvidenceBundle {
  const topic = resolveTopic(request);
  return {
    topic,
    activeNote: request.activeFile ? {
      id: `note-${request.activeFile.path}`,
      type: 'obsidian-note',
      title: request.activeFile.basename,
      path: request.activeFile.path,
      content: request.activeNoteContent,
      capturedAt: Date.now(),
    } : undefined,
    selectedText: request.selectedText,
    pinnedNotes: request.pinnedNotes.map((note) => ({
      id: `pinned-${note.path}`,
      type: 'obsidian-note',
      title: note.path.split('/').pop()?.replace(/\.md$/i, '') || note.path,
      path: note.path,
      content: note.content,
      capturedAt: Date.now(),
    })),
    relatedNotes: request.relatedNotes
      .filter((note): note is MemoryMapResult & { content: string } => Boolean(note.content?.trim()))
      .map((note) => ({
        id: `related-${note.path}`,
        type: 'obsidian-note',
        title: note.title,
        path: note.path,
        content: note.content,
        summary: `score=${note.score}; reasons=${note.reasons.join(', ')}`,
        capturedAt: Date.now(),
      })),
    externalSources: request.externalSources,
  };
}

function buildEvidenceSection(request: RunSukgoRequest): string {
  const bundle = buildEvidenceBundle(request);
  const sections: string[] = [];
  if (bundle.activeNote?.content.trim()) {
    sections.push([
      `<active_note path="${bundle.activeNote.path || ''}">`,
      trimForPrompt(bundle.activeNote.content),
      '</active_note>',
    ].join('\n'));
  }
  if (bundle.selectedText?.trim()) {
    sections.push([
      '<selected_text>',
      trimForPrompt(bundle.selectedText),
      '</selected_text>',
    ].join('\n'));
  }
  for (const note of [...bundle.pinnedNotes, ...bundle.relatedNotes]) {
    sections.push([
      `<obsidian_note path="${note.path || ''}" title="${escapeAttr(note.title)}">`,
      note.summary ? `summary: ${note.summary}` : '',
      trimForPrompt(note.content),
      '</obsidian_note>',
    ].filter(Boolean).join('\n'));
  }
  for (const source of bundle.externalSources) {
    sections.push([
      `<external_source type="${source.type}" url="${source.url || ''}" title="${escapeAttr(source.title)}">`,
      source.error ? `error: ${source.error}` : '',
      source.summary ? `summary: ${source.summary}` : '',
      source.content ? trimForPrompt(source.content) : '',
      '</external_source>',
    ].filter(Boolean).join('\n'));
  }
  return sections.length > 0 ? ['근거 컨텍스트:', ...sections].join('\n\n') : '근거 컨텍스트: 없음';
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
    buildEvidenceSection(request),
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

function buildSukgoRolePrompt(request: RunSukgoDebateRequest, role: SukgoDebateRole): string {
  const topic = resolveTopic(request);
  const source = request.activeFile
    ? `활성 노트: ${request.activeFile.path}`
    : '사용 가능한 활성 노트가 없습니다.';

  return [
    'Obsidian 안에서 Sukgo 병렬 토론의 한 역할을 맡는다.',
    '다른 역할의 답변을 볼 수 없으므로 독립적으로 분석한다.',
    '노트 컨텍스트로 확정할 수 없는 부분은 가정이라고 표시한다.',
    '원문이 다른 언어를 분명히 요구하지 않는 한 한국어로 작성한다.',
    '',
    `토론 프로필: ${request.profile.name}`,
    `도구: ${request.tool.name}`,
    `도구 목적: ${request.tool.shortDescription}`,
    `출처: ${source}`,
    `주제: ${topic}`,
    '',
    buildEvidenceSection(request),
    '',
    `역할: ${role.name}`,
    `역할 지시: ${role.systemPrompt}`,
    `출력 초점: ${role.outputFocus}`,
    '',
    '프레임워크 지시:',
    request.tool.prompt,
    '',
    '출력 요구사항:',
    '- Obsidian 친화적인 Markdown을 사용한다.',
    '- 이 역할의 결론을 먼저 쓴다.',
    '- 노트/컨텍스트에서 온 근거와 추론을 분리한다.',
    '- 중재자가 검토할 수 있도록 핵심 쟁점과 불확실성을 명확히 남긴다.',
  ].join('\n');
}

function buildSukgoSynthesisPrompt(
  request: RunSukgoDebateRequest,
  responses: SukgoDebateResponse[],
): string {
  const topic = resolveTopic(request);
  const roleBlocks = responses.map((response) => [
    `## ${response.roleName}`,
    `provider: ${response.provider}`,
    `model: ${response.model}`,
    response.errors.length > 0 ? `errors:\n${response.errors.map((error) => `- ${error}`).join('\n')}` : 'errors: none',
    '',
    response.content || '(응답 없음)',
  ].join('\n')).join('\n\n---\n\n');

  return [
    'Obsidian 안에서 Sukgo 병렬 토론 결과를 중재하고 종합한다.',
    '성공한 역할 응답과 실패 정보를 모두 고려한다.',
    '근거와 추론을 분리하고, 과도한 확신을 피한다.',
    '원문이 다른 언어를 분명히 요구하지 않는 한 한국어로 작성한다.',
    '',
    `토론 프로필: ${request.profile.name}`,
    `도구: ${request.tool.name}`,
    `주제: ${topic}`,
    '',
    buildEvidenceSection(request),
    '',
    `중재자 역할: ${request.profile.synthesizer.name}`,
    `중재자 지시: ${request.profile.synthesizer.systemPrompt}`,
    `출력 초점: ${request.profile.synthesizer.outputFocus}`,
    '',
    '역할별 응답:',
    roleBlocks,
    '',
    '최종 출력 구조:',
    '## 최종 결론',
    '## 역할별 분석',
    '## 중재 및 종합',
    '## 남은 질문',
    '## 다음 행동',
  ].join('\n');
}

function buildSukgoNote(request: RunSukgoRequest, response: string): string {
  const now = new Date();
  const topic = resolveTopic(request);
  const sourceLink = request.activeFile ? `[[${request.activeFile.path.replace(/\.md$/i, '')}]]` : '';
  const relatedLinks = request.relatedNotes.map((note) => `[[${note.path.replace(/\.md$/i, '')}]]`);
  const externalLinks = buildExternalSourceLines(request.externalSources);

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
    externalLinks.length > 0 ? `> [!cite]- 외부 자료\n${externalLinks.map((line) => `> - ${line}`).join('\n')}` : '',
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

function buildSukgoDebateNote(
  request: RunSukgoDebateRequest,
  responses: SukgoDebateResponse[],
  synthesized: string,
  synthesisErrors: string[],
): string {
  const now = new Date();
  const topic = resolveTopic(request);
  const sourceLink = request.activeFile ? `[[${request.activeFile.path.replace(/\.md$/i, '')}]]` : '';
  const relatedLinks = request.relatedNotes.map((note) => `[[${note.path.replace(/\.md$/i, '')}]]`);
  const externalLinks = buildExternalSourceLines(request.externalSources);
  const roleSections = responses.map((response) => [
    `### ${response.roleName}`,
    '',
    `- Provider: ${response.provider}`,
    `- Model: ${response.model}`,
    response.errors.length > 0 ? `- Errors: ${response.errors.join('; ')}` : '- Errors: none',
    '',
    response.content || '_응답 없음_',
  ].join('\n')).join('\n\n');

  return [
    '---',
    `title: ${yamlString(`숙고 토론 - ${topic}`)}`,
    'mode: codexian-sukgo-debate',
    `tool: ${yamlString(request.tool.id)}`,
    `profile: ${yamlString(request.profile.id)}`,
    `topic: ${yamlString(topic)}`,
    `source: ${yamlString(request.activeFile?.path || '')}`,
    `created: ${now.toISOString()}`,
    'tags:',
    '  - sukgo',
    '  - sukgo/debate',
    `  - sukgo/${request.tool.id}`,
    '  - codexian',
    '---',
    '',
    `# 숙고 토론 - ${topic}`,
    '',
    sourceLink ? `> [!info]+ 출처\n> ${sourceLink}` : '',
    relatedLinks.length > 0 ? `> [!tip]- 관련 메모리 맵 노트\n${relatedLinks.map((link) => `> - ${link}`).join('\n')}` : '',
    externalLinks.length > 0 ? `> [!cite]- 외부 자료\n${externalLinks.map((line) => `> - ${line}`).join('\n')}` : '',
    '',
    synthesized,
    '',
    '## 역할별 원문',
    '',
    roleSections,
    '',
    '---',
    '',
    '> [!quote]- 실행 메타데이터',
    `> Codexian 숙고 토론 생성 시각: ${now.toLocaleString()}`,
    `> 도구: ${request.tool.name}`,
    `> 프로필: ${request.profile.name}`,
    `> Provider: ${responses.map((response) => response.provider).join(', ')}`,
    `> 중재자: ${request.profile.synthesizer.name}`,
    synthesisErrors.length > 0 ? `> 중재 오류: ${synthesisErrors.join('; ')}` : '> 중재 오류: 없음',
  ].filter((line) => line !== '').join('\n');
}

function buildFallbackDebateSummary(responses: SukgoDebateResponse[], synthesisErrors: string[]): string {
  return [
    '## 최종 결론',
    '',
    '중재자 응답을 생성하지 못했습니다. 아래 역할별 원문과 오류를 기준으로 검토해야 합니다.',
    '',
    '## 역할별 분석',
    '',
    responses.map((response) => `- ${response.roleName}: ${response.content ? '응답 있음' : '응답 없음'}${response.errors.length > 0 ? `, 오류 ${response.errors.length}개` : ''}`).join('\n'),
    '',
    '## 남은 질문',
    '',
    synthesisErrors.map((error) => `- 중재 오류: ${error}`).join('\n') || '- 중재 오류는 없지만 최종 응답이 비어 있습니다.',
    '',
    '## 다음 행동',
    '',
    '- 역할별 원문을 검토하고 필요한 경우 단일 실행으로 재시도합니다.',
  ].join('\n');
}

async function writeSukgoDebateNote(
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
  let path = `${folder}/${timestamp}_${tool.id}_debate_${slug}.md`;
  let counter = 2;
  while (await app.vault.adapter.exists(path)) {
    path = `${folder}/${timestamp}_${tool.id}_debate_${slug}_${counter}.md`;
    counter += 1;
  }
  await app.vault.create(path, content);
  return path;
}

function resolveTopic(request: RunSukgoRequest): string {
  return request.topic.trim()
    || request.selectedText?.trim()
    || request.activeFile?.basename
    || '제목 없음';
}

function buildExternalSourceLines(sources: EvidenceSource[]): string[] {
  return sources.map((source) => {
    const label = source.title || source.url || source.id;
    const link = source.url ? `[${label}](${source.url})` : label;
    return source.error ? `${link} - 수집 오류: ${source.error}` : `${link} - ${source.type}`;
  });
}

function trimForPrompt(value: string, maxLength = 12000): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength).trim()}\n[...truncated...]`;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
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
