"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
};

export default function Goals() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGoal, setEditGoal] = useState<Partial<Goal>>({});

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const supabase = createClient();

  async function fetchGoals() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("goals")
      .select("id, name, target_amount, target_date")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setGoals(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchGoals(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated"); setSubmitting(false); return; }
    const { error: err } = await supabase.from("goals").insert({
      user_id: user.id,
      name: name.trim(),
      type: "Other",
      target_amount: parseFloat(targetAmount),
      target_date: targetDate ? `${targetDate}-01` : null,
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    setName(""); setTargetAmount(""); setTargetDate("");
    fetchGoals();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await supabase.from("goals").delete().eq("id", id);
    setDeletingId(null);
    setGoals(g => g.filter(x => x.id !== id));
  }

  function startEdit(g: Goal) {
    setEditingId(g.id);
    setEditGoal({ ...g, target_date: g.target_date ? g.target_date.slice(0, 7) : null });
  }

  async function handleSaveEdit(id: string) {
    await supabase.from("goals").update({
      name: editGoal.name,
      target_amount: editGoal.target_amount,
      target_date: editGoal.target_date ? `${editGoal.target_date}-01` : null,
    }).eq("id", id);
    setEditingId(null);
    fetchGoals();
  }

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
          <h1 className="text-xl font-semibold text-black dark:text-white">Goals</h1>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-8 py-6">
        <div className="flex w-1/3 flex-col gap-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-800 dark:border-t-white" />
            </div>
          ) : goals.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-400">No goals yet. Add your first one below.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {goals.map((g) => {
                const isEditing = editingId === g.id;
                return (
                  <div key={g.id} className="rounded-xl border-2 border-zinc-900 p-4 dark:border-zinc-700">
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <input
                          value={editGoal.name ?? ""} onChange={e => setEditGoal({ ...editGoal, name: e.target.value })}
                          placeholder="Goal name"
                          className="rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                        />
                        <div className="flex gap-2">
                          <input
                            type="number" placeholder="Target Amount"
                            value={editGoal.target_amount ?? ""} onChange={e => setEditGoal({ ...editGoal, target_amount: parseFloat(e.target.value) || 0 })}
                            className="flex-1 rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                          />
                          <input
                            type="month"
                            value={editGoal.target_date ?? ""} onChange={e => setEditGoal({ ...editGoal, target_date: e.target.value })}
                            className="rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleSaveEdit(g.id)} className="text-green-600 hover:text-green-700">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/></svg>
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-zinc-400 hover:text-zinc-600">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-1 flex-col gap-0.5">
                          <span className="text-sm font-semibold text-black dark:text-white">{g.name}</span>
                          <span className="text-xs text-zinc-500">
                            {fmt(Number(g.target_amount))}
                            {g.target_date && ` · by ${g.target_date.slice(0, 7)}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(g)} className="text-zinc-400 hover:text-black dark:hover:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/></svg>
                          </button>
                          <button onClick={() => handleDelete(g.id)} disabled={deletingId === g.id} className="text-zinc-400 hover:text-red-500 disabled:opacity-40">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add goal form */}
          <div className="rounded-xl border-2 border-zinc-900 p-6 dark:border-zinc-700">
            <h2 className="mb-4 text-sm font-semibold text-black dark:text-white">Add goal</h2>
            <form onSubmit={handleAdd} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-500">Name</label>
                <input
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder="House down payment"
                  required
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-500">Target Amount</label>
                  <input
                    type="number" min="0" step="any" required
                    value={targetAmount} onChange={e => setTargetAmount(e.target.value)}
                    placeholder="50000"
                    className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-500">Desired Timeline</label>
                  <input
                    type="month"
                    value={targetDate} onChange={e => setTargetDate(e.target.value)}
                    className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="submit" disabled={submitting}
                className="h-10 rounded-full bg-black text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {submitting ? "Adding..." : "Add goal"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
