"use client";

import { useActionState } from "react";

import {
  adminLoginAction,
  type AdminLoginState,
} from "@/lib/admin/actions";

const initialState: AdminLoginState = { error: null };

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(
    adminLoginAction,
    initialState,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Username</span>
        <input
          name="username"
          type="text"
          autoComplete="username"
          required
          autoFocus
          className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand-500"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand-500"
        />
      </label>
      <button type="submit" disabled={pending} className="btn-primary mt-2">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
