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
 *
 * All steps are cached to disk so re-runs resume from where they left off.
 */

import type { ParsedBook } from '../../types';
import type { GameData } from './game-data-generator';
import { summarizeStory, type StorySummary } from './story-summarizer';
import { buildWorld, type WorldData } from './world-builder';
import { generateStoryGraph, generateChapterSceneGraph, type StoryGraph, type GraphNode } from './graph/scene-generator';
import { generateActStructure, type ActStructure } from './graph/act-generator';
import { generateChapterStructure, type ChapterStructure } from './graph/chapter-generator';
import { resolveConnections } from './graph/connection-resolver';
import { assembleGameData, createBatches, buildGlobalContext, buildWorldContext, generateBatch } from './node-content-generator';
import { enrichGameData, printEnrichmentReport } from './enrichment';
import { validateAndFix, printValidationReport } from './validation';
import { callBatchParallel, type StructuredResponse } from './client';
import type { PipelineCache } from '../cache';

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
 * If a cache is provided, completed steps are loaded from disk.
 */
export async function runPipeline(
  book: ParsedBook,
  apiKey: string,
  config: PipelineConfig = DEFAULT_CONFIG,
  onProgress?: StageCallback,
  precomputedSummary?: StorySummary,
  cache?: PipelineCache,
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
  } else if (cache?.has('step1')) {
    summary = cache.load<StorySummary>('step1');
    onProgress?.('storySummary', 100);
    console.log('Step 1/6: Loaded summary from cache');
  } else {
    onProgress?.('storySummary', 0);
    console.log('Step 1/6: Summarizing story...');
    summary = await summarizeStory(book, apiKey, (pct) => {
      onProgress?.('storySummary', pct);
    }, targetNodes);
    cache?.save('step1', summary);
    onProgress?.('storySummary', 100);
  }

  // Validate summary has required fields (JSON repair can produce structurally invalid objects)
  if (!summary.plotProgression || !summary.characters || !summary.locations) {
    const missing = [
      !summary.plotProgression && 'plotProgression',
      !summary.characters && 'characters',
      !summary.locations && 'locations',
    ].filter(Boolean).join(', ');
    throw new Error(
      `Story summary is missing required fields: ${missing}. ` +
      `This usually happens when the AI response had malformed JSON that was repaired but lost structure. ` +
      `Please retry.`
    );
  }

  console.log(`  → ${summary.plotProgression.length} plot beats, ${summary.characters.length} characters, ${summary.locations.length} locations`);

  // --- Step 2: World Building ---
  let worldData: WorldData;
  if (cache?.has('step2')) {
    worldData = cache.load<WorldData>('step2');
    onProgress?.('worldBuilding', 100);
    console.log('Step 2/6: Loaded world from cache');
  } else {
    onProgress?.('worldBuilding', 0);
    console.log('Step 2/6: Building world...');
    worldData = await buildWorld(summary, apiKey, targetNodes, (pct) => {
      onProgress?.('worldBuilding', pct);
    });
    cache?.save('step2', worldData);
    onProgress?.('worldBuilding', 100);
  }
  console.log(`  → ${Object.keys(worldData.locations).length} locations, ${Object.keys(worldData.characters).length} characters, ${Object.keys(worldData.items).length} items, ${Object.keys(worldData.objects).length} objects`);

  // --- Step 3: Story Graph ---
  let graph: StoryGraph;

  if (cache?.has('step3')) {
    graph = cache.load<StoryGraph>('step3');
    onProgress?.('storyGraph', 100);
    console.log('Step 3/6: Loaded graph from cache');
  } else {
    onProgress?.('storyGraph', 0);
    console.log('Step 3/6: Generating story graph...');

    if (useHierarchical) {
      graph = await generateHierarchicalGraph(summary, worldData, apiKey, targetNodes, concurrency, verbose, cache, (pct) => {
        onProgress?.('storyGraph', pct);
      });
    } else {
      graph = await generateStoryGraph(summary, worldData, apiKey, targetNodes, (pct) => {
        onProgress?.('storyGraph', pct);
      });
    }

    cache?.save('step3', graph);
    onProgress?.('storyGraph', 100);
  }

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

  // --- Step 4: Node Content (batch-level caching) ---
  onProgress?.('nodeContent', 0);

  const batchSize = 5;
  const batches = createBatches(graph.nodes, batchSize);
  const totalBatches = batches.length;
  const allNodes: Record<string, unknown> = {};

  // Load cached batches
  let cachedBatchCount = 0;
  for (let i = 0; i < totalBatches; i++) {
    const batchKey = String(i).padStart(3, '0');
    if (cache?.hasKeyed('step4', batchKey)) {
      const batchNodes = cache.loadKeyed<Record<string, unknown>>('step4', batchKey);
      Object.assign(allNodes, batchNodes);
      cachedBatchCount++;
    }
  }

  if (cachedBatchCount === totalBatches) {
    console.log(`Step 4/6: All ${totalBatches} batches loaded from cache`);
  } else {
    if (cachedBatchCount > 0) {
      console.log(`Step 4/6: ${cachedBatchCount}/${totalBatches} batches from cache, generating remaining...`);
    } else {
      console.log(`Step 4/6: Generating node content (${totalBatches} batches, concurrency=${concurrency})...`);
    }

    // Build shared context
    const globalContext = buildGlobalContext(summary, book.title);
    const worldContext = buildWorldContext(worldData);

    // Build calls only for uncached batches
    const uncachedBatches: { index: number; batch: GraphNode[] }[] = [];
    for (let i = 0; i < totalBatches; i++) {
      const batchKey = String(i).padStart(3, '0');
      if (!cache?.hasKeyed('step4', batchKey)) {
        uncachedBatches.push({ index: i, batch: batches[i] });
      }
    }

    const calls = uncachedBatches.map(({ index, batch }) => {
      return () =>
        generateBatch(batch, graph, globalContext, worldContext, worldData, index, totalBatches, apiKey);
    });

    const results = await callBatchParallel(calls, concurrency, (completed) => {
      onProgress?.('nodeContent', 5 + Math.floor(((cachedBatchCount + completed) / totalBatches) * 90));
    });

    // Save each result and merge
    for (let r = 0; r < results.length; r++) {
      const batchKey = String(uncachedBatches[r].index).padStart(3, '0');
      const batchNodes = results[r].data as Record<string, unknown>;
      cache?.saveKeyed('step4', batchKey, batchNodes);
      Object.assign(allNodes, batchNodes);
    }
  }

  onProgress?.('nodeContent', 100);
  console.log(`  → ${Object.keys(allNodes).length} nodes with content`);

  // Assemble initial GameData
  let gameData = assembleGameData(book.title, book.author, graph, worldData, allNodes as Record<string, any>);

  // --- Step 5: Enrichment ---
  if (cache?.has('step5')) {
    gameData = cache.load<GameData>('step5');
    onProgress?.('enrichment', 100);
    console.log('Step 5/6: Loaded enriched data from cache');
  } else {
    onProgress?.('enrichment', 0);
    console.log('Step 5/6: Enriching game data...');
    const enrichResult = enrichGameData(gameData);
    gameData = enrichResult.gameData;
    cache?.save('step5', gameData);
    onProgress?.('enrichment', 100);
    if (verbose) {
      printEnrichmentReport(enrichResult.report);
    } else {
      console.log(`  → +${enrichResult.report.loopsAdded} go links, +${enrichResult.report.patternsInjected} patterns, ${enrichResult.report.interactionsPadded} interactions padded`);
    }
  }

  // --- Step 6: Validation ---
  if (cache?.has('step6')) {
    gameData = cache.load<GameData>('step6');
    onProgress?.('validation', 100);
    console.log('Step 6/6: Loaded validated data from cache');
  } else {
    onProgress?.('validation', 0);
    console.log('Step 6/6: Validating...');
    const validationResult = validateAndFix(gameData);
    gameData = validationResult.gameData;
    cache?.save('step6', gameData);
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
  }

  return gameData;
}

