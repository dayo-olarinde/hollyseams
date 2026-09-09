"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

/**
 * Button component with consistent styling.
 * Uses the Hollyseams teal palette for primary actions.
 */
const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className = "", disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center justify-center rounded-[10px] bg-teal px-6 py-3 text-sm font-medium text-white transition-all duration-150 hover:bg-teal-deep active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

export { Button };
