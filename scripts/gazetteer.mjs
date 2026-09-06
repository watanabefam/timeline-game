// gazetteer.mjs — maps a free-text `where` string to coordinates + area.
// Keyed by the EXACT (normalized) `where` value so detection is unambiguous:
// every value shown in the fact sheet resolves to one explicit coordinate.
//
// area: number (radius in km, drawn as a circle for a region/country/continent)
//       or the string "world" (spans the globe) or undefined (a specific place -> pin).
// off: true marks non-Earth locations (no map).

const GAZ = {
  // ----- exact `where` values (every distinct value used in events-data.js) -----
  "united states": { lat: 39.8, lng: -98.6, area: 4000 },
  "usa": { lat: 39.8, lng: -98.6, area: 4000 },
  "england": { lat: 52.5, lng: -1.5, area: 300 },
  "england (london)": { lat: 51.51, lng: -0.13 },
  "england / france": { lat: 52.5, lng: -1.5, area: 300 },
  "europe": { lat: 50, lng: 12, area: 3000 },
  "europe / worldwide": { lat: 50, lng: 10, area: "world" },
  "europe / world": { lat: 50, lng: 10, area: "world" },
  "europe / usa": { lat: 50, lng: 12, area: 3000 },
  "rome": { lat: 41.9, lng: 12.5 },
  "rome / empire": { lat: 41.9, lng: 12.5, area: 2500 },
  "rome / frankish empire": { lat: 41.9, lng: 12.5, area: 2500 },
  "rome / constantinople": { lat: 41.9, lng: 12.5, area: 2500 },
  "italy": { lat: 42.8, lng: 12.8, area: 600 },
  "italy → europe": { lat: 42.8, lng: 12.8, area: 600 },
  "greece": { lat: 39, lng: 22, area: 300 },
  "greece / italy": { lat: 39, lng: 22, area: 300 },
  "macedon / greece": { lat: 39, lng: 22, area: 300 },
  "india": { lat: 22, lng: 79, area: 1500 },
  "germany": { lat: 51.2, lng: 10.4, area: 500 },
  "germany / europe": { lat: 51.2, lng: 10.4, area: 500 },
  "japan": { lat: 36.2, lng: 138, area: 500 },
  "france": { lat: 46.6, lng: 2.4, area: 600 },
  "france / europe": { lat: 46.6, lng: 2.4, area: 600 },
  "geneva / france": { lat: 46.2, lng: 6.14 },
  "worldwide": { lat: 20, lng: 0, area: "world" },
  "worldwide (hq: new york)": { lat: 20, lng: 0, area: "world" },
  "global": { lat: 20, lng: 0, area: "world" },
  "roman empire": { lat: 41.9, lng: 12.5, area: 2500 },
  "north america": { lat: 45, lng: -100, area: 3000 },
  "jerusalem": { lat: 31.78, lng: 35.23 },
  "jerusalem / babylon": { lat: 31.78, lng: 35.23 },
  "south africa": { lat: -30.6, lng: 22.9, area: 800 },
  "russia": { lat: 61, lng: 100, area: 4000 },
  "mexico": { lat: 23.6, lng: -102.5, area: 1200 },
  "mexico / peru": { lat: 23.6, lng: -102.5, area: 1200 },
  "mexico / central america": { lat: 23.6, lng: -102.5, area: 1200 },
  "gulf coast of mexico": { lat: 23.6, lng: -102.5, area: 1200 },
  "constantinople": { lat: 41.01, lng: 28.98 },
  "china": { lat: 35, lng: 105, area: 3000 },
  "china / india": { lat: 35, lng: 105, area: 3000 },
  "congo": { lat: -4.32, lng: 15.31, area: 800 },
  "cornwall": { lat: 50.27, lng: -5.05, area: 100 },
  "yellow river, china": { lat: 34, lng: 108, area: 600 },
  "canada": { lat: 56, lng: -106, area: 3000 },
  "usa / canada": { lat: 39.8, lng: -98.6, area: 4000 },
  "canaan": { lat: 32.5, lng: 35.5, area: 200 },
  "canaan / mesopotamia": { lat: 32.5, lng: 35.5, area: 200 },
  "west africa": { lat: 9, lng: -3, area: 1500 },
  "west africa → americas": { lat: 9, lng: -3, area: 1500 },
  "west / east africa": { lat: 5, lng: 20, area: 2500 },
  "virginia / massachusetts": { lat: 37.5, lng: -79, area: 200 },
  "vietnam": { lat: 16, lng: 107.8, area: 500 },
  "venice → china": { lat: 45.44, lng: 12.34 },
  "ussr / poland": { lat: 60, lng: 90, area: 4000 },
  "usa (new orleans)": { lat: 29.95, lng: -90.07 },
  "u.s. south": { lat: 33, lng: -85, area: 600 },
  "turkey → middle east": { lat: 39, lng: 35, area: 600 },
  "trent (italy)": { lat: 46.07, lng: 11.12 },
  "thirteen colonies": { lat: 38, lng: -77, area: 600 },
  "the caribbean": { lat: 15, lng: -75, area: 800 },
  "caribbean": { lat: 15, lng: -75, area: 800 },
  "caribbean / pacific": { lat: 15, lng: -75, area: 800 },
  "sub-saharan africa": { lat: 5, lng: 25, area: 3500 },
  "spain": { lat: 40.2, lng: -3.7, area: 500 },
  "baghdad / spain": { lat: 33.3, lng: 44.4, area: 200 },
  "southeastern usa → oklahoma": { lat: 33, lng: -84, area: 600 },
  "south america": { lat: -15, lng: -60, area: 3000 },
  "scandinavia → atlantic": { lat: 62, lng: 14, area: 1000 },
  "samaria / assyria": { lat: 32.3, lng: 35.2, area: 150 },
  "portugal": { lat: 39.5, lng: -8, area: 200 },
  "peru / andes": { lat: -9.2, lng: -75, area: 800 },
  "persia": { lat: 32.65, lng: 51.68, area: 1500 },
  "persia / mesopotamia": { lat: 32, lng: 53, area: 1500 },
  "persia (to india)": { lat: 32, lng: 53, area: 1500 },
  "palestine / israel": { lat: 31.9, lng: 35.2, area: 200 },
  "pakistan / india": { lat: 30, lng: 70, area: 800 },
  "pacific": { lat: 0, lng: -160, area: 3500 },
  "pacific / australia / antarctica": { lat: 0, lng: -160, area: "world" },
  "nubia (sudan)": { lat: 18, lng: 32, area: 800 },
  "north atlantic": { lat: 40, lng: -40, area: 2500 },
  "north africa (hippo)": { lat: 23, lng: 15, area: 2500 },
  "nile river, north africa": { lat: 24, lng: 32, area: 1500 },
  "nicea (turkey)": { lat: 40.43, lng: 29.72 },
  "mesopotamia, egypt, indus": { lat: 30, lng: 50, area: 3000 },
  "mesopotamia": { lat: 33, lng: 44, area: 600 },
  "mesopotamia (traditional)": { lat: 33, lng: 44, area: 600 },
  "mesopotamia (n. iraq)": { lat: 34, lng: 43, area: 600 },
  "mesopotamia (iraq)": { lat: 33, lng: 44, area: 600 },
  "mediterranean": { lat: 35, lng: 18, area: 2500 },
  "mediterranean & near east": { lat: 35, lng: 18, area: 2500 },
  "levant": { lat: 33.5, lng: 36, area: 400 },
  "lebanon / mediterranean coasts": { lat: 33.9, lng: 35.9, area: 150 },
  "korea": { lat: 36.5, lng: 127.8, area: 300 },
  "kievan rus (ukraine/russia)": { lat: 50, lng: 31, area: 1000 },
  "judea": { lat: 31.7, lng: 35, area: 150 },
  "judea / galilee": { lat: 31.7, lng: 35, area: 150 },
  "israel (jerusalem)": { lat: 31.4, lng: 35, area: 200 },
  "egypt → sinai": { lat: 26.8, lng: 30.8, area: 800 },
  "ethiopia": { lat: 9.01, lng: 38.75, area: 800 },
  "ecuador": { lat: -1.8, lng: -78, area: 400 },
  "eastern europe": { lat: 52, lng: 27, area: 1500 },
  "chalcedon (turkey)": { lat: 40.99, lng: 29.03 },
  "central asia": { lat: 42, lng: 65, area: 3000 },
  "american colonies": { lat: 38, lng: -77, area: 800 },
  "afghanistan": { lat: 33.93, lng: 67.71, area: 800 },
  "aegean sea": { lat: 36, lng: 25, area: 600 },
  "greenland / vinland": { lat: 72, lng: -40, area: 1500 },
  "giza, egypt": { lat: 29.98, lng: 31.13 },
  "garden of eden (traditional)": { lat: 31, lng: 47, area: 400 },
  "bethlehem / rome": { lat: 31.7, lng: 35.2 },
  "babylon (iraq)": { lat: 32.54, lng: 44.42 },
  "austria": { lat: 47.5, lng: 14, area: 200 },
  "australia": { lat: -25, lng: 133, area: 2500 },
  "atlantic": { lat: 30, lng: -40, area: 3500 },
  "atlantic / global": { lat: 20, lng: 0, area: "world" },
  "athens": { lat: 37.98, lng: 23.73 },
  "arabia (mecca/medina)": { lat: 23, lng: 45, area: 1500 },
  "antarctica": { lat: -82, lng: 0, area: 3000 },
  "algeria": { lat: 28.03, lng: 1.66, area: 1200 },
  "anatolia / levant": { lat: 39, lng: 33, area: 600 },
  "cern, switzerland": { lat: 46.8, lng: 8.2, area: 200 },
  "britain → world": { lat: 54, lng: -2, area: "world" },
  "the moon": { off: true },
  "moon": { off: true },
};

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

// Exact match on the `where` field first (fully reliable); only fall back to a
// substring scan for brand-new `where` values not yet in the table.
function lookupWhere(where) {
  if (!where) return null;
  const n = norm(where);
  if (GAZ[n]) return { ...GAZ[n] };
  let best = null;
  let bestLen = 0;
  for (const key of Object.keys(GAZ)) {
    if (n.includes(key) && key.length > bestLen) {
      best = GAZ[key];
      bestLen = key.length;
    }
  }
  return best ? { ...best } : null;
}

export { GAZ, lookupWhere };
