/**
 * Pipeline orchestration — coordinates all 6 steps of game generation.
 *
 * Two modes based on target node count:
 * - Flat (≤100 nodes): Single API call for graph generation
 * - Hierarchical (>100 nodes): Acts → Chapters → Scenes with parallel generation
 *
 * Step 1: Story Summary (story-summarizer.ts)
 * Step 2: World Building (world-builder.ts)
 * Step 3: Story Graph
 *   - Flat: scene-generator.ts (single call)
 *   - Hierarchical: act-generator → chapter-generator → scene-generator → connection-resolver
 * Step 4: Node Content  (node-content-generator.ts — batched, parallel)
 * Step 5: Enrichment    (enrichment.ts — TypeScript)
 * Step 6: Validation    (validation.ts — TypeScript)
 */

import type { ParsedBook } from '../../types';
import type { GameData } from './game-data-generator';
import { summarizeStory, type StorySummary } from './story-summarizer';
import { buildWorld, type WorldData } from './world-builder';
import { generateStoryGraph, generateChapterSceneGraph, type StoryGraph } from './graph/scene-generator';
import { generateActStructure } from './graph/act-generator';
import { generateChapterStructure, type ChapterStructure } from './graph/chapter-generator';
import { resolveConnections } from './graph/connection-resolver';
import { generateNodeContent, assembleGameData } from './node-content-generator';
import { enrichGameData, printEnrichmentReport } from './enrichment';
import { validateAndFix, printValidationReport } from './validation';
import { callBatchParallel, type StructuredResponse } from './client';

export interface PipelineConfig {
  targetNodes: number;
  concurrency: number;
  dryRun: boolean;
  verbose: boolean;
}

export const DEFAULT_CONFIG: PipelineConfig = {
  targetNodes: 44,
  concurrency: 3,
  dryRun: false,
  verbose: false,
};

type StageCallback = (stage: string, percent: number) => void;

/**
 * Run the full 6-step generation pipeline.
 * If a pre-computed summary is provided, Step 1 is skipped.
 * Automatically selects flat or hierarchical mode based on target node count.
 */
export async function runPipeline(
  book: ParsedBook,
  apiKey: string,
  config: PipelineConfig = DEFAULT_CONFIG,
  onProgress?: StageCallback,
  precomputedSummary?: StorySummary,
): Promise<GameData> {
  const { targetNodes, concurrency, dryRun, verbose } = config;
  const useHierarchical = targetNodes > 100;

  if (useHierarchical) {
    console.log(`Mode: Hierarchical (${targetNodes} nodes)`);
  } else {
    console.log(`Mode: Flat (${targetNodes} nodes)`);
  }

  // --- Step 1: Story Summary ---
  let summary: StorySummary;
  if (precomputedSummary) {
    summary = precomputedSummary;
    onProgress?.('storySummary', 100);
    console.log('Step 1/6: Using pre-computed summary');
  } else {
    onProgress?.('storySummary', 0);
    console.log('Step 1/6: Summarizing story...');
    summary = await summarizeStory(book, apiKey, (pct) => {
      onProgress?.('storySummary', pct);
    }, targetNodes);
    onProgress?.('storySummary', 100);
  }
  console.log(`  → ${summary.plotProgression.length} plot beats, ${summary.characters.length} characters, ${summary.locations.length} locations`);

  // --- Step 2: World Building ---
  onProgress?.('worldBuilding', 0);
  console.log('Step 2/6: Building world...');
  const worldData = await buildWorld(summary, apiKey, targetNodes, (pct) => {
    onProgress?.('worldBuilding', pct);
  });
  onProgress?.('worldBuilding', 100);
  console.log(`  → ${Object.keys(worldData.locations).length} locations, ${Object.keys(worldData.characters).length} characters, ${Object.keys(worldData.items).length} items, ${Object.keys(worldData.objects).length} objects`);

  // --- Step 3: Story Graph ---
  onProgress?.('storyGraph', 0);
  console.log('Step 3/6: Generating story graph...');

  let graph: StoryGraph;

  if (useHierarchical) {
    graph = await generateHierarchicalGraph(summary, worldData, apiKey, targetNodes, concurrency, verbose, (pct) => {
      onProgress?.('storyGraph', pct);
    });
  } else {
    graph = await generateStoryGraph(summary, worldData, apiKey, targetNodes, (pct) => {
      onProgress?.('storyGraph', pct);
    });
  }

  onProgress?.('storyGraph', 100);
  console.log(`  → ${graph.nodes.length} nodes, ${graph.actStructure.length} acts`);

  if (verbose) {
    console.log('  Graph structure:');
    for (const act of graph.actStructure) {
      console.log(`    Act ${act.act}: ${act.nodeIds.length} nodes — ${act.description}`);
    }
    const nodeTypes = graph.nodes.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`    Types: ${Object.entries(nodeTypes).map(([t, c]) => `${t}=${c}`).join(', ')}`);
  }

  // If dry-run, stop here
  if (dryRun) {
    console.log('\n[Dry run] Stopping after graph generation.');
    console.log('Graph nodes:');
    for (const node of graph.nodes) {
      console.log(`  ${node.id} (${node.type}) — ${node.title} [${node.locationId}]`);
      console.log(`    → ${node.connections.join(', ') || '(end)'}`);
    }
    return assembleGameData(book.title, book.author, graph, worldData, {});
  }

  // --- Step 4: Node Content ---
  onProgress?.('nodeContent', 0);
  console.log(`Step 4/6: Generating node content (${Math.ceil(graph.nodes.length / 5)} batches, concurrency=${concurrency})...`);
  const nodes = await generateNodeContent(
    graph,
    worldData,
    summary,
    book.title,
    apiKey,
    concurrency,
    (pct) => {
      onProgress?.('nodeContent', pct);
    },
  );
  onProgress?.('nodeContent', 100);
  console.log(`  → ${Object.keys(nodes).length} nodes with content`);

  // Assemble initial GameData
  let gameData = assembleGameData(book.title, book.author, graph, worldData, nodes);

  // --- Step 5: Enrichment ---
  onProgress?.('enrichment', 0);
  console.log('Step 5/6: Enriching game data...');
  const enrichResult = enrichGameData(gameData);
  gameData = enrichResult.gameData;
  onProgress?.('enrichment', 100);
  if (verbose) {
    printEnrichmentReport(enrichResult.report);
  } else {
    console.log(`  → +${enrichResult.report.loopsAdded} go links, +${enrichResult.report.patternsInjected} patterns, ${enrichResult.report.interactionsPadded} interactions padded`);
  }

  // --- Step 6: Validation ---
  onProgress?.('validation', 0);
  console.log('Step 6/6: Validating...');
  const validationResult = validateAndFix(gameData);
  gameData = validationResult.gameData;
  onProgress?.('validation', 100);
  if (verbose) {
    printValidationReport(validationResult.report);
  } else {
    const r = validationResult.report;
    console.log(`  → ${r.stats.totalNodes} nodes, ${r.stats.totalInteractions} interactions (avg ${r.stats.avgInteractionsPerNode.toFixed(1)}/node)`);
    if (r.errors.length > 0) console.log(`  → ${r.errors.length} errors`);
    if (r.warnings.length > 0) console.log(`  → ${r.warnings.length} warnings`);
    if (r.fixes.length > 0) console.log(`  → ${r.fixes.length} auto-fixes applied`);
  }

  return gameData;
}

