"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const INCOME_TYPES   = ["Salary", "Freelance", "Business", "Dividends", "Rental", "Pension", "Other"];
const EXPENSE_TYPES  = ["Housing", "Food", "Transportation", "Utilities", "Insurance", "Healthcare", "Subscriptions", "Entertainment", "Education", "Personal", "Other"];

type Entry = { id: string; type: string; amount: number };

export default function CashflowPage() {
  const router = useRouter();
  const [income, setIncome] = useState<Entry[]>([]);
  const [expenses, setExpenses] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [incRes, expRes] = await Promise.all([
      supabase.from("income_sources").select("id, type, amount").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("monthly_expenses").select("id, type, amount").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    setIncome(incRes.data ?? []);
    setExpenses(expRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  const totalIncome = income.reduce((s, e) => s + Number(e.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const savings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : null;
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

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
            <>
              <Section
                title="Income Sources"
                table="income_sources"
                types={INCOME_TYPES}
                entries={income}
                onChange={loadAll}
                supabase={supabase}
              />
              <Section
                title="Monthly Expenses"
                table="monthly_expenses"
                types={EXPENSE_TYPES}
                entries={expenses}
                onChange={loadAll}
                supabase={supabase}
              />

              {/* Summary */}
              <div className="rounded-xl border-2 border-zinc-900 p-6 dark:border-zinc-700">
                <div className="flex flex-col gap-2 text-sm">
                  <Row label="Total Income"   value={fmt(totalIncome)} />
                  <Row label="Total Expenses" value={fmt(totalExpenses)} />
                  <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                  <Row
                    label="Monthly Savings"
                    value={fmt(savings)}
                    valueClass={savings >= 0 ? "text-green-600" : "text-red-500"}
                  />
                  <Row
                    label="Savings Rate"
                    value={savingsRate === null ? "—" : `${savingsRate.toFixed(1)}%`}
                    valueClass={savingsRate === null ? "" : savingsRate >= 20 ? "text-green-600" : savingsRate >= 10 ? "text-yellow-500" : "text-red-500"}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className={`font-medium text-black dark:text-white ${valueClass}`}>{value}</span>
    </div>
  );
}

type SupabaseClient = ReturnType<typeof createClient>;

function Section({
  title, table, types, entries, onChange, supabase,
}: {
  title: string;
  table: string;
  types: string[];
  entries: Entry[];
  onChange: () => void;
  supabase: SupabaseClient;
}) {
  const [type, setType] = useState(types[0]);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSubmitting(false); return; }
    await supabase.from(table).insert({ user_id: user.id, type, amount: parseFloat(amount) });
    setAmount("");
    setType(types[0]);
    setSubmitting(false);
    onChange();
  }

  async function handleDelete(id: string) {
    await supabase.from(table).delete().eq("id", id);
    onChange();
  }

  return (
    <div className="rounded-xl border-2 border-zinc-900 p-6 dark:border-zinc-700">
      <h2 className="mb-4 text-sm font-semibold text-black dark:text-white">{title}</h2>

      {entries.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{e.type}</span>
              <span className="ml-auto font-medium text-black dark:text-white">
                {Number(e.amount).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
              </span>
              <button onClick={() => handleDelete(e.id)} className="text-zinc-400 transition-colors hover:text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <select
          value={type} onChange={(e) => setType(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
        >
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
        <input
          type="number" min="0" step="any" required
          value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="w-32 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
        />
        <button
          type="submit" disabled={submitting}
          className="h-10 w-10 shrink-0 rounded-full bg-black text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >+</button>
      </form>
    </div>
  );
}
