import { HTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'colored';
  hover?: boolean;
  children: React.ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', hover = true, className, children, ...props }, ref) => {
    const baseStyles = 'bg-white border-4 border-black transition-all duration-200';
    
    const variants = {
      default: 'shadow-neo-md',
      elevated: 'shadow-neo-lg',
      colored: 'bg-neo-muted shadow-neo-md',
    };

    const hoverStyles = hover 
      ? 'hover:-translate-y-2 hover:shadow-neo-xl cursor-pointer' 
      : '';

    return (
      <div
        ref={ref}
        className={clsx(
          baseStyles,
          variants[variant],
          hoverStyles,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
