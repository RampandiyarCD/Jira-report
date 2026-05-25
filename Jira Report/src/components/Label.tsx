import type { LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/utils";

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
  className?: string;
}

export const Label = ({ children, className, ...props }: LabelProps) => {
  return (
    <label
      className={cn(
        "text-xs font-semibold text-slate-400 uppercase tracking-wider block",
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
};
