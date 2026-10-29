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
  icon: "#bf91f3",
};

const query = `
query ($login: String!) {
  user(login: $login) {
    name
    contributionsCollection { totalCommitContributions restrictedContributionsCount }
    pullRequests { totalCount }
    issues { totalCount }
    repositoriesContributedTo(contributionTypes: [COMMIT, PULL_REQUEST, ISSUE]) { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

async function fetchUser() {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is not set");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user;
}

const escape = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const font = `font-family="'Segoe UI', Ubuntu, Sans-Serif"`;

function statsCard(user) {
  const repos = user.repositories.nodes;
  const c = user.contributionsCollection;
  const rows = [
    ["Total stars", repos.reduce((sum, r) => sum + r.stargazerCount, 0)],
    ["Commits (last year)", c.totalCommitContributions + c.restrictedContributionsCount],
    ["Pull requests", user.pullRequests.totalCount],
    ["Issues", user.issues.totalCount],
    ["Contributed to", user.repositoriesContributedTo.totalCount],
  ];
  const height = 70 + rows.length * 25;
  const body = rows
    .map(
      ([label, value], i) => `
    <g transform="translate(25, ${70 + i * 25})">
      <circle cx="5" cy="-5" r="4" fill="${theme.icon}"/>
      <text x="20" ${font} font-size="14" font-weight="600" fill="${theme.text}">${label}:</text>
      <text x="220" ${font} font-size="14" font-weight="700" fill="${theme.text}">${value}</text>
    </g>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${height}" viewBox="0 0 400 ${height}">
  <rect width="400" height="${height}" rx="4.5" fill="${theme.bg}"/>
  <text x="25" y="38" ${font} font-size="18" font-weight="600" fill="${theme.title}">${escape(user.name || USERNAME)}'s GitHub Stats</text>${body}
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

const user = await fetchUser();
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/stats.svg`, statsCard(user));
writeFileSync(`${OUT_DIR}/top-langs.svg`, topLangsCard(user));
console.log(`Wrote ${OUT_DIR}/stats.svg and ${OUT_DIR}/top-langs.svg`);
