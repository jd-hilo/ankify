'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ProcessingProgress } from '@/app/api/decks/[id]/progress/route';

interface DeckProcessingProgressProps {
  deckId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

const STEP_ICONS: Record<ProcessingProgress['step'], string> = {
  uploading: '📤',
  downloading: '📥',
  parsing: '🔍',
  storing: '💾',
  completed: '✅',
  failed: '❌',
};

const STEP_LABELS: Record<ProcessingProgress['step'], string> = {
  uploading: 'Uploading file',
  downloading: 'Downloading from storage',
  parsing: 'Parsing cards',
  storing: 'Saving to database',
  completed: 'Complete',
  failed: 'Failed',
};

function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s remaining`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s remaining`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m remaining`;
}

export default function DeckProcessingProgress({
  deckId,
  onComplete,
  onError,
}: DeckProcessingProgressProps) {
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const response = await fetch(`/api/decks/${deckId}/progress`);
      if (!response.ok) {
        throw new Error('Failed to fetch progress');
      }
      const data: ProcessingProgress = await response.json();
      setProgress(data);

      if (data.status === 'completed') {
        onComplete?.();
      } else if (data.status === 'failed') {
        onError?.(data.errorMessage || 'Processing failed');
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return null;
    }
  }, [deckId, onComplete, onError]);

  useEffect(() => {
    // Initial fetch
    fetchProgress();

    // Poll every second while processing
    const interval = setInterval(async () => {
      const data = await fetchProgress();
      if (data?.status === 'completed' || data?.status === 'failed') {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [fetchProgress]);

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <span>❌</span>
          <span className="font-medium">Error: {error}</span>
        </div>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
      </div>
    );
  }

  const isComplete = progress.status === 'completed';
  const isFailed = progress.status === 'failed';
  const isProcessing = progress.status === 'processing';

  return (
    <div
      className={`rounded-lg p-6 border ${
        isComplete
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : isFailed
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{STEP_ICONS[progress.step]}</span>
          <div>
            <h3 className="font-semibold text-lg">
              {STEP_LABELS[progress.step]}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {progress.stepDescription}
            </p>
          </div>
        </div>

        {isProcessing && progress.estimatedSecondsRemaining !== null && (
          <div className="text-right">
            <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {formatTimeRemaining(progress.estimatedSecondsRemaining)}
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600 dark:text-gray-400">
            {progress.cardsProcessed.toLocaleString()} / {progress.totalCards.toLocaleString()} cards
          </span>
          <span className="font-medium">{progress.percentComplete}%</span>
        </div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ease-out ${
              isComplete
                ? 'bg-green-500'
                : isFailed
                ? 'bg-red-500'
                : 'bg-blue-500'
            }`}
            style={{ width: `${progress.percentComplete}%` }}
          />
        </div>
      </div>

      {/* Processing steps indicator */}
      <div className="flex items-center justify-between text-xs">
        {(['downloading', 'parsing', 'storing', 'completed'] as const).map((step, index) => {
          const stepOrder = ['downloading', 'parsing', 'storing', 'completed'];
          const currentIndex = stepOrder.indexOf(progress.step);
          const thisIndex = stepOrder.indexOf(step);
          const isActive = thisIndex === currentIndex;
          const isDone = thisIndex < currentIndex || progress.step === 'completed';
          const isCurrent = isActive && isProcessing;

          return (
            <div key={step} className="flex items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  isDone
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-blue-500 text-white animate-pulse'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                }`}
              >
                {isDone ? '✓' : index + 1}
              </div>
              {index < 3 && (
                <div
                  className={`w-12 sm:w-20 h-0.5 mx-1 ${
                    isDone ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1 px-1">
        <span>Download</span>
        <span>Parse</span>
        <span>Store</span>
        <span>Done</span>
      </div>

      {/* Error message */}
      {isFailed && progress.errorMessage && (
        <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-sm text-red-700 dark:text-red-300">
          {progress.errorMessage}
        </div>
      )}

      {/* Success message */}
      {isComplete && (
        <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/30 rounded-lg text-sm text-green-700 dark:text-green-300">
          Successfully processed {progress.totalCards.toLocaleString()} cards. Ready for alignment with lectures.
        </div>
      )}
    </div>
  );
}
