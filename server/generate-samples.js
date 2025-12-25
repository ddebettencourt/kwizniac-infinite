// Script to generate 100 sample topics from Wikipedia
import dotenv from 'dotenv';
dotenv.config();

// Inline the Wikipedia fetching logic
const EXCLUDED_PATTERNS = [
  /^Main Page$/i,
  /^Special:/i,
  /^Wikipedia:/i,
  /^File:/i,
  /^Portal:/i,
  /^Help:/i,
  /^Category:/i,
  /^Template:/i,
  /deaths in \d{4}/i,
  /^List of/i,
  /\d{4} in /i,
  /^.{1,2}$/,
  /^Index of/i,
  /^Outline of/i,
  /^Deaths in/i,
  /^Births in/i,
  /season \d+/i,
  /\(TV series\)/i,
  /\(film\)/i,
  /\(song\)/i,
  /\(album\)/i,
  /episode/i,
  /Chapter \d+/i,
  /^202\d /i,
  /^Google$/i,
  /^YouTube$/i,
  /^Facebook$/i,
  /^Instagram$/i,
  /^TikTok$/i,
  /^Twitter$/i,
  /^Pornhub$/i,
  /^XVideos$/i,
  /^XNXX$/i,
  /pornograph/i,
  /^ChatGPT$/i,
  /^Reddit$/i,
];

function isValidTopic(title) {
  return !EXCLUDED_PATTERNS.some(pattern => pattern.test(title));
}

async function fetchMonthlyTopics(year, month) {
  const monthStr = String(month).padStart(2, '0');
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${year}/${monthStr}/all-days`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'KwizniacInfinite/1.0 (trivia game)' }
  });

  if (!response.ok) return [];

  const data = await response.json();
  return data.items[0].articles
    .filter(article => isValidTopic(article.article))
    .map(article => ({
      title: article.article.replace(/_/g, ' '),
      views: article.views
    }));
}

async function fetchDescriptions(titles) {
  const titlesParam = titles.map(t => t.replace(/ /g, '_')).join('|');
  const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titlesParam)}&prop=description&format=json&origin=*`;

  try {
    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'KwizniacInfinite/1.0 (trivia game)' }
    });

    if (!response.ok) return {};

    const data = await response.json();
    const pages = data.query?.pages || {};
    const result = {};

    for (const page of Object.values(pages)) {
      if (page.title) {
        result[page.title.replace(/_/g, ' ')] = page.description || 'No description';
      }
    }
    return result;
  } catch {
    return {};
  }
}

async function main() {
  console.log('Fetching popular topics from Wikipedia...\n');

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  // Fetch last 3 months
  const monthsToFetch = [];
  for (let i = 1; i <= 3; i++) {
    let month = currentMonth - i;
    let year = currentYear;
    if (month <= 0) {
      month += 12;
      year -= 1;
    }
    monthsToFetch.push({ year, month });
  }

  const results = await Promise.all(
    monthsToFetch.map(({ year, month }) => fetchMonthlyTopics(year, month))
  );

  // Aggregate
  const topicViews = new Map();
  for (const monthData of results) {
    for (const article of monthData) {
      const existing = topicViews.get(article.title) || 0;
      topicViews.set(article.title, existing + article.views);
    }
  }

  // Sort and take top 100
  const top100 = Array.from(topicViews.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100);

  // Fetch descriptions in batches
  const titles = top100.map(([title]) => title);
  const descriptions = {};

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const batchDesc = await fetchDescriptions(batch);
    Object.assign(descriptions, batchDesc);
  }

  // Print results
  console.log('=' .repeat(80));
  console.log('TOP 100 WIKIPEDIA TOPICS (Last 3 Months)');
  console.log('='.repeat(80));
  console.log('');

  // Group by category
  const categories = {};
  for (const [title, views] of top100) {
    const desc = descriptions[title] || 'Unknown';
    const firstWord = desc.split(' ')[0].toLowerCase();

    if (!categories[firstWord]) {
      categories[firstWord] = [];
    }
    categories[firstWord].push({ title, desc, views });
  }

  // Print by category
  const sortedCategories = Object.entries(categories)
    .sort((a, b) => b[1].length - a[1].length);

  console.log('CATEGORY BREAKDOWN:');
  console.log('-'.repeat(40));
  for (const [cat, items] of sortedCategories.slice(0, 15)) {
    console.log(`${cat}: ${items.length} topics`);
  }
  console.log('');

  console.log('ALL 100 TOPICS:');
  console.log('-'.repeat(80));

  let i = 1;
  for (const [title, views] of top100) {
    const desc = descriptions[title] || 'Unknown';
    const viewsFormatted = (views / 1000000).toFixed(1) + 'M views';
    console.log(`${String(i).padStart(3)}. ${title}`);
    console.log(`     └─ ${desc} (${viewsFormatted})`);
    i++;
  }
}

main().catch(console.error);
