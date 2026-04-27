import { ItemView, MarkdownRenderer, Notice, setIcon, type TFile, type WorkspaceLeaf } from 'obsidian';

import type CodexianPlugin from '../main';
import type { ConversationMessage } from '../core/types';

export const VIEW_TYPE_CODEXIAN = 'codexian-view';

export class CodexianView extends ItemView {
  private plugin: CodexianPlugin;
  private logEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private statusEl: HTMLElement;
  private contextEl: HTMLElement;
  private messages: ConversationMessage[] = [];

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
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('codexian-view');

    const header = root.createDiv({ cls: 'codexian-header' });
    const brand = header.createDiv({ cls: 'codexian-brand' });
    const mark = brand.createDiv({ cls: 'codexian-mark' });
    setIcon(mark, 'sparkles');
    const titleWrap = brand.createDiv();
    titleWrap.createDiv({ cls: 'codexian-title', text: 'Codexian' });
    titleWrap.createDiv({ cls: 'codexian-subtitle', text: 'OpenAI Codex for your Obsidian vault' });

    const toolbar = header.createDiv({ cls: 'codexian-toolbar' });
    toolbar.createSpan({ cls: 'codexian-pill', text: `Model: ${this.plugin.settings.codexModel}` });
    toolbar.createSpan({ cls: 'codexian-pill', text: `Reasoning: ${this.plugin.settings.reasoningEffort}` });
    toolbar.createSpan({ cls: 'codexian-pill', text: `Mode: ${this.plugin.settings.permissionMode}` });
    this.statusEl = toolbar.createSpan({ cls: 'codexian-pill', text: 'Ready' });

    this.contextEl = header.createDiv({ cls: 'codexian-context-row' });
    this.renderContextRow();
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.renderContextRow()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.renderContextRow()));

    this.logEl = root.createDiv({ cls: 'codexian-log' });
    this.renderEmptyState();

    const composer = root.createDiv({ cls: 'codexian-composer' });
    this.inputEl = composer.createEl('textarea', {
      cls: 'codexian-input',
      attr: { placeholder: 'Ask Codex to work with this vault...' },
    });
    this.inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void this.submit();
      }
    });

    const actions = composer.createDiv({ cls: 'codexian-composer-actions' });
    actions.createEl('button', { text: 'Send', cls: 'codexian-button-primary' })
      .addEventListener('click', () => void this.submit());
    actions.createEl('button', { text: 'Generate visual' })
      .addEventListener('click', () => void this.plugin.generateImageFromActiveNote());
    actions.createEl('button', { text: 'Cancel' })
      .addEventListener('click', () => this.plugin.agent.cancel());
  }

  async onClose(): Promise<void> {
    this.plugin.agent.cancel();
  }

  private renderEmptyState(): void {
    this.logEl.empty();
    const empty = this.logEl.createDiv({ cls: 'codexian-message codexian-message-assistant' });
    empty.setText('Attach your current note implicitly, ask Codex for a change, or generate an image from the note.');
  }

  private renderContextRow(): void {
    if (!this.contextEl) return;
    this.contextEl.empty();

    const activeFile = this.plugin.getActiveMarkdownFile();
    const activeText = activeFile
      ? `${this.plugin.settings.autoIncludeActiveNote ? 'Auto' : 'Available'}: ${activeFile.path}`
      : 'No active note';
    this.contextEl.createSpan({ cls: 'codexian-context-chip', text: activeText });

    if (activeFile) {
      const isPinned = this.plugin.isNotePinned(activeFile.path);
      const button = this.contextEl.createEl('button', {
        cls: 'codexian-context-button',
        text: isPinned ? 'Unpin note' : 'Pin note',
      });
      button.addEventListener('click', async () => {
        if (isPinned) await this.plugin.unpinNote(activeFile.path);
        else await this.plugin.pinNote(activeFile.path);
        this.renderContextRow();
      });
    }

    const autoButton = this.contextEl.createEl('button', {
      cls: 'codexian-context-button',
      text: this.plugin.settings.autoIncludeActiveNote ? 'Auto note: on' : 'Auto note: off',
    });
    autoButton.addEventListener('click', async () => {
      this.plugin.settings.autoIncludeActiveNote = !this.plugin.settings.autoIncludeActiveNote;
      await this.plugin.saveSettings();
      this.renderContextRow();
    });

    for (const path of this.plugin.settings.pinnedNotePaths) {
      const chip = this.contextEl.createSpan({ cls: 'codexian-context-chip codexian-context-chip-pinned' });
      chip.setText(`Pinned: ${path}`);
      chip.addEventListener('click', () => void this.openPinnedNote(path));
    }
  }

  private async openPinnedNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !('extension' in file)) return;
    await this.app.workspace.getLeaf(false).openFile(file as TFile);
  }

  private async submit(): Promise<void> {
    const prompt = this.inputEl.value.trim();
    if (!prompt) return;

    this.inputEl.value = '';
    this.appendMessage({ role: 'user', content: prompt, timestamp: Date.now() });
    this.statusEl.setText('Running');

    try {
      const context = await this.plugin.getActiveNoteContext();
      let assistantBuffer = '';
      const assistantEl = this.createMessageEl('assistant');

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
          await this.renderMarkdown(assistantBuffer, assistantEl);
        } else if (event.type === 'error') {
          this.appendMessage({ role: 'error', content: event.content, timestamp: Date.now() });
        }
      }

      if (assistantBuffer.trim()) {
        this.messages.push({ role: 'assistant', content: assistantBuffer, timestamp: Date.now() });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message);
      this.appendMessage({ role: 'error', content: message, timestamp: Date.now() });
    } finally {
      this.statusEl.setText('Ready');
    }
  }

  private appendMessage(message: ConversationMessage): void {
    this.messages.push(message);
    const el = this.createMessageEl(message.role);
    if (message.role === 'assistant') {
      void this.renderMarkdown(message.content, el);
    } else {
      el.setText(message.content);
    }
  }

  private createMessageEl(role: ConversationMessage['role']): HTMLElement {
    if (this.messages.length === 1) {
      this.logEl.empty();
    }
    const className = role === 'user'
      ? 'codexian-message codexian-message-user'
      : role === 'error'
        ? 'codexian-message codexian-message-error'
        : 'codexian-message codexian-message-assistant';
    const el = this.logEl.createDiv({ cls: className });
    this.logEl.scrollTop = this.logEl.scrollHeight;
    return el;
  }

  private async renderMarkdown(markdown: string, el: HTMLElement): Promise<void> {
    el.empty();
    await MarkdownRenderer.renderMarkdown(markdown, el, '', this);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
}
