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
    console.log(`Processing alignments for ${slidesConcepts.length} slides ALL IN PARALLEL...`);

    // Process slides in parallel batches
    const supabaseClient = supabase as unknown as {
      rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    };

    // Get deck card count once (for gap analysis)
    const { count: rawCardCount } = await supabase
      .from('raw_cards')
      .select('*', { count: 'exact', head: true })
      .eq('deck_id', deckId);

    const hasCards = typeof rawCardCount === 'number' && rawCardCount > 0;

    // Collect all alignments and gaps to batch insert
    // Temporarily store with card_id, will resolve to card_concept_id later
    const allAlignments: Array<{
      lecture_id: string;
      slide_concept_id: string;
      card_id: string;
      alignment_type: string;
      similarity_score: number;
      llm_reasoning: string;
      tags: string[] | null;
    }> = [];

    const allGaps: Array<{
      lecture_id: string;
      slide_concept_id: string;
      gap_description: string;
    }> = [];

    // Track all unique card IDs we'll need to check/create
    const cardIdsToCheck = new Set<string>();

    // Process ALL slides in parallel at once!
    console.log(`Starting parallel processing of ${slidesConcepts.length} slides...`);
    const allResults = await Promise.allSettled(
      slidesConcepts.map(async (slide) => {
          // PHASE 1: Find candidate cards using text similarity
          const rawSearchText = slide.concept_summary.trim();
          const searchText =
            rawSearchText.length > 1000 ? rawSearchText.slice(0, 1000) : rawSearchText;

          const { data: candidatesData, error: matchError } = await supabaseClient.rpc(
            'find_candidate_cards',
            {
              search_text: searchText,
              deck_id_filter: deckId,
              match_count: MATCH_COUNT,
            }
          );

          if (matchError) {
            const errorMessage = (matchError as any).message || 'timeout';
            return {
              slideId: slide.id,
              slideNumber: slide.slide_number,
              gap: {
                lecture_id: lectureId,
                slide_concept_id: slide.id,
                gap_description: `Search failed for: ${slide.concept_summary.slice(0, 100)}... (${errorMessage})`,
              },
              alignments: [],
              cardIds: [] as string[],
            };
          }

          const rawCandidates = (candidatesData || []) as RawCardCandidate[];

          if (rawCandidates.length === 0) {
            const gapDescription = hasCards
              ? `Text search returned no candidates for: ${slide.concept_summary.slice(0, 100)}...`
              : `No cards found in deck for: ${slide.concept_summary.slice(0, 100)}...`;
            return {
              slideId: slide.id,
              slideNumber: slide.slide_number,
              gap: {
                lecture_id: lectureId,
                slide_concept_id: slide.id,
                gap_description: gapDescription,
              },
              alignments: [],
              cardIds: [] as string[],
            };
          }

          // PHASE 2: Send top candidates to AI for matching
          const candidatesToAnalyze = rawCandidates.slice(0, MAX_CARDS_PER_AI_CALL);
          
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
            return {
              slideId: slide.id,
              slideNumber: slide.slide_number,
              gap: {
                lecture_id: lectureId,
                slide_concept_id: slide.id,
                gap_description: `AI matching failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
              },
              alignments: [],
              cardIds: [] as string[],
            };
          }

          const matches = matchResult.matches;

          if (matches.length === 0) {
            return {
              slideId: slide.id,
              slideNumber: slide.slide_number,
              gap: {
                lecture_id: lectureId,
                slide_concept_id: slide.id,
                gap_description: `AI found no relevant cards among ${candidatesToAnalyze.length} candidates for: ${slide.concept_summary.slice(0, 100)}...`,
              },
              alignments: [],
              cardIds: [] as string[],
            };
          }

          // Collect card IDs and prepare alignments (without card_concept_id yet)
          const alignments: Array<{
            lecture_id: string;
            slide_concept_id: string;
            card_id: string;
            alignment_type: string;
            similarity_score: number;
            llm_reasoning: string;
            tags: string[] | null;
          }> = [];

          const directlyAlignedCards: string[] = [];

          for (const match of matches) {
            const rawCard = candidatesToAnalyze.find(c => c.card_id === match.card_id);
            if (!rawCard) continue;

            cardIdsToCheck.add(match.card_id);
            alignments.push({
              lecture_id: lectureId,
              slide_concept_id: slide.id,
              card_id: match.card_id,
              alignment_type: match.alignment_type,
              similarity_score: match.relevance_score / 100,
              llm_reasoning: match.reasoning,
              tags: rawCard.tags,
            });

            if (match.alignment_type === 'directly_aligned') {
              directlyAlignedCards.push(`${rawCard.front.slice(0, 100)}...`);
            }
          }

          // Check for coverage gaps
          let gap: { lecture_id: string; slide_concept_id: string; gap_description: string } | null = null;
          if (directlyAlignedCards.length > 0 && directlyAlignedCards.length < 3) {
            try {
              const gapAnalysis = await analyzeGap(slide.concept_summary, directlyAlignedCards);
              if (gapAnalysis) {
                gap = {
                  lecture_id: lectureId,
                  slide_concept_id: slide.id,
                  gap_description: gapAnalysis,
                };
              }
            } catch (err) {
              console.error('Gap analysis error:', err);
            }
          }

          return {
            slideId: slide.id,
            slideNumber: slide.slide_number,
            gap,
            alignments,
            cardIds: matches.map(m => m.card_id),
          };
        })
    );

    // Update progress: AI processing complete
    await supabase
      .from('processing_jobs')
      .update({ progress: 80 })
      .eq('target_id', lectureId)
      .eq('job_type', 'alignment_generation');

    // Process all results
    console.log(`Processing results from ${allResults.length} slides...`);
    let successCount = 0;
    for (const result of allResults) {
      if (result.status === 'fulfilled') {
        successCount++;
        const { gap, alignments: slideAlignments, cardIds } = result.value;
        if (gap) {
          allGaps.push(gap);
        }
        // Collect card IDs for batch lookup
        for (const cardId of cardIds) {
          cardIdsToCheck.add(cardId);
        }
        // Store alignments temporarily (we'll resolve card_concept_ids in batch)
        allAlignments.push(...slideAlignments.map(a => ({
          lecture_id: a.lecture_id,
          slide_concept_id: a.slide_concept_id,
          card_id: a.card_id,
          alignment_type: a.alignment_type,
          similarity_score: a.similarity_score,
          llm_reasoning: a.llm_reasoning,
          tags: a.tags,
        })));
      } else {
        console.error('Slide processing error:', result.reason);
      }
    }
    
    console.log(`Successfully processed ${successCount}/${allResults.length} slides`);

    // PHASE 3: Batch resolve/create card_concepts
    console.log(`Resolving ${cardIdsToCheck.size} unique card concepts in batch...`);
    
    // Get all existing card_concepts in one query
    const { data: existingConcepts } = await supabase
      .from('card_concepts')
      .select('id, card_id')
      .eq('deck_id', deckId)
      .in('card_id', Array.from(cardIdsToCheck));

    const conceptMap = new Map<string, string>();
    if (existingConcepts) {
      for (const concept of existingConcepts) {
        conceptMap.set(concept.card_id, concept.id);
      }
    }

    // Find cards that need to be created
    const cardsToCreate = Array.from(cardIdsToCheck).filter(id => !conceptMap.has(id));
    
    // Get raw card data for cards that need creation
    if (cardsToCreate.length > 0) {
      const { data: rawCardsData } = await supabase
        .from('raw_cards')
        .select('card_id, tags')
        .eq('deck_id', deckId)
        .in('card_id', cardsToCreate);

      if (rawCardsData) {
        // Batch insert new card_concepts
        const newConcepts = rawCardsData.map(rc => ({
          deck_id: deckId,
          card_id: rc.card_id,
          concept_summary: null,
          embedding: null,
          tags: rc.tags,
        }));

        const { data: insertedConcepts, error: insertError } = await supabase
          .from('card_concepts')
          .insert(newConcepts)
          .select('id, card_id');

        if (insertError) {
          console.error('Error batch inserting card concepts:', insertError);
        } else if (insertedConcepts) {
          for (const concept of insertedConcepts) {
            conceptMap.set(concept.card_id, concept.id);
          }
        }
      }
    }

    // PHASE 4: Resolve card_concept_ids and batch insert alignments
    const finalAlignments = allAlignments
      .map(a => {
        const cardConceptId = conceptMap.get(a.card_id);
        if (!cardConceptId) {
          console.warn(`Card concept not found for card_id: ${a.card_id}`);
          return null;
        }
        return {
          lecture_id: a.lecture_id,
          slide_concept_id: a.slide_concept_id,
          card_concept_id: cardConceptId,
          alignment_type: a.alignment_type,
          similarity_score: a.similarity_score,
          llm_reasoning: a.llm_reasoning,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    // Batch insert all alignments
    if (finalAlignments.length > 0) {
      console.log(`Batch inserting ${finalAlignments.length} alignments...`);
      const { error: insertError } = await supabase
        .from('card_alignments')
        .insert(finalAlignments);

      if (insertError) {
        console.error('Batch insert alignment error:', insertError);
      }
    }

    // Batch insert all gaps
    if (allGaps.length > 0) {
      console.log(`Batch inserting ${allGaps.length} coverage gaps...`);
      const { error: gapInsertError } = await supabase
        .from('coverage_gaps')
        .insert(allGaps);

      if (gapInsertError) {
        console.error('Batch insert gap error:', gapInsertError);
      }
    }

    console.log(`Completed processing ${slidesConcepts.length} slides`);

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

