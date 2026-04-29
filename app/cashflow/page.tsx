"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Cashflow = {
  monthly_income: number;
  monthly_expenses: number;
};

const EMPTY: Cashflow = { monthly_income: 0, monthly_expenses: 0 };

export default function CashflowPage() {
  const router = useRouter();
  const [data, setData] = useState<Cashflow>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: row } = await supabase
        .from("financial_profile")
        .select("monthly_income, monthly_expenses")
        .eq("user_id", user.id)
        .maybeSingle();
      if (row) setData({ ...EMPTY, ...row });
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated"); setSaving(false); return; }
    const { error: err } = await supabase
      .from("financial_profile")
      .upsert({ user_id: user.id, ...data });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function update(key: keyof Cashflow, value: string) {
    setData(d => ({ ...d, [key]: parseFloat(value) || 0 }));
  }

  const savings = data.monthly_income - data.monthly_expenses;
  const savingsRate = data.monthly_income > 0 ? (savings / data.monthly_income) * 100 : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-black">
      <div className="flex items-center justify-center border-b border-zinc-100 px-8 py-5 dark:border-zinc-900">
        <div className="flex w-1/3 items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-black text-black transition-colors hover:bg-zinc-100 dark:border-white dark:text-white dark:hover:bg-zinc-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
              <path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z"/>
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-black dark:text-white">Cashflow</h1>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-8 py-6">
        <div className="flex w-1/3 flex-col gap-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-800 dark:border-t-white" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-6">
              <div className="rounded-xl border-2 border-zinc-900 p-6 dark:border-zinc-700">
                <h2 className="mb-4 text-sm font-semibold text-black dark:text-white">Monthly Cashflow</h2>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-sm text-zinc-600 dark:text-zinc-400">Monthly Income</label>
                    <input
                      type="number" min="0" step="any"
                      value={data.monthly_income || ""}
                      onChange={e => update("monthly_income", e.target.value)}
                      placeholder="0"
                      className="w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-sm text-zinc-600 dark:text-zinc-400">Monthly Expenses</label>
                    <input
                      type="number" min="0" step="any"
                      value={data.monthly_expenses || ""}
                      onChange={e => update("monthly_expenses", e.target.value)}
                      placeholder="0"
                      className="w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
                    />
                  </div>
                </div>

                {data.monthly_income > 0 && (
                  <div className="mt-6 flex flex-col gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400">Monthly Savings</span>
                      <span className={`font-medium ${savings >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {savings.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400">Savings Rate</span>
                      <span className={`font-medium ${savingsRate === null ? "" : savingsRate >= 20 ? "text-green-600" : savingsRate >= 10 ? "text-yellow-500" : "text-red-500"}`}>
                        {savingsRate === null ? "—" : `${savingsRate.toFixed(1)}%`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex items-center gap-3">
                <button
                  type="submit" disabled={saving}
                  className="h-10 flex-1 rounded-full bg-black text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                {saved && <span className="text-sm text-green-600">✓ Saved</span>}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
