-- Optimize find_candidate_cards function for large datasets
-- Remove expensive trigram similarity checks, use only full-text search

create or replace function public.find_candidate_cards(
  search_text text,
  deck_id_filter uuid,
  match_count int default 50
)
returns table (
  raw_card_id uuid,
  card_id text,
  front text,
  back text,
  tags text[],
  similarity float
)
language sql stable
as $$
  -- Use only full-text search (fast with GIN index)
  select
    rc.id as raw_card_id,
    rc.card_id,
    rc.front,
    rc.back,
    rc.tags,
    ts_rank(rc.search_vector, plainto_tsquery('english', search_text)) as similarity
  from public.raw_cards rc
  where rc.deck_id = deck_id_filter
    and rc.search_vector @@ plainto_tsquery('english', search_text)
  order by ts_rank(rc.search_vector, plainto_tsquery('english', search_text)) desc
  limit match_count;
$$;
