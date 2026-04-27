import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Shadcn/UI's `cn()` helper. Combines clsx (conditional classes) with
 * tailwind-merge (last-wins conflict resolution for Tailwind utilities).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
