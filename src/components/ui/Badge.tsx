import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
          variant === 'default' && 'bg-gray-100 text-gray-700',
          variant === 'primary' && 'bg-primary-100 text-primary-700',
          variant === 'secondary' && 'bg-gray-200 text-gray-600',
          variant === 'success' && 'bg-green-100 text-green-700',
          variant === 'warning' && 'bg-yellow-100 text-yellow-700',
          variant === 'danger' && 'bg-red-100 text-red-700',
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
