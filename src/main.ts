import { MarkdownView, Notice, Plugin, type TFile } from 'obsidian';

import { CodexProvider } from './core/agent/CodexProvider';
import { findCodexCli } from './core/codex/CodexCliResolver';
import { draftVisualPrompt, generateVisualAsset } from './core/images/VisualAssetService';
import { buildImagePrompt } from './core/images/ImagePromptBuilder';
import { MemoryMapService } from './core/memory/MemoryMapService';
import { buildProcessEnv } from './core/settings/env';
import { collectExternalEvidence, extractUrls } from './core/sukgo/ExternalEvidenceService';
import { getSukgoDebateProfile } from './core/sukgo/SukgoDebateProfiles';
import { runSukgoAnalysis, runSukgoDebate } from './core/sukgo/SukgoService';
import { getSukgoTool, SUKGO_TOOLS } from './core/sukgo/SukgoTools';
import type { CodexianSettings, MemoryMapResult, SukgoExecutionMode } from './core/types';
import { DEFAULT_SETTINGS } from './core/types';
import { CodexianView, VIEW_TYPE_CODEXIAN } from './ui/CodexianView';
import { ImageGenerationModal } from './ui/modals/ImageGenerationModal';
import { VisualGenerationProgressModal } from './ui/modals/VisualGenerationProgressModal';
import { VisualPromptPreviewModal } from './ui/modals/VisualPromptPreviewModal';
import { CodexianSettingsTab } from './ui/settings/CodexianSettingsTab';

interface ActiveNoteContext {
  file: TFile;
  path: string;
  content: string;
  selection?: string;
  pinnedNotes: Array<{ path: string; content: string }>;
}

interface RunSukgoOptions {
  executionMode?: SukgoExecutionMode;
  debateProfileId?: string;
  externalUrls?: string;
}

export default class CodexianPlugin extends Plugin {
  settings: CodexianSettings;
  agent: CodexProvider;
  memoryMap: MemoryMapService;
  private lastActiveMarkdownFile: TFile | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.autofillCodexCliPath();
    this.agent = new CodexProvider(() => this.settings);
    this.memoryMap = new MemoryMapService(this.app);

    this.registerView(VIEW_TYPE_CODEXIAN, (leaf) => new CodexianView(leaf, this));

