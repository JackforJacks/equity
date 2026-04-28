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

// ECB Deposit Facility Rate history [YYYY-MM, annual %]
const ECB_DF_RATES: [string, number][] = [
  ["1999-01", 2.00], ["1999-04", 1.50], ["1999-11", 2.00],
  ["2000-02", 2.25], ["2000-04", 2.75], ["2000-06", 3.25],
  ["2000-09", 3.50], ["2000-10", 3.75], ["2001-05", 3.50],
  ["2001-08", 3.25], ["2001-09", 2.75], ["2001-11", 2.25],
  ["2002-12", 1.75], ["2003-03", 1.50], ["2003-06", 1.00],
  ["2005-12", 1.25], ["2006-03", 1.50], ["2006-06", 1.75],
  ["2006-08", 2.00], ["2006-10", 2.25], ["2006-12", 2.50],
  ["2007-03", 2.75], ["2007-06", 3.00], ["2008-10", 2.50],
  ["2008-11", 2.00], ["2008-12", 1.50], ["2009-01", 1.00],
  ["2009-03", 0.50], ["2009-04", 0.25], ["2011-04", 0.50],
  ["2011-07", 0.75], ["2011-11", 0.50], ["2011-12", 0.25],
  ["2012-07", 0.00], ["2014-06",-0.10], ["2014-09",-0.20],
  ["2015-12",-0.30], ["2016-03",-0.40], ["2019-09",-0.50],
  ["2022-07", 0.00], ["2022-09", 0.75], ["2022-11", 1.50],
  ["2022-12", 2.00], ["2023-02", 2.50], ["2023-03", 3.00],
  ["2023-05", 3.25], ["2023-06", 3.50], ["2023-08", 3.75],
  ["2023-09", 4.00], ["2024-06", 3.75], ["2024-09", 3.50],
  ["2024-10", 3.25], ["2024-12", 3.00],
];

type InflationData  = { rates: number[]; isMonthly: boolean; fallback: number };
type BenchmarkPoint = { timestamp: number; close: number };
type RatePoint      = { timestamp: number; rate: number };

function yahooTicker(ticker: string, exchCode: string) {
  const suffix = EXCHANGE_SUFFIX[exchCode];
  return suffix ? `${ticker}${suffix}` : ticker;
}

function ecbRiskFreeRates(): RatePoint[] {
  return ECB_DF_RATES.map(([ym, rate]) => {
    const [y, m] = ym.split("-").map(Number);
    return { timestamp: Math.floor(new Date(y, m - 1, 1).getTime() / 1000), rate };
  });
}

