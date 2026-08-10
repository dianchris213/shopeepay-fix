import { cleanupTestData } from "./seed";

/** Removes every row created by the suite so runs stay isolated. */
export default async function globalTeardown() {
  await cleanupTestData();
}
