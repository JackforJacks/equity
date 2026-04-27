"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ChatCircleText } from "@phosphor-icons/react";

const CX = 150, CY = 150, R = 125, INNER = 78, GAP = 0.015;

const portfolioData = [
  { label: "Stocks", value: 40, color: "#1D4ED8" },
  { label: "ETF",    value: 25, color: "#059669" },
  { label: "Crypto", value: 20, color: "#F59E0B" },
  { label: "Bonds",  value: 15, color: "#6B7280" },
];

function pt(radius: number, t: number) {
  const a = Math.PI * (1 - t);
  return { x: CX + radius * Math.cos(a), y: CY - radius * Math.sin(a) };
}

function arcPath(t0: number, t1: number) {
  const g0 = t0 + GAP / 2, g1 = t1 - GAP / 2;
  const os = pt(R, g0), oe = pt(R, g1);
  const ie = pt(INNER, g1), is_ = pt(INNER, g0);
  const la = g1 - g0 > 0.5 ? 1 : 0;
  return `M ${os.x} ${os.y} A ${R} ${R} 0 ${la} 0 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${INNER} ${INNER} 0 ${la} 1 ${is_.x} ${is_.y} Z`;
}

let cum = 0;
const segments = portfolioData.map(d => {
  const t0 = cum / 100;
  cum += d.value;
  return { ...d, t0, t1: cum / 100 };
});

export default function Dashboard() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

      <main className="flex flex-1 flex-col items-center gap-8 px-8 py-16">
        <div className="flex flex-col items-center gap-6">
          <svg viewBox="0 0 300 155" className="w-72 sm:w-96" overflow="visible">
            {segments.map((s) => (
              <path key={s.label} d={arcPath(s.t0, s.t1)} fill={s.color} />
            ))}
          </svg>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {portfolioData.map((d) => (
              <div key={d.label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{d.label}</span>
                <span className="text-sm font-medium text-black dark:text-white">{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <button className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-lg transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
        <ChatCircleText size={28} weight="fill" />
      </button>
    </div>
  );
}
