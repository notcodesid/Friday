"use client";

import dynamic from "next/dynamic";

const Dashboard = dynamic(
  () => import("@/components/dashboard").then((module) => module.Dashboard),
  {
    ssr: false,
    loading: () => (
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
    ),
  },
);

export function DashboardShell() {
  return <Dashboard />;
}
