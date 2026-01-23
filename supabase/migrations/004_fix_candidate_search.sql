-- Improve candidate retrieval reliability and bypass RLS for service role

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
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select
      search_text as raw_text,
      nullif(trim(search_text), '') as trimmed_text,
      plainto_tsquery('english', search_text) as tsquery,
      nullif(plainto_tsquery('english', search_text)::text, '') as tsquery_text
  ),
  fts as (
    select
      rc.id as raw_card_id,
      rc.card_id,
      rc.front,
      rc.back,
      rc.tags,
      ts_rank(rc.search_vector, input.tsquery) as similarity
    from public.raw_cards rc, input
    where rc.deck_id = deck_id_filter
      and input.tsquery_text is not null
      and rc.search_vector @@ input.tsquery
    order by ts_rank(rc.search_vector, input.tsquery) desc
    limit match_count
  ),
  fallback as (
    select
      rc.id as raw_card_id,
      rc.card_id,
      rc.front,
      rc.back,
      rc.tags,
      greatest(
        similarity(rc.front, input.raw_text),
        similarity(rc.back, input.raw_text)
      ) as similarity
    from public.raw_cards rc, input
    where rc.deck_id = deck_id_filter
      and input.trimmed_text is not null
      and (
        similarity(rc.front, input.raw_text) > 0.1
        or similarity(rc.back, input.raw_text) > 0.1
        or rc.front ilike '%' || input.raw_text || '%'
        or rc.back ilike '%' || input.raw_text || '%'
      )
    order by similarity desc
    limit match_count
  )
  select * from fts
  union all
  select * from fallback
  where not exists (select 1 from fts)
  limit match_count;
$$;
