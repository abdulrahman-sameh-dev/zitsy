import { redirect } from "next/navigation";

import { readAdminSession } from "./session";

export async function requireAdminPage(): Promise<void> {
  if (!(await readAdminSession())) redirect("/admin/login");
}
