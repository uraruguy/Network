import { withOwner } from "@/lib/api-server";
import { searchCities } from "@/lib/data/locations";

export const GET = withOwner(async ({ url }) => searchCities(url.searchParams.get("q") ?? "", 8));
