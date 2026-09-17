// Pure constants with no server-only (Prisma/Gemini) imports, so client
// components can use them without pulling in categorize.ts's DB/pg module
// graph -- import from "@finance-app/categorization-ai/constants", not the
// package root, from any "use client" file.

// A suggestion at or above this confidence is applied without flagging it
// for human review; below it, the UI surfaces the transaction on the
// Needs Review tab even though a category was still assigned.
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
