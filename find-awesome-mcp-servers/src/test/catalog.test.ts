import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const catalogPath = pathToFileURL(resolve(process.cwd(), "../site/catalog.mjs"));
const { DEFAULT_FILTERS, readFilters, writeFilters, normalizeRepositoryId, findListingIndexes } =
  await import(catalogPath.href);

test("catalog links round-trip every filter and preserve unrelated parameters", () => {
  const filters = {
    query: "data & tools",
    activity: "month",
    license: "MIT License",
    sort: "unique",
    repository: "https://github.com/Vendor/Server",
  };
  const url = writeFilters(new URL("https://example.com/catalog/?source=readme#results"), filters);
  assert.deepEqual(readFilters(url, ["MIT License"]), filters);
  assert.equal(url.searchParams.get("source"), "readme");
  assert.equal(url.hash, "#results");

  const reset = writeFilters(url, DEFAULT_FILTERS);
  assert.equal(reset.search, "?source=readme");
});

test("invalid URL selections fall back to working defaults", () => {
  const filters = readFilters(new URL("https://example.com/?sort=unknown&activity=never&license=unknown"), ["MIT"]);
  assert.deepEqual(filters, DEFAULT_FILTERS);
});

test("repository lookup accepts normalized names and GitHub links", () => {
  for (const input of [
    " Vendor/Server ",
    "vendor/server/",
    "vendor/server.git",
    "github.com/Vendor/Server",
    "https://www.github.com/Vendor/Server.git",
    "https://github.com/Vendor/Server/tree/main?tab=readme#readme",
  ]) {
    assert.equal(normalizeRepositoryId(input), "vendor/server");
  }
  for (const input of ["", "server", "vendor/server/extra", "https://example.com/vendor/server", "https://github.com/vendor", "vendor/..", "vendor/a b"]) {
    assert.equal(normalizeRepositoryId(input), null);
  }
});

test("reverse lookup uses exact repository matches and returns known indexes", () => {
  const coverage = { repositories: [
    { repositoryId: "vendor/server", indexes: ["indexes/a", "indexes/b", "indexes/missing"] },
    { repositoryId: "vendor/server-extra", indexes: ["indexes/c"] },
  ] };
  const indexes = [
    { id: "indexes/a", fullName: "indexes/a", metrics: { stars: 1 } },
    { id: "indexes/b", fullName: "indexes/b", metrics: { stars: 20 } },
    { id: "indexes/c", fullName: "indexes/c", metrics: { stars: 100 } },
  ];
  assert.deepEqual(findListingIndexes(coverage, "vendor/server", indexes).map((index: { id: string }) => index.id), ["indexes/b", "indexes/a"]);
  assert.deepEqual(findListingIndexes(coverage, "vendor/unknown", indexes), []);
});