/**
 * Hierarchical graph generation for large games (>100 nodes).
 * Acts → Chapters → Scenes, with parallel generation within each level.
 * Sub-steps (3a, 3b, 3c) are individually cached.
 */
async function generateHierarchicalGraph(
  summary: StorySummary,
  worldData: WorldData,
  apiKey: string,
  targetNodes: number,
  concurrency: number,
  verbose: boolean,
  cache?: PipelineCache,
  onProgress?: (percent: number) => void,
): Promise<StoryGraph> {
  // Step 3a: Generate act structure (1 call)
  let actStructure: ActStructure;
  if (cache?.has('step3a')) {
    actStructure = cache.load<ActStructure>('step3a');
    console.log('  3a: Loaded act structure from cache');
  } else {
    console.log('  3a: Generating act structure...');
    onProgress?.(5);
    actStructure = await generateActStructure(summary, worldData, apiKey, targetNodes);
    cache?.save('step3a', actStructure);
  }
  console.log(`    → ${actStructure.acts.length} acts`);

  // Step 3b: Generate chapter structure for each act (parallel, per-act caching)
  console.log('  3b: Generating chapter structures...');
  onProgress?.(20);

  const chapterStructures: ChapterStructure[] = [];
  const uncachedActs: typeof actStructure.acts = [];

  for (const act of actStructure.acts) {
    if (cache?.hasKeyed('step3b', act.id)) {
      chapterStructures.push(cache.loadKeyed<ChapterStructure>('step3b', act.id));
    } else {
      uncachedActs.push(act);
    }
  }

  if (uncachedActs.length > 0) {
    const chapterCalls = uncachedActs.map((act) => {
      return () => generateChapterStructure(act, summary, worldData, apiKey)
        .then((data): StructuredResponse<ChapterStructure> => ({
          data,
          usage: { inputTokens: 0, outputTokens: 0 },
        }));
    });

    const chapterResults = await callBatchParallel(chapterCalls, concurrency);
    for (let i = 0; i < chapterResults.length; i++) {
      const cs = chapterResults[i].data;
      cache?.saveKeyed('step3b', uncachedActs[i].id, cs);
      chapterStructures.push(cs);
    }
  }

  // Sort chapter structures to match original act order
  const actIdOrder = actStructure.acts.map((a) => a.id);
  chapterStructures.sort((a, b) => {
    const aActId = a.chapters[0]?.actId;
    const bActId = b.chapters[0]?.actId;
    return actIdOrder.indexOf(aActId) - actIdOrder.indexOf(bActId);
  });

  const totalChapters = chapterStructures.reduce((sum, cs) => sum + cs.chapters.length, 0);
  console.log(`    → ${totalChapters} chapters across ${actStructure.acts.length} acts`);

  if (verbose) {
    for (const cs of chapterStructures) {
      for (const ch of cs.chapters) {
        console.log(`      ${ch.id}: "${ch.title}" (${ch.targetNodeCount} nodes, ${ch.narrativeArcs.length} arcs)`);
      }
    }
  }

  // Step 3c: Generate scene graphs for each chapter (parallel, per-chapter caching)
  console.log('  3c: Generating scene graphs...');
  onProgress?.(40);

  const allChapters = chapterStructures.flatMap((cs) => cs.chapters);
  const chapterGraphs: { chapterId: string; nodes: GraphNode[] }[] = [];
  const uncachedChapters: typeof allChapters = [];

  for (const chapter of allChapters) {
    if (cache?.hasKeyed('step3c', chapter.id)) {
      chapterGraphs.push({
        chapterId: chapter.id,
        nodes: cache.loadKeyed<GraphNode[]>('step3c', chapter.id),
      });
    } else {
      uncachedChapters.push(chapter);
    }
  }

  if (uncachedChapters.length > 0) {
    const sceneCalls = uncachedChapters.map((chapter) => {
      return () => generateChapterSceneGraph(chapter, summary, worldData, apiKey)
        .then((nodes) => ({
          data: { chapterId: chapter.id, nodes },
          usage: { inputTokens: 0, outputTokens: 0 },
        }));
    });

    const sceneResults = await callBatchParallel(sceneCalls, concurrency, (completed, total) => {
      onProgress?.(40 + Math.floor((completed / total) * 40));
    });

    for (const result of sceneResults) {
      cache?.saveKeyed('step3c', result.data.chapterId, result.data.nodes);
      chapterGraphs.push(result.data);
    }
  }

  // Sort chapter graphs to match original chapter order
  const chapterIdOrder = allChapters.map((c) => c.id);
  chapterGraphs.sort((a, b) => chapterIdOrder.indexOf(a.chapterId) - chapterIdOrder.indexOf(b.chapterId));

  const totalSceneNodes = chapterGraphs.reduce((sum, cg) => sum + cg.nodes.length, 0);
  console.log(`    → ${totalSceneNodes} scene nodes across ${totalChapters} chapters`);

  // Step 3d: Resolve connections (TypeScript only — always re-run)
  console.log('  3d: Resolving connections...');
  onProgress?.(85);
  const graph = resolveConnections(actStructure, chapterStructures, chapterGraphs);
  console.log(`    → ${graph.nodes.length} nodes connected, start: ${graph.startNodeId}`);

  onProgress?.(100);
  return graph;
}
