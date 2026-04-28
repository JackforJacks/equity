import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const TYPE_COLORS: Record<string, string> = {
  Stock:  "#1D4ED8",
  ETF:    "#059669",
  Crypto: "#F59E0B",
  Bond:   "#6B7280",
  Fund:   "#8B5CF6",
  Other:  "#D1D5DB",
};

const EXCHANGE_SUFFIX: Record<string, string> = {
  GY: ".DE", LN: ".L",  FP: ".PA", IM: ".MI",
  SM: ".MC", NA: ".AS", BB: ".BR", SW: ".SW",
  AU: ".AX", HK: ".HK", JP: ".T",
};

function yahooTicker(ticker: string, exchCode: string) {
  const suffix = EXCHANGE_SUFFIX[exchCode];
  return suffix ? `${ticker}${suffix}` : ticker;
}

async function fetchInflationRate(): Promise<number> {
  try {
    const res = await fetch(
      "https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?format=jsondata&lastNObservations=60&detail=dataonly",
      { headers: { "Accept": "application/json" }, next: { revalidate: 86400 } }
    );
    const json = await res.json();
    const obs: Record<string, number[]> = json.dataSets?.[0]?.series?.["0:0:0:0:0"]?.observations ?? {};
    const values = Object.values(obs).map(v => v[0]).filter(v => v != null && !isNaN(v));
    if (!values.length) return 2.8;
    return parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
  } catch {
    return 2.8;
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: holdings } = await supabase
    .from("portfolio_holdings")
    .select("isin, quantity, type")
    .eq("user_id", user.id);

  if (!holdings?.length) return NextResponse.json([]);

  // 1 — Convert ISINs to tickers via OpenFIGI
  const figiRes = await fetch("https://api.openfigi.com/v3/mapping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(holdings.map((h) => ({ idType: "ID_ISIN", idValue: h.isin }))),
  });
  const figiData: { data?: { ticker: string; exchCode: string }[] }[] = await figiRes.json();

  // 2 — Fetch max monthly history + ECB inflation in parallel
  const [priceData, avgInflation] = await Promise.all([
    Promise.all(
      figiData.map(async (result) => {
        const item = result.data?.[0];
        if (!item?.ticker) return { current: null, yearAgo: null, oldest: null, months: 0 };
        const symbol = yahooTicker(item.ticker, item.exchCode);
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1mo&range=max`,
            { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
          );
          const json = await res.json();
          const r = json.chart?.result?.[0];
          const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
          const valid = closes.filter((v): v is number => v != null);
          const current: number | null = r?.meta?.regularMarketPrice ?? null;
          const yearAgo: number | null = closes.length >= 13
            ? (closes[closes.length - 13] ?? null)
            : (closes[0] ?? null);
          const oldest: number | null = valid[0] ?? null;
          return { current, yearAgo, oldest, months: closes.length };
        } catch {
          return { current: null, yearAgo: null, oldest: null, months: 0 };
        }
      })
    ),
    fetchInflationRate(),
  ]);

  // 3 — Aggregate gross value by type + compute 12-month P&L
  const typeValues: Record<string, number> = {};
  let currentTotal = 0;
  let yearAgoTotal = 0;
  let weightedCagr = 0;
  let cagrWeight = 0;

  holdings.forEach((holding, i) => {
    const { current, yearAgo, oldest, months } = priceData[i];
    if (current != null) {
      const v = holding.quantity * current;
      typeValues[holding.type] = (typeValues[holding.type] ?? 0) + v;
      currentTotal += v;

      if (oldest != null && months >= 2) {
        const years = months / 12;
        const cagr = (Math.pow(current / oldest, 1 / years) - 1) * 100;
        weightedCagr += cagr * v;
        cagrWeight += v;
      }
    }
    if (yearAgo != null && current != null) {
      yearAgoTotal += holding.quantity * yearAgo;
    }
  });

  const total = currentTotal;
  if (total === 0) return NextResponse.json([]);

  const segments = Object.entries(typeValues).map(([type, value]) => ({
    label: type,
    value: Math.round((value / total) * 100),
    color: TYPE_COLORS[type] ?? TYPE_COLORS.Other,
  }));

  const holdingSegments = holdings.map((holding, i) => {
    const { current } = priceData[i];
    if (current == null) return null;
    const v = holding.quantity * current;
    return {
      label: figiData[i]?.data?.[0]?.ticker ?? holding.isin,
      value: Math.round((v / total) * 100),
      grossValue: parseFloat(v.toFixed(2)),
      quantity: holding.quantity,
      color: TYPE_COLORS[holding.type] ?? TYPE_COLORS.Other,
    };
  }).filter(Boolean);

  const pnl12m = yearAgoTotal > 0
    ? parseFloat((((currentTotal - yearAgoTotal) / yearAgoTotal) * 100).toFixed(2))
    : null;

  const portfolioCagr = cagrWeight > 0
    ? parseFloat((weightedCagr / cagrWeight).toFixed(2))
    : null;

  const historicalRealReturn = portfolioCagr != null
    ? parseFloat((portfolioCagr - avgInflation).toFixed(2))
    : null;

  return NextResponse.json({
    segments,
    holdings: holdingSegments,
    total,
    pnl12m,
    historicalRealReturn,
    avgInflation,
  });
}
