import { NextResponse } from "next/server";

import {
  SOLANA_PLANS,
  getPlanAmountLamports,
  getSolanaCluster,
  getSolanaMerchantWallet,
  getSolanaRpcUrl,
  isMerchantWalletValid,
  summarizeWallet,
} from "@/lib/payments/solana";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const merchantWallet = getSolanaMerchantWallet();
  const configured = isMerchantWalletValid(merchantWallet);

  return NextResponse.json({
    configured,
    cluster: getSolanaCluster(),
    rpcUrl: getSolanaRpcUrl(),
    merchantWallet: configured ? merchantWallet : null,
    merchantWalletSummary:
      configured && merchantWallet ? summarizeWallet(merchantWallet) : null,
    billingModel: "manual-monthly",
    plans: SOLANA_PLANS.map((plan) => ({
      ...plan,
      amountLamports: getPlanAmountLamports(plan),
    })),
    notes: [
      "Direct wallet transfers are manual monthly renewals, not automatic recurring charges.",
      "Prices are fixed in SOL, so the fiat value will move as SOL moves.",
    ],
  });
}
