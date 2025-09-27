import { useEffect, useState } from "react";

type Item = {
  id: string; title: string; outlet: string; url: string;
  published_at: string; bullets: string[];
};

const FEED = "https://coreylamb90.github.io/justnews/summaries.json";

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [generatedAt, setGeneratedAt] = useState("");

  async function load() {
    try {
      const res = await fetch(FEED, { cache: "no-store" });
      const data = await res.json();
      setGeneratedAt(data.generated_at);
      setItems(data.items || []);
      localStorage.setItem("cache", JSON.stringify(data)); // simple offline
    } catch {
      const cached = localStorage.getItem("cache");
      if (cached) {
        const d = JSON.parse(cached);
        setGeneratedAt(d.generated_at || "");
        setItems(d.items || []);
      }
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h1>Unbiased News</h1>
      <p style={{ opacity: .7 }}>Updated: {generatedAt || "…"}</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map(a => (
          <li key={a.id} style={{ margin: "16px 0", padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
            <h3 style={{ margin: 0 }}>{a.title}</h3>
            <p style={{ margin: "6px 0", opacity: .75 }}>
              {(a.outlet || "Source")} · {a.published_at ? new Date(a.published_at).toLocaleString() : ""}
            </p>
            <ul>{(a.bullets || []).map((b: string, i: number) => <li key={i}>{b}</li>)}</ul>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <a href={a.url} target="_blank" rel="noreferrer">Open original</a>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
