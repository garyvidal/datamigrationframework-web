// BaseHandle — Thin wrapper around ReactFlow Handle that forwards refs and supports extra className merging.
import React from "react";
import { Handle, HandleProps } from "@xyflow/react";
import { cn } from "@/lib/Utils";

export const BaseHandle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & HandleProps
>(({ className, ...props }, ref) => (
  <Handle ref={ref} className={cn("", className)} {...props} />
));
BaseHandle.displayName = "BaseHandle";
