/*
 * scripts/enrich-cc.mjs
 * ------------------------------------------------------------------
 * One-time transform: replaces the placeholder `fact` (which merely
 * repeated the title) for every CC event with a researched explanation
 * that ADDS information, plus structured who/where/why fields used by
 * the fact-sheet UI. Re-run any time the map below is improved.
 *
 * It only rewrites the `fact`/`who`/`where`/`why` fields on each
 * `cc-###` line; all other fields (year, week, sortYear, …) are kept.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "..", "events-data.js");
let text = readFileSync(srcPath, "utf8");

// id -> { fact, who?, where?, why? }
const ENRICH = {
  "cc-001": { fact: "The opening era of the CC timeline, conventionally anchored near 4004 BC.", who: "First river-valley civilizations", where: "Mesopotamia, Egypt, Indus", why: "The starting block of the whole 161-card sweep." },
  "cc-002": { fact: "The earliest anchor of the CC timeline, dated c. 4004 BC by the Ussher chronology.", who: "Adam and Eve", where: "Garden of Eden (traditional)", why: "The conventional beginning of the biblical history frame." },
  "cc-003": { fact: "A global flood c. 2348 BC, after which Babel's builders were scattered into many languages.", who: "Noah; Nimrod", where: "Mesopotamia (traditional)", why: "The CC account for how nations and languages spread." },
  "cc-004": { fact: "Home of the first cities and writing (cuneiform) between the Tigris and Euphrates.", who: "Sumerians", where: "Mesopotamia (Iraq)", why: "The 'cradle of civilization' — first known writing and cities." },
  "cc-005": { fact: "Built the pyramids and a 3,000-year civilization along the Nile.", who: "Pharaohs of the Old/Middle/New Kingdoms", where: "Nile River, North Africa", why: "One of the longest-lasting civilizations in history." },
  "cc-006": { fact: "A planned-city civilization (Mohenjo-daro, Harappa) contemporary with early Mesopotamia.", who: "Indus peoples", where: "Pakistan / India", why: "One of the world's first urban societies, with grid streets and drainage." },
  "cc-007": { fact: "Europe's first advanced civilizations; the Mycenaeans inspired the Trojan War legends.", who: "Minoans (Crete); Mycenaeans (Greece)", where: "Aegean Sea", why: "The earliest roots of European (Greek) culture." },
  "cc-008": { fact: "Seven famed monuments including the Great Pyramid and the Hanging Gardens.", who: "Various ancient builders", where: "Mediterranean & Near East", why: "The original 'bucket list' of ancient engineering marvels." },
  "cc-009": { fact: "Abraham, Isaac, and Jacob — the founders of the Israelite people.", who: "Abraham, Isaac, Jacob", where: "Canaan / Mesopotamia", why: "The ancestry behind the biblical story of Israel." },
  "cc-010": { fact: "Bronze Age peoples of Anatolia and Canaan, rivals and neighbors of Israel.", who: "Hittites; Canaanites", where: "Anatolia / Levant", why: "Powerful cultures that frame Israel's early history." },
  "cc-011": { fact: "A kingdom south of Egypt that later conquered and ruled Egypt as the 25th Dynasty.", who: "Kushite kings", where: "Nubia (Sudan)", why: "A major African civilization that rivaled Egypt." },
  "cc-012": { fact: "A ruthless empire known for iron weapons and sweeping the ancient Near East.", who: "Assyrian kings (e.g., Ashurbanipal)", where: "Mesopotamia (N. Iraq)", why: "The dominant military empire before Babylon." },
  "cc-013": { fact: "Hammurabi's Code is the famous early law code of this empire.", who: "Hammurabi", where: "Babylon (Iraq)", why: "Gave us one of the earliest written law codes." },
  "cc-014": { fact: "China's first historical dynasty, known for oracle bones and bronze work.", who: "Shang kings", where: "Yellow River, China", why: "The earliest Chinese dynasty with written records." },
  "cc-015": { fact: "One of the world's oldest living religions, with the Vedas as sacred texts.", who: "Vedic sages", where: "India", why: "The root of much Indian culture and philosophy." },
  "cc-016": { fact: "Traders who spread the phonetic alphabet that underlies ours.", who: "Phoenician merchants", where: "Lebanon / Mediterranean coasts", why: "Their alphabet is the ancestor of nearly all Western scripts." },
  "cc-017": { fact: "The 'mother culture' of Mesoamerica, famous for colossal stone heads.", who: "Olmec artisans", where: "Gulf coast of Mexico", why: "The earliest major civilization in the Americas." },
  "cc-018": { fact: "Moses leads Israel out of Egypt and through 40 years in the wilderness.", who: "Moses; Israelites", where: "Egypt → Sinai", why: "A foundational story of freedom and law for Israel." },
  "cc-019": { fact: "Israel settles Canaan under leaders called judges (e.g., Deborah, Gideon).", who: "Joshua; the Judges", where: "Canaan", why: "The era between Moses and the monarchy." },
  "cc-020": { fact: "A poorly-documented gap after the Mycenaean collapse, ending with the Greek alphabet.", who: "Early Greeks", where: "Greece", why: "The lull before Greece's classical flowering." },
  "cc-021": { fact: "Saul, David, and Solomon rule a united Israel from Jerusalem.", who: "Saul, David, Solomon", where: "Israel (Jerusalem)", why: "Israel's golden age as a single kingdom." },
  "cc-022": { fact: "Diverse peoples (e.g., Clovis) inhabited the Americas millennia before Columbus.", who: "Clovis and other peoples", where: "North America", why: "Reminds us the Americas were lived in long before 1492." },
  "cc-023": { fact: "After Solomon, Israel splits into Israel (north) and Judah (south).", who: "Rehoboam (Judah); Jeroboam (Israel)", where: "Canaan", why: "Division that shaped the rest of biblical history." },
  "cc-024": { fact: "Authors of the Iliad, Odyssey, and Theogony — the basis of Greek myth.", who: "Homer; Hesiod", where: "Greece", why: "The literary fountainhead of Western epic and mythology." },
  "cc-025": { fact: "Legend says twin brothers founded Rome in 753 BC.", who: "Romulus and Remus", where: "Italy", why: "The mythical start of Rome's 1,000+ year story." },
  "cc-026": { fact: "The northern kingdom of Israel is conquered and exiled by Assyria.", who: "Assyrians; Israelites", where: "Samaria / Assyria", why: "The 'Lost Ten Tribes' — a major turning point for Israel." },
  "cc-027": { fact: "Babylon, under Nabopolassar and Nebuchadnezzar, destroys Assyria.", who: "Nebuchadnezzar II", where: "Mesopotamia", why: "Shifted power from Assyria to Babylon." },
  "cc-028": { fact: "Founders of Daoism, Confucianism, and Buddhism around the same era.", who: "Lao-Tzu, Confucius, Siddhartha", where: "China / India", why: "Three philosophies/religions that shaped East Asia." },
  "cc-029": { fact: "Babylon destroys Solomon's Temple and exiles Judah (586 BC).", who: "Nebuchadnezzar II; Jews", where: "Jerusalem / Babylon", why: "The Babylonian Exile — a defining crisis for Judaism." },
  "cc-030": { fact: "Cyrus the Great conquers Babylon without a fight in 539 BC.", who: "Cyrus the Great", where: "Persia / Mesopotamia", why: "Rise of the Persian Empire; Cyrus frees the Jews to rebuild." },
  "cc-031": { fact: "Cyrus lets exiles return; the Second Temple is completed c. 516 BC.", who: "Zerubbabel; returned exiles", where: "Jerusalem", why: "Restoration of Jewish worship after exile." },
  "cc-032": { fact: "Rome's era of elected consuls and senators (509–27 BC).", who: "Roman citizens / Senate", where: "Rome", why: "The model later republics (incl. the USA) would echo." },
  "cc-033": { fact: "The age of Pericles, the Parthenon, drama, and philosophy.", who: "Pericles; Socrates; playwrights", where: "Athens", why: "A high point of democracy, art, and thought." },
  "cc-034": { fact: "A long war (431–404 BC) in which Athens lost to Sparta.", who: "Athens vs. Sparta", where: "Greece", why: "Showed the limits of even a great democracy at war." },
  "cc-035": { fact: "Alexander topples the Persian Empire by age 25.", who: "Alexander the Great", where: "Persia (to India)", why: "Spread Greek culture across a vast empire." },
  "cc-036": { fact: "India's first great empire; Ashoka later spread Buddhism.", who: "Chandragupta; Ashoka", where: "India", why: "United most of India for the first time." },
  "cc-037": { fact: "Built city-states with pyramids, astronomy, and a written calendar.", who: "Maya city-states", where: "Mexico / Central America", why: "A dazzling civilization of math and astronomy." },
  "cc-038": { fact: "Rome vs. Carthage (264–146 BC); Hannibal crossed the Alps with elephants.", who: "Rome vs. Hannibal's Carthage", where: "Mediterranean", why: "Made Rome the dominant power in the west." },
  "cc-039": { fact: "Rome absorbs Greece in 146 BC, adopting much of its culture.", who: "Roman generals", where: "Greece / Italy", why: "Greek culture flowed into Roman (and thus Western) life." },
  "cc-040": { fact: "Crossed the Rubicon, became dictator, then was assassinated in 44 BC.", who: "Julius Caesar", where: "Rome", why: "The Republic's end and the road to empire." },
  "cc-041": { fact: "Rome's first emperor ushered in ~200 years of peace.", who: "Augustus (Octavian)", where: "Rome", why: "The calm peak of the Roman Empire." },
  "cc-042": { fact: "Preached repentance and baptized Jesus in the Jordan.", who: "John the Baptist; Jesus", where: "Judea", why: "The bridge between the Old and New Testament." },
  "cc-043": { fact: "Born c. 4 BC; his life and teaching launched Christianity.", who: "Jesus of Nazareth", where: "Judea / Galilee", why: "The central figure of the world's largest religion." },
  "cc-044": { fact: "The Holy Spirit fills the apostles; the church begins to spread.", who: "The apostles", where: "Jerusalem", why: "The traditional birthday of the Christian church." },
  "cc-045": { fact: "Roman persecution pushed Christians to carry the faith widely.", who: "Early Christians", where: "Roman Empire", why: "Suffering became the engine of expansion." },
  "cc-046": { fact: "Rome destroys the Second Temple in 70 AD.", who: "Titus (Roman); Jews", where: "Jerusalem", why: "Ended temple worship; reshaped Judaism and the diaspora." },
  "cc-047": { fact: "Split Rome into east and west to govern it better.", who: "Emperor Diocletian", where: "Roman Empire", why: "Set up the later Byzantine (Eastern Roman) Empire." },
  "cc-048": { fact: "The Edict of Milan (313) ended persecution of Christians.", who: "Emperor Constantine", where: "Roman Empire", why: "Christianity went from outlawed to imperial." },
  "cc-049": { fact: "India's 'Golden Age' of math, astronomy, and art.", who: "Gupta kings", where: "India", why: "Made advances like the concept of zero." },
  "cc-050": { fact: "Bishops defined core Christian doctrine (the Nicene Creed) in 325.", who: "Church bishops", where: "Nicea (Turkey)", why: "Set the foundational statement of Christian belief." },
  "cc-051": { fact: "Wrote Confessions and City of God, shaping Christian thought.", who: "Augustine", where: "North Africa (Hippo)", why: "Among the most influential theologians ever." },
  "cc-052": { fact: "Translated the Bible into Latin, the standard for centuries.", who: "Jerome", where: "Bethlehem / Rome", why: "Gave the church a common Bible text." },
  "cc-053": { fact: "In 410, Visigoths breached Rome for the first time in 800 years.", who: "Alaric's Visigoths", where: "Rome", why: "A shock that signaled the empire's decline." },
  "cc-054": { fact: "The roughly thousand-year era between ancient and modern times.", who: "Medieval Europeans", where: "Europe", why: "The 'Middle' period bridging Rome and the Renaissance." },
  "cc-055": { fact: "Defined Christ's nature in 451, shaping orthodox doctrine.", who: "Church bishops", where: "Chalcedon (Turkey)", why: "Clarified a core Christian teaching still held today." },
  "cc-056": { fact: "Rome's last emperor is deposed by Odoacer in 476.", who: "Odoacer; Germanic tribes", where: "Rome", why: "Conventionally marks the end of the ancient world." },
  "cc-057": { fact: "Codified Roman law and built the Hagia Sophia.", who: "Justinian I", where: "Constantinople", why: "His law code still influences civil law today." },
  "cc-058": { fact: "Wrote the Rule that shaped Western monastic life.", who: "Benedict of Nursia", where: "Italy", why: "Monasteries became centers of learning and preservation." },
  "cc-059": { fact: "Begins receiving revelations c. 610; Islam spreads rapidly.", who: "Muhammad", where: "Arabia (Mecca/Medina)", why: "Founded one of the world's major religions." },
  "cc-060": { fact: "Early West African gold trade and East African coastal peoples.", who: "Ghana kings; Zanj", where: "West / East Africa", why: "Highlights Africa's wealth and trade before Europe's rise." },
  "cc-061": { fact: "Charles Martel halts the Muslim advance into France in 732.", who: "Charles Martel", where: "France", why: "A pivotal check on expansion into Western Europe." },
  "cc-062": { fact: "A peak of Muslim science, medicine, and philosophy (8th–13th c.).", who: "Scholars of the Abbasid Caliphate", where: "Baghdad / Spain", why: "Preserved and advanced knowledge later flowing to Europe." },
  "cc-063": { fact: "Norse raiders reach as far as North America and Constantinople.", who: "Vikings (Norse)", where: "Scandinavia → Atlantic", why: "Fearsome raiders who also were explorers and traders." },
  "cc-064": { fact: "Japan's courtly golden age; Tale of Genji was written then.", who: "Heian court", where: "Japan", why: "A high point of Japanese art and literature." },
  "cc-065": { fact: "Pope crowns Charlemagne in 800, reviving the Western empire.", who: "Charlemagne", where: "Rome / Frankish Empire", why: "Forerunner of the Holy Roman Empire." },
  "cc-066": { fact: "Defended England from Vikings and promoted law and learning.", who: "Alfred the Great", where: "England", why: "The only English king called 'the Great'." },
  "cc-067": { fact: "Leif likely reached North America ~500 years before Columbus.", who: "Erik the Red; Leif Eriksson", where: "Greenland / Vinland", why: "Europeans in America long before 1492." },
  "cc-068": { fact: "Converted Kievan Rus to Christianity in 988.", who: "Vladimir I", where: "Kievan Rus (Ukraine/Russia)", why: "Rooted Orthodox Christianity in Russia." },
  "cc-069": { fact: "A long-reigning warrior emperor who expanded Byzantium.", who: "Basil II (the Bulgar-slayer)", where: "Constantinople", why: "The high point of Byzantine power." },
  "cc-070": { fact: "Christianity splits into Roman Catholic and Eastern Orthodox (1054).", who: "Pope vs. Patriarch of Constantinople", where: "Rome / Constantinople", why: "A divide in Christianity that lasts to today." },
  "cc-071": { fact: "William the Conqueror wins England in 1066; feudalism spreads.", who: "William the Conqueror", where: "England / France", why: "Reshaped England's language, law, and landholding." },
  "cc-072": { fact: "A series of holy wars between Christians and Muslims over the Holy Land.", who: "Crusaders; Muslims (Saladin)", where: "Levant", why: "Opened Europe to trade, ideas, and conflict with the East." },
  "cc-073": { fact: "Great Zimbabwe's stone cities and Mali's gold empire (Mansa Musa).", who: "Mali emperors; Shona builders", where: "Sub-Saharan Africa", why: "Powerful African states often left out of Europe-focused history." },
  "cc-074": { fact: "Built Tenochtitlan, a vast city, before Spanish conquest.", who: "Aztec (Mexica)", where: "Mexico", why: "A rich civilization undone by disease and conquest." },
  "cc-075": { fact: "Francis founded the Friars; Aquinas systematized theology.", who: "Francis of Assisi; Thomas Aquinas", where: "Italy", why: "Two giants of medieval Christian life and thought." },
  "cc-076": { fact: "Military rulers who held real power while emperors reigned in name.", who: "Shoguns (e.g., Tokugawa)", where: "Japan", why: "Shaped Japan's long feudal era." },
  "cc-077": { fact: "Built a massive Andean empire with roads and terraces.", who: "Inca emperors", where: "Peru / Andes", why: "The largest empire in the Americas before Columbus." },
  "cc-078": { fact: "United the Mongols and forged the largest land empire ever.", who: "Genghis Khan", where: "Central Asia", why: "Conquered more territory than anyone in history." },
  "cc-079": { fact: "1215 charter that limited the king's power and influenced rights.", who: "King John; barons", where: "England", why: "A seed of constitutional liberty and the rule of law." },
  "cc-080": { fact: "A Turkic empire that took Constantinople in 1453 and lasted centuries.", who: "Ottoman sultans", where: "Turkey → Middle East", why: "A major Islamic power bridging Europe and Asia." },
  "cc-081": { fact: "His travels (1271–95) opened Europe's fascination with the East.", who: "Marco Polo", where: "Venice → China", why: "Inspired later explorers like Columbus." },
  "cc-082": { fact: "A long England-France war alongside a plague that killed ~1/3 of Europe.", who: "England vs. France; bubonic plague", where: "Europe", why: "The plague reshaped society, labor, and the church." },
  "cc-083": { fact: "A rebirth of art and learning in Italy, rooted in classical antiquity.", who: "Da Vinci, Michelangelo, etc.", where: "Italy → Europe", why: "Sparked the modern world's art and science." },
  "cc-084": { fact: "Built the Great Wall sections and sent treasure fleets abroad.", who: "Ming emperors (e.g., Yongle)", where: "China", why: "A strong, outward-looking Chinese golden age." },
  "cc-085": { fact: "European voyages opened sea routes to the Americas, Africa, Asia.", who: "Portuguese & Spanish navigators", where: "Atlantic / global", why: "Connected the world's continents as never before." },
  "cc-086": { fact: "Portugal's Prince Henry spurred systematic ocean exploration.", who: "Prince Henry the Navigator", where: "Portugal", why: "Laid the groundwork for the Age of Exploration." },
  "cc-087": { fact: "Millions of Africans were forcibly taken to the Americas over centuries.", who: "Enslaved Africans; Atlantic traders", where: "West Africa → Americas", why: "One of history's gravest injustices; reshaped continents." },
  "cc-088": { fact: "Movable type (c. 1440) made books cheap and ideas contagious.", who: "Johannes Gutenberg", where: "Germany", why: "Fueled the Reformation and the spread of knowledge." },
  "cc-089": { fact: "West Africa's largest empire, centered on Timbuktu's learning.", who: "Songhai emperors (e.g., Askia)", where: "West Africa", why: "A center of gold and scholarship in Africa." },
  "cc-090": { fact: "Ended Mongol rule and began unifying Russia around Moscow.", who: "Ivan III", where: "Russia", why: "Laid the foundation for the Russian state." },
  "cc-091": { fact: "A church tribunal enforcing religious uniformity in Spain.", who: "Spanish monarchy; Church", where: "Spain", why: "A symbol of religious intolerance and state power." },
  "cc-092": { fact: "Reached the Americas in 1492 seeking Asia, opening the Columbian Exchange.", who: "Christopher Columbus", where: "Caribbean", why: "Began sustained European contact with the Americas." },
  "cc-093": { fact: "Kings claimed divine-right rule over centralized states.", who: "Louis XIV, etc.", where: "Europe", why: "The era before revolutions curbed royal power." },
  "cc-094": { fact: "Luther's 95 Theses (1517) split Western Christianity.", who: "Martin Luther", where: "Germany", why: "Reshaped religion, politics, and education in Europe." },
  "cc-095": { fact: "Cortés and Pizarro toppled the Aztecs and Inca.", who: "Cortés; Pizarro", where: "Mexico / Peru", why: "Brought vast Americas under Spanish rule." },
  "cc-096": { fact: "Calvin's 1536 work systematized Reformed Protestantism.", who: "John Calvin", where: "Geneva / France", why: "Shaped Presbyterianism and many Reformed churches." },
  "cc-097": { fact: "The Catholic Church's response, clarifying doctrine and reform.", who: "Catholic bishops", where: "Trent (Italy)", why: "Launched the Counter-Reformation." },
  "cc-098": { fact: "Dramatic, ornate art and music (Bach, Bernini) after the Reformation.", who: "Bach; Bernini; Rubens", where: "Europe", why: "Art used to stir emotion and faith." },
  "cc-099": { fact: "The Tokugawa shut Japan off from most foreign contact (1630s–1853).", who: "Tokugawa shoguns", where: "Japan", why: "Two centuries of near-total seclusion." },
  "cc-100": { fact: "England's first permanent (1607) and Pilgrim (1620) settlements.", who: "English colonists", where: "Virginia / Massachusetts", why: "The beginnings of English America." },
  "cc-101": { fact: "Reason and individual rights challenged tradition and throne.", who: "Locke, Voltaire, Rousseau", where: "Europe", why: "Ideas that fueled the American and French Revolutions." },
  "cc-102": { fact: "A 1670 fur-trading company that shaped Canada's development.", who: "English & French traders", where: "Canada", why: "A corporate force in North American exploration." },
  "cc-103": { fact: "A wave of Protestant revival across the American colonies.", who: "Whitefield; Edwards", where: "American colonies", why: "United the colonies in shared religious experience." },
  "cc-104": { fact: "Order and balance in art/music (Mozart, Haydn) around 1750–1820.", who: "Mozart; Haydn; early Beethoven", where: "Europe", why: "Music and art of clarity and form." },
  "cc-105": { fact: "A global war (1756–63) that left Britain dominant in North America.", who: "Britain vs. France", where: "Worldwide", why: "Set the stage for the American Revolution." },
  "cc-106": { fact: "Steam, factories, and railroads transformed how people lived and worked.", who: "Inventors; factory workers", where: "Britain → world", why: "The shift from hand-made to machine-made everything." },
  "cc-107": { fact: "Charted the Pacific and Australia's coast (1768–79).", who: "Captain James Cook", where: "Pacific / Australia / Antarctica", why: "Opened the Pacific to European mapping." },
  "cc-108": { fact: "The colonies win independence from Britain (1783).", who: "George Washington", where: "Thirteen Colonies", why: "Created the United States and a model republic." },
  "cc-109": { fact: "The U.S. Constitution (1787) and its first ten amendments (1791).", who: "James Madison", where: "United States", why: "A blueprint for limited, rights-protecting government." },
  "cc-110": { fact: "1789–99 upheaval that toppled the monarchy and reshaped Europe.", who: "French citizens; Robespierre", where: "France", why: "Spread ideals of liberty and nationalism." },
  "cc-111": { fact: "A 19th-c. revival stressing personal faith and reform movements.", who: "American revivalists", where: "United States", why: "Fueled reforms like abolition and women's rights." },
  "cc-112": { fact: "The U.S. buys vast lands (1803) and explores them to the Pacific.", who: "Jefferson; Lewis & Clark", where: "North America", why: "Doubled the size of the young United States." },
  "cc-113": { fact: "1804: the general crowns himself, reshaping Europe until 1815.", who: "Napoleon Bonaparte", where: "France / Europe", why: "Exported revolution and law (the Code Napoléon)." },
  "cc-114": { fact: "Bolívar and San Martín free Spanish colonies (1810s–20s).", who: "Simón Bolívar; San Martín", where: "South America", why: "Created independent Latin American nations." },
  "cc-115": { fact: "The U.S. and Britain fight to a draw; 'Star-Spangled Banner' born.", who: "USA vs. Britain", where: "North America", why: "Cemented U.S. independence and national identity." },
  "cc-116": { fact: "1820 deal balancing free and slave states in the U.S.", who: "U.S. Congress", where: "United States", why: "A temporary patch over the slavery divide." },
  "cc-117": { fact: "A 19th-c. wave of newcomers built America's farms and cities.", who: "European immigrants", where: "United States", why: "Dramatically grew and changed the U.S. population." },
  "cc-118": { fact: "1823 warning that Europe must stay out of the Americas.", who: "President James Monroe", where: "United States", why: "Asserted U.S. influence in the Western Hemisphere." },
  "cc-119": { fact: "Art and music favoring emotion, nature, and the individual (c. 1800–50).", who: "Late Beethoven; Turner; Byron", where: "Europe", why: "Reacted against cold reason with feeling and imagination." },
  "cc-120": { fact: "1838 forced removal of Cherokees to Oklahoma; thousands died.", who: "Cherokee; U.S. government", where: "Southeastern USA → Oklahoma", why: "A tragic symbol of Native American displacement." },
  "cc-121": { fact: "Settlers pushed the frontier to the Pacific through the 1800s.", who: "Pioneers; settlers", where: "United States", why: "Fulfilled the idea of 'Manifest Destiny.'" },
  "cc-122": { fact: "1848: calls for workers to overthrow capitalism.", who: "Karl Marx; Friedrich Engels", where: "Germany / Europe", why: "Inspired communist movements worldwide." },
  "cc-123": { fact: "1850s laws/decisions that deepened the U.S. slavery crisis.", who: "U.S. Congress; Supreme Court", where: "United States", why: "Pushed the nation toward civil war." },
  "cc-124": { fact: "Commodore Perry's 1853 fleet ends Japan's isolation.", who: "Commodore Matthew Perry", where: "Japan", why: "Forced Japan into rapid modernization." },
  "cc-125": { fact: "After 1858, Britain ruled India as 'the Jewel in the Crown.'", who: "Queen Victoria", where: "India", why: "The height of the British Empire in Asia." },
  "cc-126": { fact: "1859: proposed natural selection as the engine of evolution.", who: "Charles Darwin", where: "England", why: "Transformed biology and how we see life." },
  "cc-127": { fact: "The U.S. Civil War (1861–65) ended slavery and preserved the Union.", who: "Abraham Lincoln", where: "United States", why: "The deadliest U.S. war; ended slavery." },
  "cc-128": { fact: "The post-Civil War effort to rebuild the South and grant rights.", who: "Freedmen; federal government", where: "U.S. South", why: "A contested struggle over racial equality." },
  "cc-129": { fact: "1867: Canada becomes self-governing within the British Empire.", who: "Canadian Confederation", where: "Canada", why: "Birth of modern Canada." },
  "cc-130": { fact: "Through 'blood and iron,' he unites Germany in 1871.", who: "Otto von Bismarck", where: "Germany", why: "Created a major new European power." },
  "cc-131": { fact: "Britain fights Dutch settlers (Afrikaners) in South Africa (1899–1902).", who: "Britain vs. Boers", where: "South Africa", why: "Revealed the costs and controversies of empire." },
  "cc-132": { fact: "1898: the U.S. gains Puerto Rico, Guam, and the Philippines.", who: "USA vs. Spain", where: "Caribbean / Pacific", why: "Marked the U.S. as a global power." },
  "cc-133": { fact: "Early 1900s reforms targeting corruption, trusts, and poverty.", who: "Reformers; Theodore Roosevelt", where: "United States", why: "Expanded democracy and the regulatory state." },
  "cc-134": { fact: "1901: six colonies federate into the nation of Australia.", who: "Australian federation", where: "Australia", why: "Birth of modern Australia." },
  "cc-135": { fact: "1910: a long upheaval that overthrew the dictatorship and reformed Mexico.", who: "Zapata; Villa; Madero", where: "Mexico", why: "Reshaped Mexican politics and land reform." },
  "cc-136": { fact: "1914–18 global war; the U.S. joins under Wilson in 1917.", who: "Woodrow Wilson; Allied powers", where: "Europe / worldwide", why: "Redrew maps and sowed the seeds of WWII." },
  "cc-137": { fact: "1917: communists seize power, creating the Soviet Union.", who: "Vladimir Lenin", where: "Russia", why: "Launched the world's first communist state." },
  "cc-138": { fact: "A 20th-c. preacher who advised presidents and filled stadiums.", who: "Billy Graham", where: "United States", why: "One of the most influential evangelists of the era." },
  "cc-139": { fact: "Breaking-with-the-past styles: cubism, abstract, atonal music.", who: "Picasso; Stravinsky; others", where: "Europe / USA", why: "Art that questioned every old rule." },
  "cc-140": { fact: "1929 crash; FDR's New Deal expanded government relief.", who: "Franklin D. Roosevelt", where: "United States", why: "The worst economic crisis; reshaped government's role." },
  "cc-141": { fact: "1939–45 global war; the U.S. joins after Pearl Harbor (1941).", who: "FDR; Allied powers", where: "Worldwide", why: "The deadliest conflict in human history." },
  "cc-142": { fact: "Soviet purges and the 1940 killing of Polish officers.", who: "Joseph Stalin", where: "USSR / Poland", why: "A grim symbol of Stalinist terror." },
  "cc-143": { fact: "1945: a global body to keep peace after WWII.", who: "Member nations", where: "Worldwide (HQ: New York)", why: "A standing forum for international cooperation." },
  "cc-144": { fact: "A standoff (c. 1947–1991) between the USA and USSR short of direct war.", who: "USA vs. USSR", where: "Global", why: "Shaped world politics for nearly half a century." },
  "cc-145": { fact: "Nonviolent resistance wins India freedom from Britain in 1947.", who: "Mahatma Gandhi", where: "India", why: "Showed the power of peaceful mass protest." },
  "cc-146": { fact: "1948: Israel is founded after the Holocaust and a U.N. plan.", who: "David Ben-Gurion", where: "Palestine / Israel", why: "Created a homeland — and a long conflict." },
  "cc-147": { fact: "1949: Mao's communists win the civil war, founding the PRC.", who: "Mao Zedong", where: "China", why: "Made China a communist giant." },
  "cc-148": { fact: "1949: a U.S.–Europe military alliance against Soviet threat.", who: "NATO members", where: "North Atlantic", why: "The West's main Cold War defense pact." },
  "cc-149": { fact: "1950–53: a UN-backed South vs. communist North, ending in a stalemate.", who: "USA/UN vs. N. Korea/China", where: "Korea", why: "The Cold War's first major 'hot' war." },
  "cc-150": { fact: "Nonviolent campaigns win key civil-rights laws in the 1950s–60s.", who: "Martin Luther King Jr.", where: "United States", why: "Advanced racial equality in America." },
  "cc-151": { fact: "1956: Jim was killed by the Huaorani; later the tribe was reached.", who: "Jim & Elisabeth Elliot", where: "Ecuador", why: "A famous modern missionary story of forgiveness." },
  "cc-152": { fact: "1959: nations agree Antarctica is for peace and science.", who: "Signatory nations", where: "Antarctica", why: "Kept a continent free of military conflict." },
  "cc-153": { fact: "A long Cold War conflict; the U.S. withdraws in 1975.", who: "USA vs. North Vietnam", where: "Vietnam", why: "Deeply divisive; ended U.S. involvement in Southeast Asia." },
  "cc-154": { fact: "1969: Armstrong and Aldrin make the first crewed Moon landing.", who: "Neil Armstrong; Buzz Aldrin", where: "The Moon", why: "A pinnacle of 20th-century achievement." },
  "cc-155": { fact: "Computers and the internet link the world instantly.", who: "Tech pioneers", where: "Global", why: "The current era of digital connection." },
  "cc-156": { fact: "1974: a scandal forces the first U.S. president to resign.", who: "Richard Nixon", where: "United States", why: "A lesson in accountability and the rule of law." },
  "cc-157": { fact: "1989: the Berlin Wall falls and Soviet-blocs open up.", who: "Eastern Europeans", where: "Eastern Europe", why: "The peaceful end of the Cold War divide." },
  "cc-158": { fact: "1993: a union tying European nations together economically.", who: "European nations", where: "Europe", why: "Aims to keep the continent at peace through cooperation." },
  "cc-159": { fact: "1994: Nelson Mandela becomes president after apartheid ends.", who: "Nelson Mandela", where: "South Africa", why: "The fall of a brutal system of racial separation." },
  "cc-160": { fact: "Terrorist attacks on the U.S. kill ~3,000 and reshape global policy.", who: "Al-Qaeda; USA", where: "United States", why: "Launched the global 'war on terror.'" },
  "cc-161": { fact: "The CC song's closing theme: the onward march of liberty.", who: "CC students (song)", where: "Global", why: "The timeline's hopeful capstone on freedom." },
};

const VALUE_RE = /(?:"(?:[^"\\]|\\.)*"|-?\d+|true|false|null)/;
function field(s, key) {
  const m = s.match(new RegExp(key + ":\\s*(" + VALUE_RE.source + ")"));
  return m ? m[1] : undefined;
}

const BASE_KEYS = ["id", "songOrder", "title", "year", "circa", "continent", "week", "sortYear"];
const lines = text.split("\n");
let updated = 0;
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/id:\s*"(cc-\d+)"/);
  if (!m || !ENRICH[m[1]]) continue;
  const e = ENRICH[m[1]];
  const base = BASE_KEYS.map((k) => `${k}: ${field(lines[i], k)}`).join(", ");
  const em = field(lines[i], "emoji") || '"📜"';
  const extra =
    (e.who ? `, who: ${JSON.stringify(e.who)}` : "") +
    (e.where ? `, where: ${JSON.stringify(e.where)}` : "") +
    (e.why ? `, why: ${JSON.stringify(e.why)}` : "");
  lines[i] = `  { ${base}, fact: ${JSON.stringify(e.fact)}${extra}, emoji: ${em} },`;
  updated++;
}

writeFileSync(srcPath, lines.join("\n"));
console.log(`Updated ${updated} CC events with enriched facts + who/where/why.`);
