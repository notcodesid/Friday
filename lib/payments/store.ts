import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { addMonths } from "date-fns";
import type { User } from "@supabase/supabase-js";

import {
  getSolanaExplorerUrl,
  getSolanaPlan,
  type SolanaPlanId,
  type SubscriptionSnapshot,
} from "@/lib/payments/solana";

export type SolanaPaymentRecord = {
  id: string;
  createdAt: string;
  userId: string | null;
  userEmail: string | null;
  planId: SolanaPlanId;
  amountSol: number;
  payerWallet: string;
  merchantWallet: string;
  signature: string;
  cluster: "devnet" | "testnet" | "mainnet-beta";
  startsAt: string;
  expiresAt: string;
  explorerUrl: string;
};

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "solana-payments.json");

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, "[]\n", "utf8");
  }
}

async function readPayments() {
  await ensureDataFile();
  const contents = await readFile(dataFile, "utf8");
  return JSON.parse(contents) as SolanaPaymentRecord[];
}

async function writePayments(payments: SolanaPaymentRecord[]) {
  await ensureDataFile();
  await writeFile(dataFile, `${JSON.stringify(payments, null, 2)}\n`, "utf8");
}

function matchesUser(record: SolanaPaymentRecord, user: User | null) {
  if (!user) {
    return false;
  }

  return record.userId === user.id;
}

export async function listSolanaPayments() {
  const payments = await readPayments();
  return payments.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getPaymentBySignature(signature: string) {
  const payments = await readPayments();
  return payments.find((payment) => payment.signature === signature) ?? null;
}

export async function getCurrentSubscription(user: User | null): Promise<SubscriptionSnapshot> {
  if (!user) {
    return {
      active: false,
      planId: null,
      planName: null,
      amountSol: null,
      startsAt: null,
      expiresAt: null,
      payerWallet: null,
      latestSignature: null,
      explorerUrl: null,
    };
  }

  const payments = await listSolanaPayments();
  const latest = payments.find((payment) => matchesUser(payment, user)) ?? null;

  if (!latest) {
    return {
      active: false,
      planId: null,
      planName: null,
      amountSol: null,
      startsAt: null,
      expiresAt: null,
      payerWallet: null,
      latestSignature: null,
      explorerUrl: null,
    };
  }

  const plan = getSolanaPlan(latest.planId);
  const expiresAt = new Date(latest.expiresAt);
  const active = Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > Date.now();

  return {
    active,
    planId: latest.planId,
    planName: plan?.name ?? latest.planId,
    amountSol: latest.amountSol,
    startsAt: latest.startsAt,
    expiresAt: latest.expiresAt,
    payerWallet: latest.payerWallet,
    latestSignature: latest.signature,
    explorerUrl: latest.explorerUrl,
  };
}

export async function createVerifiedPayment({
  user,
  planId,
  amountSol,
  payerWallet,
  merchantWallet,
  signature,
  cluster,
}: {
  user: User | null;
  planId: SolanaPlanId;
  amountSol: number;
  payerWallet: string;
  merchantWallet: string;
  signature: string;
  cluster: "devnet" | "testnet" | "mainnet-beta";
}) {
  const payments = await readPayments();
  const existing = payments.find((payment) => payment.signature === signature);
  if (existing) {
    return existing;
  }

  const userPayments = payments
    .filter((payment) => matchesUser(payment, user))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const latest = userPayments[0] ?? null;
  const now = new Date();
  const startsAt =
    latest && new Date(latest.expiresAt).getTime() > now.getTime()
      ? new Date(latest.expiresAt)
      : now;
  const expiresAt = addMonths(startsAt, 1);

  const record: SolanaPaymentRecord = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    planId,
    amountSol,
    payerWallet,
    merchantWallet,
    signature,
    cluster,
    startsAt: startsAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    explorerUrl: getSolanaExplorerUrl(signature, cluster),
  };

  payments.push(record);
  await writePayments(payments);
  return record;
}
