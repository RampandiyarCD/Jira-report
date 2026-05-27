import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "../utils/utils";

export const TableContainer = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("overflow-x-auto rounded-lg border border-slate-100 shadow-sm bg-white", className)} {...props} />
);

export const Table = ({ className, ...props }: HTMLAttributes<HTMLTableElement>) => (
  <table className={cn("w-full border-collapse text-left text-sm text-slate-700", className)} {...props} />
);

export const TableHeader = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500", className)} {...props} />
);

export const TableBody = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn("divide-y divide-slate-100 bg-white", className)} {...props} />
);

export const TableRow = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("hover:bg-slate-50/50 transition-colors group", className)} {...props} />
);

export const TableHead = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th scope="col" className={cn("py-3 px-4 font-semibold select-none align-middle", className)} {...props} />
);

export const TableCell = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("py-3.5 px-4 align-middle", className)} {...props} />
);
