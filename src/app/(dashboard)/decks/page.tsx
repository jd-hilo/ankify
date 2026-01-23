import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Deck } from '@/types/database';
import { Card, Button, Badge } from '@/components/ui';
import { BookOpen, Calendar } from 'lucide-react';

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'accent' | 'secondary' | 'muted' | 'outline' }> = {
    completed: { variant: 'secondary' },
    processing: { variant: 'muted' },
    failed: { variant: 'accent' },
  };

  const config = variants[status] || { variant: 'outline' as const };

  return (
    <Badge variant={config.variant} size="sm">
      {status.toUpperCase()}
    </Badge>
  );
}

export default async function DecksPage() {
  const supabase = await createClient();

  const { data: decksData, error } = await supabase
    .from('decks')
    .select('*')
    .order('created_at', { ascending: false });

  const decks = (decksData || []) as Deck[];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter">
          DECKS
        </h1>
      </div>

      {error ? (
        <Card className="p-6 bg-neo-accent border-4 border-black shadow-neo-md">
          <p className="text-base font-black uppercase text-white">
            FAILED TO LOAD DECKS: {error.message}
          </p>
        </Card>
      ) : decks.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck, idx) => (
            <Link 
              key={deck.id}
              href={`/decks/${deck.id}`}
              className="block"
            >
              <Card 
                hover 
                className={`p-6 ${idx % 3 === 0 ? 'rotate-1' : idx % 3 === 1 ? '-rotate-1' : 'rotate-2'}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-neo-accent border-4 border-black p-3 shadow-neo-sm">
                    <BookOpen className="h-6 w-6 stroke-white stroke-[3px]" />
                  </div>
                  <StatusBadge status={deck.processing_status} />
                </div>
                
                <h3 className="text-xl font-black uppercase mb-3 hover:text-neo-accent transition-colors duration-100">
                  {deck.name}
                </h3>
                
                <div className="space-y-2 border-t-4 border-black pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold uppercase tracking-widest">TYPE</span>
                    <Badge variant="outline" size="sm">
                      {deck.file_type.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold uppercase tracking-widest">CARDS</span>
                    <span className="text-lg font-black">{deck.card_count.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold uppercase tracking-widest flex items-center gap-1">
                      <Calendar className="h-4 w-4 stroke-[3px]" />
                      CREATED
                    </span>
                    <span className="text-sm font-bold">
                      {new Date(deck.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-12 sm:p-16 text-center shadow-neo-xl">
          <div className="mb-6 inline-block">
            <div className="bg-neo-secondary border-4 border-black p-8 shadow-neo-lg rotate-3">
              <BookOpen className="h-16 w-16 stroke-black stroke-[4px]" />
            </div>
          </div>
          <p className="text-xl font-black uppercase">
            YOU HAVEN&apos;T UPLOADED ANY DECKS YET
          </p>
        </Card>
      )}
    </div>
  );
}
