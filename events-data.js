/*
 * events-data.js
 * ------------------------------------------------------------------
 * Pluggable DECK registry for the Timeline Game.
 *
 * Each deck is a self-contained, reusable content pack:
 *   {
 *     id:       unique string (used in the daily seed)
 *     name:     human label
 *     blurb:    one-line description
 *     emoji:    a glyph for the deck card
 *     filters:  [ { id, label, multi:true, options:[{value,label}], get(ev)->value|value[] } ]
 *     events:   [ { id, title, year, circa?, continent?, week?, fact, emoji? } ]
 *   }
 *
 * Adding a new deck = create a file in decks/ that calls
 * window.registerDeck(). No engine changes needed.
 *
 * Shared filter helpers (ageBucket, AGE_OPTIONS, etc.) are exposed on
 * window so deck files can reference them.
 */

// ---- shared filter helpers ----------------------------------------
function ageBucket(ev) {
  const year = typeof ev === "object" ? ev.year : ev;
  if (ev && ev.era === "prehistory") return "prehistory";
  if (year == null) return "ancient"; // un-dated CC cards still group as Ancient
  if (year < 450) return "ancient";
  if (year < 1500) return "medieval";
  if (year < 1760) return "early-modern";
  if (year < 1970) return "industrial";
  return "modern";
}

// Expose shared helpers on window so deck files can reference them.
window.ageBucket = ageBucket;
window.AGE_OPTIONS = [
  { value: "ancient", label: "Ancient (to c.450)" },
  { value: "medieval", label: "Medieval (c.450–1500)" },
  { value: "early-modern", label: "Exploration (c.1500–1760)" },
  { value: "industrial", label: "Industrial (c.1760–1970)" },
  { value: "modern", label: "Modern (1970–present)" },
];
window.CATEGORY_OPTIONS = [
  { value: "tech", label: "Technology" },
  { value: "culture", label: "Culture" },
  { value: "discovery", label: "Discovery" },
  { value: "world", label: "World & Politics" },
];
window.CONTINENT_OPTIONS = [
  { value: "africa", label: "Africa" },
  { value: "asia", label: "Asia" },
  { value: "europe", label: "Europe" },
  { value: "americas", label: "Americas" },
  { value: "oceania", label: "Oceania" },
];
window.CC_WEEK_OPTIONS = Array.from({ length: 23 }, (_, i) => ({
  value: i + 1,
  label: `Week ${i + 1}`,
}));

// ====================================================================
// DECKS — each deck lives in its own file under decks/ and self-registers
// via window.registerDeck(). Shared helpers above are available on window.
// ====================================================================

// ---- registry -----------------------------------------------------
window.DECKS = [];
// Backward-compat shim: old code referenced window.EVENTS.
window.EVENTS = null;

// Ids supplied by a higher-priority source (e.g. a user import overriding a
// bundled deck). Kept outside the deck object so serialisation stays clean.
const deckPriority = new Map();

// ---- deck registration API (used by decks/*.js and AI-generated decks) --
// options.priority: the higher value wins when two sources supply the same id.
window.registerDeck = function (deck, options) {
  const priority = options && typeof options.priority === "number" ? options.priority : 0;
  if (!deck || !deck.id || !Array.isArray(deck.events) || deck.events.length === 0) {
    console.warn("registerDeck: invalid deck — need id + events[]", deck?.id);
    return;
  }
  const existing = window.DECKS.find((d) => d.id === deck.id);
  if (existing) {
    if (priority > (deckPriority.get(deck.id) || 0)) {
      window.DECKS.splice(window.DECKS.indexOf(existing), 1, deck);
      deckPriority.set(deck.id, priority);
      return;
    }
    console.warn("registerDeck: deck '" + deck.id + "' already registered, skipping");
    return;
  }
  window.DECKS.push(deck);
  deckPriority.set(deck.id, priority);
};

// ---- deck source registry -----------------------------------------
// Decks arrive from several places: bundled files (decks/manifest.json), user
// imports (localStorage), and later downloaded packages and cloud
// entitlements. Each registers a provider:
//
//   { id, priority, timeoutMs, load(ctx) -> Promise<deck[]> }
//
// gatherDeckSources() runs them all with Promise.allSettled so one failing
// source can never block the others, and a hung source times out rather than
// hanging boot. There is deliberately NO hardcoded fallback deck list: on
// failure we degrade to fewer decks and warn, never to stale data.
window.DECK_SOURCES = [];

window.registerDeckSource = function (source) {
  if (!source || !source.id || typeof source.load !== "function") {
    console.warn("registerDeckSource: need { id, load() }", source && source.id);
    return;
  }
  window.DECK_SOURCES.push({
    priority: 0,
    timeoutMs: 5000,
    ...source,
  });
};

function settleSourceTimeout(promise, ms, id) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: new Error("timed out: " + id) });
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, error });
      }
    );
  });
}

window.gatherDeckSources = function (ctx) {
  const sources = window.DECK_SOURCES.slice();
  const jobs = sources.map((source) =>
    settleSourceTimeout(
      Promise.resolve().then(() => source.load(ctx)),
      source.timeoutMs,
      source.id
    ).then((outcome) => ({ source, outcome }))
  );

  return Promise.allSettled(jobs).then((settled) => {
    const failed = [];
    const collected = [];
    settled.forEach((entry, i) => {
      const source = sources[i];
      if (entry.status !== "fulfilled") {
        failed.push({ id: source.id, error: entry.reason });
        return;
      }
      const { outcome } = entry.value;
      if (!outcome.ok) {
        failed.push({ id: source.id, error: outcome.error });
        return;
      }
      const decks = Array.isArray(outcome.value) ? outcome.value : [];
      decks.forEach((deck) => collected.push({ deck, priority: source.priority }));
    });
    // Ascending priority, so a later higher-priority source wins a duplicate id.
    collected.sort((a, b) => a.priority - b.priority);
    collected.forEach(({ deck, priority }) => window.registerDeck(deck, { priority }));
    return { failed };
  });
};
