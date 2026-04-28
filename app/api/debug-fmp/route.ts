import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.FMP_API_KEY ?? "";
  if (!apiKey) return NextResponse.json({ error: "FMP_API_KEY not set" });

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/rating/AAPL?apikey=${apiKey}`
    );
    const json = await res.json();
    return NextResponse.json({ status: res.status, data: json });
  } catch (e) {
    return NextResponse.json({ error: String(e) });
  }
}
