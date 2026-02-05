import type { ParsedBook, NarrativeAnalysis, Character, Location, PlotPoint } from '../../types';
import type { GameData } from './game-data-generator';
import { generateGameData } from './game-data-generator';
import { summarizeStory, type StorySummary } from './story-summarizer';

type ProgressCallback = (stage: string, percent: number) => void;

export interface AnalysisResult {
  analysis: NarrativeAnalysis;
  gameData: GameData;
}

export interface PipelineOptions {
  useChunkedGeneration?: boolean; // Use multiple API calls to avoid truncation
}

/**
 * Run the full analysis pipeline using the "summarize first" approach
 *
 * Pipeline:
 * 1. Text extraction (already done by PDF parser)
 * 2. Story summarization - create comprehensive summary of entire book
 * 3. Game generation - use summary to generate complete game structure
 * 4. Build NarrativeAnalysis from summary for UI display
 *
 * Options:
 * - useChunkedGeneration: Use multiple smaller API calls to avoid truncation (recommended for large books)
 */
export async function runAnalysisPipeline(
  book: ParsedBook,
  apiKey: string,
  onProgress: ProgressCallback,
  options: PipelineOptions = {}
): Promise<AnalysisResult> {
  // Text extraction is already done
  onProgress('textExtraction', 100);
  onProgress('chapterDetection', 100);

  // Step 1: Summarize the entire story
  onProgress('storySummarization', 10);
  console.log('Summarizing story...');
  const summary = await summarizeStory(book, apiKey, (percent) => {
    onProgress('storySummarization', 10 + percent * 0.9);
  });
  onProgress('storySummarization', 100);
  console.log('Story summarized:', summary.plotProgression.length, 'plot beats');

  // Step 2: Extract analysis from summary (for UI display)
  onProgress('characterAnalysis', 50);
  const characters = extractCharactersFromSummary(summary);
  onProgress('characterAnalysis', 100);

  onProgress('locationMapping', 50);
  const locations = extractLocationsFromSummary(summary);
  onProgress('locationMapping', 100);

  onProgress('plotAnalysis', 50);
  const { plotPoints, themes } = extractPlotFromSummary(summary);
  onProgress('plotAnalysis', 100);

  const analysis: NarrativeAnalysis = {
    characters,
    locations,
    plotPoints,
    themes,
  };

  // Step 3: Generate game data from summary
  onProgress('interactionGeneration', 10);
  console.log('Generating game from summary...');
  console.log('Using chunked generation:', options.useChunkedGeneration ?? false);
  const gameData = await generateGameData(
    book.title,
    book.author,
    summary,
    apiKey,
    (percent) => {
      onProgress('interactionGeneration', 10 + percent * 0.9);
    },
    { useChunked: options.useChunkedGeneration }
  );
  onProgress('interactionGeneration', 100);
  console.log('Game generated:', Object.keys(gameData.nodes).length, 'nodes');

  return { analysis, gameData };
}

/**
 * Extract Character array from StorySummary for UI display
 */
function extractCharactersFromSummary(summary: StorySummary): Character[] {
  return summary.characters.map((char) => ({
    id: char.id,
    name: char.name,
    aliases: [],
    description: char.description,
    role: char.role,
    traits: [],
    motivations: [char.arc],
    firstAppearance: 'chapter_1',
  }));
}

/**
 * Extract Location array from StorySummary for UI display
 */
function extractLocationsFromSummary(summary: StorySummary): Location[] {
  return summary.locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    description: loc.description,
    atmosphere: loc.atmosphere,
    connectedLocations: loc.connectedLocations,
  }));
}

/**
 * Extract PlotPoints and themes from StorySummary for UI display
 */
function extractPlotFromSummary(summary: StorySummary): { plotPoints: PlotPoint[]; themes: string[] } {
  const plotPoints: PlotPoint[] = summary.plotProgression.map((beat, index) => ({
    id: `plot_${index + 1}`,
    chapterId: `chapter_${index + 1}`,
    type: index === 0
      ? 'exposition'
      : index === summary.plotProgression.length - 1
        ? 'resolution'
        : beat.isDecisionPoint
          ? 'climax'
          : 'rising_action',
    summary: beat.beat,
    involvedCharacters: beat.characters,
    location: beat.location,
    isKeyDecisionPoint: beat.isDecisionPoint,
  }));

  return {
    plotPoints,
    themes: summary.themes,
  };
}
