'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui';

interface AlignmentFiltersProps {
  currentFilter: string;
  counts: {
    all: number;
    directly_aligned: number;
    deeper_than_lecture: number;
    too_shallow: number;
    not_aligned: number;
  };
}

export function AlignmentFilters({ currentFilter, counts }: AlignmentFiltersProps) {
  const pathname = usePathname();

  const filters = [
    { key: 'all', label: 'ALL', count: counts.all, variant: 'outline' as const },
    { key: 'directly_aligned', label: 'DIRECTLY ALIGNED', count: counts.directly_aligned, variant: 'secondary' as const },
    { key: 'deeper_than_lecture', label: 'DEEPER CONTENT', count: counts.deeper_than_lecture, variant: 'muted' as const },
    { key: 'too_shallow', label: 'TOO SHALLOW', count: counts.too_shallow, variant: 'accent' as const },
    { key: 'not_aligned', label: 'NOT ALIGNED', count: counts.not_aligned, variant: 'outline' as const },
  ];

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {filters.map((filter) => {
        const isActive = currentFilter === filter.key;
        return (
          <Link
            key={filter.key}
            href={filter.key === 'all' ? pathname : `${pathname}?filter=${filter.key}`}
            className={`
              inline-flex items-center gap-2 px-4 py-2 border-4 border-black transition-all duration-100
              ${isActive
                ? 'bg-neo-accent text-white shadow-neo-md'
                : 'bg-white text-black hover:bg-neo-secondary hover:shadow-neo-sm'
              }
              active:translate-x-[2px] active:translate-y-[2px] active:shadow-none
            `}
          >
            <span className="text-sm font-black uppercase tracking-widest">
              {filter.label}
            </span>
            <Badge 
              variant={isActive ? 'outline' : filter.variant} 
              size="sm"
              className={isActive ? 'bg-white text-black' : ''}
            >
              {filter.count}
            </Badge>
          </Link>
        );
      })}
    </div>
  );
}
