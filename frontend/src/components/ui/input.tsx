import { type InputHTMLAttributes, forwardRef } from "react";

/**
 * Input component with consistent styling.
 * Uses the Hollyseams teal palette for focus states.
 */
const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full rounded-[10px] border border-teal-border bg-surface-card px-4 py-3 text-sm text-ink placeholder:text-stone transition-colors duration-150 focus:border-teal focus:outline-none ${className}`}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
