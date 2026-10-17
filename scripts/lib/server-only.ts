/**
 * App modules that touch the database start with `import "server-only"`, which makes the Next.js
 * build fail if a client component ever imports them. Outside the bundler (plain Node via tsx)
 * that marker package throws on import, because only the bundler's `react-server` condition maps
 * it to a no-op. Scripts are server code by definition, so they register the no-op here.
 *
 * Import this module FIRST in any script that loads src/lib/db or src/lib/data/*:
 *
 *   import "./lib/server-only";
 *
 * (Equivalent: run the script with `tsx --conditions=react-server …`.)
 */
import { createRequire } from "node:module";

const require = createRequire(__filename);
const id = require.resolve("server-only");
require.cache[id] = { id, filename: id, loaded: true, exports: {}, children: [], paths: [] } as unknown as NodeJS.Module;
