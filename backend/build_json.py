#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json, time, hashlib, datetime as dt, sys, os, re
from collections import defaultdict
from pathlib import Path
from typing import Optional, List, Dict

import feedparser
import requests
import trafilatura
from tqdm import tqdm
from transformers import pipeline

# ---------------- Paths (script-relative) ----------------
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
<<<<<<< HEAD
MAX_ARTICLES_TOTAL = 300       # global cap per run
MAX_PER_FEED = 5              # per feed cap
=======
MAX_ARTICLES_TOTAL = 500       # global cap per run
MAX_PER_FEED = 10              # per feed cap
>>>>>>> 2d147e7 (feat: update App.tsx (remove sentiment filter) and build_json.py (clustering & moods))
REQUEST_TIMEOUT = 12          # seconds
MIN_TEXT_LEN = 500            # skip very short pages
EXCERPT_LEN = 1500            # summarize only the first N chars for speed
SLEEP_BETWEEN = 0.15          # polite delay between items
SENTI_NEUTRAL_THRESHOLD = 0.65  # <= this score -> call it Neutral

# ---------------- Helper: load feeds.json ----------------
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

# ---------------- Net + extract ----------------
UA = {"User-Agent": "JustNews/1.0 (+https://github.com/coreylamb90/justnews)"}

def fetch_html(url: str) -> Optional[str]:
    try:
        r = requests.get(url, timeout=REQUEST_TIMEOUT, headers=UA)
        if r.status_code != 200:
            return None
        return r.text
    except Exception:
        return None

def extract_text(html: str) -> str:
    return trafilatura.extract(html) or ""

# ---------------- IDs + time ----------------
def make_id(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()[:12]

def now_iso() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

# ---------------- NLP: summarizer + sentiment (CPU) ----------------
print("Loading summarizer (DistilBART)…", flush=True)
summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6", device=-1)
print("Summarizer ready.", flush=True)

print("Loading sentiment model (SST-2)…", flush=True)
sentiment_clf = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english", device=-1)
print("Sentiment ready.", flush=True)

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

def classify_sentiment(title: str, bullets: List[str]) -> dict:
    text = (title + " " + " ".join(bullets)).strip()[:700]
    res = sentiment_clf(text, truncation=True)[0]  # {'label': 'POSITIVE'|'NEGATIVE', 'score': ...}
    raw = (res.get("label") or "").upper()
    score = float(res.get("score") or 0.0)
    if score <= SENTI_NEUTRAL_THRESHOLD:
        label = "neutral"
    elif raw == "POSITIVE":
        label = "positive"
    else:
        label = "negative"
    return {"label": label, "score": round(score, 3)}

# ---------------- Mood variants ----------------
POS_WORDS = {"win","gains","growth","record","award","boost","reduce","relief","improve","strong",
             "surge","rebound","recovery","progress","breakthrough","help","hope","healing","saved"}
IMPACT_WORDS = {"will","could","impact","affect","effect","cause","lead","result","expected","plan",
                "policy","bill","ban","require","expand","cut","increase","decrease","deadline","costs","risk"}

def mood_variants(title: str, bullets: List[str]) -> dict:
    brief = bullets[:2] if len(bullets) >= 2 else bullets[:1]
    hopeful = [b for b in bullets if any(p in b.lower() for p in POS_WORDS)]
    if not hopeful: hopeful = bullets[:2] or bullets[:1]
    stakes = [b for b in bullets if any(k in b.lower() for k in IMPACT_WORDS)]
    if not stakes: stakes = bullets[:3] or bullets
    return {
        "brief_bullets": brief[:4],
        "hopeful_bullets": hopeful[:4],
        "stakes_bullets": stakes[:4],
    }

# ---------------- Clustering (title token overlap) ----------------
STOP = set("""
the and for that with from this have will your their about into over more than been after
says said were was are its you but they them who what when where why how amid as of on
to in by at a an it is be or we our not new his her has had also may can could would should
one two three u us news update latest breaking
""".split())
TOKEN_RE = re.compile(r"[A-Za-z0-9]+")

def tokenize_title(title: str) -> List[str]:
    words = [w.lower() for w in TOKEN_RE.findall(title or "")]
    words = [w[:-1] if len(w) > 4 and w.endswith("s") else w for w in words]
    return [w for w in words if len(w) >= 3 and w not in STOP]

def signature_words(title: str, k: int = 6) -> List[str]:
    seen, sig = set(), []
    for w in tokenize_title(title):
        if w not in seen:
            sig.append(w); seen.add(w)
        if len(sig) >= k: break
    return sig

def jaccard(a: set, b: set) -> float:
    if not a or not b: return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0

# ---------------- Main run ----------------
def run():
    feeds = load_feeds()
    if not PUBLIC_DIR.exists():
        PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    items = []
    seen_urls = set()
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

            if not url or url in seen_urls:
                continue
            seen_urls.add(url)

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
            moods = mood_variants(title, bullets)

            items.append({
                "id": make_id(url),
                "title": title,
                "outlet": outlet_name,
                "url": url,
                "published_at": published,
                "bullets": bullets,        # neutral/standard bullets
                "category": feed_cat,
                "sentiment": sent,         # {"label": positive|neutral|negative, "score": float}
                "moods": moods,            # {"brief_bullets":[], "hopeful_bullets":[], "stakes_bullets":[]}
            })
            total += 1
            kept += 1
            time.sleep(SLEEP_BETWEEN)

        print(f"Feed done: kept {kept}", flush=True)
        if total >= MAX_ARTICLES_TOTAL:
            break

    # ---- Build clusters (multiple perspectives) ----
    print("\nClustering titles…", flush=True)
    buckets: List[tuple[set, List[int]]] = []  # (signature_set, [item_idx,...])

    for idx, it in enumerate(items):
        sig = set(signature_words(it["title"]))
        if not sig:
            buckets.append((sig, [idx]))
            continue
        assigned = False
        for b_idx, (b_sig, idxs) in enumerate(buckets):
            if jaccard(sig, b_sig) >= 0.6:      # threshold can be tuned
                idxs.append(idx)
                buckets[b_idx] = (b_sig | sig, idxs)  # expand signature
                assigned = True
                break
        if not assigned:
            buckets.append((sig, [idx]))

    clusters = []
    for (sig_set, idxs) in buckets:
        if len(idxs) == 0:
            continue
        # Topic label from sig words
        topic = " ".join(sorted(list(sig_set))[:4]) or "topic"
        cid = make_id(topic + "".join(items[i]["id"] for i in idxs)[:24])
        clusters.append({
            "id": cid,
            "topic": topic,
            "keywords": sorted(list(sig_set))[:8],
            "item_ids": [items[i]["id"] for i in idxs],
            "outlets": sorted({items[i]["outlet"] or "" for i in idxs if items[i].get("outlet")}),
        })
        for i in idxs:
            items[i]["cluster_id"] = cid

    # ---- Write JSON ----
    sorted_items = sorted(items, key=lambda x: x.get("published_at") or "", reverse=True)
    data = {
        "generated_at": now_iso(),
        "items": sorted_items,
        "clusters": clusters,
    }

    out_path = PUBLIC_DIR / "summaries.json"
    print(f"\nWriting {len(sorted_items)} items to {out_path}", flush=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Done.", flush=True)

# ---------------- Entry ----------------
if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        sys.exit(130)
    except Exception as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)
