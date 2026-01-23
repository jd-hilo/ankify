import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DeckActions } from '@/components/deck-actions';
import type { Deck } from '@/types/database';
import { Card, Badge, Button } from '@/components/ui';
import { ArrowLeft, BookOpen, Calendar, CheckCircle, XCircle, Clock } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

interface CardConceptSummary {
  id: string;
  card_id: string;
  concept_summary: string;
  tags: string[] | null;
}

export default async function DeckDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: deckData, error } = await supabase
    .from('decks')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !deckData) {
    notFound();
  }

  const deck = deckData as Deck;

  // Get sample concepts if deck is processed
  const { data: conceptsData } = deck.processing_status === 'completed'
    ? await supabase
        .from('card_concepts')
        .select('id, card_id, concept_summary, tags')
        .eq('deck_id', id)
        .limit(10)
    : { data: null };

  const concepts = (conceptsData || null) as CardConceptSummary[] | null;

  function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, { variant: 'accent' | 'secondary' | 'muted' | 'outline' }> = {
      completed: { variant: 'secondary' },
      processing: { variant: 'muted' },
      failed: { variant: 'accent' },
    };
    const config = variants[status] || { variant: 'outline' as const };
    return <Badge variant={config.variant} size="md">{status.toUpperCase()}</Badge>;
  }

  return (
    <div>
      <Link href="/decks">
        <Button variant="ghost" size="sm" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4 stroke-[3px]" />
          BACK TO DECKS
        </Button>
      </Link>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter mb-2">
            {deck.name}
          </h1>
          <p className="text-lg font-bold">
            {deck.file_type.toUpperCase()} &middot; {deck.card_count.toLocaleString()} CARDS
          </p>
        </div>
        <DeckActions deck={deck} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <Card className="p-6 rotate-1">
          <div className="flex items-center gap-3 mb-4">
            {deck.processing_status === 'completed' && (
              <CheckCircle className="h-8 w-8 stroke-neo-secondary stroke-[3px]" />
            )}
            {deck.processing_status === 'failed' && (
              <XCircle className="h-8 w-8 stroke-neo-accent stroke-[3px]" />
            )}
            {(deck.processing_status === 'processing' || deck.processing_status === 'pending') && (
              <Clock className="h-8 w-8 stroke-neo-muted stroke-[3px]" />
            )}
            <h3 className="text-sm font-black uppercase tracking-widest">STATUS</h3>
          </div>
          <StatusBadge status={deck.processing_status} />
          {deck.error_message && (
            <Card className="mt-4 p-3 bg-neo-accent border-4 border-black">
              <p className="text-sm font-black uppercase text-white">
                {deck.error_message}
              </p>
            </Card>
          )}
        </Card>

        <Card className="p-6 -rotate-1">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="h-8 w-8 stroke-black stroke-[3px]" />
            <h3 className="text-sm font-black uppercase tracking-widest">CARDS INDEXED</h3>
          </div>
          <p className="text-4xl sm:text-5xl font-black">{deck.card_count.toLocaleString()}</p>
        </Card>

        <Card className="p-6 rotate-2">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="h-8 w-8 stroke-black stroke-[3px]" />
            <h3 className="text-sm font-black uppercase tracking-widest">CREATED</h3>
          </div>
          <p className="text-lg font-bold">
            {new Date(deck.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }).toUpperCase()}
          </p>
        </Card>
      </div>

      {deck.processing_status === 'pending' && (
        <Card className="p-6 mb-8 bg-neo-secondary border-4 border-black shadow-neo-md">
          <h3 className="text-lg font-black uppercase mb-2">
            PROCESSING REQUIRED
          </h3>
          <p className="text-base font-bold">
            This deck has been uploaded but not yet processed. Click the button above to start processing.
          </p>
        </Card>
      )}

      {deck.processing_status === 'processing' && (
        <Card className="p-6 mb-8 bg-neo-muted border-4 border-black shadow-neo-md">
          <h3 className="text-lg font-black uppercase mb-2">
            PROCESSING IN PROGRESS
          </h3>
          <p className="text-base font-bold">
            Your deck is being processed. This may take a few minutes depending on the size.
          </p>
        </Card>
      )}

      {concepts && concepts.length > 0 && (
        <Card className="shadow-neo-lg">
          <div className="px-6 py-4 border-b-4 border-black bg-neo-muted">
            <h2 className="text-xl font-black uppercase tracking-tight">SAMPLE CONCEPTS</h2>
            <p className="text-sm font-bold mt-1">
              SHOWING {concepts.length} OF {deck.card_count.toLocaleString()} INDEXED CONCEPTS
            </p>
          </div>
          <div className="divide-y-4 divide-black">
            {concepts.map((concept) => (
              <div key={concept.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-base font-bold leading-relaxed">{concept.concept_summary}</p>
                    <p className="text-xs font-bold uppercase tracking-widest mt-2 opacity-60">
                      CARD ID: {concept.card_id}
                    </p>
                  </div>
                  {concept.tags && concept.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {concept.tags.slice(0, 3).map((tag, i) => (
                        <Badge key={i} variant="outline" size="sm">
                          {tag}
                        </Badge>
                      ))}
                      {concept.tags.length > 3 && (
                        <span className="text-xs font-bold uppercase">
                          +{concept.tags.length - 3} MORE
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
