import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, Button, Badge } from '@/components/ui';
import { BookOpen, FileText, ArrowRight } from 'lucide-react';

interface DeckSummary {
  id: string;
  name: string;
  processing_status: string;
  card_count: number;
}

interface LectureSummary {
  id: string;
  name: string;
  processing_status: string;
  slide_count: number;
}

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

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: decksData }, { data: lecturesData }] = await Promise.all([
    supabase.from('decks').select('id, name, processing_status, card_count').order('created_at', { ascending: false }),
    supabase.from('lectures').select('id, name, processing_status, slide_count').order('created_at', { ascending: false }),
  ]);

  const decks = (decksData || []) as DeckSummary[];
  const lectures = (lecturesData || []) as LectureSummary[];

  const indexedDecks = decks.filter(d => d.processing_status === 'completed');
  const processedLectures = lectures.filter(l => l.processing_status === 'completed');

  const totalCards = indexedDecks.reduce((sum, d) => sum + (d.card_count || 0), 0);
  const totalSlides = processedLectures.reduce((sum, l) => sum + (l.slide_count || 0), 0);

  return (
    <div>
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter mb-8 sm:mb-12">
        DASHBOARD
      </h1>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 mb-12">
        <Card hover className="p-6 sm:p-8 rotate-1">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-neo-accent border-4 border-black p-4 shadow-neo-sm">
              <BookOpen className="h-8 w-8 stroke-white stroke-[3px]" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest">INDEXED DECKS</h3>
          </div>
          <p className="text-4xl sm:text-5xl font-black mb-2">{indexedDecks.length}</p>
          <p className="text-base font-bold">
            {totalCards.toLocaleString()} CARDS INDEXED
          </p>
        </Card>

        <Card hover className="p-6 sm:p-8 -rotate-1">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-neo-secondary border-4 border-black p-4 shadow-neo-sm">
              <FileText className="h-8 w-8 stroke-black stroke-[3px]" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest">PROCESSED LECTURES</h3>
          </div>
          <p className="text-4xl sm:text-5xl font-black mb-2">{processedLectures.length}</p>
          <p className="text-base font-bold">
            {totalSlides.toLocaleString()} SLIDES PROCESSED
          </p>
        </Card>
      </div>

      {/* Recent Items */}
      <div className="grid gap-6 lg:grid-cols-1">
        <Card className="shadow-neo-lg">
          <div className="px-6 py-4 border-b-4 border-black flex justify-between items-center bg-neo-secondary">
            <h2 className="text-xl font-black uppercase tracking-tight">RECENT LECTURES</h2>
            <Link href="/lectures">
              <Button variant="ghost" size="sm">
                VIEW ALL
                <ArrowRight className="ml-2 h-4 w-4 stroke-[3px]" />
              </Button>
            </Link>
          </div>
          <div className="p-6">
            {lectures.length > 0 ? (
              <ul className="space-y-4">
                {lectures.slice(0, 5).map((lecture, idx) => (
                  <li key={lecture.id} className="flex justify-between items-center pb-4 border-b-4 border-black last:border-0 last:pb-0">
                    <Link
                      href={`/lectures/${lecture.id}`}
                      className="text-base font-bold hover:text-neo-accent transition-colors duration-100 flex-1"
                    >
                      {lecture.name}
                    </Link>
                    <StatusBadge status={lecture.processing_status} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-8">
                <p className="text-lg font-bold mb-4">
                  NO LECTURES YET
                </p>
                <Link href="/lectures/upload">
                  <Button variant="primary">
                    UPLOAD YOUR FIRST LECTURE
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
