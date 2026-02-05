import Anthropic from '@anthropic-ai/sdk';
import { attemptJsonRepair, validateRepairedJson, extractPartialNodes } from './json-repair';

let client: Anthropic | null = null;

// Rate limiting configuration
const MIN_DELAY_BETWEEN_CALLS = 2000; // 2 seconds between calls
const MAX_RETRIES = 3;
let lastCallTime = 0;

/**
 * Sleep for a given number of milliseconds
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function getClient(apiKey: string): Anthropic {
  if (!client || (client as any).apiKey !== apiKey) {
    client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true, // Required for browser usage
    });
  }
  return client;
}

export interface StructuredResponse<T> {
  data: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  wasTruncated?: boolean;
  wasRepaired?: boolean;
}

export type ModelType = 'sonnet' | 'haiku';

const MODEL_IDS: Record<ModelType, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-3-5-haiku-20241022',
};

/**
 * Call Claude with a prompt and get a structured JSON response
 * Includes rate limiting and retry logic for 429 errors
 */
export async function callWithStructuredOutput<T>(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  _schema: object, // Schema for validation (not used in runtime, but helpful for type safety)
  model: ModelType = 'sonnet'
): Promise<StructuredResponse<T>> {
  const anthropic = getClient(apiKey);

  // Rate limiting - ensure minimum delay between calls
  const timeSinceLastCall = Date.now() - lastCallTime;
  if (timeSinceLastCall < MIN_DELAY_BETWEEN_CALLS) {
    await sleep(MIN_DELAY_BETWEEN_CALLS - timeSinceLastCall);
  }

  // Retry logic with exponential backoff
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      lastCallTime = Date.now();

      const response = await anthropic.messages.create({
        model: MODEL_IDS[model],
        max_tokens: 16384,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      // Check if response was truncated
      const wasTruncated = response.stop_reason === 'max_tokens';
      if (wasTruncated) {
        console.warn(`⚠️ Response truncated at ${response.usage.output_tokens} tokens (stop_reason: max_tokens)`);
      }

      // Extract text content
      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in response');
      }

      // Parse JSON from response
      const jsonMatch = textContent.text.match(/```json\s*([\s\S]*?)\s*```/);
      let jsonStr = jsonMatch ? jsonMatch[1] : textContent.text;

      // Clean up any markdown or extra text
      jsonStr = jsonStr.trim();
      if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
        // Already looks like JSON
      } else {
        // Try to find JSON object/array in the text
        const startBrace = jsonStr.indexOf('{');
        const startBracket = jsonStr.indexOf('[');
        const start = Math.min(
          startBrace === -1 ? Infinity : startBrace,
          startBracket === -1 ? Infinity : startBracket
        );
        if (start !== Infinity) {
          jsonStr = jsonStr.slice(start);
        }
      }

      // First, try standard parsing
      try {
        const data = JSON.parse(jsonStr) as T;
        return {
          data,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
          wasTruncated,
        };
      } catch (parseErr) {
        console.warn('Standard JSON parsing failed, attempting repair...');
        console.error('Parse error:', parseErr);
        console.log('JSON string (first 1000 chars):', jsonStr.slice(0, 1000));
        console.log('JSON string (last 500 chars):', jsonStr.slice(-500));

        // Try to repair the JSON
        const repaired = attemptJsonRepair(jsonStr);
        if (repaired && validateRepairedJson(repaired)) {
          console.log('✓ JSON successfully repaired');
          return {
            data: repaired as T,
            usage: {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            },
            wasTruncated: true,
            wasRepaired: true,
          };
        }

        // Try to extract partial nodes as last resort
        const partialNodes = extractPartialNodes(jsonStr);
        if (partialNodes && Object.keys(partialNodes).length >= 5) {
          console.log(`✓ Extracted ${Object.keys(partialNodes).length} partial nodes from truncated response`);
          return {
            data: partialNodes as T,
            usage: {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            },
            wasTruncated: true,
            wasRepaired: true,
          };
        }

        // If all repair attempts fail, throw with detailed info
        const tokenInfo = `Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`;
        const truncatedMsg = wasTruncated ? ' (Response was TRUNCATED - max_tokens reached)' : '';
        throw new Error(
          `Failed to parse AI response as JSON${truncatedMsg}. ${tokenInfo}. ` +
          `Original error: ${parseErr}. ` +
          `Consider using chunked generation for large books.`
        );
      }
    } catch (err: unknown) {
      lastError = err as Error;

      // Check if it's a rate limit error
      const isRateLimitError =
        (err as { status?: number })?.status === 429 ||
        (err as Error)?.message?.includes('rate_limit') ||
        (err as Error)?.message?.includes('429');

      if (isRateLimitError && attempt < MAX_RETRIES - 1) {
        // Exponential backoff: 5s, 10s, 20s
        const delay = Math.pow(2, attempt) * 5000;
        console.log(`Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }

      // If not a rate limit error or we've exhausted retries, throw
      throw err;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}
