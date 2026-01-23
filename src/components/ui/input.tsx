import { InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label 
            htmlFor={props.id} 
            className="block font-bold text-sm uppercase tracking-widest mb-2"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={clsx(
            'w-full h-14 px-4 font-bold text-lg bg-white border-4 border-black',
            'placeholder:text-black/40',
            'focus-visible:bg-neo-secondary focus-visible:shadow-neo-sm focus-visible:outline-none focus-visible:ring-0',
            'transition-all duration-100',
            error && 'border-red-500',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-2 text-sm font-bold text-red-500 uppercase">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
