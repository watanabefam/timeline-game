// source.mjs — build a registry-compatible source record from a fetched page.
// Pure functions only (no network) so they are unit-testable.

export const WIKIPEDIA_LICENSE = "CC-BY-SA-4.0";

export function wikipediaApiUrl(title, lang = "en") {
  return `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    String(title).replace(/ /g, "_"),
  )}`;
}

/**
 * One Action API request returning the full plain-text extract AND the numeric
 * revision id (a human-verifiable ?oldid= target). Used by fetch-source.mjs.
 */
export function wikipediaActionUrl(title, lang = "en") {
  return (
    `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts|revisions` +
    `&explaintext=1&exlimit=1&rvprop=ids&redirects=1&format=json&formatversion=2` +
    `&titles=${encodeURIComponent(String(title))}`
  );
}

export function wikipediaPageUrl(title, lang = "en") {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, "_"))}`;
}

/** Extract a Wikipedia article title from a URL, or null. */
export function wikiTitleFromUrl(url) {
  try {
    const u = new URL(url);
    if (!/wikipedia\.org$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/wiki\/(.+)$/);
    return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : null;
  } catch {
    return null;
  }
}

/**
 * Build the `source` record that lives on an event, matching registry/sources.json.
 * @param {{title:string, revid:string|number, lang?:string}} p
 */
export function buildWikipediaSource({ title, revid, lang = "en" }) {
  if (!title) throw new Error("title is required");
  return {
    name: `Wikipedia, ${title}`,
    url: wikipediaPageUrl(title, lang),
    license: WIKIPEDIA_LICENSE,
    attribution: `Wikipedia contributors, '${title}', CC BY-SA 4.0`,
    revision: String(revid == null ? "" : revid),
    rights: "verified",
  };
}

/** Action API URL for just the current revision id of an article. */
export function wikipediaRevIdUrl(title, lang = "en") {
  return (
    `https://${lang}.wikipedia.org/w/api.php?action=query&prop=revisions` +
    `&titles=${encodeURIComponent(String(title))}&redirects=1&rvprop=ids&format=json&formatversion=2`
  );
}

/**
 * Every pinned source in a deck: { event, title, pinned, url }.
 * Prefers the structured `sources[]`, falls back to a lone `source`.
 */
export function pinnedRevisions(deck) {
  const out = [];
  for (const e of deck.events || []) {
    const rows = Array.isArray(e.sources) && e.sources.length ? e.sources : e.source ? [e.source] : [];
    rows.forEach((s, i) => {
      const title = s.title || wikiTitleFromUrl(s.url || "");
      if (!s.revision || !title) return;
      out.push({ event: e.id, index: i, title, pinned: String(s.revision), url: s.url || "" });
    });
  }
  return out;
}

/** Compare a pin against the article's current revision id. */
export function driftFor(pin, currentRevId) {
  if (!currentRevId) return { ...pin, current: null, status: "unknown" };
  const current = String(currentRevId);
  return { ...pin, current, status: current === pin.pinned ? "current" : "drifted" };
}
