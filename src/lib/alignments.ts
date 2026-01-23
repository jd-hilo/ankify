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
 * Alignment is now a two-phase process:
 * 1. Find candidate cards using text similarity (no embeddings needed)
 * 2. Generate summaries + embeddings ONLY for matched candidates
 * 3. Use vector similarity + LLM classification for final alignment
 *
 * This avoids calling OpenAI for thousands of cards during deck upload.
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

    for (let slideIndex = 0; slideIndex < slidesConcepts.length; slideIndex++) {
      const slide = slidesConcepts[slideIndex];
      
      // Update progress (5% to 95% range)
      const progress = 5 + Math.floor((slideIndex / slidesConcepts.length) * 90);
      await supabase
        .from('processing_jobs')
        .update({ progress })
        .eq('target_id', lectureId)
        .eq('job_type', 'alignment_generation');
      // PHASE 1: Find candidate cards using text similarity (no OpenAI yet)
      const supabaseClient = supabase as unknown as {
        rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      };

      const rawSearchText = slide.concept_summary.trim();
      const searchText =
        rawSearchText.length > 1000 ? rawSearchText.slice(0, 1000) : rawSearchText;

      const { data: candidatesData, error: matchError } = await supabaseClient.rpc(
        'find_candidate_cards',
        {
          search_text: searchText,
          deck_id_filter: deckId,
          match_count: MATCH_COUNT, // Get more candidates for text search
        }
      );

      if (matchError) {
        console.error('Text match error:', matchError);
        // If search times out or fails, skip this slide
        await supabase.from('coverage_gaps').insert({
          lecture_id: lectureId,
          slide_concept_id: slide.id,
          gap_description: `Search failed for: ${slide.concept_summary.slice(0, 100)}... (${matchError.message || 'timeout'})`,
        });
        continue;
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
        continue;
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
      } catch (err) {
        console.error(`AI matching error for slide ${slide.slide_number}:`, err);
        await supabase.from('coverage_gaps').insert({
          lecture_id: lectureId,
          slide_concept_id: slide.id,
          gap_description: `AI matching failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
        continue;
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
        continue;
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

