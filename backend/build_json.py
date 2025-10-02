import json, time, hashlib, datetime as dt, sys
import feedparser, requests, os
import trafilatura
from transformers import pipeline
from tqdm import tqdm
from pathlib import Path
from typing import Optional, List, Dict

# ---------------- Path helpers (script-relative) ----------------
HERE = Path(__file__).resolve().parent
PUBLIC_DIR = HERE / "public"
FEEDS_JSON = HERE / "feeds.json"

# ---------------- Defaults if feeds.json missing ----------------
DEFAULT_FEEDS: List[Dict[str, str]] = [
    {"url": "https://www.reuters.com/world/rss", "category": "World"},
    {"url": "https://feeds.npr.org/1001/rss.xml", "category": "General"},
    {"url": "https://www.theverge.com/rss/index.xml", "category": "Technology"},
    {"url": "https://www.sciencedaily.com/rss/top/science.xml", "category": "Science"},
]

# ---------------- Tunables ----------------
MAX_ARTICLES_TOTAL = 100       # keep small while testing
MAX_PER_FEED = 5              # per feed limit
REQUEST_TIMEOUT = 12          # seconds
MIN_TEXT_LEN = 500            # skip very short pages
EXCERPT_LEN = 1500            # trim long articles for speed
SLEEP_BETWEEN = 0.2           # polite pause between items

def load_feeds() -> List[Dict[str, str]]:
    """Load feeds.json: list of {url, category}. Fallback to DEFAULT_FEEDS."""
    try:
        if FEEDS_JSON.exists():
            data = json.loads(FEEDS_JSON.read_text(encoding="utf-8"))
            out = []
            for row in data:
                if isinstance(row, dict) and "url" in row:
                    out.append({
                        "url": str(row["url"]).strip(),
                        "category": str(row.get("category", "General")).strip() or "General"
                    })
            if out:
                return out
    except Exception as e:
        print(f"(warn) failed to read feeds.json: {e}", flush=True)
    return DEFAULT_FEEDS

def fetch_html(url: str) -> Optional[str]:
    try:
        r = requests.get(url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": "JustNews/1.0"})
        if r.status_code != 200:
            return None
        return r.text
    except Exception:
        return None

def extract_text(html: str) -> str:
    return trafilatura.extract(html) or ""

def make_id(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:12]

def now_iso() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

# ---- Summarizer (DistilBART; faster on CPU) ----
print("Loading summarizer (DistilBART)…", flush=True)
summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6", device=-1)
print("Summarizer ready.", flush=True)

def summarize_text(text: str) -> List[str]:
    excerpt = text[:EXCERPT_LEN]
    out = summarizer(
        excerpt,
        max_length=150,   # shorter = faster
        min_length=50,
        do_sample=False
    )[0]["summary_text"]
    bullets = [("• " + b.strip().rstrip(".")) for b in out.split(". ") if b.strip()]
    return bullets[:5] if bullets else ["• (no summary)"]

print("Loading sentiment model (SST-2)…", flush=True)
sentiment_clf = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english", device=-1)
print("Sentiment ready.", flush=True)

def classify_sentiment(title: str, bullets: list[str]) -> dict:
    # Build a short text from title + bullets for classification
    text = (title + " " + " ".join(bullets)).strip()
    text = text[:700]  # keep it snappy for CI/CPU
    res = sentiment_clf(text, truncation=True)[0]  # {'label': 'POSITIVE'|'NEGATIVE', 'score': ...}
    label_raw = (res.get("label") or "").upper()
    score = float(res.get("score") or 0.0)
    # Create a 'neutral' band for low confidence
    if score < 0.65:     # tweakable threshold
        label = "neutral"
    elif label_raw == "POSITIVE":
        label = "positive"
    else:
        label = "negative"
    return {"label": label, "score": round(score, 3)}

def run():
    feeds = load_feeds()
    if not PUBLIC_DIR.exists():
        PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    items = []
    seen = set()
    per_cat = {}
    total = 0

    for f in feeds:
        feed_url = f["url"]
        feed_cat = f.get("category", "General")
        print(f"\nParsing feed: {feed_url}  (category: {feed_cat})", flush=True)

        parsed = feedparser.parse(feed_url)
        outlet_name = parsed.feed.get("title", "")

        kept = 0
        for e in tqdm(parsed.entries[:MAX_PER_FEED], desc="Entries", unit="art"):
            if total >= MAX_ARTICLES_TOTAL:
                break

            url = getattr(e, "link", None)
            title = getattr(e, "title", "Untitled")
            published = getattr(e, "published", None) or getattr(e, "updated", None)

            if not url or url in seen:
                continue
            seen.add(url)

            print(f"\n→ Fetching: {title}\n  {url}", flush=True)
            html = fetch_html(url)
            if not html:
                print("  (skip) fetch failed/timeout", flush=True)
                continue

            text = extract_text(html)
            if len(text) < MIN_TEXT_LEN:
                print("  (skip) too short after extraction", flush=True)
                continue

            print("  summarizing…", flush=True)
            try:
                bullets = summarize_text(text)
            except Exception as ex:
                print(f"  (skip) summarizer error: {ex}", flush=True)
                continue

            sent = classify_sentiment(title, bullets)

            items.append({
                "id": make_id(url),
                "title": title,
                "outlet": outlet_name,
                "url": url,
                "published_at": published,
                "bullets": bullets,
                "category": feed_cat,
                "sentiment": sent,
            })
            total += 1
            kept += 1
            per_cat[feed_cat] = per_cat.get(feed_cat, 0) + 1
            time.sleep(SLEEP_BETWEEN)

        print(f"Feed done: kept {kept}", flush=True)
        if total >= MAX_ARTICLES_TOTAL:
            break

    data = {
        "generated_at": now_iso(),
        "items": sorted(items, key=lambda x: x["published_at"] or "", reverse=True)
    }

    out_path = PUBLIC_DIR / "summaries.json"
    print(f"\nWriting {len(items)} items to {out_path}", flush=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Done.", flush=True)

if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
