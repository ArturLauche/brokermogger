import "./test-env";

import { afterAll, beforeEach } from "vitest";

import { resetRuntimeSettingsCacheForTests } from "@/lib/config/runtimeSettings";
import { resetCatalogCacheForTests } from "@/lib/db/repositories/catalog";
import { resetDatabase, testPrisma } from "../helpers/db";

beforeEach(async () => {
  resetRuntimeSettingsCacheForTests();
  resetCatalogCacheForTests();
  await resetDatabase();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
