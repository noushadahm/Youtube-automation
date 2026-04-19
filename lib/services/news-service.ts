/**
 * News / web-search grounding helper.
 *
 * Tries providers in order:
 *   1. Tavily  — LLM-optimised answers + sources (free tier: 1000/mo)
 *   2. NewsAPI — classic headline search (free tier: 100/day, dev only)
 *
 * Returns a short "context block" that can be injected into an LLM system
 * prompt to ground script generation in real, recent facts. Empty string if
 * no provider is configured or all calls fail.
 */

export interface NewsKeys {
  tavilyApiKey?: string | null;
  newsApiKey?: string | null;
}

export interface GroundingResult {
  provider: "tavily" | "newsapi" | "none";
  context: string;
  sources: Array<{ title: string; url: string; publishedAt?: string }>;
}

const EMPTY: GroundingResult = { provider: "none", context: "", sources: [] };

export async function fetchNewsContext(
  query: string,
  keys: NewsKeys,
  maxResults = 5
): Promise<GroundingResult> {
  const cleaned = query.trim().slice(0, 400);
  if (!cleaned) return EMPTY;

  if (keys.tavilyApiKey) {
    try {
      return await tavilySearch(cleaned, keys.tavilyApiKey, maxResults);
    } catch (err) {
      console.warn("[news] Tavily search failed:", err instanceof Error ? err.message : err);
    }
  }

  if (keys.newsApiKey) {
    try {
      return await newsApiSearch(cleaned, keys.newsApiKey, maxResults);
    } catch (err) {
      console.warn("[news] NewsAPI search failed:", err instanceof Error ? err.message : err);
    }
  }

  return EMPTY;
}

async function tavilySearch(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<GroundingResult> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      topic: "news",
      max_results: maxResults,
      include_answer: true
    })
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const payload = (await res.json()) as {
    answer?: string;
    results?: Array<{ title: string; url: string; content?: string; published_date?: string }>;
  };
  const sources =
    payload.results?.slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      publishedAt: r.published_date
    })) ?? [];
  const lines: string[] = [];
  if (payload.answer) lines.push(`Summary: ${payload.answer}`);
  (payload.results ?? []).slice(0, maxResults).forEach((r, i) => {
    const date = r.published_date ? ` (${r.published_date})` : "";
    lines.push(`[${i + 1}] ${r.title}${date} — ${r.content?.slice(0, 280) ?? ""}`);
    lines.push(`    Source: ${r.url}`);
  });
  return { provider: "tavily", context: lines.join("\n"), sources };
}

async function newsApiSearch(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<GroundingResult> {
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", query);
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("language", "en");
  url.searchParams.set("pageSize", String(maxResults));
  const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
  if (!res.ok) throw new Error(`NewsAPI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const payload = (await res.json()) as {
    articles?: Array<{
      title: string;
      url: string;
      description?: string;
      publishedAt?: string;
      source?: { name?: string };
    }>;
  };
  const arts = payload.articles ?? [];
  const sources = arts.map((a) => ({
    title: a.title,
    url: a.url,
    publishedAt: a.publishedAt
  }));
  const lines = arts.map(
    (a, i) =>
      `[${i + 1}] ${a.title} (${a.source?.name ?? "Unknown"}, ${a.publishedAt ?? ""})\n    ${a.description ?? ""}\n    Source: ${a.url}`
  );
  return { provider: "newsapi", context: lines.join("\n"), sources };
}
