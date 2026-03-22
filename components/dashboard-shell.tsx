"use client";

import dynamic from "next/dynamic";

import type { DashboardProps } from "@/components/dashboard";

const Dashboard = dynamic(
  () => import("@/components/dashboard").then((module) => module.Dashboard),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          minHeight: "100vh",
          background: "#08090c",
          color: "#a2a8b8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "0.9rem",
        }}
      >
        Loading Friday...
      </div>
    ),
  },
);

export function DashboardShell(props: DashboardProps) {
  return <Dashboard {...props} />;
}
