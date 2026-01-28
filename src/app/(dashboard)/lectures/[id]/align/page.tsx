'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input } from '@/components/ui';
import { ArrowLeft, Loader2, Play } from 'lucide-react';

interface Deck {
  id: string;
  name: string;
  card_count: number;
  processing_status: string;
  user_id?: string;
}

export default function AlignLecturePage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [aligning, setAligning] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const params = useParams();
  const lectureId = params.id as string;

  useEffect(() => {
    async function fetchDecks() {
      try {
        // Fetch all completed decks from all users
        const response = await fetch('/api/decks/all');
        if (!response.ok) throw new Error('Failed to fetch decks');
        const data = await response.json();
        setDecks(data.decks || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load decks');
      } finally {
        setLoading(false);
      }
    }
    fetchDecks();
  }, []);

  const handleAlign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeck) {
      setError('Please select a deck');
      return;
    }

    setAligning(true);
    setError(null);
    setSuccess(false);

    try {
      console.log('Starting alignment for lecture:', lectureId, 'deck:', selectedDeck);
      
      const response = await fetch('/api/alignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lectureId,
          deckId: selectedDeck,
        }),
      });

      console.log('Alignment API response status:', response.status);

      if (!response.ok) {
        let errorMessage = 'Failed to start alignment';
        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
          console.error('Alignment API error:', data);
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Alignment started successfully:', data);
      
      // Show success state
      setSuccess(true);
      setAligning(false);
      
      // Show success message briefly before redirect
      // This helps on iPad where redirects can be delayed
      setTimeout(() => {
        console.log('Redirecting to results page...');
        // Use window.location as fallback for iPad Safari router issues
        try {
          router.push(`/lectures/${lectureId}/results`);
          // Also try window.location after a short delay if router.push doesn't work
          setTimeout(() => {
            if (window.location.pathname !== `/lectures/${lectureId}/results`) {
              console.log('Router.push failed, using window.location fallback');
              window.location.href = `/lectures/${lectureId}/results`;
            }
          }, 1000);
        } catch (routerError) {
          console.error('Router.push failed:', routerError);
          // Fallback to window.location if router.push fails
          window.location.href = `/lectures/${lectureId}/results`;
        }
      }, 1500);
    } catch (err) {
      console.error('Alignment error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
      setAligning(false);
      setSuccess(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="p-8">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 stroke-black stroke-[3px] animate-spin" />
            <span className="text-lg font-black uppercase">LOADING DECKS...</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/lectures/${lectureId}`}>
        <Button variant="ghost" size="sm" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4 stroke-[3px]" />
          BACK TO LECTURE
        </Button>
      </Link>

      <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter mb-8">
        ALIGN CARDS TO LECTURE
      </h1>

      <Card className="p-6 sm:p-8 shadow-neo-xl">
        {decks.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-lg font-black uppercase mb-6">
              NO INDEXED DECKS AVAILABLE
            </p>
            <p className="text-base font-bold mb-6">
              Please upload and process a deck first.
            </p>
            <Link href="/decks/upload">
              <Button variant="primary" size="lg">
                UPLOAD A DECK
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleAlign} className="space-y-6">
            {error && (
              <Card className="p-4 bg-red-500 border-4 border-red-700 shadow-neo-md">
                <p className="text-sm font-black uppercase text-white">
                  {error}
                </p>
              </Card>
            )}
            {success && (
              <Card className="p-4 bg-green-500 border-4 border-black shadow-neo-md">
                <p className="text-sm font-black uppercase text-white">
                  ✓ ALIGNMENT STARTED! REDIRECTING TO RESULTS...
                </p>
              </Card>
            )}

            <div>
              <label className="block text-sm font-black uppercase tracking-widest mb-3">
                SELECT DECK TO ALIGN
              </label>
              <select
                value={selectedDeck}
                onChange={(e) => setSelectedDeck(e.target.value)}
                required
                className="w-full h-14 px-4 font-bold text-lg bg-white border-4 border-black placeholder:text-black/40 focus-visible:bg-neo-secondary focus-visible:shadow-neo-sm focus-visible:outline-none focus-visible:ring-0 transition-all duration-100"
              >
                <option value="">CHOOSE A DECK...</option>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name.toUpperCase()} ({deck.card_count.toLocaleString()} CARDS)
                  </option>
                ))}
              </select>
            </div>

            <Card className="p-4 bg-neo-muted border-4 border-black">
              <h4 className="text-base font-black uppercase mb-3">WHAT HAPPENS NEXT?</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm font-bold">
                <li>Each slide concept is compared to deck cards using vector similarity</li>
                <li>AI classifies the alignment type for top matches</li>
                <li>Results show which cards to study for this lecture</li>
                <li>You can export card IDs to create a filtered deck in Anki</li>
              </ol>
            </Card>

            <Card className="p-4 bg-yellow-100 border-4 border-yellow-500">
              <p className="text-sm font-black uppercase text-yellow-900">
                ⚠️ PLEASE STAY ON THIS PAGE WHILE PROCESSING (WE ARE FIXING THIS SOON)
              </p>
            </Card>
            
            <Card className="p-4 bg-neo-secondary border-4 border-black">
              <p className="text-sm font-black uppercase">
                <strong>NOTE:</strong> ALIGNMENT MAY TAKE SEVERAL MINUTES FOR LARGE LECTURES.
              </p>
            </Card>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={!selectedDeck || aligning || success}
                className="flex-1 sm:flex-none"
              >
                {aligning ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 stroke-[3px] animate-spin" />
                    STARTING ALIGNMENT...
                  </>
                ) : success ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 stroke-[3px] animate-spin" />
                    REDIRECTING...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5 stroke-[3px]" />
                    START ALIGNMENT
                  </>
                )}
              </Button>
              <Link href={`/lectures/${lectureId}`}>
                <Button variant="outline" size="lg">
                  CANCEL
                </Button>
              </Link>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
