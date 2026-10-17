/**
 * Name handling for Slovenian + English notes: accent folding, case-ending lemmatisation,
 * nickname groups (for clustering only — never for deciding identity) and gender hints.
 */

const SPECIAL: Record<string, string> = {
  č: "c", Č: "C", š: "s", Š: "S", ž: "z", Ž: "Z", ć: "c", Ć: "C", đ: "dj", Đ: "Dj",
  ø: "o", Ø: "O", æ: "ae", Æ: "Ae", ß: "ss", ł: "l", Ł: "L", œ: "oe", Œ: "Oe",
};

/** Folds diacritics: Blaž → Blaz, Đurđa → Djurdja, Höflinger → Hoflinger. Case is preserved. */
export function deaccent(s: string): string {
  return s
    .replace(/[čČšŠžŽćĆđĐøØæÆßłŁœŒ]/g, (c) => SPECIAL[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const HONORIFICS = new Set(["mr", "mrs", "ms", "dr", "prof", "g", "ga", "gdc", "sir", "mag", "ing"]);

/** Lowercased, accent-folded, punctuation-free tokens; honorifics dropped. */
export function nameTokens(s: string): string[] {
  return deaccent(s.normalize("NFC"))
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, " ")
    .replace(/['-]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t));
}

/** Normalised name for comparisons: "Blaž  Novák" → "blaz novak". */
export function normName(s: string): string {
  return nameTokens(s).join(" ");
}

/** Stable slug used as an import_people key: "Blaž Novak" → "blaz-novak"; extra parts disambiguate. */
export function personKey(name: string, ...disambiguators: (string | null | undefined)[]): string {
  const parts = [name, ...disambiguators.filter(Boolean)].map((p) => nameTokens(p!).join("-")).filter(Boolean);
  return parts.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";
}

export const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True for a token like "A." or "J" (an initial, not a surname). */
export function isInitial(token: string) {
  return /^[a-z]\.?$/i.test(token);
}

/** "Blaž Novak" → true, "Blaž" → false, "Arijita A." → false. */
export function isFullName(name: string) {
  const raw = name.trim().split(/\s+/).filter(Boolean);
  if (raw.length < 2) return false;
  return !isInitial(raw[raw.length - 1]!.replace(/[.,]/g, "")) || raw.length > 2;
}

/* ------------------------------------------------------------------ */
/*  Slovenian case endings                                             */
/* ------------------------------------------------------------------ */

function keepCase(stem: string, add: string) {
  return stem + add;
}

/**
 * Candidate base (nominative) forms for an inflected surface form, original first.
 *   Blažem → [Blažem, Blaž]   Janija → [Janija, Jani]   Kajo → [Kajo, Kaja]   Miho → [Miho, Miha]
 *   Jani → [Jani, Jana]  (dative of Jana — genuinely ambiguous)
 * Multi-word surfaces are lemmatised token by token (cartesian product capped at 12).
 */
export function lemmaCandidates(surface: string): string[] {
  const words = surface.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    let acc: string[] = [""];
    for (const w of words) {
      const next: string[] = [];
      for (const prefix of acc) for (const l of lemmaWord(w)) next.push(prefix ? `${prefix} ${l}` : l);
      acc = next.slice(0, 12);
    }
    return acc;
  }
  return words.length ? lemmaWord(words[0]!) : [];
}

function lemmaWord(word: string): string[] {
  const w = word.replace(/[.,;:!?()"“”„]+$/g, "").replace(/^[("“„]+/, "");
  const out: string[] = [w];
  const lw = w.toLowerCase();
  const add = (s: string) => {
    if (s.length >= 2 && !out.includes(s)) out.push(s);
  };
  const strip = (n: number) => w.slice(0, w.length - n);
  if (w.length < 3) return out;

  // Possessive adjectives: Blažev(a/o/e/i/em/ih), Kajin(a/o/…) → owner.
  let m = lw.match(/^(.+?)(ov|ev)(a|o|e|i|em|ih|im|ega|emu)?$/);
  if (m && m[1]!.length >= 3) add(w.slice(0, m[1]!.length));
  m = lw.match(/^(.+?)in(a|o|e|i|em|ih|im|ega|emu)?$/);
  if (m && m[1]!.length >= 2 && lw.length > 4) add(keepCase(w.slice(0, m[1]!.length), "a"));

  // i/j-stems: Janija, Janiju, Janijem, Janijo → Jani
  m = lw.match(/^(.+[aeiou])j(a|u|em|om|o|e)$/);
  if (m) add(w.slice(0, m[1]!.length));
  // -e names with -t- infix: Toneta, Tonetu, Tonetom → Tone
  m = lw.match(/^(.+)et(a|u|om|em)$/);
  if (m) add(keepCase(w.slice(0, m[1]!.length), "e"));
  // Masculine consonant stems: Blaža, Blažu, Blažem, Blažom → Blaž; o-names: Marka/Marku/Markom → Marko
  if (/(em|om)$/.test(lw)) {
    add(strip(2));
    add(keepCase(strip(2), "o"));
  }
  if (/[^aeiou](a|u)$/.test(lw)) {
    add(strip(1));
    if (lw.endsWith("u") || lw.endsWith("a")) add(keepCase(strip(1), "o"));
  }
  // a-stems (feminine and masculine -a names): Kaje/Kaji/Kajo → Kaja, Mihe/Mihi/Miho → Miha
  if (/[^aeiou](e|i|o)$/.test(lw) || /[aeiou]j(e|i|o)$/.test(lw)) add(keepCase(strip(1), "a"));
  return out;
}

/* ------------------------------------------------------------------ */
/*  Nickname groups (clustering only)                                  */
/* ------------------------------------------------------------------ */

/** Variant spellings and diminutives that may refer to the same first name. Accent-folded, lowercase. */
export const NICKNAME_GROUPS: string[][] = [
  ["alex", "aleks", "aleksander", "alexander", "aleksandar", "alexandre", "alek"],
  ["jani", "janez", "janko"],
  ["matjaz", "matjo", "matjazek"],
  ["matt", "matthew", "mathew", "matty", "matthias", "mattia"],
  ["miha", "mihael", "mihec"],
  ["michael", "mike", "mikey", "mick", "micha", "michal"],
  ["peter", "pero", "pejo", "petr", "pierre", "pete"],
  ["blaz", "blazko", "blazi"],
  ["domen", "domi", "dome"],
  ["nejc", "nejko"],
  ["luka", "luki", "luke", "lucas", "lukas"],
  ["tomaz", "tomi", "tom", "thomas", "tommy", "tomas"],
  ["gregor", "grega", "greg", "gregory"],
  ["primoz", "primi"],
  ["ziga", "zigi"],
  ["jure", "jurij", "juri", "jurc"],
  ["nik", "niko", "nikola", "nikolaj", "nick", "nicolas", "nicholas", "nico", "niki"],
  ["katarina", "katja", "kat", "kate", "katie", "katy"],
  ["stephen", "steven", "steve", "stefan", "stef"],
  ["robert", "rob", "robi", "bob", "bobby", "robbie"],
  ["william", "will", "bill", "billy", "liam"],
  ["benjamin", "ben", "benji"],
  ["daniel", "dan", "danny", "dani", "danijel"],
  ["samuel", "sam", "sammy"],
  ["david", "dave", "davide", "davor"],
  ["joseph", "joe", "joey", "jozef", "joze"],
  ["james", "jim", "jimmy", "jamie"],
  ["christopher", "chris", "kris", "christoph", "krištof", "kristof"],
  ["anthony", "tony", "anton", "tone", "toni"],
  ["andrej", "andraz", "andrew", "andy", "andre", "andreas"],
  ["urban", "urbi"],
  ["marko", "mark", "marc", "marcus", "markus"],
  ["jakob", "jake", "jacob", "kobe"],
  ["sebastjan", "sebastian", "seba", "basti"],
  ["elizabeta", "liza", "lizi", "eliza", "elizabeth", "beth", "lisa"],
  ["alexandra", "aleksandra", "sasha", "sasa"],
];

const NICK_CANON = new Map<string, string>();
for (const g of NICKNAME_GROUPS) for (const n of g) if (!NICK_CANON.has(n)) NICK_CANON.set(n, g[0]!);

/** Canonical group name for a first-name token (accent-folded lowercase), or the token itself. */
export function nicknameCanon(token: string): string {
  const t = deaccent(token).toLowerCase();
  return NICK_CANON.get(t) ?? t;
}

/** All accent-folded lowercase variants of a name token (itself, lemmas, nickname siblings). */
export function nameVariants(token: string): string[] {
  const out = new Set<string>();
  for (const l of lemmaCandidates(token)) out.add(deaccent(l).toLowerCase());
  const canon = nicknameCanon(token);
  for (const g of NICKNAME_GROUPS) if (g[0] === canon) for (const n of g) out.add(n);
  return [...out];
}

/* ------------------------------------------------------------------ */
/*  Gender hint from Slovenian past-tense participles                  */
/* ------------------------------------------------------------------ */

const MASC = new Set([
  "rekel", "rekou", "reku", "bil", "biu", "sel", "sou", "povedal", "povedu", "imel", "imeu", "mislil", "mislu", "delal", "delu",
  "prisel", "prisu", "hotel", "hotu", "vprasal", "vprasu", "predlagal", "predlagu", "poslal", "poslu", "napisal", "napisu", "naredil", "naredu",
  "dal", "dau", "vedel", "vedu", "znal", "znau", "zacel", "zacu", "rekl", "omenil", "omenu", "pokazal", "pokazu", "ponudil", "ponudu", "razlozil",
  "pomagal", "pomagu", "obljubil", "povabil", "spoznal", "spoznu", "videl", "vidu", "dobil", "dobu", "izvedel", "zelel", "prosil",
]);
const FEM = new Set([
  "rekla", "bila", "sla", "povedala", "imela", "mislila", "delala", "prisla", "hotela", "hotla", "vprasala", "predlagala", "poslala", "napisala",
  "naredila", "dala", "vedela", "vedla", "znala", "zacela", "omenila", "pokazala", "ponudila", "razlozila", "pomagala", "obljubila", "povabila",
  "spoznala", "videla", "dobila", "izvedela", "zelela", "prosila",
]);
const AUX = new Set(["je", "ni", "bo", "bi", "mi", "me", "se", "si", "pa", "tud", "tudi", "ze", "še", "se", "mu", "ji", "nam", "da"]);

/**
 * Guesses grammatical gender of the person named at `surfaceIndex` in `text` from the next few
 * past-tense verbs ("Kaja je rekla" → f, "Blaž je rekou" → m). Returns null without a signal.
 */
export function genderHint(text: string, surfaceIndex: number): "m" | "f" | null {
  if (surfaceIndex < 0 || surfaceIndex >= text.length) return null;
  // Scope: the rest of the clause after the name (up to a sentence break, ~80 chars).
  const after = text.slice(surfaceIndex).replace(/^[\p{L}'’-]+/u, "").slice(0, 80).split(/[.!?\n;]/)[0] ?? "";
  const words = deaccent(after)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .slice(0, 7);
  let m = 0;
  let f = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (FEM.has(w)) f++;
    else if (MASC.has(w)) m++;
    else if (i > 0 && AUX.has(words[i - 1]!) && w.length >= 4) {
      if (/la$/.test(w)) f += 0.5;
      else if (/(il|al|ou|iu)$/.test(w)) m += 0.5;
    }
  }
  if (m === f) return null;
  return m > f ? "m" : "f";
}
