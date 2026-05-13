import { ItemView, Notice, setIcon, type TFile, type WorkspaceLeaf } from 'obsidian';

import type CodexianPlugin from '../main';

export const VIEW_TYPE_CODEXIAN_GALAXY = 'codexian-galaxy-view';

interface GalaxyNode {
  id: string;
  path: string;
  title: string;
  folder: string;
  tags: string[];
  links: number;
  backlinks: number;
  size: number;
  color: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  screenX: number;
  screenY: number;
  screenSize: number;
  depth: number;
  selected: boolean;
  active: boolean;
  visible: boolean;
}

interface GalaxyEdge {
  source: GalaxyNode;
  target: GalaxyNode;
  type: 'link' | 'tag';
  weight: number;
}

interface GalaxyCluster {
  key: string;
  label: string;
  count: number;
  color: string;
  x: number;
  y: number;
  z: number;
}

interface GalaxyGraph {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  clusters: GalaxyCluster[];
}

const FOLDER_COLORS = [
  '#72f6d2',
  '#ffd166',
  '#a78bfa',
  '#5eead4',
  '#f97373',
  '#93c5fd',
  '#f5a524',
  '#c4f25f',
  '#fb7185',
  '#67e8f9',
];

export class GalaxyGraphView extends ItemView {
  private plugin: CodexianPlugin;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private infoEl: HTMLElement | null = null;
  private topicSelect: HTMLSelectElement | null = null;
  private limitSelect: HTMLSelectElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private autoRotateBtn: HTMLButtonElement | null = null;
  private collectBtn: HTMLButtonElement | null = null;
  private modeBtn: HTMLButtonElement | null = null;
  private graph: GalaxyGraph = { nodes: [], edges: [], clusters: [] };
  private selectedNode: GalaxyNode | null = null;
  private hoveredNode: GalaxyNode | null = null;
  private animationFrame = 0;
  private width = 1;
  private height = 1;
  private yaw = -0.35;
  private pitch = 0.38;
  private zoom = 1;
  private dragStart: { x: number; y: number; yaw: number; pitch: number } | null = null;
  private isAutoRotate = true;
  private includeTagEdges = true;
  private is2d = false;
  private query = '';
  private topic = 'all';
  private nodeLimit = 1500;

  constructor(leaf: WorkspaceLeaf, plugin: CodexianPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CODEXIAN_GALAXY;
  }

  getDisplayText(): string {
    return 'Codexian Galaxy 3D';
  }

  getIcon(): string {
    return 'orbit';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('oc-galaxy-view');

    const canvas = container.createEl('canvas', { cls: 'oc-galaxy-canvas' });
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    const controls = container.createDiv({ cls: 'oc-galaxy-controls' });
    this.buildControls(controls);

    this.infoEl = container.createDiv({ cls: 'oc-galaxy-info' });
    this.renderInfo();

    this.registerDomEvent(canvas, 'mousedown', (event) => this.onPointerDown(event));
    this.registerDomEvent(canvas, 'mousemove', (event) => this.onPointerMove(event));
    this.registerDomEvent(canvas, 'mouseup', () => this.onPointerUp());
    this.registerDomEvent(canvas, 'mouseleave', () => this.onPointerUp());
    this.registerDomEvent(canvas, 'wheel', (event) => this.onWheel(event));
    this.registerDomEvent(canvas, 'click', () => this.selectHoveredNode());
    this.registerDomEvent(canvas, 'dblclick', () => void this.openSelectedNode());
    this.registerEvent(this.app.workspace.on('file-open', () => this.markActiveNode()));
    this.registerEvent(this.app.metadataCache.on('changed', () => this.scheduleRebuild()));
    this.registerEvent(this.app.metadataCache.on('deleted', () => this.scheduleRebuild()));

    this.resize();
    this.registerDomEvent(window, 'resize', () => this.resize());
    await this.rebuildGraph();
    this.animate();
  }

  async onClose(): Promise<void> {
    if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
  }

