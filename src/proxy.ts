import { NextResponse, type NextRequest } from "next/server";

import {
  legacySearchQuery,
  SEARCH_QUERY_COOKIE,
  searchCookieOptions,
} from "@/lib/search/query";

export function proxy(request: NextRequest) {
  const query = legacySearchQuery(request.nextUrl);
  if (query === null) return NextResponse.next();

  const response = NextResponse.redirect(new URL("/search", request.url));

  if (query) {
    response.cookies.set(
      SEARCH_QUERY_COOKIE,
      query,
      searchCookieOptions(process.env.NODE_ENV === "production"),
    );
  } else {
    response.cookies.set(SEARCH_QUERY_COOKIE, "", {
      ...searchCookieOptions(process.env.NODE_ENV === "production"),
      maxAge: 0,
    });
  }

  return response;
}

export const config = {
  matcher: "/search",
};
