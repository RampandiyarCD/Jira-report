import type { HTMLAttributes } from "react";
import { cn } from "../utils/utils";


interface CardProps extends HTMLAttributes<HTMLDivElement> {}
interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}
interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {}
interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}
interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}
interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

export const Card = ({ className, ...props }: CardProps) => (
  <div
    className={cn("rounded-xl border bg-white shadow-sm", className)}
    style={{
      backgroundColor: "hsl(var(--card))",
      borderColor: "hsl(var(--border))",
      color: "hsl(var(--card-foreground))",
    }}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: CardHeaderProps) => (
  <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
);

export const CardTitle = ({ className, ...props }: CardTitleProps) => (
  <h3
    className={cn("font-semibold leading-none tracking-tight text-sm", className)}
    {...props}
  />
);

export const CardDescription = ({ className, ...props }: CardDescriptionProps) => (
  <p
    className={cn("text-sm", className)}
    style={{ color: "hsl(var(--muted-foreground))" }}
    {...props}
  />
);

export const CardContent = ({ className, ...props }: CardContentProps) => (
  <div className={cn("p-6 pt-0", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: CardFooterProps) => (
  <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
);