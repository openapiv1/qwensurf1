import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
import { cardVariants } from "./card";

export const menuItemVariants = cva(
  [
    "relative flex cursor-pointer rounded-sm select-none items-center gap-2",
    "px-2 py-1.5",
    "font-mono text-xs",
    "outline-none",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  ],
  {
    variants: {
      variant: {
        default: "focus:bg-accent/10 focus:text-accent",
        error: "text-red-500 focus:bg-red-500/10 focus:text-red-500",
        success: "text-green-500 focus:bg-green-500/10 focus:text-green-500",
        warning: "text-yellow-500 focus:bg-yellow-500/10 focus:text-yellow-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export const menuContentStyles = cn(
  "z-50 min-w-[8rem] overflow-hidden rounded-sm p-2",
  cardVariants({ variant: "layer" }),
  "shadow-sm",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
  "data-[side=bottom]:slide-in-from-top-2",
  "data-[side=left]:slide-in-from-right-2",
  "data-[side=right]:slide-in-from-left-2",
  "data-[side=top]:slide-in-from-bottom-2"
);

export const menuLabelStyles = cn("font-mono text-xs uppercase", "text-fg-500");

export const menuSeparatorStyles = cn(
  "-mx-2 my-2",
  "border-t border-dashed border-border-200"
);

export const menuViewportStyles = cn("p-1");

export const menuGroupStyles = cn("flex flex-col gap-0.5 pt-2 first:pt-0");
