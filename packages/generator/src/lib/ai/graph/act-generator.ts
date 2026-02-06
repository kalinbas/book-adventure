/**
 * Step 3a: Act Structure Generation (for large games >100 nodes)
 *
 * Generates the high-level act structure: 3-5 acts covering the story arc.
 * Each act gets a target node count and defines entry/exit ports.
 */

import { callWithStructuredOutput } from '../client';
import type { StorySummary } from '../story-summarizer';
import type { WorldData } from '../world-builder';

export interface ActStructure {
  acts: {
    id: string;
    title: string;
    summary: string;
    plotBeats: number[];
    mainCharacters: string[];
    locations: string[];
    targetNodeCount: number;
    entryPoints: string[];
    exitPoints: string[];
  }[];
}

export async function generateActStructure(
  summary: StorySummary,
  worldData: WorldData,
  apiKey: string,
  targetNodes: number,
  onProgress?: (percent: number) => void,
  language: string = 'English',
): Promise<ActStructure> {
  onProgress?.(10);

  const locationIds = Object.keys(worldData.locations);
  const characterIds = Object.keys(worldData.characters);

  const numActs = targetNodes > 500 ? 5 : targetNodes > 200 ? 4 : 3;

  const languageInstruction = language !== 'English'
    ? ` Write all titles and summaries in ${language}. Only IDs should be in English snake_case.`
    : '';

  const systemPrompt = `You are a story architect dividing a narrative into acts for a large text adventure game.
Each act is a major story arc that will be further divided into chapters and scenes.${languageInstruction}
Output valid JSON only.`;

  const userPrompt = `Divide this story into ${numActs} acts for a text adventure with ~${targetNodes} nodes total.

## STORY OVERVIEW
${summary.overview}

## PLOT BEATS
${summary.plotProgression.map((p) => `${p.beatNumber}. ${p.beat} [${p.location}] ${p.isDecisionPoint ? 'DECISION POINT' : ''}`).join('\n')}

## AVAILABLE IDS
Locations: ${locationIds.join(', ')}
Characters: ${characterIds.join(', ')}

## REQUIREMENTS
- ${numActs} acts covering the entire story
- Each act gets a proportional share of the ${targetNodes} total nodes
- Act 1 (setup): ~20% of nodes
- Middle acts: ~50-60% of nodes divided evenly
- Final act (climax/resolution): ~20-25% of nodes
- Each act defines entryPoints (named ports for incoming connections) and exitPoints (named ports for outgoing)
- Plot beats are distributed across acts by their beat number

## OUTPUT FORMAT
\`\`\`json
{
  "acts": [
    {
      "id": "act_1",
      "title": "Act 1 Title",
      "summary": "What happens in this act",
      "plotBeats": [1, 2, 3, 4, 5],
      "mainCharacters": ["char_id_1", "char_id_2"],
      "locations": ["loc_id_1", "loc_id_2"],
      "targetNodeCount": ${Math.floor(targetNodes * 0.2)},
      "entryPoints": ["game_start"],
      "exitPoints": ["to_act_2_main", "to_act_2_alternate"]
    }
  ]
}
\`\`\`

Return ONLY valid JSON.`;

  onProgress?.(30);

  const response = await callWithStructuredOutput<ActStructure>(
    apiKey,
    systemPrompt,
    userPrompt,
    {},
    'sonnet',
  );

  onProgress?.(100);
  return response.data;
}
