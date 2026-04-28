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

const BENCHMARK_TICKERS: Record<string, string> = {
  "S&P 500": "^GSPC",
};

function yahooTicker(ticker: string, exchCode: string) {
  const suffix = EXCHANGE_SUFFIX[exchCode];
  return suffix ? `${ticker}${suffix}` : ticker;
}

type InflationData = { rates: number[]; isMonthly: boolean; fallback: number };
type BenchmarkPoint = { timestamp: number; close: number };

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

async function fetchBenchmarkData(ticker: string): Promise<BenchmarkPoint[]> {
  try {
    const period2 = Math.floor(Date.now() / 1000);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1mo&period1=0&period2=${period2}`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
    );
    const json = await res.json();
    const r = json.chart?.result?.[0];
    const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
    const timestamps: number[] = r?.timestamp ?? [];
    const result: BenchmarkPoint[] = [];
    for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
      if (closes[i] != null) result.push({ timestamp: timestamps[i], close: closes[i] as number });
    }
    return result;
  } catch {
    return [];
  }
}

function benchmarkPriceAt(data: BenchmarkPoint[], targetTs: number): number | null {
  if (!data.length) return null;
  const idx = data.findIndex(d => d.timestamp >= targetTs);
  if (idx === -1) return data[data.length - 1].close;
  return data[idx].close;
}

// Find nearest non-null price within 45 days of target timestamp
function nearestPrice(closes: (number | null)[], timestamps: number[], targetTs: number): number | null {
  let best: number | null = null;
  let bestDiff = Infinity;
  for (let i = 0; i < timestamps.length; i++) {
    const diff = Math.abs(timestamps[i] - targetTs);
    if (diff < bestDiff && closes[i] != null) {
      bestDiff = diff;
      best = closes[i] as number;
    }
  }
  return bestDiff <= 45 * 24 * 3600 ? best : null;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx  += (x[i] - mx) ** 2;
    dy  += (y[i] - my) ** 2;
  }
  return dx * dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const country       = params.get("country")   ?? "Italy";
  const benchmarkName = params.get("benchmark") ?? "S&P 500";
  const benchmarkTicker = BENCHMARK_TICKERS[benchmarkName] ?? "^GSPC";

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

  const figiRes = await fetch("https://api.openfigi.com/v3/mapping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(holdings.map((h) => ({ idType: "ID_ISIN", idValue: h.isin }))),
  });
  const figiData: { data?: { ticker: string; exchCode: string }[] }[] = await figiRes.json();

  const period2 = Math.floor(Date.now() / 1000);

  const [priceData, inflationData, benchmarkData] = await Promise.all([
    Promise.all(
      figiData.map(async (result) => {
        const item = result.data?.[0];
        if (!item?.ticker) return { current: null, yearAgo: null, oldest: null, actualYears: 0, startTimestamp: 0, closes: [] as (number | null)[], timestamps: [] as number[] };
        const symbol = yahooTicker(item.ticker, item.exchCode);
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1mo&period1=0&period2=${period2}`,
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
          const startTimestamp = firstValidIdx >= 0 && timestamps[firstValidIdx] ? timestamps[firstValidIdx] : 0;
          const endTimestamp = timestamps[timestamps.length - 1] ?? 0;
          const actualYears = startTimestamp > 0 && endTimestamp > startTimestamp
            ? (endTimestamp - startTimestamp) / (365.25 * 24 * 3600)
            : 0;
          return { current, yearAgo, oldest, actualYears, startTimestamp, closes, timestamps };
        } catch {
          return { current: null, yearAgo: null, oldest: null, actualYears: 0, startTimestamp: 0, closes: [] as (number | null)[], timestamps: [] as number[] };
        }
      })
    ),
    fetchAllInflationData(country),
    fetchBenchmarkData(benchmarkTicker),
  ]);

  const benchmarkCurrentClose = benchmarkData.length > 0 ? benchmarkData[benchmarkData.length - 1].close : null;

  const typeValues: Record<string, number> = {};
  let currentTotal = 0;
  let yearAgoTotal = 0;
  let weightedRealCagr = 0, cagrWeight = 0;
  let weightedEdge = 0, edgeWeight = 0;

  holdings.forEach((holding, i) => {
    const { current, yearAgo, oldest, actualYears, startTimestamp } = priceData[i];
    if (current != null) {
      const v = holding.quantity * current;
      typeValues[holding.type] = (typeValues[holding.type] ?? 0) + v;
      currentTotal += v;

      if (oldest != null && actualYears >= 1 && oldest > 0) {
        const nominalCagr = (Math.pow(current / oldest, 1 / actualYears) - 1) * 100;
        const inflationForPeriod = avgInflationForMonths(inflationData, Math.round(actualYears * 12));
        weightedRealCagr += (nominalCagr - inflationForPeriod) * v;
        cagrWeight += v;

        if (benchmarkCurrentClose != null && startTimestamp > 0) {
          const benchmarkAtStart = benchmarkPriceAt(benchmarkData, startTimestamp);
          if (benchmarkAtStart != null && benchmarkAtStart > 0) {
            const benchmarkCagr = (Math.pow(benchmarkCurrentClose / benchmarkAtStart, 1 / actualYears) - 1) * 100;
            weightedEdge += (nominalCagr - benchmarkCagr) * v;
            edgeWeight += v;
          }
        }
      }
    }
    if (yearAgo != null && current != null) {
      yearAgoTotal += holding.quantity * yearAgo;
    }
  });

  const total = currentTotal;
  if (total === 0) return NextResponse.json([]);

  // — Benchmark Correlation —
  // Use the overlapping period: latest start across all holdings
  const overlapStart = Math.max(...priceData.map(pd => pd.startTimestamp).filter(t => t > 0));
  const overlapTimestamps = benchmarkData
    .filter(d => d.timestamp >= overlapStart)
    .map(d => d.timestamp);

  let benchmarkCorrelation: number | null = null;
  if (overlapTimestamps.length >= 4 && holdings.every((_, i) => priceData[i].timestamps.length > 0)) {
    // Portfolio value at each benchmark timestamp
    const portfolioValues: number[] = overlapTimestamps.map(ts =>
      holdings.reduce((sum, h, i) => {
        const price = nearestPrice(priceData[i].closes, priceData[i].timestamps, ts);
        return price != null ? sum + h.quantity * price : sum;
      }, 0)
    ).filter(v => v > 0);

    // Benchmark values at same timestamps
    const benchmarkValues = overlapTimestamps
      .map(ts => benchmarkData.find(d => d.timestamp === ts)?.close ?? null)
      .filter((v): v is number => v != null);

    const n = Math.min(portfolioValues.length, benchmarkValues.length);
    if (n >= 4) {
      const portReturns: number[] = [];
      const bmReturns: number[] = [];
      for (let i = 1; i < n; i++) {
        if (portfolioValues[i - 1] > 0 && benchmarkValues[i - 1] > 0) {
          portReturns.push(portfolioValues[i] / portfolioValues[i - 1] - 1);
          bmReturns.push(benchmarkValues[i] / benchmarkValues[i - 1] - 1);
        }
      }
      if (portReturns.length >= 3) {
        const r = pearsonCorrelation(portReturns, bmReturns);
        benchmarkCorrelation = Math.round(((r + 1) / 2) * 100);
      }
    }
  }

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

  const edgeOnBenchmark = edgeWeight > 0
    ? parseFloat((weightedEdge / edgeWeight).toFixed(2))
    : null;

  return NextResponse.json({
    segments, holdings: holdingSegments, total,
    pnl12m, historicalRealReturn, edgeOnBenchmark, benchmarkCorrelation,
  });
}
