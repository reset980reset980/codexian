import { ItemView, MarkdownRenderer, Notice, setIcon, type TFile, type WorkspaceLeaf } from 'obsidian';

import type CodexianPlugin from '../main';
import { SUKGO_TOOLS } from '../core/sukgo/SukgoTools';
import type { ConversationMessage, MemoryMapResult, PermissionMode, ReasoningEffort } from '../core/types';

export const VIEW_TYPE_CODEXIAN = 'codexian-view';

const CODEXIAN_LOGO = {
  viewBox: '0 0 24 24',
  path: 'M12 2.8a4.2 4.2 0 0 1 3.64 2.1 4.2 4.2 0 0 1 5.56 5.56A4.2 4.2 0 0 1 19.1 14.1a4.2 4.2 0 0 1-5.56 5.56A4.2 4.2 0 0 1 9.9 21.2a4.2 4.2 0 0 1-5.56-5.56A4.2 4.2 0 0 1 2.8 12a4.2 4.2 0 0 1 2.1-3.64A4.2 4.2 0 0 1 10.46 2.8 4.4 4.4 0 0 1 12 2.8Zm0 2.1a2.1 2.1 0 0 0-1.05.28L7.32 7.27a2.1 2.1 0 0 0-1.05 1.82v4.18a2.1 2.1 0 0 0 1.05 1.82l3.63 2.09a2.1 2.1 0 0 0 2.1 0l3.63-2.09a2.1 2.1 0 0 0 1.05-1.82V9.09a2.1 2.1 0 0 0-1.05-1.82l-3.63-2.09A2.1 2.1 0 0 0 12 4.9Zm0 3.1 3.46 2v4L12 16l-3.46-2v-4L12 8Z',
};

const CODEX_SLASH_COMMANDS = [
  { name: '/help', hint: 'Codex CLI 도움말', description: '사용 가능한 Codex 명령과 사용법을 확인합니다.' },
  { name: '/init', hint: 'AGENTS.md 생성', description: '저장소나 볼트 지침 파일을 초기화합니다.' },
  { name: '/status', hint: '세션 상태', description: '현재 모델, 작업 폴더, 샌드박스, 세션 상태를 확인합니다.' },
  { name: '/model', hint: '모델 변경', description: 'Codex CLI가 지원하는 경우 모델 선택을 요청합니다.' },
  { name: '/approvals', hint: '승인 모드', description: '승인 및 샌드박스 모드 변경을 요청합니다.' },
  { name: '/compact', hint: '컨텍스트 압축', description: '현재 대화 컨텍스트 압축을 요청합니다.' },
  { name: '/diff', hint: '변경사항 검토', description: '현재 git/worktree 변경 요약을 요청합니다.' },
  { name: '/clear', hint: '컨텍스트 초기화', description: '활성 대화 컨텍스트 초기화를 요청합니다.' },
  { name: '/new', hint: '새 세션', description: '지원되는 경우 새 Codex 세션을 시작합니다.' },
  { name: '/resume', hint: '세션 재개', description: '사용 가능한 이전 Codex 세션 재개를 요청합니다.' },
  { name: '/login', hint: '로그인', description: 'Codex 로그인 안내를 요청합니다.' },
  { name: '/logout', hint: '로그아웃', description: 'Codex 로그아웃 안내를 요청합니다.' },
  { name: '/doctor', hint: '진단', description: 'CLI 설치, 인증, PATH, 환경 문제를 점검합니다.' },
  { name: '/features', hint: '기능 플래그', description: 'image_generation 같은 Codex 기능 플래그를 확인하거나 관리합니다.' },
  { name: '/memory', hint: '메모리', description: '사용 가능한 메모리 컨텍스트 확인 또는 업데이트를 요청합니다.' },
  { name: '/review', hint: '코드 리뷰', description: '로컬 변경사항의 위험과 문제를 검토합니다.' },
  { name: '/tests', hint: '테스트 실행', description: '관련 검증 명령 실행 또는 제안을 요청합니다.' },
  { name: '/image', hint: '이미지 생성', description: '활성화된 경우 Codex 이미지 생성을 요청합니다.' },
];

const REASONING_LABELS: Record<ReasoningEffort, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  xhigh: '매우 높음',
};

