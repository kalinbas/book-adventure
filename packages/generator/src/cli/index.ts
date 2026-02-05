#!/usr/bin/env node
/**
 * CLI Tool for Testing Book Adventure Generation
 *
 * Usage:
 *   npx tsx src/cli/index.ts --pdf ./book.pdf --api-key $ANTHROPIC_API_KEY
 *
 * Options:
 *   --pdf, -p       Path to PDF file (required)
 *   --api-key, -k   Anthropic API key (or set ANTHROPIC_API_KEY env var)
 *   --output, -o    Output JSON path (default: <book>.game.json)
 *   --chunked, -c   Use chunked generation (multiple API calls, safer for large books)
 *   --verbose, -v   Show detailed progress
 *   --help, -h      Show help
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'util';
import { parsePdf } from '../lib/pdf/parser';
import { runAnalysisPipeline } from '../lib/ai/analysis';

// Parse command line arguments
const { values: args } = parseArgs({
  options: {
    pdf: { type: 'string', short: 'p' },
    'api-key': { type: 'string', short: 'k' },
    output: { type: 'string', short: 'o' },
    chunked: { type: 'boolean', short: 'c', default: false },
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
  --chunked, -c   Use chunked generation (multiple API calls, safer for large books)
  --verbose, -v   Show detailed progress
  --help, -h      Show help

Examples:
  # Basic usage
  npx tsx src/cli/index.ts -p moby-dick.pdf -k sk-ant-xxx

  # Use environment variable for API key
  export ANTHROPIC_API_KEY=sk-ant-xxx
  npx tsx src/cli/index.ts -p moby-dick.pdf

  # Use chunked generation for large books
  npx tsx src/cli/index.ts -p war-and-peace.pdf -c -v
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

  // Determine output path
  const baseName = path.basename(pdfPath, '.pdf');
  const outputPath = args.output || `${baseName}.game.json`;

  const verbose = args.verbose;
  const useChunked = args.chunked;

  console.log('='.repeat(60));
  console.log('Book Adventure CLI');
  console.log('='.repeat(60));
  console.log(`PDF: ${pdfPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Chunked: ${useChunked}`);
  console.log(`Verbose: ${verbose}`);
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    // Step 1: Parse PDF
    console.log('\n📖 Step 1: Parsing PDF...');
    const pdfBuffer = fs.readFileSync(pdfPath);

    // Convert Buffer to ArrayBuffer
    const arrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    );

    const book = await parsePdf(arrayBuffer, baseName);
    console.log(`   ✓ Extracted ${book.chapters.length} chapters`);
    console.log(`   ✓ Title: "${book.title}"`);
    console.log(`   ✓ Author: "${book.author}"`);

    if (verbose) {
      console.log('\n   Chapters:');
      book.chapters.slice(0, 10).forEach((ch, i) => {
        console.log(`     ${i + 1}. ${ch.title} (${ch.content.length} chars)`);
      });
      if (book.chapters.length > 10) {
        console.log(`     ... and ${book.chapters.length - 10} more`);
      }
    }

    // Step 2: Run analysis pipeline
    console.log('\n🤖 Step 2: Running AI analysis pipeline...');
    console.log('   This may take several minutes...\n');

    let lastStage = '';
    const result = await runAnalysisPipeline(
      book,
      apiKey,
      (stage, percent) => {
        if (verbose || stage !== lastStage) {
          const stageNames: Record<string, string> = {
            textExtraction: '📄 Text Extraction',
            chapterDetection: '📑 Chapter Detection',
            storySummarization: '📝 Story Summarization',
            characterAnalysis: '👤 Character Analysis',
            locationMapping: '🗺️  Location Mapping',
            plotAnalysis: '📊 Plot Analysis',
            interactionGeneration: '🎮 Game Generation',
          };
          const stageName = stageNames[stage] || stage;

          if (stage !== lastStage) {
            console.log(`   ${stageName}...`);
            lastStage = stage;
          }

          if (verbose) {
            process.stdout.write(`\r   ${stageName}: ${percent.toFixed(0)}%`);
            if (percent >= 100) console.log('');
          }
        }
      },
      { useChunkedGeneration: useChunked }
    );

    // Step 3: Write output
    console.log('\n💾 Step 3: Writing output...');
    const gameJson = JSON.stringify(result.gameData, null, 2);
    fs.writeFileSync(outputPath, gameJson);
    console.log(`   ✓ Wrote ${(gameJson.length / 1024).toFixed(1)} KB to ${outputPath}`);

    // Step 4: Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log('✅ Generation Complete!');
    console.log('='.repeat(60));
    console.log(`   Time: ${elapsed}s`);
    console.log(`   Nodes: ${Object.keys(result.gameData.nodes).length}`);
    console.log(`   Locations: ${Object.keys(result.gameData.locations).length}`);
    console.log(`   Characters: ${Object.keys(result.gameData.characters).length}`);
    console.log(`   Items: ${Object.keys(result.gameData.items).length}`);

    // Analyze interactivity
    const nodes = Object.values(result.gameData.nodes);
    const totalInteractions = nodes.reduce((sum, n) => sum + (n.interactions?.length || 0), 0);
    const avgInteractions = totalInteractions / nodes.length;
    const endingCount = nodes.filter((n) => n.type === 'ending').length;
    const branchingNodes = nodes.filter((n) => {
      const targets = new Set(n.interactions?.filter((i) => i.targetNodeId).map((i) => i.targetNodeId));
      return targets.size > 1;
    }).length;

    console.log('\n   Interactivity Analysis:');
    console.log(`   - Avg interactions per node: ${avgInteractions.toFixed(1)}`);
    console.log(`   - Ending nodes: ${endingCount}`);
    console.log(`   - Branching nodes: ${branchingNodes}`);

    if (avgInteractions < 2) {
      console.log('\n   ⚠️  Warning: Low interactivity detected. Consider using --chunked flag.');
    }

    console.log('\n   Output file: ' + outputPath);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
