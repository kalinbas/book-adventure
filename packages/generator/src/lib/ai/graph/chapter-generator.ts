/**
 * Step 3b: Chapter Structure Generation (for large games >100 nodes)
 *
 * Generates chapters within each act. 1 API call per act (parallelizable).
 * Each chapter has narrative arcs and entry/exit ports.
 */

import { callWithStructuredOutput } from '../client';
import type { StorySummary } from '../story-summarizer';
import type { WorldData } from '../world-builder';
import type { ActStructure } from './act-generator';

export interface ChapterStructure {
  chapters: {
    id: string;
    actId: string;
    title: string;
    summary: string;
    narrativeArcs: {
      id: string;
      isCanonical: boolean;
      summary: string;
      branchCondition?: string;
    }[];
    targetNodeCount: number;
    entryPorts: string[];
    exitPorts: string[];
    locations: string[];
    characters: string[];
  }[];
}

export async function generateChapterStructure(
  act: ActStructure['acts'][number],
  summary: StorySummary,
  _worldData: WorldData,
  apiKey: string,
  onProgress?: (percent: number) => void,
  language: string = 'English',
): Promise<ChapterStructure> {
  onProgress?.(10);

  const plotBeats = summary.plotProgression.filter((p) =>
    act.plotBeats.includes(p.beatNumber),
  );

  const chaptersTarget = Math.max(3, Math.ceil(act.targetNodeCount / 15));

  const languageInstruction = language !== 'English'
    ? ` Write all titles and summaries in ${language}. Only IDs should be in English snake_case.`
    : '';

  const systemPrompt = `You are a narrative architect designing chapter structure within an act of a text adventure game.
Each chapter is a coherent story segment that will contain multiple scene nodes.${languageInstruction}
Output valid JSON only.`;

  const userPrompt = `Design ${chaptersTarget} chapters for "${act.title}" (${act.id}).

## ACT SUMMARY
${act.summary}

## PLOT BEATS IN THIS ACT
${plotBeats.map((p) => `${p.beatNumber}. ${p.beat} [${p.location}] ${p.isDecisionPoint ? 'DECISION POINT' : ''}`).join('\n')}

## ACT LOCATIONS
${act.locations.join(', ')}

## ACT CHARACTERS
${act.mainCharacters.join(', ')}

## ACT ENTRY POINTS
${act.entryPoints.join(', ')}

## ACT EXIT POINTS
${act.exitPoints.join(', ')}

## TARGET: ${act.targetNodeCount} nodes total across all chapters

## REQUIREMENTS
- ${chaptersTarget} chapters covering this act's story
- Each chapter has 1-3 narrative arcs (canonical path + optional alternate paths)
- Distribute ${act.targetNodeCount} nodes across chapters (5-15 nodes each)
- Entry ports: the first chapter must include the act's entry points
- Exit ports: the last chapter must include the act's exit points
- Cross-chapter connections use named ports

## OUTPUT FORMAT
\`\`\`json
{
  "chapters": [
    {
      "id": "ch_1_1",
      "actId": "${act.id}",
      "title": "Chapter Title",
      "summary": "What happens in this chapter",
      "narrativeArcs": [
        { "id": "main", "isCanonical": true, "summary": "Main path through chapter" },
        { "id": "alt_stealth", "isCanonical": false, "summary": "Alternate stealth path", "branchCondition": "has_item:disguise" }
      ],
      "targetNodeCount": 10,
      "entryPorts": ["from_previous_chapter"],
      "exitPorts": ["to_next_chapter_main", "to_next_chapter_alt"],
      "locations": ["loc_id_1", "loc_id_2"],
      "characters": ["char_id_1"]
    }
  ]
}
\`\`\`

Return ONLY valid JSON.`;

  onProgress?.(30);

  const response = await callWithStructuredOutput<ChapterStructure>(
    apiKey,
    systemPrompt,
    userPrompt,
    {},
    'sonnet',
  );

  onProgress?.(100);
  return response.data;
}
