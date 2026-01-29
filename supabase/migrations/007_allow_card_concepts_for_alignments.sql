-- Allow users to view card_concepts that are referenced by alignments for their own lectures
-- This fixes the issue where alignments don't show up when using someone else's deck
create policy "Users can view card concepts for own lecture alignments" on public.card_concepts
  for select using (
    exists (
      select 1 from public.card_alignments ca
      join public.lectures l on l.id = ca.lecture_id
      where ca.card_concept_id = card_concepts.id
      and l.user_id = auth.uid()
    )
  );
