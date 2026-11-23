// bun run admin:create <email> <password> [name]

import * as v from "valibot";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { registerUserSchema } from "shared";

import db, { users } from "../db";

const [email, password, name = "Admin"] = process.argv.slice(2);

const parsed = v.safeParse(registerUserSchema, { email, password, name });
if (!parsed.success) {
  console.error("Usage: bun run admin:create <email> <password> [name]");
  console.error(parsed.issues.map((issue) => issue.message).join("\n"));
  process.exit(1);
}

const passwordHash = await Bun.password.hash(parsed.output.password);

const [existing] = await db.select().from(users).where(eq(users.email, parsed.output.email));
if (existing) {
  await db.update(users).set({ role: "admin", passwordHash }).where(eq(users.id, existing.id));
  console.log(`Promoted existing user ${parsed.output.email} to admin and reset their password.`);
} else {
  await db.insert(users).values({ ...parsed.output, passwordHash, role: "admin" });
  console.log(`Created admin user ${parsed.output.email}.`);
}

await db.$client.end();
