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

// ---- deck registration API (used by decks/*.js and AI-generated decks) --
window.registerDeck = function (deck) {
  if (!deck || !deck.id || !Array.isArray(deck.events) || deck.events.length === 0) {
    console.warn("registerDeck: invalid deck — need id + events[]", deck?.id);
    return;
  }
  if (window.DECKS.some((d) => d.id === deck.id)) {
    console.warn("registerDeck: deck '" + deck.id + "' already registered, skipping");
    return;
  }
  window.DECKS.push(deck);
};
