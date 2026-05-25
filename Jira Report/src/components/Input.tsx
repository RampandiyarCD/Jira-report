import type { InputHTMLAttributes, ChangeEvent } from "react";
import { cn } from "../utils/utils";

interface Inputprops extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  name?: string;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
  placeholder?: string;
  className?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  labelClassName?: string;
  containerClassName?: string;
}

export const Input = ({
  name,
  type,
  placeholder,
  className,
  value,
  onChange,
  id,
  labelClassName,
  containerClassName,
  ...props
}: Inputprops) => {
  const inputId = id || name?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={cn(!containerClassName && "flex flex-col gap-1.5", containerClassName)}>
      {name && (
        <label
          htmlFor={inputId}
          className={cn("text-xs font-semibold text-slate-400 uppercase tracking-wider", labelClassName)}
        >
          {name}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200 disabled:opacity-50 shadow-sm",
          className
        )}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        {...props}
      />
    </div>
  );
};

