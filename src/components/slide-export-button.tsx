'use client';

import { useState, useRef, useEffect } from 'react';
import type { AlignmentType } from '@/types/database';
import { Button, Card, Badge } from '@/components/ui';
import { Copy, Check, ChevronDown } from 'lucide-react';

interface Alignment {
  card_concepts: { card_id: string };
  alignment_type: AlignmentType;
}

interface SlideExportButtonProps {
  alignments: Alignment[];
  slideNumber: number;
}

export function SlideExportButton({ alignments, slideNumber }: SlideExportButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  const handleCopy = async (filterType: 'all' | 'directly_aligned') => {
    let cardIds: string[];
    
    if (filterType === 'directly_aligned') {
      cardIds = alignments
        .filter(a => a.alignment_type === 'directly_aligned')
        .map(a => a.card_concepts.card_id);
    } else {
      cardIds = alignments.map(a => a.card_concepts.card_id);
    }

    if (cardIds.length === 0) {
      alert(`No card IDs to copy${filterType === 'directly_aligned' ? ' (no directly aligned cards)' : ''}`);
      return;
    }

    // Format as Anki search query: cid:xxx OR cid:yyy OR cid:zzz
    const searchQuery = cardIds.map(id => `cid:${id}`).join(' OR ');

    try {
      await navigator.clipboard.writeText(searchQuery);
      setCopied(true);
      setShowDropdown(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert('Failed to copy to clipboard');
    }
  };

  if (alignments.length === 0) {
    return null;
  }

  const directlyAlignedCount = alignments.filter(a => a.alignment_type === 'directly_aligned').length;
  const allCount = alignments.length;

  return (
    <div className="ml-auto relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 stroke-[3px]" />
            COPIED!
          </>
        ) : (
          <>
            <Copy className="h-4 w-4 stroke-[3px]" />
            COPY IDS ({allCount})
            <ChevronDown className="h-4 w-4 stroke-[3px]" />
          </>
        )}
      </Button>

      {showDropdown && !copied && (
        <Card className="absolute right-0 mt-2 w-64 shadow-neo-xl z-10 border-4 border-black">
          <div className="p-3">
            <p className="text-xs font-black uppercase tracking-widest mb-2 px-2">COPY CARD IDS</p>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy('all')}
                className="w-full justify-between"
              >
                <span className="font-bold uppercase text-xs">COPY ALL CARDS</span>
                <Badge variant="outline" size="sm">{allCount}</Badge>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy('directly_aligned')}
                className="w-full justify-between"
              >
                <span className="font-bold uppercase text-xs">COPY DIRECTLY ALIGNED</span>
                <Badge variant="secondary" size="sm">{directlyAlignedCount}</Badge>
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
