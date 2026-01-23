import { ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-bold uppercase tracking-wide border-black transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2';
    
    const variants = {
      primary: 'bg-neo-accent text-white border-4 shadow-neo-sm hover:shadow-neo-md active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
      secondary: 'bg-neo-secondary text-black border-4 shadow-neo-sm hover:shadow-neo-md active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
      outline: 'bg-white text-black border-4 shadow-neo-sm hover:bg-neo-secondary hover:shadow-neo-md active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
      ghost: 'bg-transparent text-black border-2 border-transparent hover:border-black hover:shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
    };

    const sizes = {
      sm: 'h-10 px-4 text-xs',
      md: 'h-12 px-6 text-sm',
      lg: 'h-14 px-8 text-base',
    };

    return (
      <button
        ref={ref}
        className={clsx(
          baseStyles,
          variants[variant],
          sizes[size],
          disabled && 'opacity-50 cursor-not-allowed active:translate-x-0 active:translate-y-0 active:shadow-neo-sm',
          className
        )}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
