/**
 * Extracts one team's official result and the complete standings from a WodBuster page.
 * Fail-closed by design: missing cards/team throw instead of inventing a result.
 */

function decodeEntities(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function textContent(markup) {
  return decodeEntities(
    markup
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function attribute(tag, name) {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? "") : null;
}

/** Finds balanced div elements without requiring a browser DOM or dependency. */
function findDivElements(html) {
  const elements = [];
  const stack = [];
  const token = /<\/?div\b[^>]*>/gi;
  let match;

  while ((match = token.exec(html)) !== null) {
    const tag = match[0];
    if (/^<\//.test(tag)) {
      const opened = stack.pop();
      if (opened) elements.push({ ...opened, end: token.lastIndex, innerEnd: match.index });
      continue;
    }

    if (/\/\s*>$/.test(tag)) continue;
    const classes = (attribute(tag, "class") || "").split(/\s+/).filter(Boolean);
    stack.push({ start: match.index, innerStart: token.lastIndex, tag, classes });
  }

  return elements;
}

function innerHtml(html, element) {
  return html.slice(element.innerStart, element.innerEnd);
}

function classElement(elements, container, className) {
  return elements
    .filter(element =>
      element.classes.includes(className) &&
      element.start >= container.innerStart &&
      element.end <= container.innerEnd
    )
    .sort((a, b) => a.start - b.start)[0] || null;
}

function parseInteger(value) {
  const match = String(value ?? "").match(/^\s*(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function normalizeName(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

function parseCard(html, elements, card) {
  const athlete = classElement(elements, card, "athlete");
  const name = athlete && classElement(elements, athlete, "name");
  const team = name
    ? (attribute(html.slice(name.start, name.innerStart), "title") || textContent(innerHtml(html, name)))
    : null;
  const score = classElement(elements, card, "score");
  const result = classElement(elements, card, "result");
  const pointsElement = result && classElement(elements, result, "points");
  const rank = score ? parseInteger(textContent(innerHtml(html, score))) : null;

  let resultText = result ? innerHtml(html, result) : "";
  if (pointsElement) resultText = resultText.replace(html.slice(pointsElement.start, pointsElement.end), " ");
  const rawResult = textContent(resultText);
  const mark = rawResult && rawResult !== "-" && !/^\d+\s*pts$/i.test(rawResult) ? rawResult : null;

  let points = pointsElement
    ? parseInteger(textContent(innerHtml(html, pointsElement)).replace(/\s*pts\s*$/i, ""))
    : null;

  if (points === null && result) {
    const pointsMatch = rawResult.match(/^(\d+)\s*pts$/i);
    if (pointsMatch) points = Number(pointsMatch[1]);
  }

  return {
    team: team?.trim() || null,
    rank,
    mark,
    points,
    hasResult: rank !== null || mark !== null || (points !== null && points > 0)
  };
}

/**
 * @param {string} html Raw HTML from a WodBuster competition.aspx page.
 * @param {string} teamName Exact team name shown by WodBuster.
 * @returns {{team: string, rank: number|null, totalTeams: number, mark: string|null, points: number|null, hasResult: boolean, standings: Array}}
 */
export function parseCompetitionHtml(html, teamName) {
  if (typeof html !== "string" || !html.trim()) {
    throw new TypeError("WodBuster HTML must be a non-empty string.");
  }
  if (typeof teamName !== "string" || !teamName.trim()) {
    throw new TypeError("A non-empty team name is required.");
  }

  const elements = findDivElements(html);
  const cards = elements.filter(element => element.classes.includes("athleteresult"));
  if (cards.length === 0) throw new Error("No WodBuster .athleteresult cards were found.");

  const standings = cards
    .map(card => parseCard(html, elements, card))
    .filter(row => row.team)
    .sort((a, b) => {
      if (a.rank === null) return b.rank === null ? 0 : 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank;
    });

  const target = standings.find(row => normalizeName(row.team) === normalizeName(teamName));
  if (!target) {
    throw new Error('Team "' + teamName + '" was not found in the WodBuster result cards.');
  }

  return {
    team: target.team,
    rank: target.rank,
    totalTeams: cards.length,
    mark: target.mark,
    points: target.points,
    hasResult: target.hasResult,
    standings
  };
}
