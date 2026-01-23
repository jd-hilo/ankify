-- Clear all cards and decks
-- WARNING: This will delete ALL card and deck data for ALL users
-- Run this script with caution!

-- Delete in order to respect foreign key constraints:

-- 1. Delete card alignments that reference card concepts
-- (These reference card_concepts which will be deleted with decks, but explicit is better)
DELETE FROM public.card_alignments
WHERE card_concept_id IN (
  SELECT id FROM public.card_concepts
);

-- 2. Delete raw cards (will cascade from decks, but explicit for clarity)
DELETE FROM public.raw_cards;

-- 3. Delete card concepts (will cascade from decks, but explicit for clarity)
DELETE FROM public.card_concepts;

-- 4. Delete processing jobs related to decks
DELETE FROM public.processing_jobs
WHERE job_type = 'deck_processing';

-- 5. Finally, delete all decks (this will cascade delete any remaining related records)
DELETE FROM public.decks;

-- Verify deletion
SELECT 
  (SELECT COUNT(*) FROM public.decks) as decks_count,
  (SELECT COUNT(*) FROM public.raw_cards) as raw_cards_count,
  (SELECT COUNT(*) FROM public.card_concepts) as card_concepts_count,
  (SELECT COUNT(*) FROM public.card_alignments WHERE card_concept_id IS NOT NULL) as card_alignments_count;
