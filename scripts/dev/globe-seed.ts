/**
 * LOCAL-ONLY throwaway: seeds fake people across world cities so globe clustering can be tested,
 * and removes them again. Rows are tagged (`met_context = '[globe-seed]'`, `locations.source =
 * 'globe-seed'`) so removal never touches real data. Refuses any non-local database.
 *
 *   pnpm exec tsx scripts/dev/globe-seed.ts           # add ~160 people in 40 cities
 *   pnpm exec tsx scripts/dev/globe-seed.ts --remove  # delete them
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
const url = process.env.DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Refusing: DATABASE_URL is not local");

const TAG = "[globe-seed]";
const CITIES: [string, string, string, number, number][] = [
  ["Ljubljana", "Slovenia", "SI", 46.0511, 14.5051],
  ["Maribor", "Slovenia", "SI", 46.5547, 15.6459],
  ["Zagreb", "Croatia", "HR", 45.815, 15.9819],
  ["Vienna", "Austria", "AT", 48.2082, 16.3738],
  ["Graz", "Austria", "AT", 47.0707, 15.4395],
  ["Munich", "Germany", "DE", 48.1351, 11.582],
  ["Berlin", "Germany", "DE", 52.52, 13.405],
  ["Hamburg", "Germany", "DE", 53.5511, 9.9937],
  ["Zurich", "Switzerland", "CH", 47.3769, 8.5417],
  ["Milan", "Italy", "IT", 45.4642, 9.19],
  ["Trieste", "Italy", "IT", 45.6495, 13.7768],
  ["Venice", "Italy", "IT", 45.4408, 12.3155],
  ["Rome", "Italy", "IT", 41.9028, 12.4964],
  ["Paris", "France", "FR", 48.8566, 2.3522],
  ["London", "United Kingdom", "GB", 51.5074, -0.1278],
  ["Amsterdam", "Netherlands", "NL", 52.3676, 4.9041],
  ["Copenhagen", "Denmark", "DK", 55.6761, 12.5683],
  ["Stockholm", "Sweden", "SE", 59.3293, 18.0686],
  ["Barcelona", "Spain", "ES", 41.3874, 2.1686],
  ["Lisbon", "Portugal", "PT", 38.7223, -9.1393],
  ["Budapest", "Hungary", "HU", 47.4979, 19.0402],
  ["Prague", "Czechia", "CZ", 50.0755, 14.4378],
  ["Belgrade", "Serbia", "RS", 44.7866, 20.4489],
  ["Athens", "Greece", "GR", 37.9838, 23.7275],
  ["Istanbul", "Türkiye", "TR", 41.0082, 28.9784],
  ["Tel Aviv", "Israel", "IL", 32.0853, 34.7818],
  ["Dubai", "United Arab Emirates", "AE", 25.2048, 55.2708],
  ["Bangalore", "India", "IN", 12.9716, 77.5946],
  ["Singapore", "Singapore", "SG", 1.3521, 103.8198],
  ["Tokyo", "Japan", "JP", 35.6762, 139.6503],
  ["Seoul", "South Korea", "KR", 37.5665, 126.978],
  ["Sydney", "Australia", "AU", -33.8688, 151.2093],
  ["Cape Town", "South Africa", "ZA", -33.9249, 18.4241],
  ["Nairobi", "Kenya", "KE", -1.2921, 36.8219],
  ["New York City", "United States", "US", 40.7128, -74.006],
  ["Boston", "United States", "US", 42.3601, -71.0589],
  ["San Francisco", "United States", "US", 37.7749, -122.4194],
  ["Toronto", "Canada", "CA", 43.6532, -79.3832],
  ["Mexico City", "Mexico", "MX", 19.4326, -99.1332],
  ["Buenos Aires", "Argentina", "AR", -34.6037, -58.3816],
];
const FIRST = ["Ana", "Bor", "Cene", "Dana", "Eva", "Filip", "Gaja", "Han", "Iris", "Jan", "Kaja", "Luka", "Maja", "Nik", "Ola", "Pia", "Rok", "Sara", "Tim", "Urša", "Vid", "Zala", "Max", "Lea", "Noah", "Emma", "Leo", "Mia"];
const LAST = ["Novak", "Horvat", "Kos", "Zupan", "Krajnc", "Smith", "Müller", "Rossi", "Dubois", "Tanaka", "Kim", "Silva", "Cohen", "Ivanova", "Larsen", "Garcia"];
const ROLES = [["Founder", "Northwind"], ["Designer", "Studio Mono"], ["Engineer", "Photomath"], ["Investor", null], ["Doctor", null], ["Product manager", "Bitstamp"], ["Architect", null], [null, null]];
const WARMTH = ["inner", "active", "active", "active", "dormant", "dormant", "archive"];

async function main() {
  const sql = postgres(url!, { max: 1 });
  try {
    const [owner] = await sql<{ id: string }[]>`select id from profiles order by (email = 'dev@local.test') desc limit 1`;
    if (!owner) throw new Error("No profile found");
    if (process.argv.includes("--remove")) {
      const ppl = await sql`delete from people where owner_id = ${owner.id} and met_context = ${TAG}`;
      const locs = await sql`delete from locations where owner_id = ${owner.id} and source = 'globe-seed'`;
      console.log(`Removed ${ppl.count} people, ${locs.count} locations`);
      return;
    }
    let n = 0;
    for (const [i, [name, country, cc, lat, lng]] of CITIES.entries()) {
      const [loc] = await sql<{ id: string }[]>`
        insert into locations (owner_id, name, country, country_code, lat, lng, source)
        values (${owner.id}, ${name}, ${country}, ${cc}, ${lat}, ${lng}, 'globe-seed') returning id`;
      // Zipf-ish: the first cities get the most people, a few get exactly one.
      const count = Math.max(1, Math.round(22 / (i + 1) ** 0.75)) - (i % 9 === 8 ? 1 : 0) || 1;
      for (let k = 0; k < count; k++, n++) {
        const [headline, company] = ROLES[n % ROLES.length]!;
        await sql`
          insert into people (owner_id, display_name, headline, company, warmth, home_location_id, met_context)
          values (${owner.id}, ${`${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`}, ${headline}, ${company},
                  ${WARMTH[n % WARMTH.length]!}, ${loc!.id}, ${TAG})`;
      }
    }
    console.log(`Seeded ${n} people in ${CITIES.length} cities (remove with --remove)`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
