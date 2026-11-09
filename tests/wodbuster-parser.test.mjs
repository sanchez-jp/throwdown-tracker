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
    assert.deepEqual(
      { team: result.team, rank: result.rank, totalTeams: result.totalTeams, mark: result.mark, points: result.points, hasResult: result.hasResult },
      { team: fixtures.team, ...expected[key] }
    );\n    assert.equal(result.standings.length, page.expectedTotalTeams);\n    assert.ok(result.standings.some(row => row.team === fixtures.team));
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


test("returns complete standings ordered by official rank", () => {
  const card = (rank, team, mark, points) =>
    '<div class="athleteresult"><div class="score">' + rank +
    '</div><div class="athlete"><div class="name" title="' + team + '">' + team +
    '</div></div><div class="result">' + mark +
    '<div class="points">' + points + 'pts</div></div></div>';
  const html = [
    card(6, "Team Below", "90reps", 18),
    card(4, "Team Above", "110reps", 20),
    card(5, fixtures.team, "100reps", 19)
  ].join("");

  const result = parseCompetitionHtml(html, fixtures.team);
  assert.deepEqual(
    result.standings.map(({ team, rank }) => ({ team, rank })),
    [
      { team: "Team Above", rank: 4 },
      { team: fixtures.team, rank: 5 },
      { team: "Team Below", rank: 6 }
    ]
  );
  assert.equal(result.standings[1].points, 19);
});

test("keeps unranked teams after ranked teams", () => {
  const html = [
    '<div class="athleteresult"><div class="score">-</div><div class="athlete"><div class="name" title="Pending Team">Pending Team</div></div><div class="result">-</div></div>',
    '<div class="athleteresult"><div class="score">2</div><div class="athlete"><div class="name" title="' + fixtures.team + '">' + fixtures.team + '</div></div><div class="result">80reps</div></div>'
  ].join("");
  const result = parseCompetitionHtml(html, fixtures.team);
  assert.deepEqual(result.standings.map(row => row.team), [fixtures.team, "Pending Team"]);
  assert.equal(result.standings[1].rank, null);
});
