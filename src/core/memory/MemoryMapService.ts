import type { App, TFile } from 'obsidian';

import type { MemoryMapEntry, MemoryMapIndex, MemoryMapResult } from '../types';

const INDEX_PATH = '.codexian/memory/index.json';
const STOP_WORDS = new Set([
  '그리고', '그러나', '이것', '저것', '하는', '있는', '없는', 'the', 'and', 'for', 'with', 'that', 'this',
  'from', 'into', 'about', 'note', 'notes', '정리', '내용', '문서', '관련', '키워드', '자료', '수업', '교육',
  'https', 'http', 'www', 'com', 'net', 'org', 'html', 'utm', 'amp', 'nbsp', 'pdf', 'jpg', 'png', 'md',
  '그리고', '또는', '하지만', '때문에', '위해서', '통해서', '대해서', '입니다', '합니다', '있는지', '있습니다',
]);

const NOISY_TERM = /^(?:https?|www|com|net|org|html?|utm|ref|amp|nbsp|localhost|\d+|[a-f0-9]{8,})$/i;

export class MemoryMapService {
  private app: App;
  private index: MemoryMapIndex | null = null;

  constructor(app: App) {
    this.app = app;
  }

  async build(): Promise<MemoryMapIndex> {
    const entries: MemoryMapEntry[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      entries.push(this.toEntry(file, content));
    }

    this.index = { version: 2, builtAt: Date.now(), entries };
    await this.persist(this.index);
    return this.index;
  }

