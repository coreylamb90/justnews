import json, time, hashlib, datetime as dt
import feedparser, requests, sys
import trafilatura
from transformers import pipeline
from tqdm import tqdm

FEEDS = [
  "https://www.theguardian.com/world/rss",
  "https://www.reuters.com/world/rss",
  "https://feeds.npr.org/1001/rss.xml",
]

MAX_ARTICLES_TOTAL = 12        # keep small while testing
MAX_PER_FEED = 5               # per feed limit
REQUEST_TIMEOUT = 10           # seconds
MIN_TEXT_LEN = 500             # skip very short pages
EXCERPT_LEN = 1500             # trim long articles for speed

print("Loading summarizer (DistilBART)…", flush=True)
summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6", device=-1)
print("Summarizer ready.", flush=True)

def fetch_html(url: str) -> str | None:
    try:
        r = requests.get(url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": "JustNews/1.0"})
        if r.status_code != 200:
            return None
        return r.text
    except Exception:
        return None

def extract_text(html: str) -> str:
    return trafilatura.extract(html) or ""

def summarize_text(text: str) -> list[str]:
    excerpt = text[:EXCERPT_LEN]
    out = summarizer(
        excerpt,
        max_length=150,   # shorter = faster
        min_length=50,
        do_sample=False
    )[0]["summary_text"]
    bullets = [("• " + b.strip().rstrip(".")) for b in out.split(". ") if b.strip()]
    return bullets[:5] if bullets else ["• (no summary)"]

def make_id(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:12]

def now_iso() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def run():
    items = []
    seen = set()
    total = 0

    for feed in FEEDS:
        print(f"\nParsing feed: {feed}", flush=True)
        parsed = feedparser.parse(feed)
        count_this_feed = 0

        for e in tqdm(parsed.entries[:MAX_PER_FEED], desc="Entries", unit="art"):
            if total >= MAX_ARTICLES_TOTAL:
                break

            url = getattr(e, "link", None)
            title = getattr(e, "title", "Untitled")
            published = getattr(e, "published", None) or getattr(e, "updated", None)
            outlet = parsed.feed.get("title", "")

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

            items.append({
                "id": make_id(url),
                "title": title,
                "outlet": outlet,
                "url": url,
                "published_at": published,
                "bullets": bullets
            })
            total += 1
            count_this_feed += 1
            time.sleep(0.2)  # be polite

        print(f"Feed done: kept {count_this_feed}", flush=True)
        if total >= MAX_ARTICLES_TOTAL:
            break

    data = {
        "generated_at": now_iso(),
        "items": sorted(items, key=lambda x: x["published_at"] or "", reverse=True)
    }

    print(f"\nWriting {len(items)} items to public/summaries.json", flush=True)
    with open("public/summaries.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("Done.", flush=True)

if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
