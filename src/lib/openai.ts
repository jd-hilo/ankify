import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a concept summary for a flashcard
 *
 * The summary should:
 * - Be 1-2 sentences
 * - Answer "What medical knowledge is this card testing?"
 * - Be concept-level, not trivia-level
 * - Avoid copying phrasing directly from the card
 * - Ignore cloze syntax, formatting, and extraneous details
 */
export async function generateConceptSummary(
  front: string,
  back: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a medical education expert. Given a flashcard's front and back content, generate a concise concept summary (1-2 sentences) that captures the core medical knowledge being tested.

Requirements:
- Focus on the underlying medical concept, not memorization details
- Answer the question: "What medical knowledge is this card testing?"
- Be concept-level (e.g., "mechanism of beta-blocker action") not trivia-level (e.g., "metoprolol dosage")
- Do not copy phrasing from the card
- Ignore formatting artifacts, cloze markers, or media references
- Use medical terminology appropriately

Output only the concept summary, nothing else.`,
      },
      {
        role: 'user',
        content: `Front: ${front}\n\nBack: ${back}`,
      },
    ],
    temperature: 0, // Deterministic output
    max_tokens: 150,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

/**
 * Generate concept summaries for multiple cards in batches
 * Uses batch processing for efficiency
 */
export async function generateConceptSummariesBatch(
  cards: { front: string; back: string }[],
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  const BATCH_SIZE = 20;
  const results: string[] = [];

  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = cards.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map((card) => generateConceptSummary(card.front, card.back))
    );

    results.push(...batchResults);

    if (onProgress) {
      onProgress(results.length, cards.length);
    }

    // Rate limiting - wait between batches
    if (i + BATCH_SIZE < cards.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Generate embedding vector for a concept summary
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batches
 * OpenAI supports up to 2048 texts per request
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<number[][]> {
  const BATCH_SIZE = 100; // Conservative batch size
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
      dimensions: 1536,
    });

    // Embeddings are returned in the same order as input
    const batchEmbeddings = response.data.map((d) => d.embedding);
    results.push(...batchEmbeddings);

    if (onProgress) {
      onProgress(results.length, texts.length);
    }

    // Rate limiting
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return results;
}

/**
 * Classify alignment between a slide concept and card concept
 */
export async function classifyAlignment(
  slideConcept: string,
  cardConcept: string
): Promise<{
  alignmentType: 'directly_aligned' | 'deeper_than_lecture' | 'too_shallow' | 'not_aligned';
  reasoning: string;
}> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a medical education curriculum alignment expert. Given a lecture slide concept and a flashcard concept, classify their alignment.

Classification types:
- directly_aligned: The card tests knowledge that directly matches what's being taught in the slide
- deeper_than_lecture: The card goes beyond what the lecture covers (too advanced for this lecture)
- too_shallow: The card is too basic compared to the lecture content
- not_aligned: The concepts are not meaningfully related

Respond in JSON format:
{
  "alignmentType": "directly_aligned" | "deeper_than_lecture" | "too_shallow" | "not_aligned",
  "reasoning": "Brief explanation (1-2 sentences)"
}`,
      },
      {
        role: 'user',
        content: `Lecture slide concept: ${slideConcept}\n\nFlashcard concept: ${cardConcept}`,
      },
    ],
    temperature: 0,
    max_tokens: 200,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);

  return {
    alignmentType: parsed.alignmentType || 'not_aligned',
    reasoning: parsed.reasoning || 'Unable to determine alignment',
  };
}

/**
 * Analyze a slide for coverage gaps
 */
export async function analyzeGap(
  slideConcept: string,
  matchedCardConcepts: string[]
): Promise<string | null> {
  if (matchedCardConcepts.length === 0) {
    // Complete gap - no cards match
    return `No flashcards found covering: ${slideConcept}`;
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a medical education curriculum analyst. Given a lecture concept and the flashcard concepts that were matched to it, identify if there are any significant gaps in coverage.

If the matched cards adequately cover the lecture concept, respond with null.
If there are gaps, briefly describe what's missing.

Respond in JSON format:
{
  "gap": null | "Description of what's not covered"
}`,
      },
      {
        role: 'user',
        content: `Lecture concept: ${slideConcept}\n\nMatched flashcard concepts:\n${matchedCardConcepts.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
      },
    ],
    temperature: 0,
    max_tokens: 150,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);

  return parsed.gap || null;
}

/**
 * Match and classify cards for a slide in a single AI call
 * This is much faster than processing cards individually
 */
export async function matchCardsToSlide(
  slideConcept: string,
  cards: { card_id: string; front: string; back: string }[]
): Promise<{
  matches: Array<{
    card_id: string;
    alignment_type: 'directly_aligned' | 'deeper_than_lecture' | 'too_shallow' | 'not_aligned';
    reasoning: string;
    relevance_score: number; // 0-100
  }>;
}> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a medical education curriculum alignment expert. Given a lecture slide concept and a list of flashcards, identify which cards are relevant and classify their alignment.

For each card, determine:
1. alignment_type:
   - "directly_aligned": Card tests knowledge that directly matches the slide
   - "deeper_than_lecture": Card goes beyond what the slide covers
   - "too_shallow": Card is too basic compared to the slide
   - "not_aligned": Not meaningfully related

2. relevance_score: 0-100 (how relevant is this card to the slide?)
3. reasoning: Brief explanation (1 sentence)

Only include cards with relevance_score >= 30.

Respond in JSON format:
{
  "matches": [
    {
      "card_id": "abc123",
      "alignment_type": "directly_aligned",
      "reasoning": "Brief explanation",
      "relevance_score": 85
    }
  ]
}`,
      },
      {
        role: 'user',
        content: `Lecture slide concept: ${slideConcept}

Flashcards to analyze:
${cards.map((c, i) => `${i + 1}. [ID: ${c.card_id}]
Front: ${c.front.slice(0, 300)}
Back: ${c.back.slice(0, 300)}`).join('\n\n')}`,
      },
    ],
    temperature: 0,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);

  return {
    matches: parsed.matches || [],
  };
}
