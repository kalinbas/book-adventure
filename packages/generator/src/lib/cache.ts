/**
 * File-based pipeline cache.
 *
 * Saves each pipeline step's output to disk so re-runs can resume
 * from where they left off without re-paying for API calls.
 *
 * Cache key: <sanitized-title>_n<targetNodes>_<8-char content hash>
 * Cache dir: .cache/<key>/ next to the output file
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ParsedBook } from '../types';

type SingleStep = 'step1' | 'step2' | 'step3' | 'step3a';
type KeyedStep = 'step3b' | 'step3c' | 'step4';

interface StepEntry {
  file: string;
  completedAt: string;
}

interface CacheManifest {
  version: 1;
  bookTitle: string;
  bookAuthor: string;
  targetNodes: number;
  bookHash: string;
  createdAt: string;
  updatedAt: string;
  steps: {
    step1?: StepEntry;
    step2?: StepEntry;
    step3?: StepEntry;
    step3a?: StepEntry;
    step3b?: Record<string, StepEntry>;
    step3c?: Record<string, StepEntry>;
    step4?: Record<string, StepEntry>;
  };
}

/** Ordered list of all step keys for downstream invalidation */
const STEP_ORDER = ['step1', 'step2', 'step3a', 'step3b', 'step3c', 'step3', 'step4'] as const;

export class PipelineCache {
  private dir: string;
  private manifest: CacheManifest;
  private manifestPath: string;

  constructor(outputPath: string, book: ParsedBook, targetNodes: number) {
    const cacheKey = computeCacheKey(book, targetNodes);
    const outputDir = path.dirname(path.resolve(outputPath));
    this.dir = path.join(outputDir, '.cache', cacheKey);
    this.manifestPath = path.join(this.dir, '_manifest.json');

    if (fs.existsSync(this.manifestPath)) {
      this.manifest = JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'));
    } else {
      fs.mkdirSync(this.dir, { recursive: true });
      this.manifest = {
        version: 1,
        bookTitle: book.title,
        bookAuthor: book.author,
        targetNodes,
        bookHash: computeBookHash(book),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: {},
      };
      this.saveManifest();
    }
  }

  // ── Single-value steps ──────────────────────────────────────────

  has(step: SingleStep): boolean {
    const entry = this.manifest.steps[step] as StepEntry | undefined;
    if (!entry) return false;
    return fs.existsSync(path.join(this.dir, entry.file));
  }

  load<T>(step: SingleStep): T {
    const entry = this.manifest.steps[step] as StepEntry;
    return JSON.parse(fs.readFileSync(path.join(this.dir, entry.file), 'utf-8'));
  }

  save(step: SingleStep, data: unknown): void {
    this.invalidateDownstream(step);
    const filename = `${step}.json`;
    fs.writeFileSync(path.join(this.dir, filename), JSON.stringify(data, null, 2));
    (this.manifest.steps as Record<string, StepEntry>)[step] = {
      file: filename,
      completedAt: new Date().toISOString(),
    };
    this.saveManifest();
  }

  // ── Keyed steps (3b per-act, 3c per-chapter, 4 per-batch) ──────

  hasKeyed(step: KeyedStep, key: string): boolean {
    const map = this.manifest.steps[step] as Record<string, StepEntry> | undefined;
    if (!map || !map[key]) return false;
    return fs.existsSync(path.join(this.dir, map[key].file));
  }

  loadKeyed<T>(step: KeyedStep, key: string): T {
    const map = this.manifest.steps[step] as Record<string, StepEntry>;
    return JSON.parse(fs.readFileSync(path.join(this.dir, map[key].file), 'utf-8'));
  }

  saveKeyed(step: KeyedStep, key: string, data: unknown): void {
    if (!this.manifest.steps[step]) {
      this.invalidateDownstream(step);
      (this.manifest.steps as Record<string, unknown>)[step] = {};
    }
    const filename = `${step}_${sanitizeKey(key)}.json`;
    fs.writeFileSync(path.join(this.dir, filename), JSON.stringify(data, null, 2));
    (this.manifest.steps[step] as Record<string, StepEntry>)[key] = {
      file: filename,
      completedAt: new Date().toISOString(),
    };
    this.saveManifest();
  }

  /** Number of cached entries for a keyed step */
  keyedCount(step: KeyedStep): number {
    const map = this.manifest.steps[step] as Record<string, StepEntry> | undefined;
    return map ? Object.keys(map).length : 0;
  }

  // ── Utilities ───────────────────────────────────────────────────

  /** Human-readable summary of what's cached */
  summarize(): string {
    const s = this.manifest.steps;
    const parts: string[] = [];
    if (s.step1) parts.push('summary');
    if (s.step2) parts.push('world');
    if (s.step3a) parts.push('acts');
    if (s.step3b) parts.push(`chapters(${Object.keys(s.step3b).length})`);
    if (s.step3c) parts.push(`scenes(${Object.keys(s.step3c).length})`);
    if (s.step3) parts.push('graph');
    if (s.step4) parts.push(`batches(${Object.keys(s.step4).length})`);
    return parts.length > 0 ? `cached: ${parts.join(', ')}` : 'empty cache';
  }

  /** Invalidate all steps after the given step */
  private invalidateDownstream(fromStep: string): void {
    const idx = STEP_ORDER.indexOf(fromStep as typeof STEP_ORDER[number]);
    if (idx === -1) return;

    for (let i = idx + 1; i < STEP_ORDER.length; i++) {
      const step = STEP_ORDER[i];
      const entry = this.manifest.steps[step as keyof typeof this.manifest.steps];
      if (!entry) continue;

      // Delete files
      if ('file' in (entry as StepEntry)) {
        const filepath = path.join(this.dir, (entry as StepEntry).file);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      } else {
        // Keyed step — delete all files
        for (const [, e] of Object.entries(entry as Record<string, StepEntry>)) {
          const filepath = path.join(this.dir, e.file);
          if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        }
      }

      delete (this.manifest.steps as Record<string, unknown>)[step];
    }
  }

  private saveManifest(): void {
    this.manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2));
  }
}

function computeCacheKey(book: ParsedBook, targetNodes: number): string {
  const hash = computeBookHash(book);
  const safeName = book.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${safeName}_n${targetNodes}_${hash}`;
}

function computeBookHash(book: ParsedBook): string {
  const contentSample = book.chapters.map((ch) => ch.content).join('').slice(0, 10000);
  return crypto.createHash('sha256').update(contentSample).digest('hex').slice(0, 8);
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}
