import type { EvidenceSource, EvidenceSourceType, SukgoExternalEvidenceMode } from '../types';

export interface CollectExternalEvidenceOptions {
  urls: string[];
  mode: SukgoExternalEvidenceMode;
  maxChars: number;
  onProgress?: (message: string) => void;
}

export async function collectExternalEvidence(options: CollectExternalEvidenceOptions): Promise<EvidenceSource[]> {
  const urls = normalizeUrls(options.urls);
  const results = await Promise.allSettled(
    urls.map((url) => collectOne(url, options)),
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const url = urls[index];
    return failedSource(url, classifyUrl(url), result.reason instanceof Error ? result.reason.message : String(result.reason));
  });
}

export function extractUrls(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s<>)\]]+/g) || [];
  return normalizeUrls(matches.map((url) => url.replace(/[.,;:!?]+$/g, '')));
}

async function collectOne(url: string, options: CollectExternalEvidenceOptions): Promise<EvidenceSource> {
  const type = classifyUrl(url);
  options.onProgress?.(`외부 자료 수집: ${url}`);
  if (options.mode === 'link-only') {
    return {
      id: stableId(url),
      type,
      title: url,
      url,
      content: '',
      summary: '출처 링크만 포함됨',
      capturedAt: Date.now(),
    };
  }

  try {
    if (type === 'youtube') return await collectYoutube(url, options);
    if (type === 'paper') return await collectPaper(url, options);
    if (type === 'pdf') return await collectPdf(url, options);
    return await collectWeb(url, type, options);
  } catch (error) {
    return failedSource(url, type, error instanceof Error ? error.message : String(error));
  }
}

async function collectWeb(
  url: string,
  type: EvidenceSourceType,
  options: CollectExternalEvidenceOptions,
): Promise<EvidenceSource> {
  const html = await fetchText(url, 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5');
  const title = extractTitle(html) || url;
  const description = extractMetaDescription(html);
  const body = normalizeText(stripHtml(html)).slice(0, options.maxChars);
  return {
    id: stableId(url),
    type,
    title,
    url,
    content: options.mode === 'excerpt' ? body : '',
    summary: description || summarize(body),
    capturedAt: Date.now(),
  };
}

async function collectPdf(url: string, options: CollectExternalEvidenceOptions): Promise<EvidenceSource> {
  const response = await fetchWithTimeout(url, 'application/pdf,*/*;q=0.5');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const raw = Buffer.from(arrayBuffer).toString('latin1');
  const text = normalizeText(
    raw
      .replace(/\\[nrtbf()\\]/g, ' ')
      .replace(/[^ -~\n\r\t가-힣]/g, ' ')
      .replace(/\s+/g, ' '),
  ).slice(0, options.maxChars);
  return {
    id: stableId(url),
    type: 'pdf',
    title: decodeURIComponent(url.split('/').pop() || 'PDF 자료'),
    url,
    content: options.mode === 'excerpt' ? text : '',
    summary: text ? summarize(text) : 'PDF를 가져왔지만 텍스트 추출 결과가 비어 있습니다.',
    capturedAt: Date.now(),
  };
}

async function collectPaper(url: string, options: CollectExternalEvidenceOptions): Promise<EvidenceSource> {
  const arxivId = extractArxivId(url);
  if (arxivId) {
    const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
    const xml = await fetchText(apiUrl, 'application/atom+xml,text/xml,*/*;q=0.5');
    const title = xmlText(xml, 'title') || `arXiv ${arxivId}`;
    const summary = normalizeText(xmlText(xml, 'summary') || '');
    return {
      id: stableId(url),
      type: 'paper',
      title,
      url,
      content: options.mode === 'excerpt' ? summary.slice(0, options.maxChars) : '',
      summary: summary || 'arXiv 메타데이터를 가져왔지만 초록이 비어 있습니다.',
      capturedAt: Date.now(),
    };
  }
  return collectWeb(url, 'paper', options);
}

async function collectYoutube(url: string, options: CollectExternalEvidenceOptions): Promise<EvidenceSource> {
  const html = await fetchText(url, 'text/html,*/*;q=0.5');
  const title = extractTitle(html) || 'YouTube';
  const transcriptUrl = extractYoutubeTranscriptUrl(html);
  let transcript = '';
  if (transcriptUrl) {
    const transcriptXml = await fetchText(transcriptUrl, 'text/xml,*/*;q=0.5');
    transcript = normalizeText(transcriptXml.replace(/<text[^>]*>/g, ' ').replace(/<\/text>/g, ' '));
  }
  const description = extractMetaDescription(html);
  const summary = transcript ? summarize(transcript) : description || 'YouTube transcript를 찾지 못했습니다.';
  return {
    id: stableId(url),
    type: 'youtube',
    title,
    url,
    content: options.mode === 'excerpt' ? transcript.slice(0, options.maxChars) : '',
    summary,
    capturedAt: Date.now(),
    error: transcript ? undefined : 'transcript unavailable',
  };
}

async function fetchText(url: string, accept: string): Promise<string> {
  const response = await fetchWithTimeout(url, accept);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: accept,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
}

function classifyUrl(url: string): EvidenceSourceType {
  const lower = url.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(lower)) return 'youtube';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (/arxiv\.org|doi\.org|pubmed\.ncbi\.nlm\.nih\.gov|semanticscholar\.org/.test(lower)) return 'paper';
  return 'web-url';
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normalizeText(stripHtml(match[1])) : '';
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  return match ? normalizeText(stripHtml(match[1])) : '';
}

function summarize(value: string): string {
  const normalized = normalizeText(value);
  if (normalized.length <= 900) return normalized;
  return `${normalized.slice(0, 900).trim()}...`;
}

function extractArxivId(url: string): string {
  const match = url.match(/arxiv\.org\/(?:abs|pdf)\/([^?#/]+)/i);
  return match ? match[1].replace(/\.pdf$/i, '') : '';
}

function xmlText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? normalizeText(stripHtml(match[1])) : '';
}

function extractYoutubeTranscriptUrl(html: string): string {
  const match = html.match(/"captionTracks":(\[.*?\])\s*,\s*"audioTracks"/);
  if (!match) return '';
  try {
    const tracks = JSON.parse(match[1].replace(/\\"/g, '"')) as Array<{ baseUrl?: string; languageCode?: string }>;
    const preferred = tracks.find((track) => track.languageCode === 'ko')
      || tracks.find((track) => track.languageCode === 'en')
      || tracks[0];
    return preferred?.baseUrl ? preferred.baseUrl.replace(/\\u0026/g, '&') : '';
  } catch {
    return '';
  }
}

function failedSource(url: string, type: EvidenceSourceType, error: string): EvidenceSource {
  return {
    id: stableId(url),
    type,
    title: url,
    url,
    content: '',
    summary: '',
    capturedAt: Date.now(),
    error,
  };
}

function stableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `external-${Math.abs(hash)}`;
}
