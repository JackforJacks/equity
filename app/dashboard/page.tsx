"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type Segment = { label: string; value: number; color: string; grossValue?: number; quantity?: number };

const EMPTY: Segment[] = [{ label: "Empty", value: 100, color: "#e4e4e7" }];

export default function Dashboard() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [currency, setCurrency] = useState("EUR");
  const [country, setCountry] = useState("Italy");
  const [segments, setSegments] = useState<Segment[]>(EMPTY);
  const [holdingSegments, setHoldingSegments] = useState<Segment[]>(EMPTY);
  const [total, setTotal] = useState<number | null>(null);
  const [pnl12m, setPnl12m] = useState<number | null>(null);
  const [historicalRealReturn, setHistoricalRealReturn] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [radii, setRadii] = useState({ height: 200, outer: 180, inner1: 151, inner2: 124 });

  useEffect(() => {
    const measure = () => {
      if (!chartContainerRef.current) return;
      const w = chartContainerRef.current.offsetWidth;
      const outer = Math.floor(w / 2) - 2;
      const inner1 = Math.round(outer * 0.84);
      const inner2 = Math.round(inner1 * 0.82);
      setRadii({ height: outer + 4, outer, inner1, inner2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (chartContainerRef.current) ro.observe(chartContainerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    fetch(`/api/portfolio?country=${country}`)
      .then((r) => r.json())
      .then((data: { segments: Segment[]; holdings: Segment[]; total: number; pnl12m: number | null; historicalRealReturn: number | null }) => {
        if (data.segments?.length > 0) {
          setSegments(data.segments);
          setHoldingSegments(data.holdings?.length > 0 ? data.holdings : EMPTY);
          setTotal(data.total);
          setPnl12m(data.pnl12m ?? null);
          setHistoricalRealReturn(data.historicalRealReturn ?? null);
        }
      })
      .catch(() => {});
  }, [country]);

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
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-black">
      <div className="fixed top-6 right-6 z-10" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black text-black transition-colors hover:bg-zinc-100 dark:border-white dark:text-white dark:hover:bg-zinc-900"
        >
          <span className="text-lg leading-none tracking-tighter">···</span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 bg-white py-2 shadow-md dark:border-zinc-800 dark:bg-zinc-950">
            <div className="px-4 py-2 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Language</span>
                <select className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white">
                  <option>English</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Currency</span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                >
                  <option>EUR</option>
                  <option>USD</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Country</span>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                >
                  <option>Italy</option>
                  <option>USA</option>
                </select>
              </div>
            </div>
            <div className="mx-4 my-2 h-px bg-zinc-100 dark:bg-zinc-800" />
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-left text-sm text-red-500 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              Log out
            </button>
          </div>
        )}
      </div>

      <main className="flex flex-1 flex-col overflow-hidden px-8 py-6">
       <div className="mx-auto flex flex-1 min-h-0 w-1/3 flex-col gap-2">
        <div className="flex flex-col items-center rounded-xl border-2 border-zinc-900 p-5 dark:border-zinc-700">
        <div className="relative w-full" ref={chartContainerRef}>
          <ResponsiveContainer width="100%" height={radii.height}>
            <PieChart>
              {/* Outer ring — individual holdings with gross value */}
              <Pie
                data={holdingSegments}
                dataKey="value"
                nameKey="label"
                startAngle={180}
                endAngle={0}
                cx="50%"
                cy="100%"
                outerRadius={radii.outer}
                innerRadius={radii.inner1}
                paddingAngle={holdingSegments === EMPTY ? 0 : 2}
                fill="#e4e4e7"
                stroke="none"
              >
                {holdingSegments.map((s) => (
                  <Cell key={s.label} fill={s.color} />
                ))}
              </Pie>
              {/* Inner ring — asset types with percentage */}
              <Pie
                data={segments}
                dataKey="value"
                nameKey="label"
                startAngle={180}
                endAngle={0}
                cx="50%"
                cy="100%"
                outerRadius={radii.inner1}
                innerRadius={radii.inner2}
                paddingAngle={isEmpty ? 0 : 2}
                fill="#e4e4e7"
                stroke="none"
              >
                {segments.map((s) => (
                  <Cell key={s.label} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                animationDuration={0}
                content={({ active, payload }) => {
                  if (!active || !payload?.length || payload[0].name === "Empty") return null;
                  const seg = payload[0].payload as Segment;
                  const detail = seg.grossValue != null && seg.quantity != null
                    ? `${seg.quantity} ${payload[0].name} : $${seg.grossValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : seg.grossValue != null
                    ? `$${seg.grossValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `${payload[0].name}: ${payload[0].value}%`;
                  return (
                    <div style={{ borderRadius: "8px", border: "1px solid #e4e4e7", background: "#fff", padding: "6px 12px", fontSize: "13px" }}>
                      {detail}
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
            {total !== null && (
              <p style={{ fontSize: radii.outer * 0.16, fontWeight: 600 }} className="text-black dark:text-white leading-tight">
                {total.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}
              </p>
            )}
            {pnl12m !== null && (
              <>
                <p style={{ fontSize: radii.outer * 0.12, fontWeight: 700 }} className={`leading-tight ${pnl12m >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {pnl12m >= 0 ? "+" : ""}{pnl12m.toFixed(2)}%
                </p>
                <p style={{ fontSize: radii.outer * 0.055 }} className="text-zinc-400">in the last 12 months</p>
              </>
            )}
          </div>
        </div>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-2 [grid-template-rows:repeat(4,minmax(0,1fr))] gap-2">
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className="text-2xl font-bold text-black dark:text-white">—</span>
            <span className="text-xs font-medium text-black dark:text-white">Robustness</span>
            <span className="text-[10px] text-zinc-400">safety + diversification</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className="text-2xl font-bold text-black dark:text-white">—</span>
            <span className="text-xs font-medium text-black dark:text-white">Expected Real Returns</span>
            <span className="text-[10px] text-zinc-400">12-month outlook</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className="text-2xl font-bold text-black dark:text-white">—</span>
            <span className="text-xs font-medium text-black dark:text-white">Quality</span>
            <span className="text-[10px] text-zinc-400">fundamental health</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className="text-2xl font-bold text-black dark:text-white">—</span>
            <span className="text-xs font-medium text-black dark:text-white">Market Correlation</span>
            <span className="text-[10px] text-zinc-400">how you move with markets</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className="text-2xl font-bold text-black dark:text-white">—</span>
            <span className="text-xs font-medium text-black dark:text-white">Return on Risk</span>
            <span className="text-[10px] text-zinc-400">return per unit of risk</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className="text-2xl font-bold text-black dark:text-white">—</span>
            <span className="text-xs font-medium text-black dark:text-white">Edge on Market</span>
            <span className="text-[10px] text-zinc-400">return above the S&P 500</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className="text-2xl font-bold text-black dark:text-white">—</span>
            <span className="text-xs font-medium text-black dark:text-white">Expected Drawdown</span>
            <span className="text-[10px] text-zinc-400">worst-case projected drop</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className={`text-2xl font-bold ${historicalRealReturn === null ? "text-black dark:text-white" : historicalRealReturn >= 0 ? "text-green-600" : "text-red-500"}`}>
              {historicalRealReturn === null ? "—" : `${historicalRealReturn >= 0 ? "+" : ""}${historicalRealReturn.toFixed(2)}%`}
            </span>
            <span className="text-xs font-medium text-black dark:text-white">Historical Real Returns</span>
            <span className="text-[10px] text-zinc-400">past return after inflation</span>
          </div>
        </div>
       </div>
      </main>

      <button className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-lg transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 256 256" fill="currentColor">
          <path d="M200,48H136V16a8,8,0,0,0-16,0V48H56A32,32,0,0,0,24,80V192a32,32,0,0,0,32,32H200a32,32,0,0,0,32-32V80A32,32,0,0,0,200,48ZM96,144a16,16,0,1,1,16-16A16,16,0,0,1,96,144Zm64,0a16,16,0,1,1,16-16A16,16,0,0,1,160,144Zm-96,48a8,8,0,0,1,0-16h96a8,8,0,0,1,0,16ZM72,80h16a8,8,0,0,1,0,16H72a8,8,0,0,1,0-16Zm96,0h16a8,8,0,0,1,0,16H168a8,8,0,0,1,0-16Z"/>
        </svg>
      </button>
    </div>
  );
}
