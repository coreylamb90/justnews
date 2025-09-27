import { useEffect, useState } from "react";

type Item = {
  id: string;
  title: string;
  outlet: string;
  url: string;
  published_at: string;
  bullets: string[];
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

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  async function load() {
    try {
      const res = await fetch(FEED, { cache: "no-store" });
      const data = await res.json();
      setGeneratedAt(data.generated_at || "");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      console.error("Failed to fetch feed");
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-neutral-900 dark:text-neutral-100">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b bg-white/80 dark:bg-neutral-900/80 backdrop-blur px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <h1 className="text-xl font-semibold">Unbiased News</h1>
          <span className="text-sm text-gray-500 dark:text-neutral-400">
            Updated {generatedAt ? timeAgo(generatedAt) : "…"}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-6 py-6">
        {items.length === 0 ? (
          <div className="grid place-items-center py-20 text-center">
            <div>
              <div className="text-5xl mb-4">📰</div>
              <h2 className="text-xl font-semibold">No stories yet</h2>
              <p className="text-gray-500 dark:text-neutral-400">
                Please check back later.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => (
              <article
                key={a.id}
                className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition dark:bg-neutral-800 dark:border-neutral-700"
              >
                <header className="mb-3">
                  <h3 className="text-lg font-semibold leading-snug line-clamp-3">
                    {a.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-neutral-400">
                    {a.outlet || "Source"} ·{" "}
                    {a.published_at ? timeAgo(a.published_at) : ""}
                  </p>
                </header>

                <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
                  {(a.bullets || []).map((b, i) => (
                    <li key={i}>{b.replace(/^•\s?/, "")}</li>
                  ))}
                </ul>

                <footer>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
                  >
                    Open original
                  </a>
                </footer>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
