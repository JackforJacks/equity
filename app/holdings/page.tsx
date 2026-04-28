"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const ASSET_TYPES = ["Stock", "ETF", "Crypto", "Bond", "Fund", "Other"];

type Holding = {
  id: string;
  isin: string;
  quantity: number;
  purchase_date: string;
  type: string;
};

export default function Holdings() {
  const router = useRouter();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [isin, setIsin] = useState("");
  const [quantity, setQuantity] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [type, setType] = useState("Stock");

  const supabase = createClient();

  async function fetchHoldings() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("portfolio_holdings")
      .select("id, isin, quantity, purchase_date, type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setHoldings(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchHoldings(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated"); setSubmitting(false); return; }
    const { error: err } = await supabase.from("portfolio_holdings").insert({
      user_id: user.id,
      isin: isin.trim().toUpperCase(),
      quantity: parseFloat(quantity),
      purchase_date: purchaseDate,
      type,
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    setIsin(""); setQuantity(""); setPurchaseDate(""); setType("Stock");
    fetchHoldings();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await supabase.from("portfolio_holdings").delete().eq("id", id);
    setDeletingId(null);
    setHoldings(h => h.filter(x => x.id !== id));
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-black">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-zinc-100 px-8 py-5 dark:border-zinc-900">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-black text-black transition-colors hover:bg-zinc-100 dark:border-white dark:text-white dark:hover:bg-zinc-900"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
            <path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z"/>
          </svg>
        </button>
        <h1 className="text-xl font-semibold text-black dark:text-white">Holdings</h1>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-8 py-6">
        {/* Holdings table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-800 dark:border-t-white" />
          </div>
        ) : holdings.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-400">No holdings yet. Add your first one below.</p>
        ) : (
          <div className="rounded-xl border-2 border-zinc-900 overflow-hidden dark:border-zinc-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-zinc-900 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">ISIN</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Quantity</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Purchase Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, i) => (
                  <tr key={h.id} className={i < holdings.length - 1 ? "border-b border-zinc-100 dark:border-zinc-900" : ""}>
                    <td className="px-4 py-3 font-mono text-xs text-black dark:text-white">{h.isin}</td>
                    <td className="px-4 py-3 text-black dark:text-white">{h.quantity}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{h.type}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{h.purchase_date}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(h.id)}
                        disabled={deletingId === h.id}
                        className="text-zinc-400 transition-colors hover:text-red-500 disabled:opacity-40"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                          <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add holding form */}
        <div className="rounded-xl border-2 border-zinc-900 p-6 dark:border-zinc-700">
          <h2 className="mb-4 text-sm font-semibold text-black dark:text-white">Add holding</h2>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-500">ISIN</label>
                <input
                  value={isin} onChange={e => setIsin(e.target.value)}
                  placeholder="US0378331005"
                  required
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-3 font-mono text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-500">Quantity</label>
                <input
                  type="number" min="0.0001" step="any"
                  value={quantity} onChange={e => setQuantity(e.target.value)}
                  placeholder="10"
                  required
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-500">Type</label>
                <select
                  value={type} onChange={e => setType(e.target.value)}
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
                >
                  {ASSET_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-500">Purchase Date</label>
                <input
                  type="date"
                  value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
                  required
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit" disabled={submitting}
              className="h-10 rounded-full bg-black text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {submitting ? "Adding..." : "Add holding"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
