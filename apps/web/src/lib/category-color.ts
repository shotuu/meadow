/**
 * Hashes a category id into one of the app's 5 fixed chart colors, so a
 * category's color is stable and identity-based rather than tied to its
 * rank in whatever list it's currently rendered in (e.g. spend order).
 * Shared by the Categories page and any chart that colors by category.
 */
export function categoryColorVar(categoryId: string): string {
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0;
  return `var(--chart-${(hash % 5) + 1})`;
}
