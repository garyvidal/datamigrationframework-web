// BaseNode — Styled container div for ReactFlow nodes; applies border, shadow, and selected-state highlight.
import React from "react";
import { cn } from "@/lib/Utils";

export const BaseNode = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { selected?: boolean }
>(({ className, selected, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-md border border-gray-300 dark:border-slate-600 bg-card p-5 text-card-foreground shadow-sm",
      className,
      selected ? "border-gray-500 dark:border-muted-foreground shadow-lg" : "",
      "hover:ring-1 hover:ring-gray-400 dark:hover:ring-slate-400",
    )}
    tabIndex={0}
    {...props}
  />
));
BaseNode.displayName = "BaseNode";
