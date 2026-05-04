import { NextRequest } from "next/server";

export function isAuthorized(req: NextRequest): boolean {
  const expectedKey = process.env.DEBUG_KEY;

  if (!expectedKey) {
    console.warn("DEBUG_KEY is missing from environment variables.");
    return false;
  }

  const headerKey = req.headers.get("x-debug-key");
  const queryKey = req.nextUrl.searchParams.get("debugKey");

  return headerKey === expectedKey || queryKey === expectedKey;
}