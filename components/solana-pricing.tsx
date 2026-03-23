"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

type BillingPlan = {
  id: string;
  name: string;
  amountSol: number;
  monthlyLabel: string;
  description: string;
  features: string[];
};

type BillingConfigResponse = {
  notes?: string[];
  plans?: BillingPlan[];
};

type SolanaPricingProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  className?: string;
};

const FALLBACK_PLANS: BillingPlan[] = [
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

const FALLBACK_NOTES = [
  "Direct wallet transfers are manual monthly renewals, not automatic recurring charges.",
  "Prices are fixed in SOL, so the fiat value moves as SOL moves.",
];

const PAYMENT_STEPS = [
  {
    step: "01",
    title: "Choose the monthly tier",
    copy: "Select Starter, Growth, or Scale based on how much operator capacity you need.",
  },
  {
    step: "02",
    title: "Pay from a Solana wallet",
    copy: "Friday uses a direct wallet transfer flow with Phantom or another injected wallet.",
  },
  {
    step: "03",
    title: "Verification unlocks access",
    copy: "The transfer is verified on-chain and the monthly access window is applied to the account.",
  },
];

function getPlanBadge(planId: string) {
  if (planId === "starter") {
    return "Lean entry";
  }

  if (planId === "growth") {
    return "Most chosen";
  }

  return "High capacity";
}

export function SolanaPricing({
  eyebrow = "Billing",
  title = "Pay monthly with Solana",
  description = "Choose a monthly plan, pay from a Solana wallet, and activate access through a direct verified transfer.",
  className = "",
}: SolanaPricingProps) {
  const [plans, setPlans] = useState<BillingPlan[]>(FALLBACK_PLANS);
  const [notes, setNotes] = useState<string[]>(FALLBACK_NOTES);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/payments/solana/config")
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as BillingConfigResponse;
      })
      .then((data) => {
        if (cancelled || !data) {
          return;
        }

        if (Array.isArray(data.plans) && data.plans.length > 0) {
          setPlans(data.plans);
        }

        if (Array.isArray(data.notes) && data.notes.length > 0) {
          setNotes(data.notes);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className={`relative overflow-hidden rounded-[36px] border border-white/10 bg-[#0a0a0a] text-white shadow-[0_36px_120px_rgba(0,0,0,0.4)] ${className}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,94,0,0.26),transparent_28%),radial-gradient(circle_at_86%_14%,rgba(255,138,61,0.16),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0)_22%),linear-gradient(135deg,#080808_0%,#0b0b0b_52%,#101010_100%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ff8a3d]/80 to-transparent" />
      <div className="absolute left-8 top-8 h-24 w-24 rounded-full border border-white/6" />
      <div className="absolute right-10 top-10 h-28 w-28 rounded-full bg-[#ff5e00]/8 blur-3xl" />

      <div className="relative p-7 md:p-8 lg:p-10">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] lg:items-end">
          <div className="max-w-[760px]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff8a3d]">
              {eyebrow}
            </div>
            <h3 className="mt-4 max-w-[12ch] text-[clamp(2.2rem,4.2vw,4.4rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-white">
              {title}
            </h3>
            <p className="mt-5 max-w-[50rem] text-[1rem] leading-[1.85] text-white/54">
              {description}
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/38">
                  Pricing stack
                </div>
                <div className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">
                  {plans.length} wallet-led tiers
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/38">
                  Billing mode
                </div>
                <div className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">
                  Direct on-chain transfer
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/38">
                  Renewal logic
                </div>
                <div className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">
                  Manual monthly reset
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-black/20 p-5 backdrop-blur-sm">
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/38">
              How payment works
            </div>

            <div className="mt-5 space-y-3">
              {PAYMENT_STEPS.map((item) => (
                <div
                  key={item.step}
                  className="flex gap-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ff8a3d]/24 bg-[#ff8a3d]/10 text-sm font-semibold tracking-[0.12em] text-[#ffb075]">
                    {item.step}
                  </div>
                  <div>
                    <div className="text-base font-semibold tracking-[-0.03em] text-white">
                      {item.title}
                    </div>
                    <p className="mt-2 text-sm leading-7 text-white/56">
                      {item.copy}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/38">
                Billing notes
              </div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-white/56">
                {notes.map((note) => (
                  <div key={note}>{note}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const isFeatured = plan.id === "growth";

            return (
              <div
                key={plan.id}
                className={`group relative flex h-full flex-col overflow-hidden rounded-[30px] border p-[1px] transition duration-300 ${
                  isFeatured
                    ? "border-[#ff8a3d]/40 bg-[linear-gradient(180deg,rgba(255,138,61,0.32),rgba(255,138,61,0.06)_18%,rgba(255,255,255,0.05)_48%,rgba(255,255,255,0.02)_100%)] shadow-[0_24px_80px_rgba(255,94,0,0.16)]"
                    : "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_20%,rgba(255,255,255,0.01)_100%)] hover:-translate-y-1 hover:border-white/16"
                }`}
              >
                <div
                  className={`relative flex h-full flex-col rounded-[29px] p-5 ${
                    isFeatured
                      ? "bg-[linear-gradient(180deg,rgba(24,13,7,0.96)_0%,rgba(16,16,16,0.98)_100%)]"
                      : "bg-[linear-gradient(180deg,rgba(18,18,18,0.98)_0%,rgba(14,14,14,0.98)_100%)]"
                  }`}
                >
                  <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-[#ff8a3d]">
                        {plan.monthlyLabel}
                      </div>
                      <div className="mt-4 text-[1.7rem] font-semibold tracking-[-0.06em] text-white">
                        {plan.name}
                      </div>
                    </div>

                    <div
                      className={`rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${
                        isFeatured
                          ? "border border-[#ff8a3d]/30 bg-[#ff8a3d]/12 text-[#ffb075]"
                          : "border border-white/10 bg-white/[0.04] text-white/48"
                      }`}
                    >
                      {getPlanBadge(plan.id)}
                    </div>
                  </div>

                  <div className="mt-8 flex items-end gap-2">
                    <div className="text-[3.2rem] font-semibold leading-none tracking-[-0.09em] text-white">
                      {plan.amountSol}
                    </div>
                    <div className="pb-1 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-white/36">
                      SOL / month
                    </div>
                  </div>

                  <p className="mt-5 min-h-[96px] text-[0.96rem] leading-8 text-white/52">
                    {plan.description}
                  </p>

                  <div className="mt-6 space-y-3 border-t border-white/8 pt-5">
                    {plan.features.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-start gap-3 text-sm leading-6 text-white/64"
                      >
                        <CheckCircle2 size={15} className="mt-1 shrink-0 text-[#ff8a3d]" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
