import "./test-env";

import { afterAll, beforeEach } from "vitest";

import { resetDatabase, testPrisma } from "../helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
