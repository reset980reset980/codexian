import { Notice, PluginSettingTab, Setting } from 'obsidian';

import type CodexianPlugin from '../../main';
import type { PermissionMode, ReasoningEffort } from '../../core/types';
import { findCodexCli } from '../../core/codex/CodexCliResolver';
import { buildProcessEnv } from '../../core/settings/env';
import {
  enableCodexImageGeneration,
  getCodexUpdatePreview,
  getInstallPreview,
  getObsidianSkillsPreview,
  installOrUpdateObsidianSkills,
  installOrUpdateOmx,
  updateCodexCli,
} from '../../core/installer/OmxInstaller';
import { probeEnvironment } from '../../core/installer/EnvironmentProbe';

export class CodexianSettingsTab extends PluginSettingTab {
  plugin: CodexianPlugin;
  private diagnosticsEl: HTMLElement | null = null;

  constructor(plugin: CodexianPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Codexian' });

    const statusCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    statusCard.createEl('h3', { text: 'Codex 설정' });
    statusCard.createEl('p', {
      text: 'Obsidian에서 사용할 Codex CLI, 모델, 추론 수준, 실행 환경을 설정합니다.',
    });
    const detectedCodex = findCodexCli('', buildProcessEnv(this.plugin.settings.environmentVariables).PATH);
    statusCard.createEl('p', {
      cls: 'codexian-settings-hint',
      text: detectedCodex ? `감지된 Codex CLI: ${detectedCodex}` : '아직 Codex CLI를 자동으로 찾지 못했습니다.',
    });

    new Setting(statusCard)
      .setName('Codex CLI 경로')
      .setDesc('자동 감지를 쓰려면 비워두거나, 감지된 경로 사용을 눌러 현재 경로를 고정합니다.')
      .addText((text) => text
        .setPlaceholder(process.platform === 'win32' ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\codex.cmd' : '/opt/homebrew/bin/codex')
        .setValue(this.plugin.settings.codexCliPath)
        .onChange(async (value) => {
          this.plugin.settings.codexCliPath = value.trim();
          await this.plugin.saveSettings();
        }))
      .addButton((button) => button
        .setButtonText('감지된 경로 사용')
        .setDisabled(!detectedCodex)
        .onClick(async () => {
          if (!detectedCodex) return;
          this.plugin.settings.codexCliPath = detectedCodex;
          await this.plugin.saveSettings();
          this.display();
        }));

    new Setting(statusCard)
      .setName('모델')
      .addText((text) => text
        .setValue(this.plugin.settings.codexModel)
        .onChange(async (value) => {
          this.plugin.settings.codexModel = value.trim() || 'gpt-5.5';
          await this.plugin.saveSettings();
        }));

    new Setting(statusCard)
      .setName('추론 수준')
      .addDropdown((dropdown) => dropdown
        .addOption('low', '낮음')
        .addOption('medium', '보통')
        .addOption('high', '높음')
        .addOption('xhigh', '매우 높음')
        .setValue(this.plugin.settings.reasoningEffort)
        .onChange(async (value) => {
          this.plugin.settings.reasoningEffort = value as ReasoningEffort;
          await this.plugin.saveSettings();
        }));

    new Setting(statusCard)
      .setName('권한 모드')
      .setDesc('검토는 작업공간 샌드박스를 사용합니다. 자동은 Codex full-auto에 대응합니다. 무제한은 승인과 샌드박스를 우회합니다.')
      .addDropdown((dropdown) => dropdown
        .addOption('review', '검토')
        .addOption('auto', '자동')
        .addOption('yolo', '무제한')
        .setValue(this.plugin.settings.permissionMode)
        .onChange(async (value) => {
          this.plugin.settings.permissionMode = value as PermissionMode;
          await this.plugin.saveSettings();
        }));

    new Setting(statusCard)
      .setName('활성 노트 자동 포함')
      .setDesc('현재 열려 있는 마크다운 노트를 모든 Codex 프롬프트에 자동으로 첨부합니다.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoIncludeActiveNote)
        .onChange(async (value) => {
          this.plugin.settings.autoIncludeActiveNote = value;
          await this.plugin.saveSettings();
        }));

    const envCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    envCard.createEl('h3', { text: '환경 변수' });
    new Setting(envCard)
      .setName('환경 변수')
      .setDesc('한 줄에 KEY=VALUE 하나씩 입력합니다. 주로 Obsidian이 codex, npm, omx를 찾을 수 있도록 PATH를 넘길 때 사용합니다.')
      .addTextArea((text) => {
        text
          .setPlaceholder('PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin')
          .setValue(this.plugin.settings.environmentVariables)
          .onChange(async (value) => {
            this.plugin.settings.environmentVariables = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.style.width = '100%';
      });

    const imageCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    imageCard.createEl('h3', { text: '시각 자료' });
    imageCard.createEl('p', {
      text: 'Codexian은 Codex CLI로 노트에서 PNG 또는 SVG 시각 자료를 만듭니다. PNG 생성에는 image_generation이 활성화된 최신 Codex CLI가 필요하며 API 키는 필요하지 않습니다.',
    });
    new Setting(imageCard)
      .setName('미디어 폴더')
      .addText((text) => text
        .setValue(this.plugin.settings.mediaFolder)
        .onChange(async (value) => {
          this.plugin.settings.mediaFolder = value.trim() || 'attachments/codexian';
          await this.plugin.saveSettings();
        }));

    const sukgoCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    sukgoCard.createEl('h3', { text: '숙고 사고' });
    sukgoCard.createEl('p', {
      text: '현재 노트와 메모리 맵 컨텍스트로 생성한 구조화 사고 노트를 저장합니다.',
    });
    new Setting(sukgoCard)
      .setName('숙고 출력 폴더')
      .addText((text) => text
        .setValue(this.plugin.settings.sukgoFolder)
        .onChange(async (value) => {
          this.plugin.settings.sukgoFolder = value.trim() || 'Sukgo';
          await this.plugin.saveSettings();
        }));

    const omxCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    omxCard.createEl('h3', { text: 'oh-my-codex' });
    omxCard.createEl('p', { text: 'Codex CLI와 OMX를 설치하거나 업데이트합니다. 실행 전에 명령 미리보기를 확인하세요.' });
    omxCard.createEl('pre', { cls: 'codexian-status-line', text: getInstallPreview() });

    new Setting(omxCard)
      .addButton((button) => button
        .setButtonText('진단 실행')
        .onClick(() => void this.runDiagnostics()))
      .addButton((button) => button
        .setButtonText('Codex + OMX 설치/업데이트')
        .setCta()
        .onClick(() => void this.installOmx()));

    this.diagnosticsEl = omxCard.createDiv({ cls: 'codexian-status-line' });
    this.diagnosticsEl.setText('아직 진단을 실행하지 않았습니다.');

    const codexUpdateCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    codexUpdateCard.createEl('h3', { text: 'Codex CLI 업데이트' });
    codexUpdateCard.createEl('p', {
      text: 'Codex CLI를 업데이트하고 PNG 시각 자료에 쓰이는 내장 image_generation 기능을 활성화합니다.',
    });
    codexUpdateCard.createEl('pre', { cls: 'codexian-status-line', text: getCodexUpdatePreview() });

    new Setting(codexUpdateCard)
      .addButton((button) => button
        .setButtonText('Codex CLI 업데이트')
        .setCta()
        .onClick(() => void this.updateCodexCli()))
      .addButton((button) => button
        .setButtonText('이미지 생성 활성화')
        .onClick(() => void this.enableImageGeneration()));

    const skillsCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    skillsCard.createEl('h3', { text: 'Obsidian Skills' });
    skillsCard.createEl('p', {
      text: 'Codex CLI용 kepano/obsidian-skills를 설치하거나 업데이트합니다. 이 스킬은 Codex에 Obsidian Markdown, Bases, Canvas, CLI 워크플로를 알려줍니다.',
    });
    skillsCard.createEl('pre', { cls: 'codexian-status-line', text: getObsidianSkillsPreview() });

    new Setting(skillsCard)
      .addButton((button) => button
        .setButtonText('Obsidian Skills 설치/업데이트')
        .setCta()
        .onClick(() => void this.installObsidianSkills()));
  }

  private async runDiagnostics(): Promise<void> {
    if (!this.diagnosticsEl) return;
    this.diagnosticsEl.setText('진단 실행 중...');
    const results = await probeEnvironment(this.plugin.settings.environmentVariables);
    this.diagnosticsEl.setText(results
      .map((result) => `${result.ok ? '통과' : '경고'} ${result.label}\n${result.detail}`)
      .join('\n\n'));
  }

  private async installOmx(): Promise<void> {
    if (!this.diagnosticsEl) return;
    this.diagnosticsEl.setText('설치 중...\n');
    try {
      await installOrUpdateOmx(this.plugin.settings.environmentVariables, (line) => {
        this.diagnosticsEl?.appendText(line);
      });
      this.plugin.settings.omx.enabled = true;
      this.plugin.settings.omx.lastDoctorStatus = 'pass';
      this.plugin.settings.omx.lastCheckedAt = Date.now();
      await this.plugin.saveSettings();
      new Notice('Codex + OMX 설정 완료.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.diagnosticsEl.appendText(`\n실패: ${message}`);
      new Notice(`Codexian 설정 실패: ${message}`);
    }
  }

  private async updateCodexCli(): Promise<void> {
    if (!this.diagnosticsEl) return;
    this.diagnosticsEl.setText('Codex CLI 업데이트 중...\n');
    try {
      await updateCodexCli(this.plugin.settings.environmentVariables, (line) => {
        this.diagnosticsEl?.appendText(line);
      });
      new Notice('Codex CLI 업데이트 완료.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.diagnosticsEl.appendText(`\n실패: ${message}`);
      new Notice(`Codex CLI 업데이트 실패: ${message}`);
    }
  }

  private async enableImageGeneration(): Promise<void> {
    if (!this.diagnosticsEl) return;
    this.diagnosticsEl.setText('Codex image_generation 활성화 중...\n');
    try {
      await enableCodexImageGeneration(this.plugin.settings.environmentVariables, (line) => {
        this.diagnosticsEl?.appendText(line);
      });
      new Notice('Codex image_generation 활성화 완료.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.diagnosticsEl.appendText(`\n실패: ${message}`);
      new Notice(`Codex image_generation 설정 실패: ${message}`);
    }
  }

  private async installObsidianSkills(): Promise<void> {
    if (!this.diagnosticsEl) return;
    this.diagnosticsEl.setText('Obsidian Skills 설치 중...\n');
    try {
      await installOrUpdateObsidianSkills(this.plugin.settings.environmentVariables, (line) => {
        this.diagnosticsEl?.appendText(line);
      });
      new Notice('Obsidian Skills 설치 완료. 적용하려면 Codexian 세션을 다시 시작하세요.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.diagnosticsEl.appendText(`\n실패: ${message}`);
      new Notice(`Obsidian Skills 설정 실패: ${message}`);
    }
  }
}
