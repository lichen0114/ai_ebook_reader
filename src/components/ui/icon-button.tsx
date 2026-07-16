import type { ButtonHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={twMerge("grid size-10 place-items-center rounded-full border border-transparent text-[#555047] transition hover:border-[#d8d0c2] hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40", className)} {...props} />;
}
