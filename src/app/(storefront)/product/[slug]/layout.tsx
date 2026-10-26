import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { getVisibleProductBySlug } from "@/lib/catalog/query";

interface ProductLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function ProductLayout({
  children,
  params,
}: ProductLayoutProps) {
  const { slug } = await params;
  // This layout renders above the route's loading.tsx boundary, so an unknown
  // slug is rejected here, before any shell is streamed with a 200 status.
  const product = await getVisibleProductBySlug(slug);
  if (!product) notFound();
  return children;
}
