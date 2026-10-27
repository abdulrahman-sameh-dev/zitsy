import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin/login-form";
import { readAdminSession } from "@/lib/admin/session";
import { adminCredentials } from "@/lib/config/env";

export const metadata = {
  title: "Sign in",
};

export default async function AdminLoginPage() {
  if (await readAdminSession()) redirect("/admin/analytics");

  const configured = adminCredentials() !== null;

  return (
    <main className="container-page flex min-h-screen max-w-md flex-col justify-center py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
        {configured ? "Zitsy admin" : "Admin unavailable"}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
        {configured ? "Sign in" : "Admin access is not configured"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {configured
          ? "This area is restricted. Sign in with the admin credentials for this environment."
          : "Set ADMIN_USERNAME and ADMIN_PASSWORD in the server environment to enable the dashboard."}
      </p>

      {configured ? (
        <div className="mt-8 rounded-lg border border-line bg-surface p-5">
          <AdminLoginForm />
        </div>
      ) : (
        <Link href="/" className="btn-secondary mt-8 self-start">
          Back to store
        </Link>
      )}
    </main>
  );
}
