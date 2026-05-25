import type { SelectHTMLAttributes, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../utils/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  name?: string;
  className?: string;
  labelClassName?: string;
  containerClassName?: string;
  children?: ReactNode;
}

export const Select = ({
  name,
  className,
  id,
  labelClassName,
  containerClassName,
  children,
  ...props
}: SelectProps) => {
  const selectId = id || name?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={cn(!containerClassName && "flex flex-col gap-1.5", containerClassName)}>
      {name && (
        <label
          htmlFor={selectId}
          className={cn("text-xs font-semibold text-slate-400 uppercase tracking-wider", labelClassName)}
        >
          {name}
        </label>
      )}
      <div className="relative w-full">
        <select
          id={selectId}
          className={cn(
            "w-full bg-white border border-slate-200 rounded-lg pl-3.5 pr-10 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200 disabled:opacity-50 cursor-pointer appearance-none shadow-sm",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
          <ChevronDown size={16} />
        </div>
      </div>
    </div>
  );
};
