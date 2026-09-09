/*
 * decks-io.js — JSON import/export for timeline decks
 * ------------------------------------------------------------------
 * Client-side only. Uses Blob URLs for export and FileReader for import.
 * No server, no build step, no external dependencies.
 */

(function () {
  "use strict";

  // ---- validation ---------------------------------------------------
  function validateDeck(obj) {
    if (!obj || typeof obj !== "object") return "Not a JSON object.";
    if (typeof obj.id !== "string" || !obj.id.trim()) return "Missing deck id.";
    if (!Array.isArray(obj.events)) return "Missing events array.";
    if (obj.events.length === 0) return "Deck has no events.";
    for (let i = 0; i < obj.events.length; i++) {
      const ev = obj.events[i];
      if (!ev || typeof ev.title !== "string" || !ev.title.trim()) {
        return `Event #${i + 1} is missing a title.`;
      }
      if (ev.year == null && !obj.events[i].sortYear) {
        return `Event #${i + 1} ("${ev.title}") is missing a year or sortYear.`;
      }
    }
    return null;
  }

  function isDuplicateId(id) {
    return window.DECKS.some(function (d) { return d.id === id; });
  }

  // ---- export -------------------------------------------------------
  // Edge (Chromium) opens a leftover blank tab for anchor-triggered
  // downloads — a known quirk (the file downloads, but the tab stays open
  // and blank). Copy to clipboard instead so the export never spawns a
  // tab. Other browsers keep the native download.
  function isEdge() {
    return /Edg\//.test(navigator.userAgent || "");
  }

  function downloadJson(filename, jsonString) {
    if (isEdge()) {
      copyExport(filename, jsonString);
      return;
    }
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke on the next tick (not synchronously): browsers that open the
    // blob URL in a tab instead of downloading need the URL alive to
    // resolve it — revoking immediately left those tabs blank.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyExport(filename, jsonString) {
    const status = document.getElementById("decks-status");
    const note = (msg) => { if (status) status.textContent = msg; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonString).then(() => {
        note(`Copied ${filename} to clipboard — Edge opens a blank tab on downloads, so the JSON is on your clipboard instead.`);
      }).catch(() => {
        note("Clipboard blocked — serve the game over http:// to download decks.");
      });
    } else {
      note("Clipboard unavailable — serve the game over http:// to download decks.");
    }
  }

  window.exportDeck = function (deckId) {
    const deck = window.DECKS.find(function (d) { return d.id === deckId; });
    if (!deck) {
      alert("Deck not found: " + deckId);
      return;
    }
    const payload = {
      id: deck.id,
      name: deck.name,
      blurb: deck.blurb,
      emoji: deck.emoji,
      tier: deck.tier,
      filters: deck.filters || [],
      events: deck.events,
    };
    downloadJson(deck.id + "-deck.json", JSON.stringify(payload, null, 2));
  };

  window.exportAllDecks = function () {
    if (window.DECKS.length === 0) {
      alert("No decks to export.");
      return;
    }
    const payload = window.DECKS.map(function (d) {
      return {
        id: d.id,
        name: d.name,
        blurb: d.blurb,
        emoji: d.emoji,
        tier: d.tier,
        filters: d.filters || [],
        events: d.events,
      };
    });
    downloadJson("all-decks.json", JSON.stringify(payload, null, 2));
  };

  // ---- import -------------------------------------------------------
  function importDeckObject(obj) {
    const err = validateDeck(obj);
    if (err) {
      alert("Invalid deck: " + err);
      return false;
    }

    // Clean unknown top-level fields; keep only the schema we use.
    const deck = {
      id: String(obj.id).trim(),
      name: typeof obj.name === "string" ? obj.name : obj.id,
      blurb: typeof obj.blurb === "string" ? obj.blurb : "Imported deck",
      emoji: typeof obj.emoji === "string" ? obj.emoji : "🎴",
      tier: typeof obj.tier === "string" ? obj.tier : "free",
      filters: Array.isArray(obj.filters) ? obj.filters : [],
      events: obj.events,
    };

    const existing = window.DECKS.find(function (d) { return d.id === deck.id; });
    if (existing) {
      const ok = confirm(
        'Deck "' + deck.id + '" already exists. Replace it?'
      );
      if (!ok) return false;
      const idx = window.DECKS.indexOf(existing);
      window.DECKS.splice(idx, 1);
    }

    if (typeof window.registerDeck === "function") {
      window.registerDeck(deck);
    } else {
      window.DECKS.push(deck);
    }

    // Persist to localStorage so it survives reloads on file://.
    try {
      const stored = JSON.parse(localStorage.getItem("timeline.importedDecks") || "[]");
      stored.push({
        id: deck.id,
        name: deck.name,
        events: deck.events,
        filters: deck.filters,
        emoji: deck.emoji,
        blurb: deck.blurb,
        tier: deck.tier,
      });
      localStorage.setItem("timeline.importedDecks", JSON.stringify(stored));
    } catch (_) {
      // localStorage may be disabled; ignore silently.
    }

    return true;
  }

  window.importDeckFromString = function (jsonString) {
    let obj;
    try {
      obj = JSON.parse(jsonString);
    } catch (e) {
      alert("Could not parse JSON: " + e.message);
      return false;
    }
    if (Array.isArray(obj)) {
      let anyOk = false;
      obj.forEach(function (item) {
        if (importDeckObject(item)) anyOk = true;
      });
      return anyOk;
    }
    return importDeckObject(obj);
  };

  window.importDeckFromFile = function (file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const ok = window.importDeckFromString(e.target.result);
        if (ok) resolve(file.name);
        else reject(new Error("Import failed: " + file.name));
      };
      reader.onerror = function () {
        reject(new Error("Could not read file: " + file.name));
      };
      reader.readAsText(file);
    });
  };

  // ---- bootstrap imported decks from localStorage --------------------
  // Called by timeline.js AFTER external deck files have loaded.
  window.loadImportedDecks = function () {
    try {
      const stored = JSON.parse(localStorage.getItem("timeline.importedDecks") || "[]");
      if (!Array.isArray(stored) || stored.length === 0) return;
      stored.forEach(function (d) {
        if (!window.DECKS.some(function (x) { return x.id === d.id; })) {
          window.registerDeck(d);
        }
      });
    } catch (_) {
      // ignore
    }
  };
})();
