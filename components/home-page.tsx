"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { LandingPage } from "./landing-page";

export function HomePage() {
  const router = useRouter();
  const { session, isAuthLoading, canLoadWorkspace } = useAuth();

  useEffect(() => {
    if (canLoadWorkspace && session) {
      router.replace("/waitlist");
    }
  }, [canLoadWorkspace, session, router]);

  if (isAuthLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#050505",
          color: "rgba(255,255,255,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, -apple-system, sans-serif",
          fontSize: "0.9rem",
        }}
      >
        Loading Friday...
      </div>
    );
  }

  if (canLoadWorkspace && session) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#050505",
          color: "rgba(255,255,255,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, -apple-system, sans-serif",
          fontSize: "0.9rem",
        }}
      >
        Redirecting to waitlist...
      </div>
    );
  }

  return <LandingPage />;
}
