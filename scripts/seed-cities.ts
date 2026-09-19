/**
 * Loads GeoNames cities (population ≥ 15 000) into the `cities` table.
 * Data: https://download.geonames.org/export/dump/ (CC BY 4.0)
 * Run: pnpm db:seed-cities
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const CACHE = join(process.cwd(), ".cache", "geonames");
const CITIES = "cities15000";

function fetchFile(name: string) {
  mkdirSync(CACHE, { recursive: true });
  const target = join(CACHE, name);
  if (!existsSync(target)) {
    console.log(`Downloading ${name}…`);
    execSync(`curl -sSL -o "${target}" https://download.geonames.org/export/dump/${name}`, { stdio: "inherit" });
  }
  return target;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const sql = postgres(url, { prepare: false });

  const zip = fetchFile(`${CITIES}.zip`);
  const txt = join(CACHE, `${CITIES}.txt`);
  if (!existsSync(txt)) execSync(`unzip -o -q "${zip}" -d "${CACHE}"`);

  const admin1 = new Map<string, string>();
  for (const line of readFileSync(fetchFile("admin1CodesASCII.txt"), "utf8").split("\n")) {
    const [code, name] = line.split("\t");
    if (code && name) admin1.set(code, name);
  }
  const countryName = new Intl.DisplayNames(["en"], { type: "region" });

  const rows: Array<Record<string, unknown>> = [];
  for (const line of readFileSync(txt, "utf8").split("\n")) {
    if (!line) continue;
    const c = line.split("\t");
    const [id, name, ascii, , lat, lng, , , cc, , a1, , , , pop, , , tz] = c;
    let country = cc;
    try {
      country = countryName.of(cc) ?? cc;
    } catch {}
    rows.push({
      id: Number(id),
      name,
      ascii_name: ascii,
      admin: admin1.get(`${cc}.${a1}`) ?? null,
      country,
      country_code: cc,
      lat: Number(lat),
      lng: Number(lng),
      population: Number(pop) || null,
      timezone: tz || null,
    });
  }
  console.log(`Parsed ${rows.length} cities. Upserting…`);

  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await sql`
      insert into cities ${sql(chunk, "id", "name", "ascii_name", "admin", "country", "country_code", "lat", "lng", "population", "timezone")}
      on conflict (id) do update set
        name = excluded.name, ascii_name = excluded.ascii_name, admin = excluded.admin, country = excluded.country,
        country_code = excluded.country_code, lat = excluded.lat, lng = excluded.lng, population = excluded.population, timezone = excluded.timezone
    `;
    process.stdout.write(`\r${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log("\nDone.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
