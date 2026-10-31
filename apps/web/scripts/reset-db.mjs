import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, "..", "data");

for (const file of ["away.db", "away.db-shm", "away.db-wal"]) {
  rmSync(join(data, file), { force: true });
}

console.log("Database cleared — it re-seeds with fresh dates on the next request.");
