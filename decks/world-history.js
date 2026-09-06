/*
 * decks/world-history.js
 * ------------------------------------------------------------------
 * General deck — 33 landmark events spanning pyramids to smartphones.
 * Extracted from the original events-data.js monolith.
 *
 * Filters: Category (4), Era (5).
 * Tier: free (available to all users).
 */

/* global registerDeck, window */

window.registerDeck({
  id: "general",
  name: "World History",
  blurb: "A broad sweep from pyramids to smartphones.",
  emoji: "🌍",
  tier: "free",
  filters: [
    {
      id: "category",
      label: "By Category",
      multi: true,
      options: window.CATEGORY_OPTIONS,
      get: (ev) => ev.category,
    },
    {
      id: "era",
      label: "By Era",
      multi: true,
      options: window.AGE_OPTIONS,
      get: (ev) => window.ageBucket(ev),
    },
  ],
  events: [
    { id: "printing-press", title: "Movable-type printing press demonstrated in Europe", year: 1440, category: "tech", emoji: "🖨️", fact: "Gutenberg's press made books cheap enough to spread ideas across a continent.", who: "Johannes Gutenberg", where: "Germany", why: "Made books cheap; spread ideas and the Reformation.", lat: 51.2, lng: 10.4, area: 500 },
    { id: "telescope", title: "First astronomical telescope used by Galileo", year: 1609, category: "discovery", emoji: "🔭", fact: "Galileo turned the spyglass skyward and saw Jupiter's moons within months.", who: "Galileo Galilei", where: "Italy", why: "Turned the spyglass skyward; saw Jupiter's moons.", lat: 42.8, lng: 12.8, area: 600 },
    { id: "vaccine", title: "First successful smallpox vaccine", year: 1796, category: "discovery", emoji: "💉", fact: "Jenner's cowpox experiment began the end of a plague older than recorded history.", who: "Edward Jenner", where: "England", why: "Began the end of smallpox, a plague older than history.", lat: 52.5, lng: -1.5, area: 300 },
    { id: "penicillin", title: "Penicillin's antibacterial effect discovered", year: 1928, category: "discovery", emoji: "🦠", fact: "Fleming noticed mold killing bacteria on a forgotten petri dish.", who: "Alexander Fleming", where: "England (London)", why: "The first antibiotic; transformed medicine.", lat: 51.51, lng: -0.13 },
    { id: "dna", title: "Structure of DNA described", year: 1953, category: "discovery", emoji: "🧬", fact: "The double helix came from a photo, a model, and a borrowed idea.", who: "Watson, Crick, Franklin", where: "England", why: "The double helix unlocked modern genetics.", lat: 52.5, lng: -1.5, area: 300 },
    { id: "moon", title: "Humans first walk on the Moon", year: 1969, category: "discovery", emoji: "🌕", fact: "About 600 million people watched the landing live on television.", who: "Armstrong & Aldrin (Apollo 11)", where: "The Moon", why: "About 600M watched live; a peak of 20th-century achievement.", noMap: true },
    { id: "steam-train", title: "First public steam-hauled railway opens", year: 1825, category: "tech", emoji: "🚂", fact: "The Stockton & Darlington line carried passengers at a blistering 15 km/h.", who: "Stockton & Darlington Railway", where: "England", why: "First public steam-hauled railway; sped up travel.", lat: 52.5, lng: -1.5, area: 300 },
    { id: "telephone", title: "First practical telephone demonstrated", year: 1876, category: "tech", emoji: "📞", fact: "Bell's first words over the wire: 'Mr. Watson, come here, I want to see you.'", who: "Alexander Graham Bell", where: "USA / Canada", why: "First practical phone; 'Mr. Watson, come here.'", lat: 39.8, lng: -98.6, area: 4000 },
    { id: "lightbulb", title: "Long-lasting incandescent light bulb patented", year: 1879, category: "tech", emoji: "💡", fact: "Edison's team tested thousands of filament materials to beat the dark.", who: "Thomas Edison", where: "USA", why: "Long-lasting bulb beat the dark; tested thousands of filaments.", lat: 39.8, lng: -98.6, area: 4000 },
    { id: "radio", title: "First transatlantic radio signal sent", year: 1901, category: "tech", emoji: "📻", fact: "Marconi's 'S' crackled across the Atlantic from Newfoundland.", who: "Guglielmo Marconi", where: "Atlantic", why: "First transatlantic signal ('S') in 1901.", lat: 30, lng: -40, area: 3500 },
    { id: "tv", title: "First regular television broadcasts begin", year: 1936, category: "tech", emoji: "📺", fact: "The BBC's 30-line service reached a handful of living rooms in London.", who: "BBC", where: "England", why: "First regular TV broadcasts (1936).", lat: 52.5, lng: -1.5, area: 300 },
    { id: "transistor", title: "First transistor demonstrated", year: 1947, category: "tech", emoji: "🔌", fact: "The tiny switch replaced vacuum tubes and launched the microchip age.", who: "Bell Labs", where: "USA", why: "Tiny switch that launched the microchip age.", lat: 39.8, lng: -98.6, area: 4000 },
    { id: "internet", title: "First message sent over ARPANET", year: 1969, category: "tech", emoji: "🌐", fact: "The system crashed after 'LO' — the intended 'LOGIN' never finished.", who: "ARPANET", where: "USA", why: "First ARPANET message (1969) crashed after 'LO'.", lat: 39.8, lng: -98.6, area: 4000 },
    { id: "www", title: "The World Wide Web is proposed", year: 1989, category: "tech", emoji: "🕸️", fact: "Tim Berners-Lee wrote the proposal on a NeXT computer at CERN.", who: "Tim Berners-Lee", where: "CERN, Switzerland", why: "Proposed the Web in 1989.", lat: 46.8, lng: 8.2, area: 200 },
    { id: "smartphone", title: "First modern smartphone released", year: 2007, category: "tech", emoji: "📱", fact: "Apple's iPhone in 2007 made the keyboardless, full-touchscreen phone mainstream.", who: "Apple (iPhone)", where: "USA", why: "Redefined what a phone was and launched the app economy.", lat: 39.8, lng: -98.6, area: 4000 },
    { id: "magna-carta", title: "Magna Carta sealed", year: 1215, category: "world", emoji: "📜", fact: "King John's 1215 charter with the barons planted the seed of limited government.", who: "King John; English barons", where: "England", why: "A seed of constitutional liberty and the rule of law.", lat: 52.5, lng: -1.5, area: 300 },
    { id: "columbus", title: "Columbus reaches the Americas", year: 1492, category: "world", emoji: "⛵", fact: "He was looking for Asia and found a continent instead.", who: "Christopher Columbus", where: "The Caribbean", why: "Reached the Americas in 1492 seeking Asia.", lat: 15, lng: -75, area: 800 },
    { id: "french-rev", title: "Storming of the Bastille", year: 1789, category: "world", emoji: "🇫🇷", fact: "The prison held only seven inmates — but became a symbol of revolution.", who: "French citizens", where: "France", why: "Storming the Bastille (1789) symbolized revolution.", lat: 46.6, lng: 2.4, area: 600 },
    { id: "us-civil-war", title: "American Civil War begins", year: 1861, category: "world", emoji: "🇺🇸", fact: "The conflict killed more Americans than every other US war combined.", who: "Union vs. Confederacy", where: "USA", why: "Deadliest US war; ended slavery.", lat: 39.8, lng: -98.6, area: 4000 },
    { id: "ww1", title: "World War I begins", year: 1914, category: "world", emoji: "⚔️", fact: "A single assassination in Sarajevo lit the fuse of a continent.", who: "Allied vs. Central Powers", where: "Europe / world", why: "Began 1914 after an assassination in Sarajevo.", lat: 50, lng: 10, area: "world" },
    { id: "ww2", title: "World War II ends", year: 1945, category: "world", emoji: "🕊️", fact: "The war had touched nearly every corner of the globe.", who: "Allied vs. Axis", where: "Worldwide", why: "Ended 1945; touched nearly every corner of the globe.", lat: 20, lng: 0, area: "world" },
    { id: "fall-berlin", title: "Fall of the Berlin Wall", year: 1989, category: "world", emoji: "🧱", fact: "Crowds chipped at the wall with hammers that very night.", who: "East & West Berliners", where: "Germany", why: "1989; crowds chipped at the wall that night.", lat: 51.2, lng: 10.4, area: 500 },
    { id: "shakespeare", title: "Shakespeare's first plays performed", year: 1590, category: "culture", emoji: "🎭", fact: "He wrote about 38 plays, though a few may be collaborations.", who: "William Shakespeare", where: "England", why: "Wrote about 38 plays; a cornerstone of literature.", lat: 52.5, lng: -1.5, area: 300 },
    { id: "beethoven", title: "Beethoven's Ninth Symphony premieres", year: 1824, category: "culture", emoji: "🎼", fact: "Deaf by then, he had to be turned around to see the applause.", who: "Ludwig van Beethoven", where: "Austria", why: "Deaf by his 9th premiere; a turning point in music.", lat: 47.5, lng: 14, area: 200 },
    { id: "photography", title: "First permanent photograph made", year: 1826, category: "culture", emoji: "📷", fact: "Niépce's 1826 view from a window needed about eight hours of exposure.", who: "Joseph Niépce", where: "France", why: "The first image that survived, launching photography.", lat: 46.6, lng: 2.4, area: 600 },
    { id: "jazz", title: "Jazz recordings first released", year: 1917, category: "culture", emoji: "🎺", fact: "The first jazz record was made by a white band; the originators were overlooked.", who: "Early jazz pioneers", where: "USA (New Orleans)", why: "First jazz records (1917) by a white band; originators overlooked.", lat: 29.95, lng: -90.07 },
    { id: "beatles", title: "The Beatles release their first single", year: 1962, category: "culture", emoji: "🎸", fact: "A producer nearly passed on the Beatles in 1962, calling the guitar sound 'out.'", who: "The Beatles", where: "England", why: "Launched the most influential band of the rock era.", lat: 52.5, lng: -1.5, area: 300 },
    { id: "star-wars", title: "Star Wars is released", year: 1977, category: "culture", emoji: "🚀", fact: "George Lucas's 1977 film redefined the summer blockbuster and modern visual effects.", who: "George Lucas", where: "USA", why: "Set the template for the modern franchise blockbuster.", lat: 39.8, lng: -98.6, area: 4000 },
    { id: "pyramids", title: "Great Pyramid of Giza completed", year: -2560, circa: true, category: "world", emoji: "🔺", fact: "It was the tallest human structure for nearly 3,800 years.", who: "Pharaoh Khufu's builders", where: "Giza, Egypt", why: "Tallest human structure for roughly 3,800 years.", lat: 29.98, lng: 31.13 },
    { id: "homer", title: "Homer's Iliad and Odyssey composed", year: -750, circa: true, category: "culture", emoji: "📖", fact: "Composed orally, it was written down centuries later.", who: "Homer", where: "Greece", why: "Composed orally; written down centuries later.", lat: 39, lng: 22, area: 300 },
    { id: "rome-founded", title: "Traditional founding of Rome", year: -753, circa: true, category: "world", emoji: "🏛️", fact: "Legend says it was founded by Romulus on Palatine Hill.", who: "Romulus (legend)", where: "Italy", why: "Legendary founding of Rome.", lat: 42.8, lng: 12.8, area: 600 },
    { id: "alexander", title: "Alexander the Great dies", year: -323, category: "world", emoji: "👑", fact: "He conquered an empire by 32 and died at 32.", who: "Alexander the Great", where: "Macedon / Greece", why: "Conquered an empire by 32; died at 32.", lat: 39, lng: 22, area: 300 },
    { id: "aqueduct", title: "Roman aqueducts supply major cities", year: 100, category: "tech", emoji: "💧", fact: "Gravity alone moved water for miles without a pump.", who: "Romans", where: "Rome / empire", why: "Gravity alone moved water for miles without a pump.", lat: 41.9, lng: 12.5, area: 2500 },
  ],
});