  private buildControls(parent: HTMLElement): void {
    const title = parent.createDiv({ cls: 'oc-galaxy-title' });
    title.createDiv({ cls: 'oc-galaxy-title-main', text: 'OBSIDIAN GALAXY 3D' });
    title.createDiv({ cls: 'oc-galaxy-title-sub', text: `Vault: ${this.plugin.getVaultPath().split(/[\\/]/).pop() || 'Obsidian'}` });

    const stats = parent.createDiv({ cls: 'oc-galaxy-stats' });
    stats.createSpan({ cls: 'oc-galaxy-stat', text: '노트 수집 중' });

    const searchRow = parent.createDiv({ cls: 'oc-galaxy-row' });
    this.searchInput = searchRow.createEl('input', {
      cls: 'oc-galaxy-search',
      attr: { type: 'search', placeholder: '노트/태그/폴더 검색' },
    });
    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput?.value.trim().toLowerCase() || '';
      this.applyVisibility();
    });
    const searchBtn = searchRow.createEl('button', { cls: 'oc-galaxy-button', text: '검색' });
    searchBtn.addEventListener('click', () => this.applyVisibility());
    const resetBtn = searchRow.createEl('button', { cls: 'oc-galaxy-button', text: '초기화' });
    resetBtn.addEventListener('click', () => {
      if (this.searchInput) this.searchInput.value = '';
      this.query = '';
      this.topic = 'all';
      if (this.topicSelect) this.topicSelect.value = 'all';
      this.applyVisibility();
      this.refocus();
    });

    const filters = parent.createDiv({ cls: 'oc-galaxy-row' });
    this.topicSelect = filters.createEl('select', { cls: 'oc-galaxy-select' });
    this.topicSelect.addEventListener('change', () => {
      this.topic = this.topicSelect?.value || 'all';
      this.applyVisibility();
    });
    this.limitSelect = filters.createEl('select', { cls: 'oc-galaxy-select' });
    for (const limit of [300, 800, 1500, 3000]) {
      const option = this.limitSelect.createEl('option', { text: `${limit} 통합함`, value: String(limit) });
      option.selected = limit === this.nodeLimit;
    }
    this.limitSelect.addEventListener('change', async () => {
      this.nodeLimit = Number(this.limitSelect?.value || 1500);
      await this.rebuildGraph();
    });

    const actions = parent.createDiv({ cls: 'oc-galaxy-action-grid' });
    actions.appendChild(this.iconButton('재초점', 'scan-search', () => this.refocus()));
    this.autoRotateBtn = this.iconButton('자동회전', 'rotate-3d', () => {
      this.isAutoRotate = !this.isAutoRotate;
      this.updateToggleButtons();
    });
    actions.appendChild(this.autoRotateBtn);
    this.collectBtn = this.iconButton('수집 빛 ON', 'network', () => {
      this.includeTagEdges = !this.includeTagEdges;
      this.updateToggleButtons();
      this.applyVisibility();
    });
    actions.appendChild(this.collectBtn);
    this.modeBtn = this.iconButton('2D 보기', 'panel-top', () => {
      this.is2d = !this.is2d;
      this.updateToggleButtons();
    });
    actions.appendChild(this.modeBtn);

    const legend = parent.createDiv({ cls: 'oc-galaxy-legend' });
    legend.createDiv({ cls: 'oc-galaxy-legend-title', text: '주제 군집' });
    legend.createDiv({ cls: 'oc-galaxy-legend-list' });
    this.updateToggleButtons();
  }

  private iconButton(label: string, icon: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'oc-galaxy-button oc-galaxy-icon-button';
    setIcon(button.createSpan({ cls: 'oc-galaxy-button-icon' }), icon);
    button.createSpan({ text: label });
    button.addEventListener('click', onClick);
    return button;
  }

  private async rebuildGraph(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles()
      .filter((file) => !this.plugin.isNoteExcluded(file.path))
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, this.nodeLimit);
    const fileSet = new Set(files.map((file) => file.path));
    const folders = Array.from(new Set(files.map((file) => rootFolder(file.path)))).sort();
    const clusterMap = new Map<string, GalaxyCluster>();
    folders.forEach((folder, index) => {
      const angle = (index / Math.max(folders.length, 1)) * Math.PI * 2;
      const radius = 540 + (index % 3) * 210;
      const cluster: GalaxyCluster = {
        key: folder,
        label: folder,
        count: files.filter((file) => rootFolder(file.path) === folder).length,
        color: FOLDER_COLORS[index % FOLDER_COLORS.length],
        x: Math.cos(angle) * radius,
        y: Math.sin(angle * 1.7) * 180,
        z: Math.sin(angle) * radius,
      };
      clusterMap.set(folder, cluster);
    });

    const inbound = new Map<string, number>();
    for (const [source, links] of Object.entries(this.app.metadataCache.resolvedLinks)) {
      if (!fileSet.has(source)) continue;
      for (const target of Object.keys(links)) {
        if (!fileSet.has(target)) continue;
        inbound.set(target, (inbound.get(target) || 0) + links[target]);
      }
    }

    const nodes = files.map((file, index) => this.createNode(file, index, clusterMap, inbound));
    const nodeByPath = new Map(nodes.map((node) => [node.path, node]));
    const edges: GalaxyEdge[] = [];
    for (const [sourcePath, links] of Object.entries(this.app.metadataCache.resolvedLinks)) {
      const source = nodeByPath.get(sourcePath);
      if (!source) continue;
      for (const [targetPath, count] of Object.entries(links)) {
        const target = nodeByPath.get(targetPath);
        if (!target || target === source) continue;
        edges.push({ source, target, type: 'link', weight: Math.min(4, count) });
      }
    }
    edges.push(...this.buildTagEdges(nodes));

    this.graph = { nodes, edges, clusters: Array.from(clusterMap.values()) };
    this.populateTopicSelect();
    this.applyVisibility();
    this.markActiveNode();
    this.refocus();
  }

  private createNode(
    file: TFile,
    index: number,
    clusterMap: Map<string, GalaxyCluster>,
    inbound: Map<string, number>,
  ): GalaxyNode {
    const folder = rootFolder(file.path);
    const cluster = clusterMap.get(folder) || clusterMap.values().next().value as GalaxyCluster;
    const cache = this.app.metadataCache.getFileCache(file);
    const tags = Array.from(new Set([
      ...(cache?.tags?.map((tag) => tag.tag.replace(/^#/, '')) || []),
      ...frontmatterTags(cache?.frontmatter?.tags),
    ].filter(Boolean))).slice(0, 8);
    const outgoing = Object.keys(this.app.metadataCache.resolvedLinks[file.path] || {}).length;
    const incoming = inbound.get(file.path) || 0;
    const spiral = index * 0.73;
    const radius = 36 + (index % 43) * 3.8;
    const jitter = hashToUnit(file.path);
    return {
      id: `node-${index}`,
      path: file.path,
      title: file.basename,
      folder,
      tags,
      links: outgoing,
      backlinks: incoming,
      size: Math.min(12, 3 + Math.sqrt(outgoing + incoming + 1) * 1.7),
      color: cluster.color,
      x: cluster.x + Math.cos(spiral) * radius + (jitter - 0.5) * 120,
      y: cluster.y + Math.sin(index * 1.91) * 95,
      z: cluster.z + Math.sin(spiral) * radius + (0.5 - jitter) * 120,
      vx: 0,
      vy: 0,
      vz: 0,
      screenX: 0,
      screenY: 0,
      screenSize: 0,
      depth: 0,
      selected: false,
      active: false,
      visible: true,
    };
  }

  private buildTagEdges(nodes: GalaxyNode[]): GalaxyEdge[] {
    const byTag = new Map<string, GalaxyNode[]>();
    for (const node of nodes) {
      for (const tag of node.tags) {
        const bucket = byTag.get(tag) || [];
        bucket.push(node);
        byTag.set(tag, bucket);
      }
    }
    const edges: GalaxyEdge[] = [];
    for (const bucket of byTag.values()) {
      if (bucket.length < 2 || bucket.length > 40) continue;
      for (let index = 1; index < bucket.length; index += 1) {
        edges.push({ source: bucket[0], target: bucket[index], type: 'tag', weight: 0.55 });
      }
    }
    return edges;
  }

  private populateTopicSelect(): void {
    if (!this.topicSelect) return;
    this.topicSelect.empty();
    this.topicSelect.createEl('option', { text: '전체 주제', value: 'all' });
    for (const cluster of this.graph.clusters) {
      const option = this.topicSelect.createEl('option', { text: `${cluster.label} ${cluster.count}`, value: cluster.key });
      option.selected = cluster.key === this.topic;
    }
    if (!Array.from(this.topicSelect.options).some((option) => option.value === this.topic)) this.topic = 'all';
    this.topicSelect.value = this.topic;
    this.renderLegend();
    this.renderStats();
  }

  private applyVisibility(): void {
    const query = this.query;
    for (const node of this.graph.nodes) {
      const topicMatch = this.topic === 'all' || node.folder === this.topic;
      const queryMatch = !query
        || node.title.toLowerCase().includes(query)
        || node.path.toLowerCase().includes(query)
        || node.tags.some((tag) => tag.toLowerCase().includes(query));
      node.visible = topicMatch && queryMatch;
    }
    this.renderStats();
  }

  private renderStats(): void {
    const root = this.containerEl.querySelector('.oc-galaxy-stats');
    if (!root) return;
    root.empty();
    const visible = this.graph.nodes.filter((node) => node.visible).length;
    const linkCount = this.graph.edges.filter((edge) => edge.type === 'link').length;
    root.createSpan({ cls: 'oc-galaxy-stat', text: `전체 노트 ${this.graph.nodes.length}` });
    root.createSpan({ cls: 'oc-galaxy-stat', text: `표시 ${visible}` });
    root.createSpan({ cls: 'oc-galaxy-stat', text: `연결 ${linkCount}` });
    root.createSpan({ cls: 'oc-galaxy-stat', text: `군집 ${this.graph.clusters.length}` });
  }

  private renderLegend(): void {
    const list = this.containerEl.querySelector('.oc-galaxy-legend-list') as HTMLElement | null;
    if (!list) return;
    list.empty();
    for (const cluster of this.graph.clusters.slice(0, 10)) {
      const item = list.createDiv({ cls: 'oc-galaxy-legend-item' });
      item.createSpan({ cls: 'oc-galaxy-swatch' }).style.backgroundColor = cluster.color;
      item.createSpan({ text: `${cluster.label} ${cluster.count}` });
      item.addEventListener('click', () => {
        this.topic = cluster.key;
        if (this.topicSelect) this.topicSelect.value = cluster.key;
        this.applyVisibility();
      });
    }
  }

  private updateToggleButtons(): void {
    this.autoRotateBtn?.toggleClass('is-active', this.isAutoRotate);
    this.collectBtn?.toggleClass('is-active', this.includeTagEdges);
    this.modeBtn?.toggleClass('is-active', this.is2d);
    if (this.collectBtn) this.collectBtn.lastElementChild?.setText(this.includeTagEdges ? '수집 빛 ON' : '수집 빛 OFF');
    if (this.modeBtn) this.modeBtn.lastElementChild?.setText(this.is2d ? '3D 보기' : '2D 보기');
  }

  private resize(): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * ratio);
    this.canvas.height = Math.floor(this.height * ratio);
    this.ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  private animate(): void {
    if (this.isAutoRotate && !this.dragStart && !this.is2d) this.yaw += 0.0016;
    this.draw();
    this.animationFrame = window.requestAnimationFrame(() => this.animate());
  }

  private draw(): void {
    if (!this.ctx) return;
    this.resize();
    this.drawBackground(this.ctx);
    const projected = this.projectNodes();
    this.drawEdges(this.ctx);
    for (const node of projected) this.drawNode(this.ctx, node);
    this.drawClusterLabels(this.ctx);
    this.drawHoverLabel(this.ctx);
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.globalAlpha = 0.46;
    for (let i = 0; i < 120; i += 1) {
      const x = ((i * 137.5) % this.width);
      const y = ((i * 71.3) % this.height);
      const size = 0.5 + ((i * 17) % 4) * 0.35;
      ctx.fillStyle = i % 7 === 0 ? '#b7f7ff' : '#ffffff';
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
  }

  private projectNodes(): GalaxyNode[] {
    const visible = this.graph.nodes.filter((node) => node.visible);
    for (const node of visible) this.project(node);
    return visible.sort((a, b) => a.depth - b.depth);
  }

  private project(node: GalaxyNode): void {
    if (this.is2d) {
      const scale = 0.55 * this.zoom;
      node.screenX = this.width / 2 + node.x * scale;
      node.screenY = this.height / 2 + node.z * scale;
      node.depth = 1;
      node.screenSize = Math.max(2, node.size * this.zoom);
      return;
    }
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const x1 = node.x * cosY - node.z * sinY;
    const z1 = node.x * sinY + node.z * cosY;
    const y1 = node.y * cosP - z1 * sinP;
    const z2 = node.y * sinP + z1 * cosP;
    const depth = 1450 + z2;
    const perspective = Math.max(0.18, 950 / Math.max(320, depth)) * this.zoom;
    node.screenX = this.width / 2 + x1 * perspective;
    node.screenY = this.height / 2 + y1 * perspective;
    node.depth = depth;
    node.screenSize = Math.max(1.4, node.size * perspective);
  }

  private drawEdges(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineCap = 'round';
    for (const edge of this.graph.edges) {
      if (!edge.source.visible || !edge.target.visible) continue;
      if (edge.type === 'tag' && !this.includeTagEdges) continue;
      const alpha = edge.type === 'tag' ? 0.08 : 0.18;
      ctx.globalAlpha = alpha * Math.min(1, (edge.source.screenSize + edge.target.screenSize) / 12);
      ctx.strokeStyle = edge.type === 'tag' ? '#b7ffde' : '#f7d26b';
      ctx.lineWidth = edge.weight;
      ctx.beginPath();
      ctx.moveTo(edge.source.screenX, edge.source.screenY);
      ctx.lineTo(edge.target.screenX, edge.target.screenY);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawNode(ctx: CanvasRenderingContext2D, node: GalaxyNode): void {
    const glow = node.selected || node.active || node === this.hoveredNode;
    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.34 + node.screenSize / 16);
    ctx.shadowColor = node.color;
    ctx.shadowBlur = glow ? 24 : 8;
    ctx.fillStyle = node.active ? '#ffffff' : node.color;
    ctx.beginPath();
    ctx.arc(node.screenX, node.screenY, node.screenSize * (glow ? 1.35 : 1), 0, Math.PI * 2);
    ctx.fill();
    if (node.links + node.backlinks > 16 || glow) {
      ctx.globalAlpha = glow ? 0.45 : 0.18;
      ctx.strokeStyle = node.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(node.screenX, node.screenY, node.screenSize * 4.4, node.screenSize * 1.45, this.yaw, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawClusterLabels(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const cluster of this.graph.clusters) {
      const sample = this.graph.nodes.find((node) => node.folder === cluster.key && node.visible);
      if (!sample) continue;
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = '#f8fafc';
      ctx.shadowColor = '#020617';
      ctx.shadowBlur = 8;
      ctx.fillText(`${cluster.label} ${cluster.count}`, sample.screenX, sample.screenY - 34);
    }
    ctx.restore();
  }

  private drawHoverLabel(ctx: CanvasRenderingContext2D): void {
    const node = this.hoveredNode;
    if (!node) return;
    ctx.save();
    const text = node.title;
    ctx.font = '600 13px system-ui, sans-serif';
    const width = ctx.measureText(text).width + 18;
    const x = Math.min(this.width - width - 14, node.screenX + 16);
    const y = Math.max(18, node.screenY - 22);
    ctx.fillStyle = 'rgba(4, 8, 22, 0.86)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    roundRect(ctx, x, y, width, 28, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(text, x + 9, y + 18);
    ctx.restore();
  }

  private onPointerDown(event: MouseEvent): void {
    this.dragStart = { x: event.clientX, y: event.clientY, yaw: this.yaw, pitch: this.pitch };
  }

  private onPointerMove(event: MouseEvent): void {
    if (this.dragStart) {
      const dx = event.clientX - this.dragStart.x;
      const dy = event.clientY - this.dragStart.y;
      this.yaw = this.dragStart.yaw + dx * 0.006;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.dragStart.pitch + dy * 0.004));
      return;
    }
    this.hoveredNode = this.findNodeAt(event.offsetX, event.offsetY);
    if (this.canvas) this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
  }

  private onPointerUp(): void {
    this.dragStart = null;
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    this.zoom = Math.max(0.35, Math.min(3.4, this.zoom * factor));
  }

  private findNodeAt(x: number, y: number): GalaxyNode | null {
    let best: GalaxyNode | null = null;
    let bestDistance = Infinity;
    for (const node of this.graph.nodes) {
      if (!node.visible) continue;
      const dx = node.screenX - x;
      const dy = node.screenY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < Math.max(9, node.screenSize * 2.2) && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }

  private selectHoveredNode(): void {
    if (!this.hoveredNode) return;
    this.selectedNode = this.hoveredNode;
    for (const node of this.graph.nodes) node.selected = node === this.selectedNode;
    this.renderInfo();
  }

  private async openSelectedNode(): Promise<void> {
    const node = this.selectedNode || this.hoveredNode;
    if (!node) return;
    const file = this.app.vault.getAbstractFileByPath(node.path);
    if (!file || !('extension' in file)) {
      new Notice('노트를 찾지 못했습니다.');
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(file as TFile);
  }

  private markActiveNode(): void {
    const activePath = this.plugin.getActiveMarkdownFile()?.path || '';
    for (const node of this.graph.nodes) node.active = node.path === activePath;
    if (!this.selectedNode && activePath) {
      this.selectedNode = this.graph.nodes.find((node) => node.path === activePath) || null;
      if (this.selectedNode) this.selectedNode.selected = true;
      this.renderInfo();
    }
  }

  private renderInfo(): void {
    if (!this.infoEl) return;
    this.infoEl.empty();
    const node = this.selectedNode;
    if (!node) {
      this.infoEl.createDiv({ cls: 'oc-galaxy-info-title', text: '노트를 선택하세요' });
      this.infoEl.createDiv({ cls: 'oc-galaxy-info-empty', text: '은하의 노드를 클릭하면 노트 정보와 연결 수를 볼 수 있습니다.' });
      return;
    }
    this.infoEl.createDiv({ cls: 'oc-galaxy-info-title', text: node.title });
    const meta = this.infoEl.createDiv({ cls: 'oc-galaxy-info-meta' });
    meta.createDiv({ text: `주제: ${node.folder}` });
    meta.createDiv({ text: `연결: ${node.links}` });
    meta.createDiv({ text: `백링크: ${node.backlinks}` });
    meta.createDiv({ text: `파일: ${node.path}` });
    if (node.tags.length > 0) {
      const tags = this.infoEl.createDiv({ cls: 'oc-galaxy-tags' });
      for (const tag of node.tags) tags.createSpan({ text: `#${tag}` });
    }
    const actions = this.infoEl.createDiv({ cls: 'oc-galaxy-info-actions' });
    const open = actions.createEl('button', { cls: 'oc-galaxy-button is-active', text: '노트 열기' });
    open.addEventListener('click', () => void this.openSelectedNode());
    const pin = actions.createEl('button', { cls: 'oc-galaxy-button', text: this.plugin.isNotePinned(node.path) ? '고정 해제' : '컨텍스트 고정' });
    pin.addEventListener('click', async () => {
      if (!this.selectedNode) return;
      if (this.plugin.isNotePinned(this.selectedNode.path)) await this.plugin.unpinNote(this.selectedNode.path);
      else await this.plugin.pinNote(this.selectedNode.path);
      this.renderInfo();
    });
  }

  private refocus(): void {
    this.zoom = 1;
    this.yaw = -0.35;
    this.pitch = this.is2d ? 0 : 0.38;
  }

  private scheduleRebuild(): void {
    window.setTimeout(() => void this.rebuildGraph(), 350);
  }
}

function rootFolder(path: string): string {
  const parts = path.split('/');
  return parts.length > 1 ? parts[0] : '루트';
}

function hashToUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function frontmatterTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[,\s]+/).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean);
  }
  if (typeof value === 'object') return Object.keys(value).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean);
  return [];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
