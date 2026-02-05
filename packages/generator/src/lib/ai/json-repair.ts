/**
 * JSON Repair Utilities
 * Attempts to fix common truncation patterns in JSON responses from LLMs
 */

/**
 * Attempt to repair truncated JSON
 * Common patterns:
 * - Unclosed strings: "some text...
 * - Unclosed arrays: [...
 * - Unclosed objects: {...
 * - Missing closing brackets/braces
 */
export function attemptJsonRepair(jsonStr: string): unknown | null {
  // First, try parsing as-is
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Continue with repair attempts
  }

  let repaired = jsonStr.trim();

  // Remove any trailing incomplete key-value pairs
  // e.g., `"someKey": ` or `"someKey":` at the end
  repaired = repaired.replace(/,\s*"[^"]*":\s*$/, '');
  repaired = repaired.replace(/,\s*"[^"]*"\s*$/, '');

  // Remove trailing comma
  repaired = repaired.replace(/,\s*$/, '');

  // Try to close any unclosed strings
  // Count quotes - if odd, add one
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    // Find the last quote and close the string
    repaired = repaired + '"';
  }

  // Now balance brackets and braces
  repaired = balanceBrackets(repaired);

  // Try parsing the repaired JSON
  try {
    return JSON.parse(repaired);
  } catch {
    // Try more aggressive repair
  }

  // More aggressive: try to find the last complete object/array
  const lastCompleteJson = findLastCompleteJson(jsonStr);
  if (lastCompleteJson) {
    try {
      return JSON.parse(lastCompleteJson);
    } catch {
      // Continue
    }
  }

  return null;
}

/**
 * Balance brackets and braces in JSON string
 */
function balanceBrackets(str: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{' || char === '[') {
      stack.push(char);
    } else if (char === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === '{') {
        stack.pop();
      }
    } else if (char === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === '[') {
        stack.pop();
      }
    }
  }

  // Close any unclosed brackets/braces
  let result = str;
  while (stack.length > 0) {
    const open = stack.pop();
    if (open === '{') {
      result += '}';
    } else if (open === '[') {
      result += ']';
    }
  }

  return result;
}

/**
 * Try to find the last position where the JSON was complete
 * Works by progressively removing content and trying to parse
 */
function findLastCompleteJson(str: string): string | null {
  // For objects, try to find the last complete property
  if (str.trim().startsWith('{')) {
    // Try removing characters from the end until we get valid JSON
    let truncated = str;
    while (truncated.length > 2) {
      // Try closing the JSON at this point
      const attempt = closeJsonAtPosition(truncated);
      try {
        JSON.parse(attempt);
        return attempt;
      } catch {
        // Remove last character and try again
        truncated = truncated.slice(0, -1);
      }
    }
  }

  return null;
}

/**
 * Try to close JSON at the current position
 */
function closeJsonAtPosition(str: string): string {
  let result = str.trim();

  // Remove any incomplete trailing content
  // Remove trailing partial strings
  if (result.match(/:\s*"[^"]*$/)) {
    result = result.replace(/:\s*"[^"]*$/, ': null');
  }

  // Remove trailing colons
  result = result.replace(/:\s*$/, ': null');

  // Remove trailing commas
  result = result.replace(/,\s*$/, '');

  // Balance brackets
  result = balanceBrackets(result);

  return result;
}

/**
 * Validate that the repaired JSON has reasonable content
 * Returns true if the JSON appears to be usable
 */
export function validateRepairedJson(data: unknown): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // For game data, check if it has the expected structure
  const obj = data as Record<string, unknown>;

  // Check if it's a nodes object (most likely truncation point)
  if (Object.keys(obj).length > 0) {
    // At least some content was recovered
    const firstKey = Object.keys(obj)[0];
    const firstValue = obj[firstKey];

    // Check if values look like story nodes
    if (firstValue && typeof firstValue === 'object') {
      const node = firstValue as Record<string, unknown>;
      if ('id' in node || 'content' in node || 'interactions' in node) {
        return true;
      }
    }

    // For other object types, just check we have content
    return Object.keys(obj).length >= 1;
  }

  return false;
}

/**
 * Extract partial data from truncated JSON
 * This is a last resort - tries to salvage whatever nodes were complete
 */
export function extractPartialNodes(jsonStr: string): Record<string, unknown> | null {
  const nodes: Record<string, unknown> = {};

  // Try to find complete node objects
  // Pattern: "node_id": { ... complete object ... }
  const nodePattern = /"([^"]+)":\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/g;

  let match;
  while ((match = nodePattern.exec(jsonStr)) !== null) {
    const [, nodeId, nodeJson] = match;
    try {
      const node = JSON.parse(nodeJson);
      if (node && typeof node === 'object' && 'id' in node) {
        nodes[nodeId] = node;
      }
    } catch {
      // Skip malformed nodes
    }
  }

  return Object.keys(nodes).length > 0 ? nodes : null;
}
