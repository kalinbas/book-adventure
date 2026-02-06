#!/usr/bin/env node
/**
 * CLI Tool for Book Adventure Generation
 *
 * Usage:
 *   npx tsx src/cli/index.ts --pdf ./book.pdf --api-key $ANTHROPIC_API_KEY
 *
 * Options:
 *   --pdf, -p       Path to PDF file (required)
 *   --api-key, -k   Anthropic API key (or set ANTHROPIC_API_KEY env var)
 *   --output, -o    Output JSON path (default: <book>.game.json)
 *   --nodes, -n     Target number of nodes (default: 44)
 *   --parallel      API call concurrency (default: 3)
 *   --dry-run       Stop after graph generation, print structure
 *   --no-cache      Disable cache, force fresh generation
 *   --verbose, -v   Show detailed progress
 *   --help, -h      Show help
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'util';
import { parsePdf } from '../lib/pdf/parser';
import { runPipeline, type PipelineConfig } from '../lib/ai/pipeline';
import { validateAndFix } from '../lib/ai/validation';
import { PipelineCache } from '../lib/cache';

// Parse command line arguments
const { values: args } = parseArgs({
  options: {
    pdf: { type: 'string', short: 'p' },
    'api-key': { type: 'string', short: 'k' },
    output: { type: 'string', short: 'o' },
    nodes: { type: 'string', short: 'n' },
    parallel: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'no-cache': { type: 'boolean', default: false },
    verbose: { type: 'boolean', short: 'v', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

function printHelp() {
  console.log(`
Book Adventure CLI - Generate text adventures from PDF books

Usage:
  npx tsx src/cli/index.ts --pdf ./book.pdf --api-key $ANTHROPIC_API_KEY

Options:
  --pdf, -p       Path to PDF file (required)
  --api-key, -k   Anthropic API key (or set ANTHROPIC_API_KEY env var)
  --output, -o    Output JSON path (default: <book>.game.json)
  --nodes, -n     Target number of nodes (default: 44)
  --parallel      API call concurrency (default: 3)
  --dry-run       Stop after graph generation, print structure
  --no-cache      Disable cache, force fresh generation
  --verbose, -v   Show detailed progress
  --help, -h      Show help

Examples:
  # Basic usage (44 nodes)
  npx tsx src/cli/index.ts -p moby-dick.pdf -k sk-ant-xxx

  # Larger game with 200 nodes
  npx tsx src/cli/index.ts -p moby-dick.pdf -n 200

  # Preview graph structure without generating content
  npx tsx src/cli/index.ts -p moby-dick.pdf --dry-run

  # Use environment variable for API key
  export ANTHROPIC_API_KEY=sk-ant-xxx
  npx tsx src/cli/index.ts -p moby-dick.pdf
`);
}

async function main() {
  // Show help
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Validate required arguments
  const pdfPath = args.pdf;
  if (!pdfPath) {
    console.error('Error: --pdf argument is required');
    printHelp();
    process.exit(1);
  }

  // Check PDF exists
  if (!fs.existsSync(pdfPath)) {
    console.error(`Error: PDF file not found: ${pdfPath}`);
    process.exit(1);
  }

  // Get API key
  const apiKey = args['api-key'] || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: API key required. Use --api-key or set ANTHROPIC_API_KEY env var');
    process.exit(1);
  }

  // Parse options
  const targetNodes = args.nodes ? parseInt(args.nodes, 10) : 44;
  const concurrency = args.parallel ? parseInt(args.parallel, 10) : 3;
  const dryRun = args['dry-run'] ?? false;
  const noCache = args['no-cache'] ?? false;
  const verbose = args.verbose ?? false;

  // Determine output path
  const baseName = path.basename(pdfPath, '.pdf');
  const outputPath = args.output || `${baseName}.game.json`;

  console.log('='.repeat(60));
  console.log('Book Adventure CLI');
  console.log('='.repeat(60));
  console.log(`PDF: ${pdfPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Target nodes: ${targetNodes}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Cache: ${noCache ? 'disabled' : 'enabled'}`);
  console.log(`Verbose: ${verbose}`);
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    // Parse PDF
    console.log('\nParsing PDF...');
    const pdfBuffer = fs.readFileSync(pdfPath);

    // Convert Buffer to ArrayBuffer
    const arrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    );

    const book = await parsePdf(arrayBuffer, baseName);
    console.log(`  Extracted ${book.chapters.length} chapters`);
    console.log(`  Title: "${book.title}"`);
    console.log(`  Author: "${book.author}"`);

    if (verbose) {
      console.log('\n  Chapters:');
      book.chapters.slice(0, 10).forEach((ch, i) => {
        console.log(`    ${i + 1}. ${ch.title} (${ch.content.length} chars)`);
      });
      if (book.chapters.length > 10) {
        console.log(`    ... and ${book.chapters.length - 10} more`);
      }
    }

    // Set up cache
    const cache = noCache ? undefined : new PipelineCache(outputPath, book, targetNodes);
    if (cache) {
      console.log(`  Cache: ${cache.summarize()}`);
    }

    // Run pipeline
    console.log('\nRunning 6-step generation pipeline...\n');

    const config: PipelineConfig = {
      targetNodes,
      concurrency,
      dryRun,
      verbose,
    };

    const gameData = await runPipeline(book, apiKey, config, (stage, percent) => {
      if (verbose) {
        process.stdout.write(`\r  [${stage}] ${percent.toFixed(0)}%`);
        if (percent >= 100) console.log('');
      }
    }, undefined, cache);

    // Write output
    console.log('\nWriting output...');
    const gameJson = JSON.stringify(gameData, null, 2);
    fs.writeFileSync(outputPath, gameJson);
    console.log(`  Wrote ${(gameJson.length / 1024).toFixed(1)} KB to ${outputPath}`);

    // Final summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log('Generation Complete!');
    console.log('='.repeat(60));
    console.log(`  Time: ${elapsed}s`);
    console.log(`  Nodes: ${Object.keys(gameData.nodes).length}`);
    console.log(`  Locations: ${Object.keys(gameData.locations).length}`);
    console.log(`  Characters: ${Object.keys(gameData.characters).length}`);
    console.log(`  Items: ${Object.keys(gameData.items).length}`);
    console.log(`  Objects: ${Object.keys(gameData.objects).length}`);
    console.log(`  Variables: ${Object.keys(gameData.variableDefinitions).length}`);

    // Run validation for final stats
    const { report } = validateAndFix(gameData);
    console.log(`\n  Interactions: ${report.stats.totalInteractions} (avg ${report.stats.avgInteractionsPerNode.toFixed(1)}/node)`);
    console.log(`  Endings: ${report.stats.endingNodes}`);
    console.log(`  Choices: ${report.stats.choiceNodes}`);

    if (report.stats.missingInteractionTypes.length > 0) {
      console.log(`  Missing interaction types: ${report.stats.missingInteractionTypes.join(', ')}`);
    }
    if (report.stats.missingConditionTypes.length > 0) {
      console.log(`  Missing condition types: ${report.stats.missingConditionTypes.join(', ')}`);
    }
    if (report.stats.missingEffectTypes.length > 0) {
      console.log(`  Missing effect types: ${report.stats.missingEffectTypes.join(', ')}`);
    }

    if (report.errors.length > 0) {
      console.log(`\n  Errors: ${report.errors.length}`);
    }
    if (report.warnings.length > 0) {
      console.log(`  Warnings: ${report.warnings.length}`);
    }

    console.log('\n  Output file: ' + outputPath);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\nError:', error);
    process.exit(1);
  }
}

main();