export class CodexianView extends ItemView {
  private plugin: CodexianPlugin;
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private memoryMapEl: HTMLElement | null = null;
  private sukgoEl: HTMLElement | null = null;
  private fileIndicatorEl: HTMLElement | null = null;
  private selectionIndicatorEl: HTMLElement | null = null;
  private slashDropdownEl: HTMLElement | null = null;
  private welcomeEl: HTMLElement | null = null;
  private messages: ConversationMessage[] = [];
  private relatedNotes: MemoryMapResult[] = [];
  private hiddenRelatedPaths = new Set<string>();
  private memoryMapRenderToken = 0;
  private isMemoryMapExpanded = true;
  private selectedSukgoToolId = SUKGO_TOOLS[0]?.id || 'steelman';
  private isRunning = false;
  private selectedSlashCommandIndex = 0;

  constructor(leaf: WorkspaceLeaf, plugin: CodexianPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CODEXIAN;
  }

  getDisplayText(): string {
    return 'Codexian';
  }

  getIcon(): string {
    return 'bot';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('oc-container');

    const header = container.createDiv({ cls: 'oc-header' });
    this.buildHeader(header);

    this.messagesEl = container.createDiv({ cls: 'oc-messages' });
    this.welcomeEl = this.messagesEl.createDiv({ cls: 'oc-welcome' });
    this.renderWelcome();

    const inputContainerEl = container.createDiv({ cls: 'oc-input-container' });
    this.buildInputArea(inputContainerEl);

    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.renderFileChips()));
    this.registerEvent(this.app.workspace.on('file-open', () => {
      this.relatedNotes = [];
      this.hiddenRelatedPaths.clear();
      this.renderMemoryMapPanel();
      this.renderSukgoPanel();
      this.renderFileChips();
    }));
    void this.renderMemoryMapPanel();
    this.renderSukgoPanel();
    this.renderFileChips();
  }

  async onClose(): Promise<void> {
    this.plugin.agent.cancel();
  }

  refreshContextChips(): void {
    void this.renderMemoryMapPanel();
    this.renderSukgoPanel();
    this.renderFileChips();
  }

  private buildHeader(header: HTMLElement): void {
    const titleContainer = header.createDiv({ cls: 'oc-title' });
    const logoEl = titleContainer.createSpan({ cls: 'oc-logo' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', CODEXIAN_LOGO.viewBox);
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', CODEXIAN_LOGO.path);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    logoEl.appendChild(svg);
    titleContainer.createEl('h4', { text: 'Codexian' });

    const headerActions = header.createDiv({ cls: 'oc-header-actions' });

    const visualBtn = headerActions.createDiv({ cls: 'oc-header-btn' });
    setIcon(visualBtn, 'image');
    visualBtn.setAttribute('aria-label', '노트로 시각 자료 생성');
    visualBtn.addEventListener('click', () => void this.plugin.generateImageFromActiveNote());

    const newBtn = headerActions.createDiv({ cls: 'oc-header-btn' });
    setIcon(newBtn, 'plus');
    newBtn.setAttribute('aria-label', '새 대화');
    newBtn.addEventListener('click', () => this.createNewConversation());
  }

  private buildInputArea(inputContainerEl: HTMLElement): void {
    const inputWrapper = inputContainerEl.createDiv({ cls: 'oc-input-wrapper' });

    this.selectionIndicatorEl = inputWrapper.createDiv({ cls: 'oc-selection-indicator' });
    this.selectionIndicatorEl.style.display = 'none';

    this.memoryMapEl = inputWrapper.createDiv({ cls: 'oc-memory-map-panel' });

    this.sukgoEl = inputWrapper.createDiv({ cls: 'oc-sukgo-panel' });
    this.renderSukgoPanel();

    this.fileIndicatorEl = inputWrapper.createDiv({ cls: 'oc-file-indicator' });

    this.inputEl = inputWrapper.createEl('textarea', {
      cls: 'oc-input',
      attr: {
        placeholder: '무엇을 도와드릴까요?',
        rows: '3',
      },
    });
    this.inputEl.addEventListener('keydown', (event) => {
      if (this.handleSlashKeydown(event)) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void this.submit();
      }
    });
    this.inputEl.addEventListener('input', () => {
      this.autoResizeInput();
      this.renderSlashCommands();
    });
    this.inputEl.addEventListener('blur', () => {
      window.setTimeout(() => this.hideSlashCommands(), 120);
    });

    this.slashDropdownEl = inputWrapper.createDiv({ cls: 'oc-slash-dropdown' });
    this.slashDropdownEl.addEventListener('wheel', (event) => event.stopPropagation());

    const toolbar = inputWrapper.createDiv({ cls: 'oc-input-toolbar' });
    this.buildModelSelector(toolbar);
    this.buildThinkingSelector(toolbar);
    this.buildPermissionToggle(toolbar);

    const sendBtn = toolbar.createDiv({ cls: 'oc-header-btn oc-send-btn', attr: { 'aria-label': '메시지 보내기' } });
    setIcon(sendBtn, 'send');
    sendBtn.addEventListener('click', () => void this.submit());
  }

  private buildModelSelector(parent: HTMLElement): void {
    const selector = parent.createDiv({ cls: 'oc-model-selector' });
    const button = selector.createDiv({ cls: 'oc-model-btn' });
    const label = button.createSpan({ cls: 'oc-model-label', text: this.plugin.settings.codexModel });

    const dropdown = selector.createDiv({ cls: 'oc-model-dropdown' });
    const models = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.3-codex-spark'];
    const options: HTMLElement[] = [];
    for (const model of models) {
      const option = dropdown.createDiv({ cls: 'oc-model-option' });
      options.push(option);
      if (model === this.plugin.settings.codexModel) option.addClass('selected');
      option.createSpan({ text: model });
      option.addEventListener('click', async () => {
        this.plugin.settings.codexModel = model;
        await this.plugin.saveSettings();
        label.setText(model);
        for (const item of options) item.removeClass('selected');
        option.addClass('selected');
      });
    }
  }

  private buildThinkingSelector(parent: HTMLElement): void {
    const selector = parent.createDiv({ cls: 'oc-thinking-selector' });
    selector.createSpan({ cls: 'oc-thinking-label-text', text: '추론:' });
    const gears = selector.createDiv({ cls: 'oc-thinking-gears' });
    const current = gears.createDiv({
      cls: 'oc-thinking-current',
      text: REASONING_LABELS[this.plugin.settings.reasoningEffort],
    });
    const options = gears.createDiv({ cls: 'oc-thinking-options' });
    const efforts: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];
    const items: HTMLElement[] = [];
    for (const effort of efforts) {
      const option = options.createDiv({ cls: 'oc-thinking-gear', text: REASONING_LABELS[effort] });
      items.push(option);
      if (effort === this.plugin.settings.reasoningEffort) option.addClass('selected');
      option.addEventListener('click', async () => {
        this.plugin.settings.reasoningEffort = effort;
        await this.plugin.saveSettings();
        current.setText(REASONING_LABELS[effort]);
        for (const item of items) item.removeClass('selected');
        option.addClass('selected');
      });
    }
  }

  private buildPermissionToggle(parent: HTMLElement): void {
    const toggle = parent.createDiv({ cls: 'oc-permission-toggle' });
    const label = toggle.createSpan({ cls: 'oc-permission-label' });
    const switchEl = toggle.createDiv({ cls: 'oc-toggle-switch' });
    this.updatePermissionToggle(label, switchEl);
    toggle.addEventListener('click', async () => {
      this.plugin.settings.permissionMode = this.nextPermissionMode(this.plugin.settings.permissionMode);
      await this.plugin.saveSettings();
      this.updatePermissionToggle(label, switchEl);
    });
  }

  private updatePermissionToggle(label: HTMLElement, switchEl: HTMLElement): void {
    const mode = this.plugin.settings.permissionMode;
    switchEl.toggleClass('active', mode === 'auto' || mode === 'yolo');
    label.setText(mode === 'review' ? '안전' : mode === 'auto' ? '자동' : '무제한');
  }

  private nextPermissionMode(mode: PermissionMode): PermissionMode {
    if (mode === 'review') return 'auto';
    if (mode === 'auto') return 'yolo';
    return 'review';
  }

  private renderWelcome(): void {
    if (!this.welcomeEl) return;
    this.welcomeEl.empty();
    this.welcomeEl.createDiv({ cls: 'oc-welcome-greeting', text: '무엇을 도와드릴까요?' });
  }

  private async renderMemoryMapPanel(): Promise<void> {
    if (!this.memoryMapEl) return;
    const renderToken = ++this.memoryMapRenderToken;

    const status = await this.plugin.getMemoryMapStatus();
    if (renderToken !== this.memoryMapRenderToken || !this.memoryMapEl) return;

    this.memoryMapEl.empty();
    this.memoryMapEl.toggleClass('is-collapsed', !this.isMemoryMapExpanded);
    const header = this.memoryMapEl.createDiv({ cls: 'oc-memory-map-header' });
    const title = header.createDiv({ cls: 'oc-memory-map-title' });
    title.setAttribute('role', 'button');
    title.setAttribute('aria-expanded', String(this.isMemoryMapExpanded));
    title.addEventListener('click', async () => {
      this.isMemoryMapExpanded = !this.isMemoryMapExpanded;
      await this.renderMemoryMapPanel();
    });
    setIcon(title.createSpan({ cls: 'oc-memory-map-toggle' }), this.isMemoryMapExpanded ? 'chevron-down' : 'chevron-right');
    setIcon(title.createSpan({ cls: 'oc-memory-map-icon' }), 'network');
    title.createSpan({ text: status.built ? `메모리 맵 · 노트 ${status.count}개` : '메모리 맵이 아직 없습니다' });

    const actions = header.createDiv({ cls: 'oc-memory-map-actions' });
    if (this.relatedNotes.length > 0) {
      const clearBtn = actions.createEl('button', { cls: 'oc-memory-map-btn', text: '지우기' });
      clearBtn.addEventListener('click', async () => {
        this.relatedNotes = [];
        this.hiddenRelatedPaths.clear();
        await this.renderMemoryMapPanel();
      });
    }

    const buildBtn = actions.createEl('button', { cls: 'oc-memory-map-btn', text: status.built ? '다시 빌드' : '메모리 맵 빌드' });
    buildBtn.addEventListener('click', async () => {
      buildBtn.setText('빌드 중...');
      await this.plugin.buildMemoryMap();
      await this.renderMemoryMapPanel();
    });

    const findBtn = actions.createEl('button', { cls: 'oc-memory-map-btn oc-memory-map-primary', text: '컨텍스트 찾기' });
    findBtn.disabled = !Boolean(this.plugin.getActiveMarkdownFile());
    findBtn.addEventListener('click', async () => {
      findBtn.setText('찾는 중...');
      this.relatedNotes = await this.plugin.findRelatedNotes();
      this.hiddenRelatedPaths.clear();
      this.isMemoryMapExpanded = true;
      await this.renderMemoryMapPanel();
    });

    if (!this.isMemoryMapExpanded) return;

    const visibleResults = this.relatedNotes.filter((result) => !this.hiddenRelatedPaths.has(result.path));
    if (visibleResults.length === 0) {
      const hint = this.memoryMapEl.createDiv({ cls: 'oc-memory-map-hint' });
      hint.setText(status.built ? '컨텍스트 찾기를 누르면 관련 노트를 추천합니다.' : '한 번 빌드한 뒤 이 볼트에서 관련 노트를 찾을 수 있습니다.');
      return;
    }

    const list = this.memoryMapEl.createDiv({ cls: 'oc-memory-map-results' });
    for (const result of visibleResults) {
      this.createRelatedNoteChip(list, result);
    }
  }

  private createRelatedNoteChip(parent: HTMLElement, result: MemoryMapResult): void {
    const chip = parent.createDiv({ cls: 'oc-memory-chip' });
    chip.addEventListener('click', () => void this.openNote(result.path));

    const name = chip.createSpan({ cls: 'oc-memory-chip-name', text: result.title });
    name.setAttribute('title', result.path);
    chip.createSpan({ cls: 'oc-memory-chip-reason', text: result.reasons[0] || `점수 ${result.score}` });

    const tooltip = chip.createDiv({ cls: 'oc-memory-chip-tooltip' });
    tooltip.createDiv({ cls: 'oc-memory-tooltip-title', text: result.title });
    tooltip.createDiv({ cls: 'oc-memory-tooltip-path', text: result.path });
    const reasons = tooltip.createDiv({ cls: 'oc-memory-tooltip-reasons' });
    if (result.reasons.length > 0) {
      for (const reason of result.reasons) {
        reasons.createDiv({ cls: 'oc-memory-tooltip-reason', text: reason });
      }
    } else {
      reasons.createDiv({ cls: 'oc-memory-tooltip-reason', text: '규칙 기반 점수로 추천됨' });
    }
    tooltip.createDiv({ cls: 'oc-memory-tooltip-score', text: `관련도 점수 ${result.score}` });

    const add = chip.createSpan({ cls: 'oc-memory-chip-action' });
    setIcon(add, 'plus');
    add.setAttribute('aria-label', 'Codexian 컨텍스트에 노트 추가');
    add.setAttribute('title', '컨텍스트에 추가');
    add.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.plugin.pinNote(result.path);
      this.renderFileChips();
      new Notice(`컨텍스트 추가됨: ${result.title}`);
    });

    const hide = chip.createSpan({ cls: 'oc-memory-chip-action' });
    setIcon(hide, 'x');
    hide.setAttribute('aria-label', '추천 숨기기');
    hide.setAttribute('title', '이 추천 숨기기');
    hide.addEventListener('click', async (event) => {
      event.stopPropagation();
      this.hiddenRelatedPaths.add(result.path);
      await this.renderMemoryMapPanel();
    });
  }

  private renderSukgoPanel(): void {
    if (!this.sukgoEl) return;
    this.sukgoEl.empty();

    const header = this.sukgoEl.createDiv({ cls: 'oc-sukgo-header' });
    const title = header.createDiv({ cls: 'oc-sukgo-title' });
    setIcon(title.createSpan({ cls: 'oc-sukgo-icon' }), 'brain');
    title.createSpan({ text: '숙고 사고' });

    const controls = this.sukgoEl.createDiv({ cls: 'oc-sukgo-controls' });
    const select = controls.createEl('select', { cls: 'oc-sukgo-select' });
    for (const tool of SUKGO_TOOLS) {
      const option = select.createEl('option', { text: tool.name, value: tool.id });
      option.selected = tool.id === this.selectedSukgoToolId;
    }
    select.addEventListener('change', () => {
      this.selectedSukgoToolId = select.value;
      this.renderSukgoPanel();
    });

    const runBtn = controls.createEl('button', { cls: 'oc-memory-map-btn oc-memory-map-primary', text: '실행' });
    const topicInput = this.sukgoEl.createEl('input', {
      cls: 'oc-sukgo-topic',
      attr: {
        type: 'text',
        placeholder: '선택 주제. 비워두면 현재 노트를 사용합니다.',
      },
    });

    const selected = SUKGO_TOOLS.find((tool) => tool.id === this.selectedSukgoToolId);
    this.sukgoEl.createDiv({
      cls: 'oc-sukgo-hint',
      text: selected?.shortDescription || '현재 노트에 구조화된 사고 프레임워크를 실행합니다.',
    });

    runBtn.addEventListener('click', async () => {
      runBtn.setText('실행 중...');
      runBtn.disabled = true;
      const savedPath = await this.plugin.runSukgoTool(this.selectedSukgoToolId, topicInput.value);
      runBtn.disabled = false;
      runBtn.setText(savedPath ? '저장됨' : '실행');
      window.setTimeout(() => runBtn.setText('실행'), 1600);
    });
  }

  private renderFileChips(): void {
    if (!this.fileIndicatorEl) return;
    this.fileIndicatorEl.empty();

    const activeFile = this.plugin.getActiveMarkdownFile();
    if (activeFile && !this.plugin.isNoteExcluded(activeFile.path)) {
      this.createFileChip(activeFile.path, {
        current: this.plugin.settings.autoIncludeActiveNote,
        pinned: this.plugin.isNotePinned(activeFile.path),
      });
    }

    for (const pinnedPath of this.plugin.settings.pinnedNotePaths) {
      if (pinnedPath === activeFile?.path) continue;
      if (this.plugin.isNoteExcluded(pinnedPath)) continue;
      this.createFileChip(pinnedPath, { pinned: true });
    }

    const hasChips = this.fileIndicatorEl.children.length > 0;
    this.fileIndicatorEl.style.display = hasChips ? 'flex' : 'none';
  }

  private createFileChip(filePath: string, options: { current?: boolean; pinned?: boolean }): void {
    if (!this.fileIndicatorEl) return;
    const chip = this.fileIndicatorEl.createDiv({ cls: 'oc-file-chip' });
    if (options.pinned) {
      chip.addClass('oc-file-chip-pinned');
    } else if (options.current) {
      chip.addClass('oc-file-chip-current');
    } else {
      chip.addClass('oc-file-chip-attached');
    }

    const icon = chip.createSpan({ cls: 'oc-file-chip-icon' });
    setIcon(icon, 'file-text');
    const normalizedPath = filePath.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() || filePath;
    const name = chip.createSpan({ cls: 'oc-file-chip-name', text: filename });
    name.setAttribute('title', options.current ? `현재 노트: ${filePath}` : filePath);

    const pin = chip.createSpan({ cls: 'oc-file-chip-pin' });
    setIcon(pin, options.pinned ? 'pin-off' : 'pin');
    pin.setAttribute('aria-label', options.pinned ? '노트 고정 해제' : '노트 고정');
    pin.setAttribute('title', options.pinned ? '고정됨 - 클릭하면 해제' : '클릭하면 이 노트를 고정');
    pin.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (this.plugin.isNotePinned(filePath)) await this.plugin.unpinNote(filePath);
      else await this.plugin.pinNote(filePath);
      this.renderFileChips();
    });

    const remove = chip.createSpan({ cls: 'oc-file-chip-remove' });
    setIcon(remove, 'x');
    remove.setAttribute('aria-label', 'Codexian 컨텍스트에서 노트 제거');
    remove.setAttribute('title', '채팅 컨텍스트에서 이 노트 제거');
    remove.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.plugin.excludeNote(filePath);
      this.renderFileChips();
    });

    chip.addEventListener('click', () => void this.openNote(filePath));
  }

  private async openNote(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !('extension' in file)) return;
    await this.app.workspace.getLeaf(false).openFile(file as TFile);
  }

  private createNewConversation(): void {
    this.plugin.agent.cancel();
    this.plugin.agent.resetSession();
    this.messages = [];
    this.messagesEl?.empty();
    this.welcomeEl = this.messagesEl?.createDiv({ cls: 'oc-welcome' }) || null;
    this.renderWelcome();
  }

  private reopen(): void {
    const leaf = this.leaf;
    void leaf.setViewState({ type: VIEW_TYPE_CODEXIAN, active: true });
  }

  private autoResizeInput(): void {
    if (!this.inputEl) return;
    this.inputEl.style.height = 'auto';
    this.inputEl.style.height = `${Math.min(this.inputEl.scrollHeight, 200)}px`;
  }

  private handleSlashKeydown(event: KeyboardEvent): boolean {
    if (!this.slashDropdownEl?.hasClass('visible')) return false;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedSlashCommandIndex = Math.min(this.selectedSlashCommandIndex + 1, this.getFilteredSlashCommands().length - 1);
      this.renderSlashCommands();
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedSlashCommandIndex = Math.max(this.selectedSlashCommandIndex - 1, 0);
      this.renderSlashCommands();
      return true;
    }

    if (event.key === 'Tab' || event.key === 'Enter') {
      const command = this.getFilteredSlashCommands()[this.selectedSlashCommandIndex];
      if (command) {
        event.preventDefault();
        this.insertSlashCommand(command.name);
        return true;
      }
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.hideSlashCommands();
      return true;
    }

    return false;
  }

  private getSlashQuery(): string | null {
    if (!this.inputEl) return null;
    const value = this.inputEl.value;
    const cursor = this.inputEl.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    if (!beforeCursor.startsWith('/')) return null;
    if (beforeCursor.includes('\n')) return null;
    if (beforeCursor.includes(' ')) return null;
    return beforeCursor.toLowerCase();
  }

  private getFilteredSlashCommands(): typeof CODEX_SLASH_COMMANDS {
    const query = this.getSlashQuery();
    if (query === null) return [];
    return CODEX_SLASH_COMMANDS.filter((command) => command.name.startsWith(query));
  }

  private renderSlashCommands(): void {
    if (!this.slashDropdownEl) return;
    const commands = this.getFilteredSlashCommands();
    this.slashDropdownEl.empty();

    if (commands.length === 0) {
      this.hideSlashCommands();
      return;
    }

    this.selectedSlashCommandIndex = Math.min(this.selectedSlashCommandIndex, commands.length - 1);
    this.slashDropdownEl.addClass('visible');

    for (const [index, command] of commands.entries()) {
      const item = this.slashDropdownEl.createDiv({ cls: 'oc-slash-item' });
      if (index === this.selectedSlashCommandIndex) {
        item.addClass('selected');
        window.requestAnimationFrame(() => item.scrollIntoView({ block: 'nearest' }));
      }
      item.createSpan({ cls: 'oc-slash-name', text: command.name });
      item.createSpan({ cls: 'oc-slash-hint', text: command.hint });
      item.createDiv({ cls: 'oc-slash-desc', text: command.description });
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this.insertSlashCommand(command.name);
      });
    }
  }

  private insertSlashCommand(command: string): void {
    if (!this.inputEl) return;
    this.inputEl.value = `${command} `;
    this.inputEl.focus();
    this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
    this.autoResizeInput();
    this.hideSlashCommands();
  }

  private hideSlashCommands(): void {
    this.slashDropdownEl?.removeClass('visible');
    this.selectedSlashCommandIndex = 0;
  }

  private async submit(): Promise<void> {
    if (!this.inputEl || this.isRunning) return;
    const prompt = this.inputEl.value.trim();
    if (!prompt) return;

    this.inputEl.value = '';
    this.autoResizeInput();
    this.isRunning = true;
    this.appendMessage({ role: 'user', content: prompt, timestamp: Date.now() });

    try {
      const context = await this.plugin.getActiveNoteContext();
      let assistantBuffer = '';
      const assistantEl = this.createMessageEl('assistant');
      const progressEl = this.createProgressTimeline(assistantEl);
      const progressListEl = progressEl.querySelector('.oc-progress-list') as HTMLElement;
      this.appendProgressStep(progressListEl, 'Codex 프로세스 시작');
      const contentEl = assistantEl.createDiv({ cls: 'oc-message-content' });

      for await (const event of this.plugin.agent.query({
        prompt,
        cwd: this.plugin.getVaultPath(),
        activeNotePath: context?.path,
        activeNoteContent: context?.content,
        selectedText: context?.selection,
        pinnedNotes: context?.pinnedNotes,
      })) {
        if (event.type === 'text') {
          assistantBuffer += event.content;
          progressEl.addClass('is-complete');
          this.appendProgressStep(progressListEl, '최종 응답 수신');
          await this.renderMarkdown(assistantBuffer, contentEl);
        } else if (event.type === 'progress') {
          this.appendProgressStep(progressListEl, event.content);
        } else if (event.type === 'error') {
          progressEl.addClass('is-error');
          this.appendProgressStep(progressListEl, `오류: ${event.content}`);
          this.appendMessage({ role: 'error', content: event.content, timestamp: Date.now() });
        }
      }

      progressEl.addClass('is-complete');

      if (assistantBuffer.trim()) {
        this.messages.push({ role: 'assistant', content: assistantBuffer, timestamp: Date.now() });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message);
      this.appendMessage({ role: 'error', content: message, timestamp: Date.now() });
    } finally {
      this.isRunning = false;
    }
  }

  private appendMessage(message: ConversationMessage): void {
    this.messages.push(message);
    const el = this.createMessageEl(message.role);
    const content = el.createDiv({ cls: 'oc-message-content' });
    if (message.role === 'assistant') {
      void this.renderMarkdown(message.content, content);
    } else {
      content.setText(message.content);
    }
  }

  private createMessageEl(role: ConversationMessage['role']): HTMLElement {
    if (this.welcomeEl) {
      this.welcomeEl.remove();
      this.welcomeEl = null;
    }
    const className = role === 'user'
      ? 'oc-message oc-message-user'
      : role === 'error'
        ? 'oc-message oc-message-assistant oc-message-error'
        : 'oc-message oc-message-assistant';
    const el = this.messagesEl!.createDiv({ cls: className });
    this.messagesEl!.scrollTop = this.messagesEl!.scrollHeight;
    return el;
  }

  private createProgressTimeline(parent: HTMLElement): HTMLElement {
    const wrapper = parent.createDiv({ cls: 'oc-progress-timeline' });
    const header = wrapper.createDiv({ cls: 'oc-progress-header' });
    header.createSpan({ cls: 'oc-progress-dot' });
    header.createSpan({ cls: 'oc-progress-title', text: 'Codex 작업 단계' });
    wrapper.createDiv({ cls: 'oc-progress-list' });
    return wrapper;
  }

  private appendProgressStep(listEl: HTMLElement, message: string): void {
    const previous = listEl.lastElementChild;
    if (previous?.textContent === message) return;
    const item = listEl.createDiv({ cls: 'oc-progress-step' });
    item.setText(message);
    const maxItems = 24;
    while (listEl.children.length > maxItems) {
      listEl.firstElementChild?.remove();
    }
    item.scrollIntoView({ block: 'nearest' });
    if (this.messagesEl) this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private async renderMarkdown(markdown: string, el: HTMLElement): Promise<void> {
    el.empty();
    await MarkdownRenderer.renderMarkdown(markdown, el, '', this);
    if (this.messagesEl) this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
