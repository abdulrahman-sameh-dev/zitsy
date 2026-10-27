"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  normalizeSearchQuery,
  SEARCH_QUERY_COOKIE,
  searchCookieOptions,
} from "@/lib/search/query";

export async function searchAction(formData: FormData): Promise<void> {
  const query = normalizeSearchQuery(formData.get("q"));
  const cookieStore = await cookies();

  if (query) {
    cookieStore.set(
      SEARCH_QUERY_COOKIE,
      query,
      searchCookieOptions(process.env.NODE_ENV === "production"),
    );
  } else {
    cookieStore.set(SEARCH_QUERY_COOKIE, "", {
      ...searchCookieOptions(process.env.NODE_ENV === "production"),
      maxAge: 0,
    });
  }

  redirect("/search");
}

export async function clearSearchAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SEARCH_QUERY_COOKIE, "", {
    ...searchCookieOptions(process.env.NODE_ENV === "production"),
    maxAge: 0,
  });
  redirect("/search");
}
