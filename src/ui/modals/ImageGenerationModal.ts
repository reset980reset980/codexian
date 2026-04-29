import { Modal, Setting, type App } from 'obsidian';

import type { ImageMode, VisualOutputType } from '../../core/types';

export interface ImageGenerationInput {
  mode: ImageMode;
  outputType: VisualOutputType;
  prompt: string;
}

export class ImageGenerationModal extends Modal {
  private resolve: ((value: ImageGenerationInput | null) => void) | null = null;
  private mode: ImageMode = 'infographic';
  private outputType: VisualOutputType = 'png';
  private prompt = '';

  constructor(app: App) {
    super(app);
  }

  openAndWait(): Promise<ImageGenerationInput | null> {
    this.open();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Codexian 시각 자료 생성' });
    contentEl.createEl('p', {
      text: 'Codexian이 현재 노트를 분석해 이미지 프롬프트를 작성하고, Codex CLI로 시각 자료를 생성한 뒤 노트 상단에 삽입합니다. API 키는 사용하지 않습니다.',
    });

    new Setting(contentEl)
      .setName('출력')
      .setDesc('Codex 내장 PNG 생성 또는 텍스트 안전 SVG 생성을 선택합니다.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('png', 'Codex 이미지 생성으로 PNG')
          .addOption('svg', 'Codex 코드 생성으로 SVG')
          .setValue(this.outputType)
          .onChange((value) => {
            this.outputType = value as VisualOutputType;
          });
      });

    new Setting(contentEl)
      .setName('형식')
      .setDesc('시각 자료 형식을 선택합니다.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('infographic', '인포그래픽')
          .addOption('poster', '포스터')
          .addOption('cartoon', '카툰')
          .addOption('concept', '컨셉 아트')
          .addOption('diagram', '다이어그램 일러스트')
          .addOption('thumbnail', '유튜브 썸네일')
          .addOption('avatar', '프로필 / 아바타')
          .addOption('product', '제품 마케팅')
          .addOption('ecommerce', '이커머스 히어로')
          .addOption('ui', 'UI / 앱 목업')
          .setValue(this.mode)
          .onChange((value) => {
            this.mode = value as ImageMode;
          });
      });

    new Setting(contentEl)
      .setName('지시사항')
      .setDesc('스타일, 대상 독자, 레이아웃, 포함할 내용 등을 선택적으로 입력합니다.')
      .addTextArea((text) => {
        text
          .setPlaceholder('뉴스레터 헤더에 어울리게, 간결한 한국어 라벨을 넣어줘...')
          .onChange((value) => {
            this.prompt = value;
          });
        text.inputEl.rows = 6;
        text.inputEl.style.width = '100%';
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('노트 분석 후 생성 및 삽입')
          .setCta()
          .onClick(() => {
            this.resolve?.({ mode: this.mode, outputType: this.outputType, prompt: this.prompt });
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
