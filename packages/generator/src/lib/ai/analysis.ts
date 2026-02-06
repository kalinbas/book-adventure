import type { ParsedBook, NarrativeAnalysis, Character, Location, PlotPoint } from '../../types';
import type { GameData } from './game-data-generator';
import { runPipeline, type PipelineConfig, DEFAULT_CONFIG } from './pipeline';
import { summarizeStory, type StorySummary } from './story-summarizer';

type ProgressCallback = (stage: string, percent: number) => void;

export interface AnalysisResult {
  analysis: NarrativeAnalysis;
  gameData: GameData;
}

export interface PipelineOptions {
  targetNodes?: number;
  concurrency?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * Run the full analysis pipeline using the new 6-step approach.
 *
 * Pipeline:
 * 1. Story Summary → 2. World Building → 3. Story Graph →
 * 4. Node Content → 5. Enrichment → 6. Validation
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

  // Map stage progress to the expected UI stages
  const stageMapping: Record<string, string> = {
    storySummary: 'storySummarization',
    worldBuilding: 'locationMapping',
    storyGraph: 'plotAnalysis',
    nodeContent: 'interactionGeneration',
    enrichment: 'interactionGeneration',
    validation: 'interactionGeneration',
  };

  const config: PipelineConfig = {
    targetNodes: options.targetNodes ?? DEFAULT_CONFIG.targetNodes,
    concurrency: options.concurrency ?? DEFAULT_CONFIG.concurrency,
    dryRun: options.dryRun ?? DEFAULT_CONFIG.dryRun,
    verbose: options.verbose ?? DEFAULT_CONFIG.verbose,
  };

  // Run a quick summary first for the NarrativeAnalysis UI data
  onProgress('storySummarization', 10);
  const summary = await summarizeStory(book, apiKey, (pct) => {
    onProgress('storySummarization', 10 + pct * 0.9);
  }, config.targetNodes);
  onProgress('storySummarization', 100);

  // Extract UI analysis from summary
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

  // Run the full generation pipeline, passing pre-computed summary to avoid double API call
  onProgress('interactionGeneration', 10);
  const gameData = await runPipeline(book, apiKey, config, (stage, pct) => {
    const mappedStage = stageMapping[stage] ?? stage;
    // Map pipeline progress to the interactionGeneration stage (10-100%)
    if (mappedStage === 'interactionGeneration') {
      onProgress('interactionGeneration', 10 + pct * 0.9);
    }
  }, summary);
  onProgress('interactionGeneration', 100);

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
