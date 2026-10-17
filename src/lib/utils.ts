import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Category icons are free text: an emoji ("☕") or a plain word ("coffee", from the
// demo seed). Only show it when it's an emoji or symbol; a word would just repeat
// the category name next to it.
export function getCategoryIcon(icon?: string) {
  return icon && /[^a-zA-Z0-9 ]/.test(icon) ? icon : null;
}
