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

/* ---------- helpers ---------- */

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

function prettySentimentLabel(s?: Sentiment) {
  if (!s) return "Neutral";
  if (s.label === "positive") return "Good News";
  if (s.label === "negative") return "Bad News";
  return "Neutral";
}
function sentiClasses(s?: Sentiment) {
  if (!s)
    return "bg-gray-100 text-gray-700 dark:bg-neutral-700/60 dark:text-neutral-200";
  if (s.label === "positive")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200";
  if (s.label === "negative")
    return "bg-rose-100 text-rose-800 dark:bg-rose-400/10 dark:text-rose-200";
  return "bg-gray-100 text-gray-700 dark:bg-neutral-700/60 dark:text-neutral-200";
}

const STOP = new Set([
  "the","and","for","that","with","from","this","have","will","your","their","about","into","over","more","than","been","after",
  "says","said","were","was","are","its","you","but","they","them","who","what","when","where","why","how","amid","as","of","on",
  "to","in","by","at","a","an","it","is","be","or","we","our","not","new","his","her","has","had","also","may","can","could",
  "would","should","one","two","three","u","us","news"
]);

function extractTrending(all: Item[], topN = 12) {
  const counts = new Map<string, number>();
  for (const it of all) {
    const text = (it.title + " " + (it.bullets || []).join(" ")).toLowerCase();
    const words = text
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9\s\-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    for (let w of words) {
      if (w.length < 4) continue;
      if (STOP.has(w)) continue;
      if (w.endsWith("s") && w.length > 4) w = w.slice(0, -1);
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

function includesKeyword(it: Item, kw: string) {
  const q = kw.toLowerCase();
  if (it.title.toLowerCase().includes(q)) return true;
  if ((it.outlet || "").toLowerCase().includes(q)) return true;
  return (it.bullets || []).some((b) => b.toLowerCase().includes(q));
}

/* ---------- component ---------- */

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  const [category, setCategory] = useState<string>("All");
  const [sentiFilter, setSentiFilter] = useState<"All" | "Good News" | "Neutral" | "Bad News">("All");
  const [topicFilter, setTopicFilter] = useState<string>("");

  // bookmarks: store ids in localStorage
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [showBookmarksOnly, setShowBookmarksOnly] = useState<boolean>(false);

  // load data
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

  // init bookmarks from localStorage
  useEffect(() => {
    const raw = localStorage.getItem("bookmarks");
    if (raw) {
      try {
        const ids: string[] = JSON.parse(raw);
        setBookmarks(new Set(ids));
      } catch {}
    }
  }, []);
  // persist bookmarks
  useEffect(() => {
    localStorage.setItem("bookmarks", JSON.stringify(Array.from(bookmarks)));
  }, [bookmarks]);

  const toggleBookmark = (id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Categories from data
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.category || "General"));
    return ["All", ...Array.from(set).sort()];
  }, [items]);

  // Newest-first sort helper
  const ts = (iso?: string) => {
    const n = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(n) ? n : 0;
    };

  // Filter + sort (newest first)
  const filtered = useMemo(() => {
    let list = items;

    if (category !== "All") {
      list = list.filter((i) => (i.category || "General") === category);
    }

    if (sentiFilter !== "All") {
      list = list.filter((i) => prettySentimentLabel(i.sentiment) === sentiFilter);
    }

    if (showBookmarksOnly) {
      list = list.filter((i) => bookmarks.has(i.id));
    }

    if (topicFilter.trim()) {
      list = list.filter((i) => includesKeyword(i, topicFilter));
    }

    return [...list].sort((a, b) => ts(b.published_at) - ts(a.published_at));
  }, [items, category, sentiFilter, showBookmarksOnly, topicFilter, bookmarks]);

  // Trending (from all items)
  const trending = useMemo(() => extractTrending(items, 12), [items]);

  const clearTopic = () => setTopicFilter("");

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
          <div className="flex items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border bg-white px-3 py-2 text-sm shadow-sm dark:bg-neutral-800 dark:border-neutral-700"
              aria-label="Filter by category"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
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
            <button
              onClick={() => setShowBookmarksOnly(v => !v)}
              className={`rounded-lg border px-3 py-2 text-sm shadow-sm dark:border-neutral-700 ${
                showBookmarksOnly
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-400/10 dark:text-yellow-200"
                  : "bg-white text-gray-700 dark:bg-neutral-800 dark:text-neutral-200"
              }`}
              title="Show bookmarks"
              aria-pressed={showBookmarksOnly}
            >
              ★
            </button>
          </div>
        </div>
      </header>

      {/* Content + Sidebar */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[1fr,260px]">
          {/* Feed */}
          <section>
            {/* Topic chip if active */}
            {topicFilter && (
              <div className="mb-4 flex items-center gap-2 text-sm">
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-200">
                  Filtering by: {topicFilter}
                </span>
                <button
                  onClick={clearTopic}
                  className="rounded-lg border px-2 py-1 shadow-sm text-xs hover:bg-gray-50 dark:hover:bg-neutral-700 dark:border-neutral-700"
                >
                  Clear
                </button>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="grid place-items-center py-16 text-center">
                <div className="max-w-sm">
                  <div className="mb-4 text-5xl">📰</div>
                  <h2 className="mb-2 text-xl font-semibold">No stories</h2>
                  <p className="text-sm text-gray-600 dark:text-neutral-400">
                    Try a different category/sentiment, or clear filters.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filtered.map((a) => {
                  const isBookmarked = bookmarks.has(a.id);
                  return (
                    <article
                      key={a.id}
                      className="relative rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md dark:bg-neutral-800 dark:border-neutral-700"
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

                      <ul className="mb-12 list-disc space-y-1 pl-5 text-sm break-words">
                        {(a.bullets || []).map((b, i) => (
                          <li key={i} className="marker:text-gray-400 dark:marker:text-neutral-500">
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

                      {/* Bookmark button in bottom-right (same size as filters) */}
                      <button
                        onClick={() => toggleBookmark(a.id)}
                        className={`absolute bottom-3 right-3 rounded-lg border px-3 py-2 text-sm shadow-sm dark:border-neutral-700 ${
                          isBookmarked
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-400/10 dark:text-yellow-200"
                            : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                        }`}
                        title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
                        aria-pressed={isBookmarked}
                      >
                        ★
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-[72px] h-max">
            <div className="rounded-2xl border bg-white p-4 shadow-sm dark:bg-neutral-800 dark:border-neutral-700">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                Trending Topics
              </h2>
              {trending.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-neutral-400">No data yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {trending.map((t) => (
                    <button
                      key={t.word}
                      onClick={() => setTopicFilter(prev => prev === t.word ? "" : t.word)}
                      className={`rounded-full px-3 py-1 text-xs shadow-sm border dark:border-neutral-700 ${
                        topicFilter === t.word
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-gray-100 text-gray-800 dark:bg-neutral-700/60 dark:text-neutral-100"
                      }`}
                      title={`Appears ${t.count} times`}
                    >
                      {t.word}
                    </button>
                  ))}
                </div>
              )}
              {topicFilter && (
                <button
                  onClick={() => setTopicFilter("")}
                  className="mt-3 text-xs underline underline-offset-2 text-indigo-600 dark:text-indigo-300"
                >
                  Clear topic filter
                </button>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
