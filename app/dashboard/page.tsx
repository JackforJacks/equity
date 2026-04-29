"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type Segment = { label: string; value: number; color: string; grossValue?: number; quantity?: number };

const INCOME_COLORS: Record<string, string> = {
  Salary:    "#1D4ED8",
  Freelance: "#7C3AED",
  Business:  "#D97706",
  Dividends: "#059669",
  Rental:    "#EA580C",
  Pension:   "#0891B2",
  Other:     "#6B7280",
};

const EXPENSE_COLORS: Record<string, string> = {
  Housing:        "#DC2626",
  Food:           "#F97316",
  Transportation: "#EAB308",
  Utilities:      "#06B6D4",
  Insurance:      "#6366F1",
  Healthcare:     "#EC4899",
  Subscriptions:  "#14B8A6",
  Entertainment:  "#84CC16",
  Education:      "#0EA5E9",
  Personal:       "#F43F5E",
  Other:          "#6B7280",
};

const EMPTY: Segment[] = [{ label: "Empty", value: 100, color: "#e4e4e7" }];

export default function Dashboard() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [currency, setCurrency] = useState("EUR");
  const [country, setCountry] = useState("Italy");
  const [benchmark, setBenchmark] = useState("S&P 500");
  const [loading, setLoading] = useState(true);
  const [segments, setSegments] = useState<Segment[]>(EMPTY);
  const [holdingSegments, setHoldingSegments] = useState<Segment[]>(EMPTY);
  const [total, setTotal] = useState<number | null>(null);
  const [pnl12m, setPnl12m] = useState<number | null>(null);
  const [historicalRealReturn, setHistoricalRealReturn] = useState<number | null>(null);
  const [edgeOnBenchmark, setEdgeOnBenchmark] = useState<number | null>(null);
  const [benchmarkCorrelation, setBenchmarkCorrelation] = useState<number | null>(null);
  const [returnOnRisk, setReturnOnRisk] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | null>(null);
  const [robustness, setRobustness] = useState<number | null>(null);
  const [expectedDrawdown, setExpectedDrawdown] = useState<number | null>(null);
  const [expectedRealReturn, setExpectedRealReturn] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [radii, setRadii] = useState({ height: 200, outer: 180, inner1: 151, inner2: 124 });
  const wealthChartRef = useRef<HTMLDivElement>(null);
  const [wealthRadii, setWealthRadii] = useState({ height: 200, outer: 180, inner1: 151, inner2: 124 });
  const [profile, setProfile] = useState<{
    monthly_income: number; monthly_expenses: number;
    liquid_cash: number; real_estate: number; pension: number; other_assets: number;
    liabilities: number;
  } | null>(null);
  const [incomeEntries, setIncomeEntries] = useState<{ type: string; amount: number }[]>([]);
  const [expenseEntries, setExpenseEntries] = useState<{ type: string; amount: number }[]>([]);

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
    async function loadProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [profileRes, incomeRes, expenseRes] = await Promise.all([
        supabase.from("financial_profile").select("liquid_cash, real_estate, pension, other_assets, liabilities").eq("user_id", user.id).maybeSingle(),
        supabase.from("income_sources").select("type, amount").eq("user_id", user.id),
        supabase.from("monthly_expenses").select("type, amount").eq("user_id", user.id),
      ]);
      const incomeRows = (incomeRes.data ?? []) as { type: string; amount: number }[];
      const expenseRows = (expenseRes.data ?? []) as { type: string; amount: number }[];
      setIncomeEntries(incomeRows);
      setExpenseEntries(expenseRows);
      const monthly_income = incomeRows.reduce((s, r) => s + Number(r.amount), 0);
      const monthly_expenses = expenseRows.reduce((s, r) => s + Number(r.amount), 0);
      setProfile({
        monthly_income, monthly_expenses,
        liquid_cash: profileRes.data?.liquid_cash ?? 0,
        real_estate: profileRes.data?.real_estate ?? 0,
        pension: profileRes.data?.pension ?? 0,
        other_assets: profileRes.data?.other_assets ?? 0,
        liabilities: profileRes.data?.liabilities ?? 0,
      });
    }
    loadProfile();
  }, []);

  useEffect(() => {
    const measure = () => {
      if (!wealthChartRef.current) return;
      const w = wealthChartRef.current.offsetWidth;
      const outer = Math.floor(w / 2) - 2;
      const inner1 = Math.round(outer * 0.84);
      const inner2 = Math.round(inner1 * 0.82);
      setWealthRadii({ height: outer + 4, outer, inner1, inner2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wealthChartRef.current) ro.observe(wealthChartRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    fetch(`/api/portfolio?country=${encodeURIComponent(country)}&benchmark=${encodeURIComponent(benchmark)}`)
      .then((r) => r.json())
      .then((data: { segments: Segment[]; holdings: Segment[]; total: number; pnl12m: number | null; historicalRealReturn: number | null; edgeOnBenchmark: number | null; benchmarkCorrelation: number | null; returnOnRisk: number | null; quality: number | null; robustness: number | null; expectedDrawdown: number | null; expectedRealReturn: number | null }) => {
        if (data.segments?.length > 0) {
          setSegments(data.segments);
          setHoldingSegments(data.holdings?.length > 0 ? data.holdings : EMPTY);
          setTotal(data.total);
          setPnl12m(data.pnl12m ?? null);
          setHistoricalRealReturn(data.historicalRealReturn ?? null);
          setEdgeOnBenchmark(data.edgeOnBenchmark ?? null);
          setBenchmarkCorrelation(data.benchmarkCorrelation ?? null);
          setReturnOnRisk(data.returnOnRisk ?? null);
          setQuality(data.quality ?? null);
          setRobustness(data.robustness ?? null);
          setExpectedDrawdown(data.expectedDrawdown ?? null);
          setExpectedRealReturn(data.expectedRealReturn ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [country, benchmark]);

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


  // Wealth computations
  const investments = total ?? 0;
  const liquidCash = profile?.liquid_cash ?? 0;
  const realEstate = profile?.real_estate ?? 0;
  const pension    = profile?.pension ?? 0;
  const otherAsset = profile?.other_assets ?? 0;
  const liabilitiesV = profile?.liabilities ?? 0;
  const totalAssets = liquidCash + investments + realEstate + pension + otherAsset;
  const netWorth = totalAssets - liabilitiesV;
  const hasWealthData = totalAssets > 0 || liabilitiesV > 0;

  const wealthAssets = hasWealthData ? [
    { label: "Liquid Cash",  value: liquidCash, color: "#10B981" },
    { label: "Investments", value: investments, color: "#1D4ED8" },
    { label: "Real Estate", value: realEstate, color: "#F59E0B" },
    { label: "Pension",     value: pension,    color: "#8B5CF6" },
    { label: "Other",       value: otherAsset, color: "#6B7280" },
  ].filter(a => a.value > 0) : [{ label: "Empty", value: 1, color: "#e4e4e7" }];

  // Liabilities ring: red segment proportional to liabilities/totalAssets, rest empty
  const wealthLiabs = (liabilitiesV > 0 && totalAssets > 0)
    ? [
        { label: "Liabilities", value: Math.min(liabilitiesV, totalAssets), color: "#EF4444" },
        { label: "Empty", value: Math.max(0, totalAssets - liabilitiesV), color: "transparent" },
      ]
    : [{ label: "Empty", value: 1, color: "#e4e4e7" }];

  // Cashflow computations
  const income = profile?.monthly_income ?? 0;
  const expenses = profile?.monthly_expenses ?? 0;
  const savings = income - expenses;
  const savingsRate = income > 0 ? (savings / income) * 100 : null;
  const expensesPct = income > 0 ? (expenses / income) * 100 : 0;
  const savingsPct  = income > 0 ? Math.max(0, (savings / income) * 100) : 0;

  // Health metrics
  const emergencyFund = expenses > 0 ? liquidCash / expenses : null;
  const debtToIncome  = income > 0 ? (liabilitiesV / (income * 12)) * 100 : null;
  // FIRE Coverage: how much of monthly expenses your asset income (4% safe withdrawal) covers
  const fireCoverage = expenses > 0
    ? ((totalAssets * 0.04) / 12 / expenses) * 100
    : null;

  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-black">
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white dark:bg-black">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-800 dark:border-t-white" />
        </div>
      )}
      <div className="fixed top-3 right-3 z-10" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-black bg-white text-black transition-colors hover:bg-zinc-100 dark:border-white dark:bg-black dark:text-white dark:hover:bg-zinc-900"
        >
          <span className="text-sm leading-none tracking-tighter">···</span>
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
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Benchmark</span>
                <select
                  value={benchmark}
                  onChange={(e) => setBenchmark(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                >
                  <option>S&P 500</option>
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

      <main className="flex flex-1 flex-row gap-4 overflow-hidden px-8 py-6">
       {/* LEFT COLUMN — Financial Position */}
       <div className="flex flex-1 min-h-0 flex-col gap-2">
         {/* Net worth half donut — assets outer, liabilities inner */}
         <div className="flex flex-col items-center rounded-xl border-2 border-zinc-900 p-5 dark:border-zinc-700">
           <div className="mb-3 flex w-full items-center justify-between">
             <span className="text-sm font-medium text-black dark:text-white">Net Worth</span>
             <button
               onClick={() => router.push("/networth")}
               className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-black dark:hover:bg-zinc-800 dark:hover:text-white"
             >
               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
                 <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/>
               </svg>
             </button>
           </div>
           <div className="relative w-full" ref={wealthChartRef}>
             <ResponsiveContainer width="100%" height={wealthRadii.height}>
               <PieChart>
                 {/* Outer ring — asset types */}
                 <Pie
                   data={wealthAssets} dataKey="value" nameKey="label"
                   startAngle={180} endAngle={0}
                   cx="50%" cy="100%"
                   outerRadius={wealthRadii.outer} innerRadius={wealthRadii.inner1}
                   paddingAngle={0}
                   fill="#e4e4e7"
                   stroke="#18181b" strokeWidth={1}
                 >
                   {wealthAssets.map(a => <Cell key={a.label} fill={a.color} />)}
                 </Pie>
                 {/* Inner ring — liabilities (red) */}
                 <Pie
                   data={wealthLiabs} dataKey="value" nameKey="label"
                   startAngle={180} endAngle={0}
                   cx="50%" cy="100%"
                   outerRadius={wealthRadii.inner1} innerRadius={wealthRadii.inner2}
                   paddingAngle={0}
                   fill="#e4e4e7"
                 >
                   {wealthLiabs.map(l => (
                     <Cell
                       key={l.label}
                       fill={l.color}
                       stroke={l.label === "Empty" ? "none" : "#18181b"}
                       strokeWidth={l.label === "Empty" ? 0 : 1}
                     />
                   ))}
                 </Pie>
                 <Tooltip
                   animationDuration={0}
                   content={({ active, payload }) => {
                     if (!active || !payload?.length || payload[0].name === "Empty") return null;
                     return (
                       <div style={{ borderRadius: "8px", border: "1px solid #e4e4e7", background: "#fff", padding: "6px 12px", fontSize: "13px" }}>
                         {payload[0].name}: {fmt(payload[0].value as number)}
                       </div>
                     );
                   }}
                 />
               </PieChart>
             </ResponsiveContainer>

             <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
               <p style={{ fontSize: wealthRadii.outer * 0.16, fontWeight: 600 }} className="text-black dark:text-white leading-tight">{hasWealthData ? fmt(netWorth) : "—"}</p>
               <p style={{ fontSize: wealthRadii.outer * 0.12, fontWeight: 700 }} className="leading-tight text-zinc-400">—%</p>
               <p style={{ fontSize: wealthRadii.outer * 0.055 }} className="text-zinc-400">in the last 12 months</p>
             </div>
           </div>
         </div>

         {/* Wrapper as 4-row CSS grid mirroring center metric grid exactly. Cashflow + 2x2 grid each row-span-2 */}
         <div className="grid flex-1 min-h-0 [grid-template-rows:repeat(4,minmax(0,1fr))] gap-2">

         {/* Cashflow graph card — spans 2 rows */}
         <div className="row-span-2 flex min-h-0 flex-col justify-between rounded-xl border-2 border-zinc-900 p-5 dark:border-zinc-700">
           <div className="flex items-center justify-between">
             <span className="text-sm font-medium text-black dark:text-white">Monthly Cashflow</span>
             <button
               onClick={() => router.push("/cashflow")}
               className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-black dark:hover:bg-zinc-800 dark:hover:text-white"
             >
               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
                 <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/>
               </svg>
             </button>
           </div>

           <div className="mt-4 flex flex-col gap-2">
             {/* Income bar — colored segments per source */}
             <div className="flex h-6 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
               {income > 0 && incomeEntries.map((e, i) => (
                 <div
                   key={i}
                   className="h-full"
                   style={{
                     width: `${(Number(e.amount) / income) * 100}%`,
                     backgroundColor: INCOME_COLORS[e.type] ?? INCOME_COLORS.Other,
                   }}
                   title={`${e.type}: ${fmt(Number(e.amount))}`}
                 />
               ))}
             </div>
             {/* Expenses (per category) + Savings bar */}
             <div className="flex h-6 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
               {income > 0 && expenseEntries.map((e, i) => (
                 <div
                   key={i}
                   className="h-full"
                   style={{
                     width: `${(Number(e.amount) / income) * 100}%`,
                     backgroundColor: EXPENSE_COLORS[e.type] ?? EXPENSE_COLORS.Other,
                   }}
                   title={`${e.type}: ${fmt(Number(e.amount))}`}
                 />
               ))}
               {savings > 0 && (
                 <div
                   className="h-full bg-green-500"
                   style={{ width: `${savingsPct}%` }}
                   title={`Savings: ${fmt(savings)}`}
                 />
               )}
             </div>
           </div>

           <div className="mt-3 flex items-center justify-between text-xs">
             <span className="text-zinc-500">Income {income > 0 ? fmt(income) : "—"}</span>
             <span className="text-zinc-500">Expenses {expenses > 0 ? fmt(expenses) : "—"}</span>
             <span className={`font-medium ${savings > 0 ? "text-green-600" : savings < 0 ? "text-red-500" : "text-zinc-500"}`}>
               Savings {income > 0 ? fmt(savings) : "—"}
             </span>
           </div>
         </div>

         {/* 2x2 grid of financial health cards — spans 2 rows of the outer 4-row grid */}
         <div className="row-span-2 grid min-h-0 grid-cols-2 [grid-template-rows:repeat(2,minmax(0,1fr))] gap-2">
           <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
             <span className={`text-2xl font-bold ${emergencyFund === null ? "text-black dark:text-white" : emergencyFund >= 6 ? "text-green-600" : emergencyFund >= 3 ? "text-yellow-500" : "text-red-500"}`}>
               {emergencyFund === null ? "—" : `${emergencyFund.toFixed(1)}`}
             </span>
             <span className="text-xs font-medium text-black dark:text-white">Emergency Fund</span>
             <span className="text-[10px] text-zinc-400">months covered</span>
           </div>
           <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
             <span className={`text-2xl font-bold ${debtToIncome === null ? "text-black dark:text-white" : debtToIncome <= 40 ? "text-green-600" : debtToIncome <= 80 ? "text-yellow-500" : "text-red-500"}`}>
               {debtToIncome === null ? "—" : `${debtToIncome.toFixed(0)}%`}
             </span>
             <span className="text-xs font-medium text-black dark:text-white">Debt-to-Income</span>
             <span className="text-[10px] text-zinc-400">debt vs annual income</span>
           </div>
           <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
             <span className={`text-2xl font-bold ${fireCoverage === null ? "text-black dark:text-white" : fireCoverage >= 100 ? "text-green-600" : fireCoverage >= 50 ? "text-yellow-500" : "text-red-500"}`}>
               {fireCoverage === null ? "—" : `${fireCoverage.toFixed(0)}%`}
             </span>
             <span className="text-xs font-medium text-black dark:text-white">FIRE Coverage</span>
             <span className="text-[10px] text-zinc-400">asset income vs expenses</span>
           </div>
           <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
             <span className={`text-2xl font-bold ${savingsRate === null ? "text-black dark:text-white" : savingsRate >= 20 ? "text-green-600" : savingsRate >= 10 ? "text-yellow-500" : "text-red-500"}`}>
               {savingsRate === null ? "—" : `${savingsRate.toFixed(0)}%`}
             </span>
             <span className="text-xs font-medium text-black dark:text-white">Saving Rate</span>
             <span className="text-[10px] text-zinc-400">monthly</span>
           </div>
         </div>
         </div>
       </div>

       {/* CENTER COLUMN — Portfolio Stats */}
       <div className="flex flex-1 min-h-0 flex-col gap-2">
        <div className="flex flex-col items-center rounded-xl border-2 border-zinc-900 p-5 dark:border-zinc-700">
          <div className="mb-3 flex w-full items-center justify-between">
            <span className="text-sm font-medium text-black dark:text-white">Portfolio Overview</span>
            <button
              onClick={() => router.push("/holdings")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-black dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
                <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/>
              </svg>
            </button>
          </div>
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
                paddingAngle={0}
                fill="#e4e4e7"
                stroke="#18181b"
                strokeWidth={1}
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
                paddingAngle={0}
                fill="#e4e4e7"
                stroke="#18181b"
                strokeWidth={1}
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
            <span className={`text-2xl font-bold ${robustness === null ? "text-black dark:text-white" : robustness >= 67 ? "text-green-600" : robustness >= 33 ? "text-yellow-500" : "text-red-500"}`}>
              {robustness === null ? "—" : robustness}
            </span>
            <span className="text-xs font-medium text-black dark:text-white">Robustness</span>
            <span className="text-[10px] text-zinc-400">safety + diversification</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className={`text-2xl font-bold ${expectedRealReturn === null ? "text-black dark:text-white" : expectedRealReturn >= 0 ? "text-green-600" : "text-red-500"}`}>
              {expectedRealReturn === null ? "—" : `${expectedRealReturn >= 0 ? "+" : ""}${expectedRealReturn.toFixed(2)}%`}
            </span>
            <span className="text-xs font-medium text-black dark:text-white">Expected Real Returns</span>
            <span className="text-[10px] text-zinc-400">CAPM − current inflation</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className={`text-2xl font-bold ${quality === null ? "text-black dark:text-white" : quality >= 67 ? "text-green-600" : quality >= 33 ? "text-yellow-500" : "text-red-500"}`}>
              {quality === null ? "—" : quality}
            </span>
            <span className="text-xs font-medium text-black dark:text-white">Quality</span>
            <span className="text-[10px] text-zinc-400">fundamental health</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className={`text-2xl font-bold ${benchmarkCorrelation === null ? "text-black dark:text-white" : benchmarkCorrelation >= 0 ? "text-black dark:text-white" : "text-red-500"}`}>
              {benchmarkCorrelation === null ? "—" : `${benchmarkCorrelation > 0 ? "+" : ""}${benchmarkCorrelation.toFixed(1)}%`}
            </span>
            <span className="text-xs font-medium text-black dark:text-white">Benchmark Correlation</span>
            <span className="text-[10px] text-zinc-400">how you move with benchmark</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className={`text-2xl font-bold ${returnOnRisk === null ? "text-black dark:text-white" : returnOnRisk >= 67 ? "text-green-600" : returnOnRisk >= 33 ? "text-yellow-500" : "text-red-500"}`}>
              {returnOnRisk === null ? "—" : returnOnRisk}
            </span>
            <span className="text-xs font-medium text-black dark:text-white">Return on Risk</span>
            <span className="text-[10px] text-zinc-400">return per unit of risk</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className={`text-2xl font-bold ${edgeOnBenchmark === null ? "text-black dark:text-white" : edgeOnBenchmark >= 0 ? "text-green-600" : "text-red-500"}`}>
              {edgeOnBenchmark === null ? "—" : `${edgeOnBenchmark >= 0 ? "+" : ""}${edgeOnBenchmark.toFixed(2)}%`}
            </span>
            <span className="text-xs font-medium text-black dark:text-white">Edge on Benchmark</span>
            <span className="text-[10px] text-zinc-400">return above the benchmark</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className={`text-2xl font-bold ${expectedDrawdown === null ? "text-black dark:text-white" : expectedDrawdown >= -5 ? "text-green-600" : expectedDrawdown >= -15 ? "text-yellow-500" : "text-red-500"}`}>
              {expectedDrawdown === null ? "—" : `${expectedDrawdown.toFixed(1)}%`}
            </span>
            <span className="text-xs font-medium text-black dark:text-white">Expected Drawdown</span>
            <span className="text-[10px] text-zinc-400">worst monthly loss (VaR 95%)</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-900 py-2 dark:border-zinc-700">
            <span className={`text-2xl font-bold ${historicalRealReturn === null ? "text-black dark:text-white" : historicalRealReturn >= 0 ? "text-green-600" : "text-red-500"}`}>
              {historicalRealReturn === null ? "—" : `${historicalRealReturn >= 0 ? "+" : ""}${historicalRealReturn.toFixed(2)}%`}
            </span>
            <span className="text-xs font-medium text-black dark:text-white">Historical Real Returns</span>
            <span className="text-[10px] text-zinc-400">yearly return after inflation</span>
          </div>
        </div>
       </div>

       {/* RIGHT COLUMN — Goal Tracker */}
       <div className="flex flex-1 min-h-0 flex-col gap-2">
         <div className="flex flex-1 min-h-0 flex-col items-center justify-center rounded-xl border-2 border-zinc-900 p-5 dark:border-zinc-700">
           <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Goal Tracker</span>
           <span className="mt-3 text-zinc-300">—</span>
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
