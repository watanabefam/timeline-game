// license.mjs — deterministic, fail-closed license resolution.
// Unknown or unlisted licenses are treated as forbidden (registry.unknownLicense).

import { finding } from "./findings.mjs";

export function resolveLicense(registry, licenseId) {
  const unknown = registry.unknownLicense || "forbidden";
  if (!licenseId) return { category: unknown, known: false, attributionRequired: false };
  const entry = registry.licenses && registry.licenses[licenseId];
  if (!entry) return { category: unknown, known: false, attributionRequired: false };
  return { category: entry.category || unknown, known: true, attributionRequired: !!entry.attributionRequired };
}

function hostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Returns findings for one event's sources — structured `sources[]` or a lone `source`. */
export function checkSource(registry, e) {
  const structured = Array.isArray(e.sources) && e.sources.length > 0;
  const rows = structured ? e.sources : e.source ? [e.source] : [];
  if (!rows.length) {
    return [finding("SOURCE_MISSING", "error", `event "${e.id}" has no source`, { event: e.id, path: "source" })];
  }

  const out = [];
  rows.forEach((src, i) => {
    const base = structured ? `sources[${i}]` : "source";
    const host = hostname(src.url);
    if (!host) {
      out.push(finding("SCHEMA", "error", `invalid source URL: ${src.url}`, { event: e.id, path: `${base}.url` }));
      return;
    }

    const registered = (registry.sources || []).find((s) => s.domain === host);
    if (!registered) {
      out.push(
        finding("SOURCE_UNREGISTERED", "error", `source domain not in registry: ${host}`, {
          event: e.id,
          path: `${base}.url`,
        }),
      );
    }

    const lic = resolveLicense(registry, src.license);
    if (!lic.known) {
      out.push(
        finding("LICENSE_MISSING", "error", `license not in registry: ${src.license ?? "(none)"}`, {
          event: e.id,
          path: `${base}.license`,
        }),
      );
    } else if (lic.category === "forbidden") {
      out.push(
        finding("LICENSE_FORBIDDEN", "error", `license is forbidden: ${src.license}`, {
          event: e.id,
          path: `${base}.license`,
        }),
      );
    }

    // A lone `source` carries an `attribution` string; a `sources[]` row carries
    // the creator name (CC's TASL "A").
    const attribution = src.attribution || src.author;
    if (lic.attributionRequired && !attribution) {
      out.push(
        finding("ATTRIBUTION_MISSING", "error", `license ${src.license} requires attribution`, {
          event: e.id,
          path: `${base}.attribution`,
        }),
      );
    }
  });

  return out;
}