/**
 * Hierarchical graph generation for large games (>100 nodes).
 * Acts → Chapters → Scenes, with parallel generation within each level.
 */
async function generateHierarchicalGraph(
  summary: StorySummary,
  worldData: WorldData,
  apiKey: string,
  targetNodes: number,
  concurrency: number,
  verbose: boolean,
  onProgress?: (percent: number) => void,
): Promise<StoryGraph> {
  // Step 3a: Generate act structure (1 call)
  console.log('  3a: Generating act structure...');
  onProgress?.(5);
  const actStructure = await generateActStructure(summary, worldData, apiKey, targetNodes);
  console.log(`    → ${actStructure.acts.length} acts`);

  // Step 3b: Generate chapter structure for each act (parallel)
  console.log('  3b: Generating chapter structures...');
  onProgress?.(20);

  const chapterCalls = actStructure.acts.map((act) => {
    return () => generateChapterStructure(act, summary, worldData, apiKey)
      .then((data): StructuredResponse<ChapterStructure> => ({
        data,
        usage: { inputTokens: 0, outputTokens: 0 },
      }));
  });

  const chapterResults = await callBatchParallel(chapterCalls, concurrency);
  const chapterStructures = chapterResults.map((r) => r.data);

  const totalChapters = chapterStructures.reduce((sum, cs) => sum + cs.chapters.length, 0);
  console.log(`    → ${totalChapters} chapters across ${actStructure.acts.length} acts`);

  if (verbose) {
    for (const cs of chapterStructures) {
      for (const ch of cs.chapters) {
        console.log(`      ${ch.id}: "${ch.title}" (${ch.targetNodeCount} nodes, ${ch.narrativeArcs.length} arcs)`);
      }
    }
  }

  // Step 3c: Generate scene graphs for each chapter (parallel)
  console.log('  3c: Generating scene graphs...');
  onProgress?.(40);

  const allChapters = chapterStructures.flatMap((cs) => cs.chapters);
  const sceneCalls = allChapters.map((chapter) => {
    return () => generateChapterSceneGraph(chapter, summary, worldData, apiKey)
      .then((nodes) => ({
        data: { chapterId: chapter.id, nodes },
        usage: { inputTokens: 0, outputTokens: 0 },
      }));
  });

  const sceneResults = await callBatchParallel(sceneCalls, concurrency, (completed, total) => {
    onProgress?.(40 + Math.floor((completed / total) * 40));
  });

  const chapterGraphs = sceneResults.map((r) => r.data);
  const totalSceneNodes = chapterGraphs.reduce((sum, cg) => sum + cg.nodes.length, 0);
  console.log(`    → ${totalSceneNodes} scene nodes across ${totalChapters} chapters`);

  // Step 3d: Resolve connections (TypeScript only)
  console.log('  3d: Resolving connections...');
  onProgress?.(85);
  const graph = resolveConnections(actStructure, chapterStructures, chapterGraphs);
  console.log(`    → ${graph.nodes.length} nodes connected, start: ${graph.startNodeId}`);

  onProgress?.(100);
  return graph;
}