async function fetchUSRiskFreeRates(period2: number): Promise<RatePoint[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/%5EIRX?interval=1mo&period1=0&period2=${period2}`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
    );
    const json = await res.json();
    const r = json.chart?.result?.[0];
    const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
    const timestamps: number[] = r?.timestamp ?? [];
    const result: RatePoint[] = [];
    for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
      if (closes[i] != null) result.push({ timestamp: timestamps[i], rate: closes[i] as number });
    }
    return result.length > 0 ? result : [{ timestamp: 0, rate: 4.0 }];
  } catch {
    return [{ timestamp: 0, rate: 4.0 }];
  }
}

function riskFreeRateAt(rates: RatePoint[], targetTs: number): number {
  let result = rates[0]?.rate ?? 2.5;
  for (const { timestamp, rate } of rates) {
    if (timestamp <= targetTs) result = rate;
    else break;
  }
  return result;
}

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

async function fetchBenchmarkData(ticker: string, period2: number): Promise<BenchmarkPoint[]> {
  try {
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

function nearestPrice(closes: (number | null)[], timestamps: number[], targetTs: number): number | null {
  let best: number | null = null;
  let bestDiff = Infinity;
  for (let i = 0; i < timestamps.length; i++) {
    const diff = Math.abs(timestamps[i] - targetTs);
    if (diff < bestDiff && closes[i] != null) { bestDiff = diff; best = closes[i] as number; }
  }
  return bestDiff <= 45 * 24 * 3600 ? best : null;
}

async function fetchYahooQuality(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=financialData,defaultKeyStatistics`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const fd = json.quoteSummary?.result?.[0]?.financialData;
    if (!fd) return null;

    const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
    const scores: number[] = [];

    // Profitability
    const roe = fd.returnOnEquity?.raw;
    const pm  = fd.profitMargins?.raw;
    const om  = fd.operatingMargins?.raw;
    if (roe != null) scores.push(clamp((roe / 0.25) * 100));   // 25% ROE = perfect
    if (pm  != null) scores.push(clamp((pm  / 0.30) * 100));   // 30% net margin = perfect
    if (om  != null) scores.push(clamp((om  / 0.25) * 100));   // 25% operating margin = perfect

    // Financial health
    const de = fd.debtToEquity?.raw; // Yahoo returns as %, e.g. 150 = 1.5x
    const cr = fd.currentRatio?.raw;
    if (de != null) scores.push(clamp(100 - de / 3));  // 0 D/E = 100, 300 D/E = 0
    if (cr != null) scores.push(clamp((cr / 3) * 100)); // current ratio 3+ = 100

    // Growth
    const eg = fd.earningsGrowth?.raw;
    const rg = fd.revenueGrowth?.raw;
    if (eg != null) scores.push(clamp(((eg + 0.5) / 1.0) * 100)); // -50% = 0, +50% = 100
    if (rg != null) scores.push(clamp(((rg + 0.3) / 0.6) * 100)); // -30% = 0, +30% = 100

    if (!scores.length) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  } catch {
    return null;
  }
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
  const country         = params.get("country")   ?? "Italy";
  const benchmarkName   = params.get("benchmark") ?? "S&P 500";
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

  const [priceData, inflationData, benchmarkData, rfRates] = await Promise.all([
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
            ? (endTimestamp - startTimestamp) / (365.25 * 24 * 3600) : 0;
          return { current, yearAgo, oldest, actualYears, startTimestamp, closes, timestamps };
        } catch {
          return { current: null, yearAgo: null, oldest: null, actualYears: 0, startTimestamp: 0, closes: [] as (number | null)[], timestamps: [] as number[] };
        }
      })
    ),
    fetchAllInflationData(country),
    fetchBenchmarkData(benchmarkTicker, period2),
    country === "USA" ? fetchUSRiskFreeRates(period2) : Promise.resolve(ecbRiskFreeRates()),
  ]);

  const benchmarkCurrentClose = benchmarkData.length > 0 ? benchmarkData[benchmarkData.length - 1].close : null;

  const typeValues: Record<string, number> = {};
  let currentTotal = 0, yearAgoTotal = 0;
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
    if (yearAgo != null && current != null) yearAgoTotal += holding.quantity * yearAgo;
  });

  const total = currentTotal;
  if (total === 0) return NextResponse.json([]);

  // — Quality score via Yahoo Finance fundamentals —
  let quality: number | null = null;
  const qualityScores = await Promise.all(
    figiData.map(async (result, i) => {
      const item = result.data?.[0];
      if (!item || priceData[i].current == null) return null;
      const yTicker = yahooTicker(item.ticker, item.exchCode);
      const score = await fetchYahooQuality(yTicker);
      const weight = (holdings[i].quantity * (priceData[i].current!)) / total;
      return score != null ? { score, weight } : null;
    })
  );
  const validQ = qualityScores.filter((q): q is { score: number; weight: number } => q != null);
  if (validQ.length > 0) {
    const totalWeight = validQ.reduce((s, q) => s + q.weight, 0);
    if (totalWeight > 0)
      quality = Math.round(validQ.reduce((s, q) => s + q.score * q.weight, 0) / totalWeight);
  }

  // — Shared monthly return series (correlation + Sharpe) —
  const overlapStart = Math.max(...priceData.map(pd => pd.startTimestamp).filter(t => t > 0));
  const overlapTimestamps = benchmarkData.filter(d => d.timestamp >= overlapStart).map(d => d.timestamp);

  let benchmarkCorrelation: number | null = null;
  let returnOnRisk: number | null = null;

  if (overlapTimestamps.length >= 4) {
    const portfolioValues: number[] = overlapTimestamps.map(ts =>
      holdings.reduce((sum, h, i) => {
        const price = nearestPrice(priceData[i].closes, priceData[i].timestamps, ts);
        return price != null ? sum + h.quantity * price : sum;
      }, 0)
    );

    const portReturns: number[] = [];
    const bmReturns: number[] = [];
    const returnTimestamps: number[] = [];

    for (let i = 1; i < overlapTimestamps.length; i++) {
      const pPrev = portfolioValues[i - 1], pNext = portfolioValues[i];
      const bPrev = benchmarkData.find(d => d.timestamp === overlapTimestamps[i - 1])?.close ?? 0;
      const bNext = benchmarkData.find(d => d.timestamp === overlapTimestamps[i])?.close ?? 0;
      if (pPrev > 0 && pNext > 0 && bPrev > 0 && bNext > 0) {
        portReturns.push(pNext / pPrev - 1);
        bmReturns.push(bNext / bPrev - 1);
        returnTimestamps.push(overlapTimestamps[i]);
      }
    }

    if (portReturns.length >= 3) {
      benchmarkCorrelation = parseFloat((pearsonCorrelation(portReturns, bmReturns) * 100).toFixed(1));

      if (portReturns.length >= 12) {
        // Time-varying risk-free rate: match each monthly return to its period rate
        const excess = portReturns.map((r, idx) => {
          const ts = returnTimestamps[idx];
          const rfAnnual = riskFreeRateAt(rfRates, ts);
          return r - rfAnnual / 100 / 12;
        });
        const meanExcess = excess.reduce((a, b) => a + b, 0) / excess.length;
        const variance = excess.reduce((s, e) => s + (e - meanExcess) ** 2, 0) / excess.length;
        const sharpe = variance > 0 ? (meanExcess / Math.sqrt(variance)) * Math.sqrt(12) : 0;
        returnOnRisk = Math.min(100, Math.max(0, Math.round((sharpe / 3) * 100)));
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
    ? parseFloat((((currentTotal - yearAgoTotal) / yearAgoTotal) * 100).toFixed(2)) : null;
  const historicalRealReturn = cagrWeight > 0
    ? parseFloat((weightedRealCagr / cagrWeight).toFixed(2)) : null;
  const edgeOnBenchmark = edgeWeight > 0
    ? parseFloat((weightedEdge / edgeWeight).toFixed(2)) : null;

  return NextResponse.json({
    segments, holdings: holdingSegments, total,
    pnl12m, historicalRealReturn, edgeOnBenchmark, benchmarkCorrelation, returnOnRisk, quality,
  });
}
