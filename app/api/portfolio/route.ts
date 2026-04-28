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

type InflationData = { rates: number[]; isMonthly: boolean; fallback: number };

async function fetchAllInflationData(country: string): Promise<InflationData> {
  if (country === "USA") {
    try {
      const res = await fetch(
        "https://api.worldbank.org/v2/country/US/indicator/FP.CPI.TOTL.ZG?format=json&mrv=30&per_page=30",
        { next: { revalidate: 86400 } }
      );
      const json = await res.json();
      const rates: number[] = (json[1] ?? [])
        .map((d: { value: number | null }) => d.value)
        .filter((v: number | null): v is number => v != null)
        .reverse();
      return { rates, isMonthly: false, fallback: 3.5 };
    } catch {
      return { rates: [], isMonthly: false, fallback: 3.5 };
    }
  } else {
    try {
      const res = await fetch(
        "https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?format=jsondata&detail=dataonly",
        { headers: { "Accept": "application/json" }, next: { revalidate: 86400 } }
      );
      const json = await res.json();
      const obs: Record<string, number[]> = json.dataSets?.[0]?.series?.["0:0:0:0:0"]?.observations ?? {};
      const rates = Object.values(obs).map(v => v[0]).filter(v => v != null && !isNaN(v));
      return { rates, isMonthly: true, fallback: 2.8 };
    } catch {
      return { rates: [], isMonthly: true, fallback: 2.8 };
    }
  }
}

function avgInflationForMonths(inflation: InflationData, months: number): number {
  if (!inflation.rates.length) return inflation.fallback;
  if (inflation.isMonthly) {
    const slice = inflation.rates.slice(-Math.min(months, inflation.rates.length));
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  } else {
    const years = Math.max(1, Math.ceil(months / 12));
    const slice = inflation.rates.slice(-Math.min(years, inflation.rates.length));
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }
}

export async function GET(request: Request) {
  const country = new URL(request.url).searchParams.get("country") ?? "Italy";

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

  // 2 — Fetch max monthly history + full inflation history in parallel
  const [priceData, inflationData] = await Promise.all([
    Promise.all(
      figiData.map(async (result) => {
        const item = result.data?.[0];
        if (!item?.ticker) return { current: null, yearAgo: null, oldest: null, actualYears: 0 };
        const symbol = yahooTicker(item.ticker, item.exchCode);
        try {
          const period1 = 0; // oldest available data point (Unix epoch)
          const period2 = Math.floor(Date.now() / 1000);
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1mo&period1=${period1}&period2=${period2}`,
            { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
          );
          const json = await res.json();
          const r = json.chart?.result?.[0];
          const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
          const timestamps: number[] = r?.timestamp ?? [];
          const current: number | null = r?.meta?.regularMarketPrice ?? null;
          const yearAgo: number | null = closes.length >= 13 ? (closes[closes.length - 13] ?? null) : (closes[0] ?? null);
          const firstValidIdx = closes.findIndex((v): v is number => v != null);
          const oldest: number | null = firstValidIdx >= 0 ? (closes[firstValidIdx] as number) : null;
          const actualYears = firstValidIdx >= 0 && timestamps.length > firstValidIdx
            ? (timestamps[timestamps.length - 1] - timestamps[firstValidIdx]) / (365.25 * 24 * 3600)
            : 0;
          return { current, yearAgo, oldest, actualYears };
        } catch {
          return { current: null, yearAgo: null, oldest: null, actualYears: 0 };
        }
      })
    ),
    fetchAllInflationData(country),
  ]);

  // 3 — Aggregate values and compute metrics
  const typeValues: Record<string, number> = {};
  let currentTotal = 0;
  let yearAgoTotal = 0;
  let weightedRealCagr = 0;
  let cagrWeight = 0;

  holdings.forEach((holding, i) => {
    const { current, yearAgo, oldest, actualYears } = priceData[i];
    if (current != null) {
      const v = holding.quantity * current;
      typeValues[holding.type] = (typeValues[holding.type] ?? 0) + v;
      currentTotal += v;

      if (oldest != null && actualYears >= 1 && oldest > 0) {
        const nominalCagr = (Math.pow(current / oldest, 1 / actualYears) - 1) * 100;
        const inflationForPeriod = avgInflationForMonths(inflationData, Math.round(actualYears * 12));
        const realCagr = nominalCagr - inflationForPeriod;
        weightedRealCagr += realCagr * v;
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

  const historicalRealReturn = cagrWeight > 0
    ? parseFloat((weightedRealCagr / cagrWeight).toFixed(2))
    : null;

  return NextResponse.json({ segments, holdings: holdingSegments, total, pnl12m, historicalRealReturn });
}
