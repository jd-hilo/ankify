-- Migration: Deferred embeddings architecture
-- This change moves OpenAI processing from deck upload to alignment phase
-- Only cards that match presentation slides will be processed

-- Raw cards table: temporary storage for parsed card content
-- Cards stay here until alignment, then relevant ones get processed
create table public.raw_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references public.decks(id) on delete cascade not null,
  card_id text not null, -- Stable Anki card identifier
  front text not null,   -- Raw card front content
  back text not null,    -- Raw card back content
  tags text[],
  created_at timestamptz default now(),

  -- Ensure unique card per deck
  unique(deck_id, card_id)
);

-- Index for fast deck lookups
create index raw_cards_deck_id_idx on public.raw_cards(deck_id);

-- Full-text search index for finding candidate cards
-- This enables text-based matching before generating embeddings
alter table public.raw_cards add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(front, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(back, '')), 'B')
  ) stored;

create index raw_cards_search_idx on public.raw_cards using gin(search_vector);

-- Trigram index for fuzzy text matching (enable pg_trgm extension)
create extension if not exists pg_trgm;
create index raw_cards_front_trgm_idx on public.raw_cards using gin(front gin_trgm_ops);
create index raw_cards_back_trgm_idx on public.raw_cards using gin(back gin_trgm_ops);

-- RLS for raw_cards
alter table public.raw_cards enable row level security;

create policy "Users can view raw cards for own decks" on public.raw_cards
  for select using (
    exists (
      select 1 from public.decks
      where decks.id = raw_cards.deck_id
      and decks.user_id = auth.uid()
    )
  );

create policy "Users can insert raw cards for own decks" on public.raw_cards
  for insert with check (
    exists (
      select 1 from public.decks
      where decks.id = raw_cards.deck_id
      and decks.user_id = auth.uid()
    )
  );

create policy "Users can delete raw cards for own decks" on public.raw_cards
  for delete using (
    exists (
      select 1 from public.decks
      where decks.id = raw_cards.deck_id
      and decks.user_id = auth.uid()
    )
  );

-- Make card_concepts columns nullable for on-demand generation
-- (Cards will be inserted without embeddings initially)
alter table public.card_concepts
  alter column concept_summary drop not null,
  alter column embedding drop not null;

-- Function to find candidate cards using text similarity
-- This is used BEFORE generating embeddings to narrow down candidates
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
  -- Combine full-text search with trigram similarity
  with scored as (
    select
      rc.id as raw_card_id,
      rc.card_id,
      rc.front,
      rc.back,
      rc.tags,
      -- Combine text search rank with trigram similarity
      (
        coalesce(ts_rank(rc.search_vector, plainto_tsquery('english', search_text)), 0) * 2 +
        greatest(
          similarity(rc.front, search_text),
          similarity(rc.back, search_text)
        )
      ) as combined_score
    from public.raw_cards rc
    where rc.deck_id = deck_id_filter
      and (
        rc.search_vector @@ plainto_tsquery('english', search_text)
        or similarity(rc.front, search_text) > 0.1
        or similarity(rc.back, search_text) > 0.1
      )
  )
  select
    raw_card_id,
    card_id,
    front,
    back,
    tags,
    combined_score as similarity
  from scored
  where combined_score > 0.1
  order by combined_score desc
  limit match_count;
$$;
