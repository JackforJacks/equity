"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Profile = {
  liquid_cash: number;
  real_estate: number;
  pension: number;
  other_assets: number;
  liabilities: number;
};

const EMPTY_PROFILE: Profile = {
  liquid_cash: 0,
  real_estate: 0,
  pension: 0,
  other_assets: 0,
  liabilities: 0,
};

const FIELDS: { key: keyof Profile; label: string; group: "assets" | "liabilities" }[] = [
  { key: "liquid_cash",  label: "Liquid Cash",   group: "assets" },
  { key: "real_estate",  label: "Real Estate",   group: "assets" },
  { key: "pension",      label: "Pension",       group: "assets" },
  { key: "other_assets", label: "Other Assets",  group: "assets" },
  { key: "liabilities",  label: "Liabilities",   group: "liabilities" },
];

export default function Networth() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("financial_profile")
        .select("liquid_cash, real_estate, pension, other_assets, liabilities")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setProfile({ ...EMPTY_PROFILE, ...data });
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
      .upsert({ user_id: user.id, ...profile });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function update(key: keyof Profile, value: string) {
    setProfile(p => ({ ...p, [key]: parseFloat(value) || 0 }));
  }

  const assets = FIELDS.filter(f => f.group === "assets");
  const liabilities = FIELDS.filter(f => f.group === "liabilities");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-black">
      {/* Header */}
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
          <h1 className="text-xl font-semibold text-black dark:text-white">Net Worth</h1>
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
              <Section title="Assets"   fields={assets}   profile={profile} update={update} />
              <Section title="Liabilities" fields={liabilities} profile={profile} update={update} />

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

function Section({ title, fields, profile, update }: {
  title: string;
  fields: { key: keyof Profile; label: string; group: string }[];
  profile: Profile;
  update: (key: keyof Profile, value: string) => void;
}) {
  return (
    <div className="rounded-xl border-2 border-zinc-900 p-6 dark:border-zinc-700">
      <h2 className="mb-4 text-sm font-semibold text-black dark:text-white">{title}</h2>
      <div className="flex flex-col gap-3">
        {fields.map(f => (
          <div key={f.key} className="flex items-center justify-between gap-4">
            <label className="text-sm text-zinc-600 dark:text-zinc-400">{f.label}</label>
            <input
              type="number" min="0" step="any"
              value={profile[f.key] || ""}
              onChange={e => update(f.key, e.target.value)}
              placeholder="0"
              className="w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right text-sm text-black outline-none focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
