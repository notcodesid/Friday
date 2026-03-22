"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth/auth-context";

export function Providers({
  authEnabled,
  children,
}: {
  authEnabled: boolean;
  children: ReactNode;
}) {
  return <AuthProvider authEnabled={authEnabled}>{children}</AuthProvider>;
}
