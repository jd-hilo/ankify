-- Enable pgvector extension for embedding similarity search
create extension if not exists vector with schema extensions;

-- Enum types
create type processing_status as enum ('pending', 'processing', 'completed', 'failed');
create type alignment_type as enum ('directly_aligned', 'deeper_than_lecture', 'too_shallow', 'not_aligned');
create type deck_file_type as enum ('apkg', 'csv');
create type lecture_file_type as enum ('pdf', 'pptx');
create type job_type as enum ('deck_processing', 'lecture_processing', 'alignment_generation');

-- Decks table: stores metadata about uploaded AnKing decks
create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  file_type deck_file_type not null,
  card_count integer default 0,
  version_hash text not null, -- For deterministic processing verification
  processing_status processing_status default 'pending',
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Card concepts table: stores processed card data (no raw card text)
create table public.card_concepts (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references public.decks(id) on delete cascade not null,
  card_id text not null, -- Stable Anki card identifier
  concept_summary text not null, -- 1-2 sentence concept description
  embedding vector(1536) not null, -- OpenAI text-embedding-3-small
  tags text[], -- Optional metadata
  created_at timestamptz default now(),

  -- Ensure unique card per deck
  unique(deck_id, card_id)
);

-- Lectures table: stores metadata about uploaded lecture files
create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  file_type lecture_file_type not null,
  slide_count integer default 0,
  processing_status processing_status default 'pending',
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Slide concepts table: stores processed slide data
create table public.slide_concepts (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid references public.lectures(id) on delete cascade not null,
  slide_number integer not null,
  concept_summary text not null,
  embedding vector(1536) not null,
  created_at timestamptz default now(),

  -- Ensure unique slide per lecture
  unique(lecture_id, slide_number)
);

-- Card alignments table: core matching results
create table public.card_alignments (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid references public.lectures(id) on delete cascade not null,
  slide_concept_id uuid references public.slide_concepts(id) on delete cascade not null,
  card_concept_id uuid references public.card_concepts(id) on delete cascade not null,
  alignment_type alignment_type not null,
  similarity_score real not null, -- Vector similarity score (0-1)
  llm_reasoning text not null, -- Explanation for the classification
  user_override alignment_type, -- Optional user correction
  user_override_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Ensure unique alignment per slide-card pair
  unique(slide_concept_id, card_concept_id)
);

-- Coverage gaps table: lecture concepts not covered by deck
create table public.coverage_gaps (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid references public.lectures(id) on delete cascade not null,
  slide_concept_id uuid references public.slide_concepts(id) on delete cascade not null,
  gap_description text not null,
  created_at timestamptz default now()
);

-- Processing jobs table: background job tracking
create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  job_type job_type not null,
  target_id uuid not null, -- deck_id or lecture_id
  status processing_status default 'pending',
  progress integer default 0 check (progress >= 0 and progress <= 100),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- Indexes for performance

-- HNSW index for fast vector similarity search on card embeddings
create index card_concepts_embedding_idx on public.card_concepts
using hnsw (embedding vector_cosine_ops)
with (m = 16, ef_construction = 64);

-- HNSW index for fast vector similarity search on slide embeddings
create index slide_concepts_embedding_idx on public.slide_concepts
using hnsw (embedding vector_cosine_ops)
with (m = 16, ef_construction = 64);

-- Standard indexes for common queries
create index decks_user_id_idx on public.decks(user_id);
create index lectures_user_id_idx on public.lectures(user_id);
create index card_concepts_deck_id_idx on public.card_concepts(deck_id);
create index slide_concepts_lecture_id_idx on public.slide_concepts(lecture_id);
create index card_alignments_lecture_id_idx on public.card_alignments(lecture_id);
create index processing_jobs_user_id_idx on public.processing_jobs(user_id);
create index processing_jobs_target_id_idx on public.processing_jobs(target_id);

-- Row Level Security (RLS)

alter table public.decks enable row level security;
alter table public.card_concepts enable row level security;
alter table public.lectures enable row level security;
alter table public.slide_concepts enable row level security;
alter table public.card_alignments enable row level security;
alter table public.coverage_gaps enable row level security;
alter table public.processing_jobs enable row level security;

-- RLS Policies

-- Decks: users can only access their own decks
create policy "Users can view own decks" on public.decks
  for select using (auth.uid() = user_id);

create policy "Users can insert own decks" on public.decks
  for insert with check (auth.uid() = user_id);

create policy "Users can update own decks" on public.decks
  for update using (auth.uid() = user_id);

