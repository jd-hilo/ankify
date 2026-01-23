# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server (localhost:3000)
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

## Environment Setup

Copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
- `OPENAI_API_KEY` - Your OpenAI API key

## Database Setup

Run the migration in `supabase/migrations/001_initial_schema.sql` against your Supabase project.

Create a storage bucket named `uploads` in Supabase Storage (private).

## Architecture

### Tech Stack
- **Frontend**: Next.js 14 (App Router) with TypeScript and Tailwind CSS
- **Backend**: Supabase (Postgres + pgvector, Auth, Storage)
- **AI**: OpenAI (text-embedding-3-small for embeddings, GPT-4o-mini for summarization)

### Directory Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth pages (login, signup)
│   ├── (dashboard)/       # Protected dashboard pages
│   └── api/               # API routes
├── components/            # React components
├── lib/                   # Utility libraries
│   ├── supabase/         # Supabase client configurations
│   ├── parsers/          # File parsers (APKG, CSV, PDF, PPTX)
│   └── openai.ts         # OpenAI integration
└── types/                # TypeScript types
```

### Data Flow

1. **Deck Ingestion**: Upload APKG/CSV → Parse → Generate concept summaries → Generate embeddings → Store (card_id, concept_summary, embedding only) → Delete source file

2. **Lecture Processing**: Upload PDF/PPTX → Parse slides → Generate concept summaries → Generate embeddings → Store slide_concepts

3. **Alignment**: For each slide → Vector similarity search → LLM classification (directly_aligned/deeper_than_lecture/too_shallow/not_aligned) → Store alignments with reasoning

4. **Export**: Generate list of card_ids for Anki filtered deck creation

### Key Design Decisions
- No raw card/slide text stored after processing (copyright protection)
- Deterministic processing (same input = same output)
- pgvector with HNSW indexes for fast similarity search
- Row Level Security (RLS) for multi-tenant data isolation
