import { Modal, Setting, type App } from 'obsidian';

import type { VisualOutputType } from '../../core/types';

export class VisualPromptPreviewModal extends Modal {
  private resolve: ((value: string | null) => void) | null = null;
  private prompt: string;
  private outputType: VisualOutputType;

  constructor(app: App, prompt: string, outputType: VisualOutputType) {
    super(app);
    this.prompt = prompt;
    this.outputType = outputType;
  }

  openAndWait(): Promise<string | null> {
    this.open();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Review generated image prompt' });
    const outputLabel = this.outputType.toUpperCase();
    contentEl.createEl('p', {
      text: `Codexian drafted this prompt from the current note. Edit it if needed, then generate the ${outputLabel} visual asset.`,
    });

    new Setting(contentEl)
      .setName('Generated prompt')
      .setDesc(`This structured prompt will be applied to the ${outputLabel} generation step.`)
      .addTextArea((text) => {
        text
          .setValue(this.prompt)
          .onChange((value) => {
            this.prompt = value;
          });
        text.inputEl.rows = 14;
        text.inputEl.style.width = '100%';
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText(`Generate ${outputLabel} with this prompt`)
          .setCta()
          .onClick(() => {
            this.resolve?.(this.prompt.trim());
            this.resolve = null;
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('Cancel')
          .onClick(() => {
            this.resolve?.(null);
            this.resolve = null;
            this.close();
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.resolve) {
      this.resolve(null);
      this.resolve = null;
    }
  }
}
