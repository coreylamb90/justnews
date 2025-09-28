import { useEffect, useMemo, useState } from "react";

type Sentiment = { label: "positive" | "neutral" | "negative"; score: number };
type Item = {
  id: string;
  title: string;
  outlet: string;
  url: string;
  published_at: string;
  bullets: string[];
  category?: string;
  sentiment?: Sentiment;
};

const FEED = "https://coreylamb90.github.io/justnews/summaries.json";

function timeAgo(iso?: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Map raw sentiment -> label and badge styles
function prettySentimentLabel(s?: Sentiment) {
  if (!s) return "Neutral";
  if (s.label === "positive") return "Good News";
  if (s.label === "negative") return "Bad News";
  return "Neutral";
}
function sentiClasses(s?: Sentiment) {
  if (!s) return "bg-gray-100 text-gray-700 dark:bg-neutral-700/60 dark:text-neutral-200";
  if (s.label === "positive") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200";
  if (s.label === "negative") return "bg-rose-100 text-rose-800 dark:bg-rose-400/10 dark:text-rose-200";
  return "bg-gray-100 text-gray-700 dark:bg-neutral-700/60 dark:text-neutral-200";
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [category, setCategory] = useState<string>("All");
  const [sentiFilter, setSentiFilter] = useState<"All" | "Good News" | "Neutral" | "Bad News">("All");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(FEED, { cache: "no-store" });
        const data = await res.json();
        setGeneratedAt(data.generated_at || "");
        setItems(Array.isArray(data.items) ? data.items : []);
        localStorage.setItem("cache", JSON.stringify(data));
      } catch {
        const cached = localStorage.getItem("cache");
        if (cached) {
          const d = JSON.parse(cached);
          setGeneratedAt(d.generated_at || "");
          setItems(d.items || []);
        }
      }
    })();
  }, []);

  // Categories from data
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.category || "General"));
    return ["All", ...Array.from(set).sort()];
  }, [items]);

  // Helper: numeric time for sort; missing dates go to 0 so they sink
  const ts = (iso?: string) => {
    const n = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(n) ? n : 0;
  };

  // Filter + sort (newest first)
  const filtered = useMemo(() => {
    let list = items;

    // Category filter
    if (category !== "All") {
      list = list.filter((i) => (i.category || "General") === category);
    }

    // Sentiment filter
    if (sentiFilter !== "All") {
      list = list.filter((i) => {
        const label = prettySentimentLabel(i.sentiment);
        return label === sentiFilter;
      });
    }

    // Sort newest first
    return [...list].sort((a, b) => ts(b.published_at) - ts(a.published_at));
  }, [items, category, sentiFilter]);

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900 dark:bg-neutral-900 dark:text-neutral-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/80 dark:bg-neutral-900/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h1 className="text-lg font-semibold">JustNews</h1>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Updated {generatedAt ? timeAgo(generatedAt) : "…"}
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border bg-white px-3 py-2 text-sm shadow-sm dark:bg-neutral-800 dark:border-neutral-700"
              aria-label="Filter by category"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={sentiFilter}
              onChange={(e) => setSentiFilter(e.target.value as any)}
              className="rounded-lg border bg-white px-3 py-2 text-sm shadow-sm dark:bg-neutral-800 dark:border-neutral-700"
              aria-label="Filter by sentiment"
            >
              <option>All</option>
              <option>Good News</option>
              <option>Neutral</option>
              <option>Bad News</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        {filtered.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <div className="max-w-sm">
              <div className="mb-4 text-5xl">📰</div>
              <h2 className="mb-2 text-xl font-semibold">No stories</h2>
              <p className="text-sm text-gray-600 dark:text-neutral-400">
                Try a different category or sentiment.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => (
              <article
                key={a.id}
                className="rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md dark:bg-neutral-800 dark:border-neutral-700"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700 dark:bg-neutral-700/60 dark:text-neutral-200">
                    {a.outlet || "Source"}
                  </span>
                  <span>•</span>
                  <span title={a.published_at}>{timeAgo(a.published_at)}</span>
                  <span>•</span>
                  <span
                    className={`rounded-full px-2 py-1 ${sentiClasses(a.sentiment)}`}
                    title={`Sentiment score ${a.sentiment?.score ?? 0}`}
                  >
                    {prettySentimentLabel(a.sentiment)}
                  </span>
                  {a.category && (
                    <>
                      <span>•</span>
                      <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-200">
                        {a.category}
                      </span>
                    </>
                  )}
                </div>

                <h3 className="mb-2 line-clamp-3 text-base font-semibold leading-snug break-words">
                  {a.title}
                </h3>

                <ul className="mb-3 list-disc space-y-1 pl-5 text-sm break-words">
                  {(a.bullets || []).map((b, i) => (
                    <li
                      key={i}
                      className="marker:text-gray-400 dark:marker:text-neutral-500"
                    >
                      {b.replace(/^•\s?/, "")}
                    </li>
                  ))}
                </ul>

                <div className="flex items-center gap-2">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-xs font-medium text-white shadow-sm hover:opacity-90 dark:bg-white dark:text-black"
                  >
                    Open original
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
