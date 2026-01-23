'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Deck } from '@/types/database';
import { Button } from '@/components/ui';
import { Play, RefreshCw, X, Trash2, Loader2 } from 'lucide-react';

interface DeckActionsProps {
  deck: Deck;
}

export function DeckActions({ deck }: DeckActionsProps) {
  const [processing, setProcessing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const handleProcess = async () => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/decks/${deck.id}/process`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start processing');
      }

      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to process deck');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel processing?')) {
      return;
    }

    setCanceling(true);
    try {
      const response = await fetch(`/api/decks/${deck.id}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cancel processing');
      }

      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel processing');
    } finally {
      setCanceling(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this deck? This action cannot be undone.')) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/decks/${deck.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete deck');
      }

      router.push('/decks');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete deck');
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {deck.processing_status !== 'processing' && (
        <>
          {deck.processing_status === 'pending' && (
            <Button
              variant="primary"
              onClick={handleProcess}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
                  PROCESSING...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4 stroke-[3px]" />
                  PROCESS DECK
                </>
              )}
            </Button>
          )}
          {deck.processing_status === 'failed' && (
            <Button
              variant="secondary"
              onClick={handleProcess}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
                  RETRYING...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 stroke-[3px]" />
                  RETRY PROCESSING
                </>
              )}
            </Button>
          )}
          {deck.processing_status === 'completed' && (
            <Button
              variant="outline"
              onClick={handleProcess}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
                  PROCESSING...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 stroke-[3px]" />
                  REPROCESS
                </>
              )}
            </Button>
          )}
        </>
      )}
      {deck.processing_status === 'processing' && (
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={canceling}
          className="border-neo-accent text-neo-accent hover:bg-neo-accent hover:text-white"
        >
          {canceling ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
              CANCELING...
            </>
          ) : (
            <>
              <X className="mr-2 h-4 w-4 stroke-[3px]" />
              CANCEL PROCESSING
            </>
          )}
        </Button>
      )}
      <Button
        variant="outline"
        onClick={handleDelete}
        disabled={deleting || deck.processing_status === 'processing'}
        className="border-neo-accent text-neo-accent hover:bg-neo-accent hover:text-white"
      >
        {deleting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
            DELETING...
          </>
        ) : (
          <>
            <Trash2 className="mr-2 h-4 w-4 stroke-[3px]" />
            DELETE
          </>
        )}
      </Button>
    </div>
  );
}
