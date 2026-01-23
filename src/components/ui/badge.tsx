import { HTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'accent' | 'secondary' | 'muted' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  rotate?: boolean;
  children: React.ReactNode;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'accent', size = 'md', rotate = false, className, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-black uppercase tracking-widest border-black shadow-neo-sm';
    
    const variants = {
      accent: 'bg-neo-accent text-white border-4',
      secondary: 'bg-neo-secondary text-black border-4',
      muted: 'bg-neo-muted text-black border-4',
      outline: 'bg-white text-black border-4',
    };

    const sizes = {
      sm: 'px-2 py-1 text-xs rounded-full',
      md: 'px-3 py-1.5 text-sm rounded-full',
      lg: 'px-4 py-2 text-base rounded-full',
    };

    const rotateStyles = rotate ? 'rotate-3 hover:rotate-12 transition-transform duration-200' : '';

    return (
      <span
        ref={ref}
        className={clsx(
          baseStyles,
          variants[variant],
          sizes[size],
          rotateStyles,
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
