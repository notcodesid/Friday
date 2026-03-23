import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

import { requireSession } from "@/lib/auth/session";
import {
  getPlanAmountLamports,
  getSolanaCluster,
  getSolanaMerchantWallet,
  getSolanaPlan,
  getSolanaRpcUrl,
  isMerchantWalletValid,
  type SolanaPlanId,
} from "@/lib/payments/solana";
import {
  createVerifiedPayment,
  getCurrentSubscription,
} from "@/lib/payments/store";

export const runtime = "nodejs";
export const maxDuration = 60;

type VerifyRequestBody = {
  signature?: string;
  planId?: string;
  payerWallet?: string;
};

export async function POST(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: VerifyRequestBody;
  try {
    body = (await request.json()) as VerifyRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const signature = body.signature?.trim();
  const planId = body.planId?.trim();
  const payerWallet = body.payerWallet?.trim();

  if (!signature || !planId || !payerWallet) {
    return NextResponse.json(
      { error: "Missing signature, planId, or payerWallet." },
      { status: 400 },
    );
  }

  const plan = getSolanaPlan(planId);
  if (!plan) {
    return NextResponse.json({ error: "Unknown billing plan." }, { status: 400 });
  }

  const merchantWallet = getSolanaMerchantWallet();
  if (!merchantWallet || !isMerchantWalletValid(merchantWallet)) {
    return NextResponse.json(
      { error: "Merchant wallet is not configured." },
      { status: 500 },
    );
  }

  try {
    new PublicKey(payerWallet);
  } catch {
    return NextResponse.json({ error: "Payer wallet is invalid." }, { status: 400 });
  }

  const connection = new Connection(getSolanaRpcUrl(), "confirmed");
  const parsedTransaction = await connection.getParsedTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!parsedTransaction) {
    return NextResponse.json(
      { error: "Transaction was not found on the configured Solana RPC." },
      { status: 404 },
    );
  }

  if (parsedTransaction.meta?.err) {
    return NextResponse.json(
      { error: "Transaction failed on-chain and cannot be accepted." },
      { status: 400 },
    );
  }

  const expectedLamports = getPlanAmountLamports(plan);
  const paymentInstruction = parsedTransaction.transaction.message.instructions.find(
    (instruction) => {
      if (!("parsed" in instruction) || instruction.program !== "system") {
        return false;
      }

      const parsed = instruction.parsed as
        | {
            type?: string;
            info?: {
              source?: string;
              destination?: string;
              lamports?: number | string;
            };
          }
        | undefined;

      if (parsed?.type !== "transfer") {
        return false;
      }

      const lamports = Number(parsed.info?.lamports ?? 0);
      return (
        parsed.info?.source === payerWallet &&
        parsed.info?.destination === merchantWallet &&
        lamports >= expectedLamports
      );
    },
  );

  if (!paymentInstruction) {
    return NextResponse.json(
      {
        error:
          "The transaction does not match the expected payment amount or destination wallet.",
      },
      { status: 400 },
    );
  }

  const payment = await createVerifiedPayment({
    user: auth.user,
    planId: plan.id as SolanaPlanId,
    amountSol: plan.amountSol,
    payerWallet,
    merchantWallet,
    signature,
    cluster: getSolanaCluster(),
  });
  const subscription = await getCurrentSubscription(auth.user);

  return NextResponse.json({
    payment,
    subscription,
  });
}