create policy "Users can delete own decks" on public.decks
  for delete using (auth.uid() = user_id);

-- Card concepts: users can access concepts for their own decks
create policy "Users can view card concepts for own decks" on public.card_concepts
  for select using (
    exists (
      select 1 from public.decks
      where decks.id = card_concepts.deck_id
      and decks.user_id = auth.uid()
    )
  );

create policy "Users can insert card concepts for own decks" on public.card_concepts
  for insert with check (
    exists (
      select 1 from public.decks
      where decks.id = card_concepts.deck_id
      and decks.user_id = auth.uid()
    )
  );

-- Lectures: users can only access their own lectures
create policy "Users can view own lectures" on public.lectures
  for select using (auth.uid() = user_id);

create policy "Users can insert own lectures" on public.lectures
  for insert with check (auth.uid() = user_id);

create policy "Users can update own lectures" on public.lectures
  for update using (auth.uid() = user_id);

create policy "Users can delete own lectures" on public.lectures
  for delete using (auth.uid() = user_id);

-- Slide concepts: users can access concepts for their own lectures
create policy "Users can view slide concepts for own lectures" on public.slide_concepts
  for select using (
    exists (
      select 1 from public.lectures
      where lectures.id = slide_concepts.lecture_id
      and lectures.user_id = auth.uid()
    )
  );

create policy "Users can insert slide concepts for own lectures" on public.slide_concepts
  for insert with check (
    exists (
      select 1 from public.lectures
      where lectures.id = slide_concepts.lecture_id
      and lectures.user_id = auth.uid()
    )
  );

-- Card alignments: users can access alignments for their own lectures
create policy "Users can view alignments for own lectures" on public.card_alignments
  for select using (
    exists (
      select 1 from public.lectures
      where lectures.id = card_alignments.lecture_id
      and lectures.user_id = auth.uid()
    )
  );

create policy "Users can insert alignments for own lectures" on public.card_alignments
  for insert with check (
    exists (
      select 1 from public.lectures
      where lectures.id = card_alignments.lecture_id
      and lectures.user_id = auth.uid()
    )
  );

create policy "Users can update alignments for own lectures" on public.card_alignments
  for update using (
    exists (
      select 1 from public.lectures
      where lectures.id = card_alignments.lecture_id
      and lectures.user_id = auth.uid()
    )
  );

-- Coverage gaps: users can access gaps for their own lectures
create policy "Users can view coverage gaps for own lectures" on public.coverage_gaps
  for select using (
    exists (
      select 1 from public.lectures
      where lectures.id = coverage_gaps.lecture_id
      and lectures.user_id = auth.uid()
    )
  );

create policy "Users can insert coverage gaps for own lectures" on public.coverage_gaps
  for insert with check (
    exists (
      select 1 from public.lectures
      where lectures.id = coverage_gaps.lecture_id
      and lectures.user_id = auth.uid()
    )
  );

-- Processing jobs: users can only access their own jobs
create policy "Users can view own processing jobs" on public.processing_jobs
  for select using (auth.uid() = user_id);

create policy "Users can insert own processing jobs" on public.processing_jobs
  for insert with check (auth.uid() = user_id);

create policy "Users can update own processing jobs" on public.processing_jobs
  for update using (auth.uid() = user_id);

-- Functions

-- Function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger decks_updated_at
  before update on public.decks
  for each row execute function public.handle_updated_at();

create trigger lectures_updated_at
  before update on public.lectures
  for each row execute function public.handle_updated_at();

create trigger card_alignments_updated_at
  before update on public.card_alignments
  for each row execute function public.handle_updated_at();

-- Function to find similar cards using vector similarity
create or replace function public.match_cards_to_slide(
  slide_embedding vector(1536),
  deck_id_filter uuid,
  match_threshold float default 0.7,
  match_count int default 20
)
returns table (
  card_concept_id uuid,
  card_id text,
  concept_summary text,
  similarity float
)
language sql stable
as $$
  select
    cc.id as card_concept_id,
    cc.card_id,
    cc.concept_summary,
    1 - (cc.embedding <=> slide_embedding) as similarity
  from public.card_concepts cc
  where cc.deck_id = deck_id_filter
    and 1 - (cc.embedding <=> slide_embedding) > match_threshold
  order by cc.embedding <=> slide_embedding
  limit match_count;
$$;

-- Storage bucket for temporary file uploads
-- Note: Run this via Supabase dashboard or separate migration
-- insert into storage.buckets (id, name, public)
-- values ('uploads', 'uploads', false);
