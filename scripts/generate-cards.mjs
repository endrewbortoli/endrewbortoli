// Generates the GitHub stats and top-languages SVG cards used in README.md.
// Runs in the "Update profile cards" workflow; needs GITHUB_TOKEN in the env.
import { mkdirSync, writeFileSync } from "node:fs";

const USERNAME = process.env.GH_USERNAME || "endrewbortoli";
const TOKEN = process.env.GITHUB_TOKEN;
const OUT_DIR = "generated";
const LANGS_COUNT = 8;

// tokyonight palette
const theme = {
  bg: "#1a1b27",
  title: "#70a5fd",
  text: "#38bdae",
};

const query = `
query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      contributionYears
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      nodes {
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

async function gql(query, variables) {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is not set");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user;
}

// contributionsCollection spans at most one year, so query each year separately.
async function totalContributions(years) {
  const fields = years
    .map(
      (y) =>
        `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") {
      contributionCalendar { totalContributions }
    }`,
    )
    .join("\n");
  const data = await gql(`query ($login: String!) { user(login: $login) { ${fields} } }`, { login: USERNAME });
  return Object.values(data).reduce((sum, c) => sum + c.contributionCalendar.totalContributions, 0);
}

const escape = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const font = `font-family="'Segoe UI', Ubuntu, Sans-Serif"`;

function contributionsCard(total, firstYear, commits) {
  const width = 495;
  const height = 195;
  const column = (x, value, label, range) => `
  <g transform="translate(${x}, 0)" text-anchor="middle">
    <text y="92" ${font} font-size="28" font-weight="700" fill="${theme.title}">${value}</text>
    <text y="128" ${font} font-size="14" fill="${theme.title}">${label}</text>
    <text y="155" ${font} font-size="12" fill="${theme.text}">${range}</text>
  </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="4.5" fill="${theme.bg}"/>${column(width / 4, total, "Total Contributions", `${firstYear} - Present`)}
  <line x1="${width / 2}" y1="28" x2="${width / 2}" y2="170" stroke="#e4e2e2" stroke-width="1"/>${column((width * 3) / 4, commits, "Commits", "Last 12 months")}
</svg>
`;
}

function topLangsCard(user) {
  const totals = new Map();
  for (const repo of user.repositories.nodes) {
    for (const { size, node } of repo.languages.edges) {
      const prev = totals.get(node.name) || { size: 0, color: node.color || "#858585" };
      prev.size += size;
      totals.set(node.name, prev);
    }
  }
  const langs = [...totals.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.size - a.size)
    .slice(0, LANGS_COUNT);
  const total = langs.reduce((sum, l) => sum + l.size, 0);

  const width = 400;
  const barWidth = width - 50;
  let x = 0;
  const bar = langs
    .map((l) => {
      const w = (l.size / total) * barWidth;
      const seg = `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="8" fill="${l.color}"/>`;
      x += w;
      return seg;
    })
    .join("");

  const rowsCount = Math.ceil(langs.length / 2);
  const height = 95 + rowsCount * 25;
  const legend = langs
    .map((l, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const pct = ((l.size / total) * 100).toFixed(2);
      return `
    <g transform="translate(${25 + col * 180}, ${90 + row * 25})">
      <circle cx="5" cy="-5" r="5" fill="${l.color}"/>
      <text x="16" ${font} font-size="12" font-weight="400" fill="${theme.text}">${escape(l.name)} ${pct}%</text>
    </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><clipPath id="bar"><rect x="0" y="0" width="${barWidth}" height="8" rx="4"/></clipPath></defs>
  <rect width="${width}" height="${height}" rx="4.5" fill="${theme.bg}"/>
  <text x="25" y="38" ${font} font-size="18" font-weight="600" fill="${theme.title}">Most Used Languages</text>
  <g transform="translate(25, 55)" clip-path="url(#bar)">${bar}</g>${legend}
</svg>
`;
}

const user = await gql(query, { login: USERNAME });
const { contributionYears, totalCommitContributions, restrictedContributionsCount } = user.contributionsCollection;
// Private-repo contributions are only exposed as one count, so they are added to public commits.
const commits = totalCommitContributions + restrictedContributionsCount;
const total = await totalContributions(contributionYears);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/stats.svg`, contributionsCard(total, Math.min(...contributionYears), commits));
writeFileSync(`${OUT_DIR}/top-langs.svg`, topLangsCard(user));
console.log(`Wrote ${OUT_DIR}/stats.svg and ${OUT_DIR}/top-langs.svg`);
