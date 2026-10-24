/**
 * Sentence Chunker for Low-Latency Voice Pipeline
 * 
 * Chunks streaming LLM tokens into sentence units.
 * Applies the PRD rule: first chunk should be small (<8 words or at first punctuation)
 * so that TTS synthesis can begin immediately without waiting for the full paragraph.
 */

export interface ChunkerOptions {
  /** Maximum words in the first chunk to trigger immediate TTS synthesis (default: 8) */
  maxFirstChunkWords?: number;
  /** Maximum words in subsequent chunks before forcing a break at commas (default: 16) */
  maxChunkWords?: number;
}

export async function* chunkSentences(
  tokenStream: AsyncIterable<string>,
  options?: ChunkerOptions
): AsyncIterable<string> {
  const maxFirstWords = options?.maxFirstChunkWords ?? 8;
  const maxSubsequentWords = options?.maxChunkWords ?? 16;

  let buffer = '';
  let isFirstChunk = true;

  // Sentence terminators: period, exclamation, question mark, newline
  const sentenceTerminators = /[.!?\n]/;
  // Clause terminators: comma, semicolon, colon, dash
  const clauseTerminators = /[,;:\u2014-]/;

  for await (const token of tokenStream) {
    buffer += token;

    // Count words in current buffer
    const words = buffer.trim().split(/\s+/).filter(Boolean);
    const wordLimit = isFirstChunk ? maxFirstWords : maxSubsequentWords;

    // Check for hard sentence boundary
    const sentenceMatch = buffer.match(sentenceTerminators);

    if (sentenceMatch && sentenceMatch.index !== undefined) {
      const splitIndex = sentenceMatch.index + 1;
      const chunk = buffer.slice(0, splitIndex).trim();
      buffer = buffer.slice(splitIndex);

      if (chunk.length > 0) {
        isFirstChunk = false;
        yield chunk;
      }
    } else if (words.length >= wordLimit) {
      // If words exceed limit, look for a clause terminator (comma, dash, etc.)
      const clauseMatch = buffer.match(clauseTerminators);
      if (clauseMatch && clauseMatch.index !== undefined && clauseMatch.index > 5) {
        const splitIndex = clauseMatch.index + 1;
        const chunk = buffer.slice(0, splitIndex).trim();
        buffer = buffer.slice(splitIndex);

        if (chunk.length > 0) {
          isFirstChunk = false;
          yield chunk;
        }
      } else if (words.length >= wordLimit * 1.5) {
        // Force split at the last space to avoid huge blocks
        const lastSpace = buffer.lastIndexOf(' ');
        if (lastSpace > 0) {
          const chunk = buffer.slice(0, lastSpace).trim();
          buffer = buffer.slice(lastSpace);
          if (chunk.length > 0) {
            isFirstChunk = false;
            yield chunk;
          }
        }
      }
    }
  }

  // Flush remaining buffer
  const finalChunk = buffer.trim();
  if (finalChunk.length > 0) {
    yield finalChunk;
  }
}
