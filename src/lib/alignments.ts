import { createServiceClient } from '@/lib/supabase/service';
import {
  matchCardsToSlide,
  analyzeGap,
} from '@/lib/openai';

interface RawCardCandidate {
  raw_card_id: string;
  card_id: string;
  front: string;
  back: string;
  tags: string[] | null;
  similarity: number;
}

interface SlideConceptWithEmbedding {
  id: string;
  slide_number: number;
  concept_summary: string;
  embedding: number[];
}

/**
 * Retry helper for database operations that may timeout
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isTimeout = error?.code === '57014' || error?.message?.includes('timeout');
      
      if (isTimeout && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.log(`Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Process a single slide's alignment
 */
async function processSlideAlignment(
  slide: SlideConceptWithEmbedding,
  lectureId: string,
  deckId: string,
  supabase: ReturnType<typeof createServiceClient>,
  MATCH_COUNT: number,
  MAX_CARDS_PER_AI_CALL: number
) {
  // PHASE 1: Find candidate cards using text similarity (no OpenAI yet)
  const supabaseClient = supabase as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };

  const rawSearchText = slide.concept_summary.trim();
  const searchText =
    rawSearchText.length > 1000 ? rawSearchText.slice(0, 1000) : rawSearchText;

  // Retry on timeout errors
  let candidatesData: unknown;
  let matchError: unknown;
  
  try {
    const result = await retryWithBackoff(async () => {
      const response = await supabaseClient.rpc(
        'find_candidate_cards',
        {
          search_text: searchText,
          deck_id_filter: deckId,
          match_count: MATCH_COUNT, // Get more candidates for text search
        }
      );
      if (response.error) {
        throw response.error;
      }
      return response.data;
    });
    candidatesData = result;
    matchError = null;
  } catch (error) {
    matchError = error;
    candidatesData = null;
  }

  if (matchError) {
    console.error(`Text match error for slide ${slide.slide_number}:`, matchError);
    // If search times out or fails after retries, skip this slide
    const errorMessage = (matchError as any).message || 'timeout';
    await supabase.from('coverage_gaps').insert({
      lecture_id: lectureId,
      slide_concept_id: slide.id,
      gap_description: `Search failed for: ${slide.concept_summary.slice(0, 100)}... (${errorMessage})`,
    });
    return;
  }

  const rawCandidates = (candidatesData || []) as RawCardCandidate[];

  if (rawCandidates.length === 0) {
    const { count: rawCardCount, error: countError } = await supabase
      .from('raw_cards')
      .select('*', { count: 'exact', head: true })
      .eq('deck_id', deckId);

    const hasCards = !countError && typeof rawCardCount === 'number' && rawCardCount > 0;
    const gapDescription = hasCards
      ? `Text search returned no candidates for: ${slide.concept_summary.slice(0, 100)}...`
      : `No cards found in deck for: ${slide.concept_summary.slice(0, 100)}...`;

    // No cards match - this is a coverage gap
    await supabase.from('coverage_gaps').insert({
      lecture_id: lectureId,
      slide_concept_id: slide.id,
      gap_description: gapDescription,
    });
    return;
  }

  console.log(`Slide ${slide.slide_number}: Found ${rawCandidates.length} candidate cards via text search`);

  // PHASE 2: Send top candidates to AI for matching in ONE call
  const candidatesToAnalyze = rawCandidates.slice(0, MAX_CARDS_PER_AI_CALL);
  console.log(`Slide ${slide.slide_number}: Analyzing ${candidatesToAnalyze.length} cards with AI`);
  
  let matchResult;
  try {
    matchResult = await matchCardsToSlide(
      slide.concept_summary,
      candidatesToAnalyze.map(c => ({
        card_id: c.card_id,
        front: c.front,
        back: c.back,
      }))
    );
  } catch (err: any) {
    // Log full error structure for debugging
    console.error(`AI matching error for slide ${slide.slide_number}:`, {
      error: err,
      code: err?.code,
      status: err?.status,
      errorCode: err?.error?.code,
      errorType: err?.error?.type,
      message: err?.message,
      fullError: JSON.stringify(err, null, 2),
    });
    
    // Check for quota errors - these are billing issues (hard stop)
    // Note: OpenAI sends 429 for quota errors too, so we must check the code/type specifically
    const isQuotaError = 
      err?.code === 'insufficient_quota' || 
      err?.error?.code === 'insufficient_quota' ||
      err?.type === 'insufficient_quota' ||
      err?.error?.type === 'insufficient_quota' ||
      err?.message?.includes('quota');
    
    // Check for rate limit errors (429 status) - these should retry with backoff
    // Only treat as rate limit if it's 429 AND NOT a quota error
    const isRateLimit = err?.status === 429 && !isQuotaError;
    
    if (isQuotaError) {
      console.error('OpenAI billing quota exceeded - stopping alignment process');
      throw new Error('OpenAI API billing quota exceeded. Please check your OpenAI billing and plan limits. Alignment cannot continue without API access.');
    }
    
    if (isRateLimit) {
      // 429 status = rate limit (too many requests per minute)
      // Even if message says "quota exceeded", if it's 429, it's likely a rate limit
      console.error(`Rate limit (429) hit for slide ${slide.slide_number} - will retry with backoff`);
      console.error(`Rate limit hit for slide ${slide.slide_number} - will retry with backoff`);
      // Retry with exponential backoff (max 3 retries)
      let retries = 0;
      const maxRetries = 3;
      let retrySuccess = false;
      
      while (retries < maxRetries) {
        const delay = Math.pow(2, retries) * 1000; // 1s, 2s, 4s
        console.log(`Retrying after ${delay}ms (attempt ${retries + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
          matchResult = await matchCardsToSlide(
            slide.concept_summary,
            candidatesToAnalyze.map(c => ({
              card_id: c.card_id,
              front: c.front,
              back: c.back,
            }))
          );
          retrySuccess = true;
          break; // Success, exit retry loop
        } catch (retryErr: any) {
          retries++;
          if (retries >= maxRetries) {
            // Final retry failed - log as gap but don't stop entire process
            console.error(`Rate limit retry failed after ${maxRetries} attempts for slide ${slide.slide_number}`);
            await supabase.from('coverage_gaps').insert({
              lecture_id: lectureId,
              slide_concept_id: slide.id,
              gap_description: `AI matching failed due to rate limits: ${retryErr?.message || 'Unknown error'}`,
            });
            return;
          }
        }
      }
      
      // If retry succeeded, continue processing (matchResult is set)
      if (!retrySuccess) {
        return; // Shouldn't reach here, but safety check
      }
    } else {
      // Other errors - log as gap but continue processing
      await supabase.from('coverage_gaps').insert({
        lecture_id: lectureId,
        slide_concept_id: slide.id,
        gap_description: `AI matching failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
      return;
    }
  }

  const matches = matchResult.matches;
  console.log(`Slide ${slide.slide_number}: AI found ${matches.length} relevant matches`);

  if (matches.length === 0) {
    // No relevant matches found
    await supabase.from('coverage_gaps').insert({
      lecture_id: lectureId,
      slide_concept_id: slide.id,
      gap_description: `AI found no relevant cards among ${candidatesToAnalyze.length} candidates for: ${slide.concept_summary.slice(0, 100)}...`,
    });
    return;
  }

  // PHASE 3: Create card_concepts entries and alignments
  const alignments: {
    lecture_id: string;
    slide_concept_id: string;
    card_concept_id: string;
    alignment_type: string;
    similarity_score: number;
    llm_reasoning: string;
  }[] = [];

  const directlyAlignedCards: string[] = [];

  for (const match of matches) {
    // Find the raw card data
    const rawCard = candidatesToAnalyze.find(c => c.card_id === match.card_id);
    if (!rawCard) continue;

    // Check if card_concept already exists
    const { data: existingConcept } = await supabase
      .from('card_concepts')
      .select('id')
      .eq('deck_id', deckId)
      .eq('card_id', match.card_id)
      .single();

    let cardConceptId: string;

    if (existingConcept) {
      cardConceptId = existingConcept.id;
    } else {
      // Create minimal card_concept entry (no summary/embedding needed for this approach)
      const { data: inserted, error: insertError } = await supabase
        .from('card_concepts')
        .insert({
          deck_id: deckId,
          card_id: match.card_id,
          concept_summary: null,
          embedding: null,
          tags: rawCard.tags,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error(`Error creating card concept for ${match.card_id}:`, insertError);
        continue;
      }

      cardConceptId = inserted.id;
    }

    alignments.push({
      lecture_id: lectureId,
      slide_concept_id: slide.id,
      card_concept_id: cardConceptId,
      alignment_type: match.alignment_type,
      similarity_score: match.relevance_score / 100, // Convert 0-100 to 0-1
      llm_reasoning: match.reasoning,
    });

    if (match.alignment_type === 'directly_aligned') {
      directlyAlignedCards.push(`${rawCard.front.slice(0, 100)}...`);
    }
  }

  // Insert alignments
  if (alignments.length > 0) {
    const { error: insertError } = await supabase
      .from('card_alignments')
      .insert(alignments);

    if (insertError) {
      console.error('Insert alignment error:', insertError);
    }
  }

  // Check for coverage gaps
  if (directlyAlignedCards.length > 0 && directlyAlignedCards.length < 3) {
    try {
      const gap = await analyzeGap(slide.concept_summary, directlyAlignedCards);
      if (gap) {
        await supabase.from('coverage_gaps').insert({
          lecture_id: lectureId,
          slide_concept_id: slide.id,
          gap_description: gap,
        });
      }
    } catch (err) {
      console.error('Gap analysis error:', err);
    }
  }

  console.log(
    `Processed slide ${slide.slide_number}: ${alignments.length} alignments created`
  );
}

/**
 * Alignment is now a two-phase process:
 * 1. Find candidate cards using text similarity (no embeddings needed)
 * 2. Generate summaries + embeddings ONLY for matched candidates
 * 3. Use vector similarity + LLM classification for final alignment
 *
 * This avoids calling OpenAI for thousands of cards during deck upload.
 * Slides are processed in parallel batches for faster alignment.
 */
export async function generateAlignmentsInBackground(
  lectureId: string,
  deckId: string,
  userId: string
) {
  // Use service role client to bypass RLS in background
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (error) {
    console.error('Failed to create service client:', error);
    // Fallback: this shouldn't happen but handle gracefully
    return;
  }

  const MATCH_COUNT = 50; // Get top text match candidates
  const MAX_CARDS_PER_AI_CALL = 30; // Send up to 30 cards to AI in one call
  
  try {
    // Clear all previous alignments and gaps for this lecture (start fresh)
    console.log(`Clearing previous alignments for lecture ${lectureId}...`);
    await supabase
      .from('card_alignments')
      .delete()
      .eq('lecture_id', lectureId);
    
    await supabase
      .from('coverage_gaps')
      .delete()
      .eq('lecture_id', lectureId);
    
    console.log('Previous alignments cleared');
    
    // Update progress: Starting
    await supabase
      .from('processing_jobs')
      .update({ progress: 5 })
      .eq('target_id', lectureId)
      .eq('job_type', 'alignment_generation');
    // Get all slide concepts for the lecture
    const { data: slidesConceptsData, error: slidesError } = await supabase
      .from('slide_concepts')
      .select('id, slide_number, concept_summary, embedding')
      .eq('lecture_id', lectureId)
      .order('slide_number', { ascending: true });

    if (slidesError || !slidesConceptsData || slidesConceptsData.length === 0) {
      throw new Error('No slide concepts found');
    }

    const slidesConcepts = slidesConceptsData as unknown as SlideConceptWithEmbedding[];
    console.log(`Processing alignments for ${slidesConcepts.length} slides...`);

    // Process slides sequentially in batches for progress updates
    // Sequential processing avoids database timeout issues from concurrent queries
    const BATCH_SIZE = 5; // Update progress every 5 slides
    let processedCount = 0;

    // Process slides in small parallel batches to balance speed and rate limits
    // Batch size of 3 as requested by user
    const PARALLEL_BATCH_SIZE = 3;
    
    for (let i = 0; i < slidesConcepts.length; i += PARALLEL_BATCH_SIZE) {
      // Check if job has been cancelled before processing next batch
      const { data: currentJob } = await supabase
        .from('processing_jobs')
        .select('status')
        .eq('target_id', lectureId)
        .eq('job_type', 'alignment_generation')
        .single();

      if (currentJob?.status === 'failed' || currentJob?.status === 'completed') {
        console.log('Job cancelled or completed elsewhere, stopping processing');
        return;
      }

      const batch = slidesConcepts.slice(i, i + PARALLEL_BATCH_SIZE);
      console.log(`Processing batch of ${batch.length} slides (slides ${batch[0].slide_number} to ${batch[batch.length-1].slide_number})...`);
      
      // Process batch in parallel
      await Promise.all(batch.map(async (slide) => {
        try {
          await processSlideAlignment(slide, lectureId, deckId, supabase, MATCH_COUNT, MAX_CARDS_PER_AI_CALL);
          processedCount++;
          
          // Update progress after EACH slide completes
          const progress = 5 + Math.floor((processedCount / slidesConcepts.length) * 90);
          await supabase
            .from('processing_jobs')
            .update({ progress })
            .eq('target_id', lectureId)
            .eq('job_type', 'alignment_generation');
            
        } catch (error: any) {
          // Check for quota errors - these are billing issues (hard stop)
          // Note: OpenAI sends 429 for quota errors too, so we must check the code/type specifically
          const isQuotaError = 
            error?.code === 'insufficient_quota' || 
            error?.error?.code === 'insufficient_quota' ||
            error?.type === 'insufficient_quota' ||
            error?.error?.type === 'insufficient_quota' ||
            error?.message?.includes('quota');
          
          if (isQuotaError) {
            console.error('OpenAI quota exceeded (billing/limit reached) - stopping alignment');
            throw error; // Re-throw to stop the entire process
          }
          
          console.error(`Error processing slide ${slide.slide_number}:`, error);
          // Continue processing other slides even if one fails (unless it's a quota error)
          processedCount++; // Count failed slides too for progress tracking
        }
      }));
        
      // Delay between batches to avoid rate limits (2 seconds)
      if (i + PARALLEL_BATCH_SIZE < slidesConcepts.length) {
        console.log('Waiting 2s between batches to avoid rate limits...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Mark as completed
    await supabase
      .from('processing_jobs')
      .update({
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
      })
      .eq('target_id', lectureId)
      .eq('job_type', 'alignment_generation');

    console.log(`Alignment completed for lecture ${lectureId}`);
  } catch (error) {
    console.error('Alignment processing error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Mark as failed
    await supabase
      .from('processing_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('target_id', lectureId)
      .eq('job_type', 'alignment_generation');
  }
}

