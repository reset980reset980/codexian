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
    contentEl.createEl('h2', { text: '생성된 이미지 프롬프트 검토' });
    const outputLabel = this.outputType.toUpperCase();
    contentEl.createEl('p', {
      text: `Codexian이 현재 노트에서 이 프롬프트를 작성했습니다. 필요하면 수정한 뒤 ${outputLabel} 시각 자료를 생성하세요.`,
    });

    new Setting(contentEl)
      .setName('생성된 프롬프트')
      .setDesc(`이 구조화 프롬프트가 ${outputLabel} 생성 단계에 적용됩니다.`)
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
          .setButtonText(`이 프롬프트로 ${outputLabel} 생성`)
          .setCta()
          .onClick(() => {
            this.resolve?.(this.prompt.trim());
            this.resolve = null;
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('취소')
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
