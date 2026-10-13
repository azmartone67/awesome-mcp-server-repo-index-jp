import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverMcpIndexes, RepositorySearchPage } from "../github/discovery.js";
import { GithubRepo } from "../schema/github.js";

test("discovery merges queries, deduplicates case-insensitively, and keeps newer metadata", async () => {
  const original = repo("awesome-mcp");
  const updated = repo("Awesome-MCP", "2026-08-02T00:00:00Z");
  const directory = repo("server-directory");
  const server = { ...repo("example-mcp-server"), description: "An MCP server for search." };
  const queries: string[] = [];
  const discovery = await discoverMcpIndexes(async (query) => {
    queries.push(query);
    return page(query === "awesome" ? [original] : [updated, directory, server]);
  }, ["awesome", "directories"]);

  assert.deepEqual(queries, ["awesome", "directories"]);
  assert.equal(discovery.query, "awesome\ndirectories");
  assert.equal(discovery.candidateCount, 3);
  assert.deepEqual(discovery.repos.map((item) => item.name), ["Awesome-MCP", "server-directory"]);
  assert.equal(discovery.repos[0].pushed_at, updated.pushed_at);
  assert.equal(discovery.decisions.filter((decision) => !decision.included).length, 1);
});

test("discovery collects all pages before classifying", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => repo(`index-${index}`));
  const requestedPages: number[] = [];
  const discovery = await discoverMcpIndexes(async (_, pageNumber) => {
    requestedPages.push(pageNumber);
    return page(pageNumber === 1 ? firstPage : [repo("last-directory")], 101);
  }, ["directories"]);

  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(discovery.candidateCount, 101);
});

test("empty searches produce an empty discovery result", async () => {
  const discovery = await discoverMcpIndexes(async () => page([]), ["directories"]);
  assert.equal(discovery.candidateCount, 0);
  assert.deepEqual(discovery.repos, []);
});

test("discovery refuses incomplete, truncated, and over-limit searches", async () => {
  for (const result of [
    { ...page([repo("directory")]), incomplete: true },
    page([repo("directory")], 2),
    page([], 1_001),
  ]) {
    await assert.rejects(discoverMcpIndexes(async () => result, ["directories"]));
  }
});

function page(items: GithubRepo[], totalCount = items.length): RepositorySearchPage {
  return { items, totalCount, incomplete: false };
}

function repo(name: string, pushedAt = "2026-08-01T00:00:00Z"): GithubRepo {
  return {
    name,
    html_url: `https://github.com/example/${name}`,
    owner: { login: "example", html_url: "https://github.com/example" },
    description: "A curated directory of MCP servers.",
    fork: false,
    topics: ["mcp"],
    size: 10,
    stargazers_count: 20,
    forks_count: 2,
    open_issues_count: 1,
    created_at: "2026-01-01T00:00:00Z",
    pushed_at: pushedAt,
    license: null,
  };
}
