'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { RefreshCw, Loader2 } from 'lucide-react';

interface RegenerateAlignmentsButtonProps {
  lectureId: string;
}

export function RegenerateAlignmentsButton({ lectureId }: RegenerateAlignmentsButtonProps) {
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleRegenerate = async () => {
    if (!confirm('Are you sure you want to regenerate matches? This will delete all existing matches and create new ones.')) {
      return;
    }

    setRegenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/alignments/${lectureId}/regenerate`, {
        method: 'POST',
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to regenerate matches');
      }

      // Redirect to lecture page to show progress
      router.push(`/lectures/${lectureId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate matches');
      setRegenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="p-3 bg-red-500 border-4 border-black shadow-neo-sm">
          <p className="text-sm font-black uppercase text-white">{error}</p>
        </div>
      )}
      <Button
        variant="secondary"
        onClick={handleRegenerate}
        disabled={regenerating}
      >
      {regenerating ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
          REGENERATING...
        </>
      ) : (
        <>
          <RefreshCw className="mr-2 h-4 w-4 stroke-[3px]" />
              REGENERATE MATCHES
        </>
      )}
    </Button>
    </div>
  );
}