    this.addRibbonIcon('sparkles', 'Codexian 열기', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-codexian',
      name: 'Codexian 열기',
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: 'generate-visual-from-note',
      name: '활성 노트로 시각 자료 생성',
      callback: () => void this.generateImageFromActiveNote(),
    });

    this.addCommand({
      id: 'attach-current-note',
      name: '현재 노트를 채팅에 첨부',
      checkCallback: (checking: boolean) => {
        const activeFile = this.getActiveMarkdownFile();
        if (!activeFile) return false;
        if (checking) return true;

        void this.attachCurrentNoteToChat();
        return true;
      },
    });

    this.addCommand({
      id: 'build-memory-map',
      name: '메모리 맵 빌드',
      callback: () => void this.buildMemoryMap(),
    });

    this.addCommand({
      id: 'find-related-notes',
      name: '현재 노트 관련 노트 찾기',
      checkCallback: (checking: boolean) => {
        const activeFile = this.getActiveMarkdownFile();
        if (!activeFile) return false;
        if (checking) return true;

        void this.findRelatedNotes();
        return true;
      },
    });

    this.addCommand({
      id: 'run-sukgo-thinking-tool',
      name: '숙고 사고 도구 실행',
      callback: () => void this.runSukgoTool('steelman'),
    });

    for (const tool of SUKGO_TOOLS) {
      this.addCommand({
        id: `run-sukgo-${tool.id}`,
        name: `숙고: ${tool.name}`,
        callback: () => void this.runSukgoTool(tool.id),
      });
    }

    this.addSettingTab(new CodexianSettingsTab(this));
  }

  onunload(): void {
    this.agent?.cancel();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CODEXIAN);
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      pinnedNotePaths: Array.isArray(data?.pinnedNotePaths) ? data.pinnedNotePaths : DEFAULT_SETTINGS.pinnedNotePaths,
      excludedNotePaths: Array.isArray(data?.excludedNotePaths) ? data.excludedNotePaths : DEFAULT_SETTINGS.excludedNotePaths,
      omx: {
        ...DEFAULT_SETTINGS.omx,
        ...data?.omx,
      },
      blockedCommands: {
        ...DEFAULT_SETTINGS.blockedCommands,
        ...data?.blockedCommands,
      },
      sukgoExecutionMode: data?.sukgoExecutionMode || DEFAULT_SETTINGS.sukgoExecutionMode,
      sukgoDebateProfile: data?.sukgoDebateProfile || DEFAULT_SETTINGS.sukgoDebateProfile,
      sukgoDebateProvider: data?.sukgoDebateProvider || DEFAULT_SETTINGS.sukgoDebateProvider,
      sukgoExternalEvidenceEnabled: typeof data?.sukgoExternalEvidenceEnabled === 'boolean'
        ? data.sukgoExternalEvidenceEnabled
        : DEFAULT_SETTINGS.sukgoExternalEvidenceEnabled,
      sukgoExternalEvidenceMode: data?.sukgoExternalEvidenceMode || DEFAULT_SETTINGS.sukgoExternalEvidenceMode,
      sukgoExternalEvidenceMaxChars: Number(data?.sukgoExternalEvidenceMaxChars) || DEFAULT_SETTINGS.sukgoExternalEvidenceMaxChars,
      sukgoProviderModels: {
        ...DEFAULT_SETTINGS.sukgoProviderModels,
        ...data?.sukgoProviderModels,
      },
      sukgoProviderConfig: {
        ...DEFAULT_SETTINGS.sukgoProviderConfig,
        ...data?.sukgoProviderConfig,
      },
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async autofillCodexCliPath(): Promise<void> {
    if (this.settings.codexCliPath.trim()) return;
    const detected = findCodexCli('', buildProcessEnv(this.settings.environmentVariables).PATH);
    if (!detected) return;
    this.settings.codexCliPath = detected;
    await this.saveSettings();
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CODEXIAN)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (!rightLeaf) return;
      leaf = rightLeaf;
      await leaf.setViewState({ type: VIEW_TYPE_CODEXIAN, active: true });
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  getVaultPath(): string {
    const adapter = this.app.vault.adapter as { basePath?: string };
    return adapter.basePath || '/';
  }

  async getActiveNoteContext(): Promise<ActiveNoteContext | null> {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = this.getActiveMarkdownFile();
    const includeActiveFile = Boolean(
      file
      && this.settings.autoIncludeActiveNote
      && !this.isNoteExcluded(file.path),
    );
    const pinnedNotes = await this.getPinnedNoteContents(file?.path);
    if (!file && pinnedNotes.length === 0) return null;

    const content = file && includeActiveFile ? await this.app.vault.read(file) : '';
    const selection = includeActiveFile && markdownView?.file?.path === file?.path
      ? markdownView?.editor?.getSelection()?.trim() || undefined
      : undefined;
    return {
      file: file!,
      path: file?.path || '',
      content,
      selection,
      pinnedNotes,
    };
  }

  async getPinnedNoteContents(excludePath?: string): Promise<Array<{ path: string; content: string }>> {
    const notes: Array<{ path: string; content: string }> = [];
    for (const notePath of this.settings.pinnedNotePaths) {
      if (notePath === excludePath) continue;
      if (this.isNoteExcluded(notePath)) continue;
      const file = this.app.vault.getAbstractFileByPath(notePath);
      if (!file || !('extension' in file)) continue;
      try {
        notes.push({ path: notePath, content: await this.app.vault.read(file as TFile) });
      } catch {
        // Ignore stale pinned files; the UI still exposes the stored path.
      }
    }
    return notes;
  }

  getActiveMarkdownFile(): TFile | null {
    const markdownViewFile = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    const activeFile = this.app.workspace.getActiveFile();
    const file = markdownViewFile || activeFile || this.lastActiveMarkdownFile;

    if (file && file.extension === 'md') {
      this.lastActiveMarkdownFile = file;
      return file;
    }

    return this.lastActiveMarkdownFile;
  }

  isNotePinned(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    return this.settings.pinnedNotePaths.includes(normalizedPath);
  }

  isNoteExcluded(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    return this.settings.excludedNotePaths.includes(normalizedPath);
  }

  async pinNote(path: string): Promise<void> {
    const normalizedPath = path.replace(/\\/g, '/');
    await this.includeNote(normalizedPath);
    if (!this.settings.pinnedNotePaths.includes(normalizedPath)) {
      this.settings.pinnedNotePaths.push(normalizedPath);
      await this.saveSettings();
    }
  }

  async attachCurrentNoteToChat(): Promise<void> {
    const activeFile = this.getActiveMarkdownFile();
    if (!activeFile) {
      new Notice('첨부할 마크다운 노트를 먼저 열어 주세요.');
      return;
    }

    await this.pinNote(activeFile.path.replace(/\\/g, '/'));
    await this.activateView();
    this.refreshOpenViews();
    new Notice(`첨부됨: ${activeFile.name}`);
  }

  async buildMemoryMap(): Promise<void> {
    new Notice('Codexian 메모리 맵을 빌드하는 중...');
    try {
      const index = await this.memoryMap.build();
      this.refreshOpenViews();
      new Notice(`메모리 맵 준비 완료: 노트 ${index.entries.length}개 색인됨.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`메모리 맵 빌드 실패: ${message}`);
    }
  }

  async getMemoryMapStatus(): Promise<{ built: boolean; count: number; builtAt: number | null }> {
    return this.memoryMap.getStatus();
  }

  async findRelatedNotes(limit = 8): Promise<MemoryMapResult[]> {
    const activeFile = this.getActiveMarkdownFile();
    if (!activeFile) {
      new Notice('관련 노트를 찾을 마크다운 노트를 먼저 열어 주세요.');
      return [];
    }

    try {
      const results = await this.memoryMap.findRelated(activeFile, limit);
      this.refreshOpenViews();
      if (results.length === 0) new Notice('관련 노트를 찾지 못했습니다.');
      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`관련 컨텍스트 찾기 실패: ${message}`);
      return [];
    }
  }

  async runSukgoTool(toolId: string, topic = '', options: RunSukgoOptions = {}): Promise<string | null> {
    const tool = getSukgoTool(toolId);
    if (!tool) {
      new Notice(`알 수 없는 숙고 도구입니다: ${toolId}`);
      return null;
    }

    const activeFile = this.getActiveMarkdownFile();
    const context = await this.getActiveNoteContext();
    if (!activeFile && !topic.trim()) {
      new Notice('마크다운 노트를 열거나 숙고 주제를 입력해 주세요.');
      return null;
    }

    const requestedMode = options.executionMode || this.settings.sukgoExecutionMode;
    let executionMode: SukgoExecutionMode = requestedMode === 'auto'
      ? tool.defaultExecutionMode
      : requestedMode;
    if (executionMode === 'parallel' && !tool.supportsParallel) {
      executionMode = 'single';
      new Notice(`${tool.name}은 병렬 토론을 지원하지 않아 단일 실행으로 진행합니다.`);
    }

    const profile = getSukgoDebateProfile(options.debateProfileId || this.settings.sukgoDebateProfile);
    new Notice(executionMode === 'parallel'
      ? `숙고 토론 실행 중: ${tool.name} / ${profile.name}...`
      : `숙고 실행 중: ${tool.name}...`);
    try {
      const relatedNotes = activeFile ? await this.getRelatedNoteContents(activeFile, 4) : [];
      const externalUrls = this.settings.sukgoExternalEvidenceEnabled
        ? extractUrls(options.externalUrls || topic)
        : [];
      const externalSources = externalUrls.length > 0
        ? await collectExternalEvidence({
            urls: externalUrls,
            mode: this.settings.sukgoExternalEvidenceMode,
            maxChars: this.settings.sukgoExternalEvidenceMaxChars,
            onProgress: (message) => console.log(`[Codexian Sukgo] ${message}`),
          })
        : [];
      const request = {
        app: this.app,
        agent: this.agent,
        settings: this.settings,
        vaultPath: this.getVaultPath(),
        outputFolder: this.settings.sukgoFolder,
        tool,
        providerId: this.settings.sukgoDebateProvider,
        topic,
        activeFile,
        activeNoteContent: context?.content || '',
        selectedText: context?.selection,
        pinnedNotes: context?.pinnedNotes || [],
        relatedNotes,
        externalSources,
        onProgress: (message: string) => console.log(`[Codexian Sukgo] ${message}`),
      };
      const result = executionMode === 'parallel'
        ? await runSukgoDebate({ ...request, profile })
        : await runSukgoAnalysis(request);

      const savedFile = this.app.vault.getAbstractFileByPath(result.path);
      if (savedFile && 'extension' in savedFile) {
        await this.app.workspace.getLeaf(false).openFile(savedFile as TFile);
      }
      this.refreshOpenViews();
      new Notice(`숙고 노트 저장됨: ${result.path}`);
      return result.path;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Codexian Sukgo] Run failed:', error);
      new Notice(`숙고 실행 실패: ${message}`);
      return null;
    }
  }

  private async getRelatedNoteContents(
    activeFile: TFile,
    limit: number,
  ): Promise<Array<MemoryMapResult & { content?: string }>> {
    try {
      const related = await this.memoryMap.findRelated(activeFile, limit);
      const results: Array<MemoryMapResult & { content?: string }> = [];
      for (const result of related) {
        const file = this.app.vault.getAbstractFileByPath(result.path);
        if (!file || !('extension' in file) || this.isNoteExcluded(result.path)) {
          results.push(result);
          continue;
        }
        try {
          results.push({ ...result, content: await this.app.vault.cachedRead(file as TFile) });
        } catch {
          results.push(result);
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  refreshOpenViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CODEXIAN)) {
      const view = leaf.view;
      if (view instanceof CodexianView) {
        view.refreshContextChips();
      }
    }
  }

  async unpinNote(path: string): Promise<void> {
    const normalizedPath = path.replace(/\\/g, '/');
    const next = this.settings.pinnedNotePaths.filter((item) => item !== normalizedPath);
    if (next.length !== this.settings.pinnedNotePaths.length) {
      this.settings.pinnedNotePaths = next;
      await this.saveSettings();
    }
  }

  async excludeNote(path: string): Promise<void> {
    const normalizedPath = path.replace(/\\/g, '/');
    this.settings.pinnedNotePaths = this.settings.pinnedNotePaths.filter((item) => item !== normalizedPath);
    if (!this.settings.excludedNotePaths.includes(normalizedPath)) {
      this.settings.excludedNotePaths.push(normalizedPath);
    }
    await this.saveSettings();
  }

  async includeNote(path: string): Promise<void> {
    const normalizedPath = path.replace(/\\/g, '/');
    const next = this.settings.excludedNotePaths.filter((item) => item !== normalizedPath);
    if (next.length !== this.settings.excludedNotePaths.length) {
      this.settings.excludedNotePaths = next;
      await this.saveSettings();
    }
  }

  async generateImageFromActiveNote(): Promise<void> {
    const activeFile = this.getActiveMarkdownFile();
    const context = await this.getActiveNoteContext();
    if (!context || !activeFile) {
      new Notice('이미지를 생성할 마크다운 노트를 먼저 열어 주세요.');
      return;
    }

    const input = await new ImageGenerationModal(this.app).openAndWait();
    if (!input) return;

    const progressModal = new VisualGenerationProgressModal(this.app);
    progressModal.open();
    progressModal.addStep(`원본 노트: ${activeFile.path}`);
    progressModal.addStep(`시각 자료 형식: ${input.mode}`);
    progressModal.addStep(`출력 유형: ${input.outputType.toUpperCase()}`);

    let activeProgressModal = progressModal;
    try {
      const noteContent = context.content || await this.app.vault.read(activeFile);
      progressModal.addStep('노트를 분석하고 이미지 프롬프트를 작성하는 중...');
      const draftedPrompt = await draftVisualPrompt({
        app: this.app,
        agent: this.agent,
        vaultPath: this.getVaultPath(),
        file: activeFile,
        mediaFolder: this.settings.mediaFolder,
        mode: input.mode,
        outputType: input.outputType,
        userPrompt: input.prompt,
        noteContent,
        selection: context.selection,
        onProgress: (message) => progressModal.addStep(message),
      });
      progressModal.close();

      const promptForReview = draftedPrompt || buildImagePrompt({
        mode: input.mode,
        outputType: input.outputType,
        userPrompt: input.prompt,
        noteTitle: activeFile.basename,
        noteContent,
        selection: context.selection,
      });
      const reviewedPrompt = await new VisualPromptPreviewModal(this.app, promptForReview, input.outputType).openAndWait();
      if (!reviewedPrompt) return;

      const generationProgressModal = new VisualGenerationProgressModal(this.app);
      activeProgressModal = generationProgressModal;
      generationProgressModal.open();
      generationProgressModal.addStep(`검토한 프롬프트로 ${input.outputType.toUpperCase()} 생성 중...`);
      const generated = await generateVisualAsset({
        app: this.app,
        agent: this.agent,
        vaultPath: this.getVaultPath(),
        file: activeFile,
        mediaFolder: this.settings.mediaFolder,
        mode: input.mode,
        outputType: input.outputType,
        userPrompt: input.prompt,
        generatedPrompt: reviewedPrompt,
        noteContent,
        selection: context.selection,
        onProgress: (message) => generationProgressModal.addStep(message),
      });

      generationProgressModal.finish(`완료. ${generated.path}에 삽입했습니다.`, 'success');
      new Notice(`시각 자료 삽입됨: ${generated.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      activeProgressModal.finish(`오류: ${message}`, 'error');
      console.error('[Codexian visual] Visual generation failed:', error);
      new Notice(`시각 자료 생성 실패: ${message}`);
    }
  }
}
