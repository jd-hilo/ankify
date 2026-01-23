'use client';

import { useState } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';

interface Review {
  name: string;
  role: string;
  text: string;
  rating: number;
}

interface ReviewsCarouselProps {
  reviews: Review[];
}

export function ReviewsCarousel({ reviews }: ReviewsCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextReview = () => {
    setCurrentIndex((prev) => (prev + 1) % reviews.length);
  };

  const prevReview = () => {
    setCurrentIndex((prev) => (prev - 1 + reviews.length) % reviews.length);
  };

  const goToReview = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div className="relative">
      {/* Carousel Container */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {reviews.map((review, idx) => (
            <div key={idx} className="min-w-full px-2">
              <div className="bg-neo-bg border-8 border-black p-8 sm:p-12 shadow-neo-md">
                <div className="flex gap-1 mb-6 justify-center">
                  {[...Array(review.rating)].map((_, i) => (
                    <Star key={i} className="h-6 w-6 fill-neo-secondary stroke-black stroke-[2px]" />
                  ))}
                </div>
                <p className="text-lg sm:text-xl font-bold leading-relaxed mb-8 text-center max-w-3xl mx-auto">
                  &quot;{review.text}&quot;
                </p>
                <div className="border-t-4 border-black pt-4 text-center">
                  <p className="text-base font-black uppercase tracking-widest mb-1">
                    {review.name}
                  </p>
                  <p className="text-sm font-bold opacity-70">
                    {review.role}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-center gap-4 mt-8">
        <Button
          variant="outline"
          size="md"
          onClick={prevReview}
          className="border-4 border-black"
        >
          <ChevronLeft className="h-5 w-5 stroke-[3px]" />
        </Button>

        {/* Dots Indicator */}
        <div className="flex gap-2">
          {reviews.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToReview(idx)}
              className={`w-4 h-4 border-4 border-black transition-all ${
                idx === currentIndex
                  ? 'bg-neo-accent shadow-neo-sm'
                  : 'bg-white hover:bg-neo-secondary'
              }`}
              aria-label={`Go to review ${idx + 1}`}
            />
          ))}
        </div>

        <Button
          variant="outline"
          size="md"
          onClick={nextReview}
          className="border-4 border-black"
        >
          <ChevronRight className="h-5 w-5 stroke-[3px]" />
        </Button>
      </div>
    </div>
  );
}
