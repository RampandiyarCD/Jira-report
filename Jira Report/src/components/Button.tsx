import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/utils";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "name"> {
  name?: ReactNode; 
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
}

export const Button = ({
  name,
  onClick,
  className,
  children,
  variant,
  type = "button",
  ...props
}: ButtonProps) => {
  const hasVariant = !!variant;
  
  const baseStyle = hasVariant || !className
    ? "inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm transition-all duration-200 active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-sm px-4 py-2.5"
    : "";

  const variants = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/10 hover:shadow-lg hover:shadow-blue-600/20 cursor-pointer border border-transparent",
    secondary: "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 hover:border-slate-300 cursor-pointer",
    outline: "bg-transparent border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer",
    ghost: "bg-transparent hover:bg-slate-100 text-slate-700 shadow-none cursor-pointer",
    danger: "bg-red-600 hover:bg-red-500 text-white shadow-red-600/10 border border-transparent cursor-pointer",
  };

  const variantStyle = variant ? variants[variant] : (className ? "" : variants.primary);

  return (
    <button
      type={type}
      className={cn("cursor-pointer disabled:cursor-not-allowed", baseStyle, variantStyle, className)}
      onClick={onClick}
      {...props}
    >
      {children || name}
    </button>
  );
};