  async load(): Promise<MemoryMapIndex | null> {
    if (this.index) return this.index;
    const adapter = this.app.vault.adapter;
    try {
      if (!await adapter.exists(INDEX_PATH)) return null;
      const parsed = JSON.parse(await adapter.read(INDEX_PATH)) as MemoryMapIndex;
      if (parsed.version !== 2 || !Array.isArray(parsed.entries)) return null;
      this.index = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  async getStatus(): Promise<{ built: boolean; count: number; builtAt: number | null }> {
    const index = await this.load();
    return {
      built: Boolean(index),
      count: index?.entries.length || 0,
      builtAt: index?.builtAt || null,
    };
  }

  async findRelated(currentFile: TFile, limit = 8): Promise<MemoryMapResult[]> {
    const index = await this.load() || await this.build();
    const current = index.entries.find((entry) => entry.path === currentFile.path);
    if (!current) return [];
    const stats = this.createCorpusStats(index.entries);

    return index.entries
      .filter((entry) => entry.path !== current.path)
      .map((entry) => this.score(current, entry, stats))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async persist(index: MemoryMapIndex): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!await adapter.exists('.codexian')) await adapter.mkdir('.codexian');
    if (!await adapter.exists('.codexian/memory')) await adapter.mkdir('.codexian/memory');
    await adapter.write(INDEX_PATH, JSON.stringify(index, null, 2));
  }

  private toEntry(file: TFile, content: string): MemoryMapEntry {
    const title = file.basename;
    const folder = file.parent?.path || '';
    const tags = this.extractTags(content);
    const links = [...content.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)]
      .map((match) => match[1].trim())
      .filter(Boolean);
    const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gm)]
      .map((match) => match[1].trim())
      .slice(0, 20);

    return {
      path: file.path,
      title,
      folder,
      tags,
      links,
      headings,
      keywords: this.extractKeywords(title, tags, links, headings, content),
      terms: this.extractTerms(title, tags, links, headings, content),
      length: this.tokenize(content).length,
      mtime: file.stat.mtime,
    };
  }

  private extractTags(content: string): string[] {
    const tags = new Set<string>();
    for (const match of content.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) {
      tags.add(match[1]);
    }

    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
    const tagLine = frontmatter?.[1].match(/^tags:\s*(.+)$/m)?.[1];
    if (tagLine) {
      tagLine
        .replace(/[[\]]/g, '')
        .split(',')
        .map((tag) => tag.trim().replace(/^#/, ''))
        .filter(Boolean)
        .forEach((tag) => tags.add(tag));
    }

    return [...tags];
  }

  private extractKeywords(title: string, tags: string[], links: string[], headings: string[], content: string): string[] {
    return [...Object.entries(this.extractTerms(title, tags, links, headings, content))]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word]) => word);
  }

  private extractTerms(title: string, tags: string[], links: string[], headings: string[], content: string): Record<string, number> {
    const counts = new Map<string, number>();
    this.addTerms(counts, this.tokenize(content), 1);
    this.addTerms(counts, this.tokenize(headings.join(' ')), 3);
    this.addTerms(counts, this.tokenize(links.join(' ')), 5);
    this.addTerms(counts, this.tokenize(tags.join(' ')), 6);
    this.addTerms(counts, this.tokenize(title), 8);
    return Object.fromEntries(counts.entries());
  }

  private addTerms(counts: Map<string, number>, terms: string[], weight: number): void {
    for (const term of terms) counts.set(term, (counts.get(term) || 0) + weight);
  }

  private tokenize(content: string): string[] {
    return content
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/---[\s\S]*?---/, ' ')
      .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
      .split(/\s+/)
      .map((word) => this.normalizeTerm(word))
      .filter((word) => Boolean(word));
  }

  private normalizeTerm(word: string): string {
    const normalized = word.trim().toLowerCase().replace(/^[-_]+|[-_]+$/g, '');
    if (normalized.length < 2 || normalized.length > 40) return '';
    if (STOP_WORDS.has(normalized) || NOISY_TERM.test(normalized)) return '';
    if (/^\d+(?:[-_]\d+)*$/.test(normalized)) return '';
    return normalized;
  }

  private createCorpusStats(entries: MemoryMapEntry[]): { docCount: number; avgLength: number; documentFrequency: Map<string, number> } {
    const documentFrequency = new Map<string, number>();
    let totalLength = 0;
    for (const entry of entries) {
      totalLength += Math.max(entry.length || 0, 1);
      for (const term of Object.keys(entry.terms || {})) {
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      }
    }
    return {
      docCount: Math.max(entries.length, 1),
      avgLength: totalLength / Math.max(entries.length, 1),
      documentFrequency,
    };
  }

  private score(
    current: MemoryMapEntry,
    candidate: MemoryMapEntry,
    stats: { docCount: number; avgLength: number; documentFrequency: Map<string, number> },
  ): MemoryMapResult {
    let score = 0;
    const reasons: string[] = [];
    const candidateAliases = new Set([candidate.title, candidate.path, candidate.path.replace(/\.md$/i, '')]);
    const currentAliases = new Set([current.title, current.path, current.path.replace(/\.md$/i, '')]);

    if (current.links.some((link) => candidateAliases.has(link))) {
      score += 12;
      reasons.push('현재 노트에서 링크됨');
    }
    if (candidate.links.some((link) => currentAliases.has(link))) {
      score += 10;
      reasons.push('현재 노트를 백링크함');
    }

    const sharedTags = candidate.tags.filter((tag) => current.tags.includes(tag));
    if (sharedTags.length > 0) {
      score += sharedTags.length * 5;
      reasons.push(`같은 태그 ${sharedTags.slice(0, 3).map((tag) => `#${tag}`).join(', ')}`);
    }

    if (candidate.folder && candidate.folder === current.folder) {
      score += 3;
      reasons.push('같은 폴더');
    }

    const sharedHeadings = candidate.headings.filter((heading) => current.headings.includes(heading));
    if (sharedHeadings.length > 0) {
      score += Math.min(sharedHeadings.length * 2, 6);
      reasons.push('비슷한 소제목');
    }

    const termMatches = this.scoreTerms(current, candidate, stats);
    if (termMatches.score > 0) {
      score += termMatches.score;
      reasons.push(`핵심어 ${termMatches.terms.slice(0, 4).join(', ')}`);
    }

    const ageDays = Math.max(0, (Date.now() - candidate.mtime) / 86_400_000);
    if (ageDays < 14) {
      score += 1;
      reasons.push('최근 수정됨');
    }

    return {
      path: candidate.path,
      title: candidate.title,
      score,
      reasons: reasons.slice(0, 4),
    };
  }

  private scoreTerms(
    current: MemoryMapEntry,
    candidate: MemoryMapEntry,
    stats: { docCount: number; avgLength: number; documentFrequency: Map<string, number> },
  ): { score: number; terms: string[] } {
    const currentTerms = current.terms || {};
    const candidateTerms = candidate.terms || {};
    const matches: Array<{ term: string; score: number }> = [];
    const candidateLength = Math.max(candidate.length || 1, 1);
    const k1 = 1.2;
    const b = 0.75;

    for (const term of Object.keys(currentTerms)) {
      const tf = candidateTerms[term] || 0;
      if (tf <= 0) continue;

      const df = stats.documentFrequency.get(term) || 1;
      const idf = Math.log(1 + (stats.docCount - df + 0.5) / (df + 0.5));
      if (idf < 0.25) continue;

      const bm25 = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (candidateLength / stats.avgLength))));
      const weighted = bm25 * Math.min(Math.sqrt(currentTerms[term]), 4);
      matches.push({ term, score: weighted });
    }

    matches.sort((a, b) => b.score - a.score);
    return {
      score: Math.min(matches.reduce((sum, match) => sum + match.score, 0), 12),
      terms: matches.slice(0, 6).map((match) => match.term),
    };
  }
}
