import { clusterApiUrl, LAMPORTS_PER_SOL, PublicKey, type Cluster } from "@solana/web3.js";

import { env } from "@/lib/env";

export type SolanaPlanId = "starter" | "growth" | "scale";

export type SolanaPlan = {
  id: SolanaPlanId;
  name: string;
  amountSol: number;
  monthlyLabel: string;
  description: string;
  features: string[];
};

export type SubscriptionSnapshot = {
  active: boolean;
  planId: SolanaPlanId | null;
  planName: string | null;
  amountSol: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  payerWallet: string | null;
  latestSignature: string | null;
  explorerUrl: string | null;
};

const DEFAULT_CLUSTER: Cluster = "devnet";

export const SOLANA_PLANS: SolanaPlan[] = [
  {
    id: "starter",
    name: "Starter",
    amountSol: 0.1,
    monthlyLabel: "Monthly access",
    description: "Best for trying Friday with a single operator flow.",
    features: ["1 operator account", "Company workspace access", "Manual monthly renewal"],
  },
  {
    id: "growth",
    name: "Growth",
    amountSol: 0.25,
    monthlyLabel: "Monthly access",
    description: "A balanced plan for teams using Friday regularly.",
    features: ["Priority operator workflow", "Brand and competitor analysis", "Manual monthly renewal"],
  },
  {
    id: "scale",
    name: "Scale",
    amountSol: 0.6,
    monthlyLabel: "Monthly access",
    description: "Higher-volume usage with a larger monthly commitment.",
    features: ["Highest billing tier", "Manual monthly renewal", "Same wallet-based checkout flow"],
  },
];

export function getSolanaCluster(): Cluster {
  const candidate = env.solanaCluster;
  if (
    candidate === "devnet" ||
    candidate === "testnet" ||
    candidate === "mainnet-beta"
  ) {
    return candidate;
  }

  return DEFAULT_CLUSTER;
}

export function getSolanaRpcUrl() {
  return env.solanaRpcUrl ?? clusterApiUrl(getSolanaCluster());
}

export function getSolanaMerchantWallet() {
  return env.solanaMerchantWallet;
}

export function getSolanaPlan(planId: string) {
  return SOLANA_PLANS.find((plan) => plan.id === planId);
}

export function solToLamports(amountSol: number) {
  return Math.round(amountSol * LAMPORTS_PER_SOL);
}

export function getPlanAmountLamports(plan: SolanaPlan) {
  return solToLamports(plan.amountSol);
}

export function getSolanaExplorerUrl(signature: string, cluster: Cluster) {
  const clusterSuffix =
    cluster === "mainnet-beta" ? "" : `?cluster=${encodeURIComponent(cluster)}`;
  return `https://solscan.io/tx/${encodeURIComponent(signature)}${clusterSuffix}`;
}

export function isMerchantWalletValid(wallet: string | undefined) {
  if (!wallet) {
    return false;
  }

  try {
    new PublicKey(wallet);
    return true;
  } catch {
    return false;
  }
}

export function summarizeWallet(wallet: string) {
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}
