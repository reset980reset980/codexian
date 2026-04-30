import * as http from 'http';
import * as https from 'https';

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
  const buffer = await fetchBuffer(url, 'application/pdf,*/*;q=0.5');
  const raw = buffer.toString('latin1');
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
  const title = cleanYoutubeTitle(extractTitle(html)) || extractMetaTitle(html) || 'YouTube';
  const transcriptUrl = extractYoutubeTranscriptUrl(html);
  let transcript = '';
  let transcriptError = '';
  if (transcriptUrl) {
    try {
      const transcriptXml = await fetchText(transcriptUrl, 'text/xml,*/*;q=0.5');
      transcript = normalizeText(transcriptXml.replace(/<text[^>]*>/g, ' ').replace(/<\/text>/g, ' '));
    } catch (error) {
      transcriptError = error instanceof Error ? error.message : String(error);
    }
  }
  const description = extractMetaDescription(html);
  const summary = transcript ? summarize(transcript) : description || 'YouTube transcript를 찾지 못했습니다.';
  const evidenceLimit = transcriptError
    ? `YouTube transcript를 가져오지 못했습니다: ${transcriptError}`
    : '';
  const summaryWithLimit = evidenceLimit && !transcript
    ? `${summary}\n[제한] ${evidenceLimit}`
    : summary;
  return {
    id: stableId(url),
    type: 'youtube',
    title,
    url,
    content: options.mode === 'excerpt' ? transcript.slice(0, options.maxChars) : '',
    summary: summaryWithLimit,
    capturedAt: Date.now(),
  };
}

async function fetchText(url: string, accept: string): Promise<string> {
  try {
    const response = await fetchWithTimeout(url, accept);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } catch (error) {
    return fetchTextWithNode(url, accept, error);
  }
}

async function fetchBuffer(url: string, accept: string): Promise<Buffer> {
  try {
    const response = await fetchWithTimeout(url, accept);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    return fetchBufferWithNode(url, accept, error);
  }
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
        'User-Agent': userAgent(),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function fetchTextWithNode(url: string, accept: string, originalError: unknown, redirectCount = 0): Promise<string> {
  return fetchBufferWithNode(url, accept, originalError, redirectCount).then((buffer) => buffer.toString('utf8'));
}

function fetchBufferWithNode(url: string, accept: string, originalError: unknown, redirectCount = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? http : https;
    const request = client.request(parsed, {
      method: 'GET',
      timeout: 15000,
      headers: {
        Accept: accept,
        'User-Agent': userAgent(),
      },
    }, (response) => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        if (redirectCount >= 5) {
          reject(new Error(`redirect limit exceeded after fetch failed: ${errorMessage(originalError)}`));
          return;
        }
        const nextUrl = new URL(location, parsed).toString();
        fetchBufferWithNode(nextUrl, accept, originalError, redirectCount + 1).then(resolve, reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${statusCode} after fetch failed: ${errorMessage(originalError)}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });

    request.on('timeout', () => {
      request.destroy(new Error(`timeout after fetch failed: ${errorMessage(originalError)}`));
    });
    request.on('error', (error) => {
      reject(new Error(`${error.message} after fetch failed: ${errorMessage(originalError)}`));
    });
    request.end();
  });
}

function userAgent(): string {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Codexian/0.2 Safari/537.36';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.map((url) => normalizeExternalUrl(url.trim())).filter(Boolean)));
}

function normalizeExternalUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      const videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (videoId) {
        const normalized = new URL('https://www.youtube.com/watch');
        normalized.searchParams.set('v', videoId);
        const timestamp = parsed.searchParams.get('t') || parsed.searchParams.get('start');
        if (timestamp) normalized.searchParams.set('t', timestamp);
        return normalized.toString();
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
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
  return extractMetaContent(html, ['description', 'og:description', 'twitter:description']);
}

function extractMetaTitle(html: string): string {
  return extractMetaContent(html, ['og:title', 'twitter:title']);
}

function extractMetaContent(html: string, names: string[]): string {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = extractAttribute(tag, 'name') || extractAttribute(tag, 'property');
    if (!name || !names.includes(name.toLowerCase())) continue;
    const content = extractAttribute(tag, 'content');
    if (content) return normalizeText(stripHtml(decodeHtmlAttribute(content)));
  }
  return '';
}

function extractAttribute(tag: string, attribute: string): string {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match ? match[2] : '';
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanYoutubeTitle(value: string): string {
  return normalizeText(value.replace(/\s*-\s*YouTube\s*$/i, ''));
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
