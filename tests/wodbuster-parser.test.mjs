import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCompetitionHtml } from "../scripts/wodbuster-parser.mjs";

const fixtures = JSON.parse(await readFile(new URL("./fixtures/wodbuster-results.json", import.meta.url), "utf8"));

function pageHtml(page) {
  const filler = Array.from(
    { length: page.expectedTotalTeams - 1 },
    (_, index) => '<div class="athleteresult"><div class="score">1</div><div class="athlete"><div class="name" title="Fixture Team ' + index + '">Fixture Team ' + index + '</div></div><div class="result">-</div></div>'
  ).join("");
  return page.teamCardHtml + filler;
}

const expected = {
  general: { rank: 15, totalTeams: 23, mark: null, points: 105, hasResult: true },
  wod1a: { rank: 12, totalTeams: 22, mark: "185reps", points: 56, hasResult: true },
  wod1b: { rank: 14, totalTeams: 22, mark: "3353reps", points: 49, hasResult: true },
  wod2: { rank: null, totalTeams: 23, mark: null, points: 0, hasResult: false },
  wod3: { rank: null, totalTeams: 23, mark: null, points: 0, hasResult: false },
  wod4: { rank: null, totalTeams: 23, mark: null, points: 0, hasResult: false }
};

for (const [key, page] of Object.entries(fixtures.pages)) {
  test("parses captured WodBuster result: " + key, () => {
    const result = parseCompetitionHtml(pageHtml(page), fixtures.team);
    assert.deepEqual(result, { team: fixtures.team, ...expected[key] });
  });
}

test("fails closed when result cards are absent", () => {
  assert.throws(
    () => parseCompetitionHtml("<html><body>No results</body></html>", fixtures.team),
    /No WodBuster \.athleteresult cards/
  );
});

test("fails closed when the team is not present", () => {
  const page = fixtures.pages.wod1a;
  assert.throws(() => parseCompetitionHtml(pageHtml(page), "A different team"), /was not found/);
});

test("matches team names case-insensitively and with normalized whitespace", () => {
  const page = fixtures.pages.wod1a;
  const result = parseCompetitionHtml(pageHtml(page), "  veni vidi regulinchi  ");
  assert.equal(result.rank, 12);
  assert.equal(result.points, 56);
});
