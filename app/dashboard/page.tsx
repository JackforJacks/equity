"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { PieChart, Pie, Tooltip, ResponsiveContainer } from "recharts";

type Segment = { label: string; value: number; color: string };

const EMPTY: Segment[] = [{ label: "Empty", value: 100, color: "#e4e4e7" }];

export default function Dashboard() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [segments, setSegments] = useState<Segment[]>(EMPTY);
  const [total, setTotal] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((data: { segments: Segment[]; total: number }) => {
        if (data.segments?.length > 0) {
          setSegments(data.segments);
          setTotal(data.total);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  const isEmpty = segments === EMPTY;

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-black">
      <div className="fixed top-6 right-6 z-10" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black text-black transition-colors hover:bg-zinc-100 dark:border-white dark:text-white dark:hover:bg-zinc-900"
        >
          <span className="text-lg leading-none tracking-tighter">···</span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-40 rounded-xl border border-zinc-200 bg-white py-1 shadow-md dark:border-zinc-800 dark:bg-zinc-950">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              Log out
            </button>
          </div>
        )}
      </div>

      <main className="flex flex-1 flex-col items-center px-8 py-16">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="label"
              startAngle={180}
              endAngle={0}
              cx="50%"
              cy="100%"
              outerRadius={220}
              innerRadius={130}
              paddingAngle={isEmpty ? 0 : 2}
              fill="#e4e4e7"
            >
              {segments.map((s) => (
                <rect key={s.label} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length || payload[0].name === "Empty") return null;
                return (
                  <div style={{ borderRadius: "8px", border: "1px solid #e4e4e7", background: "#fff", padding: "6px 12px", fontSize: "13px" }}>
                    {payload[0].name}: {payload[0].value}%
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {total !== null && (
          <p className="mt-2 text-2xl font-semibold text-black dark:text-white">
            {total.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}
          </p>
        )}
      </main>

      <button className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-lg transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 256 256" fill="currentColor">
          <path d="M200,48H136V16a8,8,0,0,0-16,0V48H56A32,32,0,0,0,24,80V192a32,32,0,0,0,32,32H200a32,32,0,0,0,32-32V80A32,32,0,0,0,200,48ZM96,144a16,16,0,1,1,16-16A16,16,0,0,1,96,144Zm64,0a16,16,0,1,1,16-16A16,16,0,0,1,160,144Zm-96,48a8,8,0,0,1,0-16h96a8,8,0,0,1,0,16ZM72,80h16a8,8,0,0,1,0,16H72a8,8,0,0,1,0-16Zm96,0h16a8,8,0,0,1,0,16H168a8,8,0,0,1,0-16Z"/>
        </svg>
      </button>
    </div>
  );
}
