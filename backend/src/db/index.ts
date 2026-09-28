import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in the environment variables.");
}

const client = new SQL(DATABASE_URL);
const db = drizzle({ client });

export default db;
export * from "./schema";
