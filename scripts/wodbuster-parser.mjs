/**
 * Extracts one team's official result from a WodBuster competition HTML page.
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
      .replace(/<br\s*\/?>/gi, " ")
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

/**
 * @param {string} html Raw HTML from a WodBuster competition.aspx page.
 * @param {string} teamName Exact team name shown by WodBuster.
 * @returns {{team: string, rank: number|null, totalTeams: number, mark: string|null, points: number|null, hasResult: boolean}}
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

  const target = cards.find(card => {
    const athlete = classElement(elements, card, "athlete");
    const name = athlete && classElement(elements, athlete, "name");
    if (!name) return false;
    const visibleName = textContent(innerHtml(html, name));
    const title = attribute(html.slice(name.start, name.innerStart), "title");
    return normalizeName(title || visibleName) === normalizeName(teamName);
  });

  if (!target) {
    throw new Error('Team "' + teamName + '" was not found in the WodBuster result cards.');
  }

  const scoreElement = classElement(elements, target, "score");
  const resultElement = classElement(elements, target, "result");
  const pointsElement = resultElement && classElement(elements, resultElement, "points");
  const rank = scoreElement ? parseInteger(textContent(innerHtml(html, scoreElement))) : null;

  let resultText = resultElement ? innerHtml(html, resultElement) : "";
  if (pointsElement) resultText = resultText.replace(html.slice(pointsElement.start, pointsElement.end), " ");
  const rawResult = textContent(resultText);
  const mark = rawResult && rawResult !== "-" && !/^\d+\s*pts$/i.test(rawResult) ? rawResult : null;

  let points = pointsElement
    ? parseInteger(textContent(innerHtml(html, pointsElement)).replace(/\s*pts\s*$/i, ""))
    : null;

  if (points === null && resultElement) {
    const pointsMatch = rawResult.match(/^(\d+)\s*pts$/i);
    if (pointsMatch) points = Number(pointsMatch[1]);
  }

  return {
    team: teamName.trim(),
    rank,
    totalTeams: cards.length,
    mark,
    points,
    hasResult: rank !== null || mark !== null || (points !== null && points > 0)
  };
}
