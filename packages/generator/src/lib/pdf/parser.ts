import { extractText } from 'unpdf';
import type { ParsedBook, Chapter } from '../../types';

/**
 * Parse a PDF file and extract structured text content
 * Accepts either a File object or an ArrayBuffer
 */
export async function parsePdf(input: File | ArrayBuffer, filename?: string): Promise<ParsedBook> {
  let arrayBuffer: ArrayBuffer;
  let name: string;

  if (input instanceof File) {
    arrayBuffer = await input.arrayBuffer();
    name = input.name;
  } else {
    arrayBuffer = input;
    name = filename || 'unknown.pdf';
  }

  const result = await extractText(new Uint8Array(arrayBuffer));

  // Get all text content - handle both string and array formats
  let fullText: string;
  if (typeof result.text === 'string') {
    fullText = result.text;
  } else if (Array.isArray(result.text)) {
    // If text is an array of pages, join them
    fullText = result.text.join('\n\n');
  } else {
    // Fallback - convert to string
    fullText = String(result.text || '');
  }

  const totalPages = result.totalPages || 1;

  // Detect chapters
  const chapters = detectChapters(fullText, totalPages);

  // Extract title and author (first page heuristics)
  const { title, author } = extractMetadata(fullText, name);

  // Count words
  const wordCount = fullText.split(/\s+/).filter((w) => w.length > 0).length;

  return {
    title,
    author,
    chapters,
    metadata: {
      totalPages,
      wordCount,
      extractedAt: new Date().toISOString(),
    },
  };
}

/**
 * Detect chapter boundaries in text
 */
function detectChapters(text: string, totalPages: number): Chapter[] {
  const chapters: Chapter[] = [];

  // Common chapter patterns
  const patterns = [
    /^(Chapter|CHAPTER)\s+(\d+|[IVXLCDM]+)[:\.]?\s*(.*)$/gim,
    /^(Part|PART)\s+(\d+|[IVXLCDM]+)[:\.]?\s*(.*)$/gim,
    /^(\d+)\.\s+(.+)$/gm,
    /^([IVXLCDM]+)\.\s+(.+)$/gm,
  ];

  interface ChapterMatch {
    index: number;
    number: number;
    title: string;
    fullMatch: string;
  }

  const matches: ChapterMatch[] = [];

  // Find all chapter headings
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const chapterNum = parseChapterNumber(match[2] || match[1]);
      const title = (match[3] || match[2] || '').trim();

      matches.push({
        index: match.index,
        number: chapterNum,
        title: title || `Chapter ${chapterNum}`,
        fullMatch: match[0],
      });
    }
  }

  // Sort by position in text
  matches.sort((a, b) => a.index - b.index);

  // Remove duplicates (same position)
  const uniqueMatches = matches.filter(
    (match, index) => index === 0 || match.index !== matches[index - 1].index
  );

  // If we found chapter markers, use them
  if (uniqueMatches.length > 0) {
    for (let i = 0; i < uniqueMatches.length; i++) {
      const current = uniqueMatches[i];
      const next = uniqueMatches[i + 1];

      const startIndex = current.index + current.fullMatch.length;
      const endIndex = next ? next.index : text.length;
      const content = text.slice(startIndex, endIndex).trim();

      // Estimate page numbers (rough approximation)
      const avgCharsPerPage = text.length / totalPages;
      const startPage = Math.floor(current.index / avgCharsPerPage) + 1;
      const endPage = Math.floor(endIndex / avgCharsPerPage) + 1;

      chapters.push({
        id: `chapter_${i + 1}`,
        number: current.number || i + 1,
        title: current.title,
        content,
        startPage,
        endPage,
      });
    }
  } else {
    // No chapter markers found - split by approximate size
    const targetChapterLength = 10000; // ~10k chars per chapter
    const numChapters = Math.max(1, Math.ceil(text.length / targetChapterLength));
    const chapterLength = Math.ceil(text.length / numChapters);

    for (let i = 0; i < numChapters; i++) {
      const startIndex = i * chapterLength;
      const endIndex = Math.min((i + 1) * chapterLength, text.length);

      // Try to break at paragraph boundaries
      let actualEnd = endIndex;
      if (i < numChapters - 1) {
        const searchStart = endIndex - 500;
        const searchEnd = endIndex + 500;
        const searchRegion = text.slice(searchStart, Math.min(searchEnd, text.length));
        const paragraphBreak = searchRegion.lastIndexOf('\n\n');
        if (paragraphBreak !== -1) {
          actualEnd = searchStart + paragraphBreak;
        }
      }

      const content = text.slice(startIndex, actualEnd).trim();
      const avgCharsPerPage = text.length / totalPages;
      const startPage = Math.floor(startIndex / avgCharsPerPage) + 1;
      const endPage = Math.floor(actualEnd / avgCharsPerPage) + 1;

      chapters.push({
        id: `section_${i + 1}`,
        number: i + 1,
        title: `Section ${i + 1}`,
        content,
        startPage,
        endPage,
      });
    }
  }

  return chapters;
}

/**
 * Parse chapter number from string (handles Roman numerals)
 */
function parseChapterNumber(str: string): number {
  const trimmed = str.trim();

  // Try Arabic numeral
  const num = parseInt(trimmed, 10);
  if (!isNaN(num)) return num;

  // Try Roman numeral
  return romanToInt(trimmed.toUpperCase());
}

/**
 * Convert Roman numeral to integer
 */
function romanToInt(roman: string): number {
  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  let result = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = values[roman[i]] || 0;
    const next = values[roman[i + 1]] || 0;

    if (current < next) {
      result -= current;
    } else {
      result += current;
    }
  }

  return result || 1;
}

/**
 * Extract title and author from text (first page heuristics)
 */
function extractMetadata(text: string, filename: string): { title: string; author: string } {
  // Get first ~2000 chars (usually contains title page)
  const firstPage = text.slice(0, 2000);
  const lines = firstPage.split('\n').filter((l) => l.trim().length > 0);

  // Try to find title (usually first significant line that's not "chapter")
  let title = '';
  let author = '';

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i].trim();

    // Skip chapter/part markers
    if (/^(chapter|part|section|\d+\.)/i.test(line)) continue;

    // Skip very short lines
    if (line.length < 3) continue;

    // Skip very long lines (likely body text)
    if (line.length > 100) continue;

    if (!title) {
      title = line;
      continue;
    }

    // Look for author marker
    if (/^by\s+/i.test(line)) {
      author = line.replace(/^by\s+/i, '').trim();
      break;
    }

    // Second significant line might be author
    if (!author && line.length < 50) {
      author = line;
      break;
    }
  }

  // Fallback to filename
  if (!title) {
    title = filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
  }

  return { title, author };
}
