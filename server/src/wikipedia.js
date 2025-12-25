// Wikipedia API integration for fetching popular topics
import dotenv from 'dotenv';
dotenv.config();

// Cache for popular topics
let cachedTopics = [];
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours (yearly data doesn't change much)

// Track used topics to avoid repetition within a session
const usedTopics = new Set();

// Categories to exclude (not good trivia subjects)
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
  /^.{1,2}$/, // Too short
  /^Index of/i,
  /^Outline of/i,
  /^Deaths in/i,
  /^Births in/i,
  /season \d+/i, // TV seasons
  /\(TV series\)/i, // TV series disambiguation
  /\(film\)/i, // Film disambiguation (often obscure)
  /\(song\)/i, // Song disambiguation
  /\(album\)/i, // Album disambiguation
  /episode/i,
  /Chapter \d+/i,
  /^202\d /i, // Year-specific events
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

// Check if a topic is suitable for trivia
function isValidTopic(title) {
  return !EXCLUDED_PATTERNS.some(pattern => pattern.test(title));
}

// Fetch top Wikipedia articles for a given month
async function fetchMonthlyTopics(year, month) {
  try {
    const monthStr = String(month).padStart(2, '0');
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${year}/${monthStr}/all-days`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'KwizniacInfinite/1.0 (trivia game; educational)'
      }
    });

    if (!response.ok) {
      console.error(`Wikipedia API error for ${year}/${monthStr}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const articles = data.items[0].articles;

    return articles
      .filter(article => isValidTopic(article.article))
      .map(article => ({
        title: article.article.replace(/_/g, ' '),
        views: article.views
      }));
  } catch (error) {
    console.error(`Error fetching ${year}/${month}:`, error.message);
    return [];
  }
}

// Fetch top articles from multiple months and aggregate
async function fetchYearlyPopularTopics() {
  console.log('Fetching yearly popular topics from Wikipedia...');

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  // Fetch last 6 months of data
  const monthsToFetch = [];
  for (let i = 1; i <= 6; i++) {
    let month = currentMonth - i;
    let year = currentYear;
    if (month <= 0) {
      month += 12;
      year -= 1;
    }
    monthsToFetch.push({ year, month });
  }

  // Fetch all months in parallel
  const results = await Promise.all(
    monthsToFetch.map(({ year, month }) => fetchMonthlyTopics(year, month))
  );

  // Aggregate views across all months
  const topicViews = new Map();
  for (const monthData of results) {
    for (const article of monthData) {
      const existing = topicViews.get(article.title) || 0;
      topicViews.set(article.title, existing + article.views);
    }
  }

  // Sort by total views and take top 2000 (before category filtering)
  const sortedTopics = Array.from(topicViews.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2000)
    .map(([title]) => title);

  console.log(`Aggregated ${sortedTopics.length} popular topics from ${monthsToFetch.length} months`);

  // Fetch categories and filter
  const excludeCategories = (process.env.EXCLUDE_CATEGORIES || '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean);

  if (excludeCategories.length > 0) {
    console.log(`Filtering out categories: ${excludeCategories.join(', ')}`);
    const categorizedTopics = await categorizeTopics(sortedTopics);
    const filteredTopics = categorizedTopics
      .filter(t => !excludeCategories.some(cat => t.category.toLowerCase().includes(cat)))
      .map(t => t.title)
      .slice(0, 1000);
    console.log(`After category filtering: ${filteredTopics.length} topics`);
    console.log('Sample topics:', filteredTopics.slice(0, 10).join(', '));
    return filteredTopics;
  }

  // Log some examples
  console.log('Sample topics:', sortedTopics.slice(0, 10).join(', '));
  return sortedTopics.slice(0, 1000);
}

// Fetch short descriptions for topics to categorize them
async function categorizeTopics(topics) {
  const categorized = [];
  const batchSize = 50; // Wikipedia API limit

  for (let i = 0; i < topics.length; i += batchSize) {
    const batch = topics.slice(i, i + batchSize);
    const titles = batch.map(t => t.replace(/ /g, '_')).join('|');

    try {
      // Use the action API for batch queries
      const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=description&format=json&origin=*`;

      const response = await fetch(apiUrl, {
        headers: { 'User-Agent': 'KwizniacInfinite/1.0 (trivia game; educational)' }
      });

      if (response.ok) {
        const data = await response.json();
        const pages = data.query?.pages || {};

        for (const page of Object.values(pages)) {
          if (page.title) {
            categorized.push({
              title: page.title.replace(/_/g, ' '),
              category: page.description || 'unknown'
            });
          }
        }
      }
    } catch (error) {
      // On error, just add without category
      for (const title of batch) {
        categorized.push({ title, category: 'unknown' });
      }
    }

    // Small delay to avoid rate limiting
    if (i + batchSize < topics.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Log category distribution
  const categoryCount = {};
  for (const t of categorized) {
    const cat = t.category.split(' ')[0].toLowerCase();
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  }
  console.log('Category distribution:', Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).slice(0, 10));

  return categorized;
}

// Fallback curated list of universally known topics
const FALLBACK_TOPICS = [
  // Historical figures everyone knows
  "Albert Einstein", "Leonardo da Vinci", "Napoleon Bonaparte", "Cleopatra",
  "Julius Caesar", "Abraham Lincoln", "Winston Churchill", "Mahatma Gandhi",
  "Martin Luther King Jr.", "Nelson Mandela", "Queen Elizabeth II", "George Washington",
  "Marie Curie", "Nikola Tesla", "Charles Darwin", "Isaac Newton", "Aristotle",
  "William Shakespeare", "Mozart", "Beethoven", "Michelangelo", "Picasso",

  // Modern famous people
  "Barack Obama", "Michael Jordan", "Muhammad Ali", "Michael Jackson",
  "Elvis Presley", "The Beatles", "Marilyn Monroe", "Oprah Winfrey",
  "Walt Disney", "Albert Hitchcock", "Steven Spielberg", "Tom Hanks",

  // Famous places
  "The Great Wall of China", "The Eiffel Tower", "The Colosseum", "Machu Picchu",
  "The Pyramids of Giza", "The Taj Mahal", "The Statue of Liberty", "Mount Everest",
  "The Grand Canyon", "Niagara Falls", "The Amazon Rainforest", "Antarctica",
  "The Sahara Desert", "The Great Barrier Reef", "Yellowstone National Park",

  // Inventions & discoveries
  "The Internet", "The Telephone", "The Light Bulb", "The Printing Press",
  "Penicillin", "The Airplane", "The Automobile", "Television", "Radio",
  "The Steam Engine", "DNA", "Electricity", "The Telescope", "Vaccines",

  // Historical events
  "World War II", "World War I", "The Moon Landing", "The French Revolution",
  "The Renaissance", "The Industrial Revolution", "The American Revolution",
  "The Fall of the Berlin Wall", "The Titanic", "D-Day",

  // Art & Literature
  "The Mona Lisa", "Romeo and Juliet", "Harry Potter", "Star Wars",
  "The Bible", "The Odyssey", "Hamlet", "The Lord of the Rings",
  "Pride and Prejudice", "To Kill a Mockingbird", "1984", "The Great Gatsby",

  // Science & Nature
  "The Sun", "The Moon", "Mars", "Jupiter", "Black Holes", "The Milky Way",
  "Dinosaurs", "The Big Bang", "Photosynthesis", "Evolution",

  // Companies & Brands
  "Coca-Cola", "McDonald's", "Apple Inc.", "Amazon", "Disney", "Nike", "Microsoft",

  // Sports
  "The Olympic Games", "The Super Bowl", "The World Cup", "Wimbledon",

  // Food
  "Pizza", "Chocolate", "Coffee", "Sushi", "Bread", "Rice",

  // Mythology
  "Zeus", "Thor", "Hercules", "King Arthur", "Achilles", "Odysseus"
];

// Get topics, fetching from API if needed
async function getTopics() {
  const now = Date.now();

  // Return cached topics if fresh
  if (cachedTopics.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedTopics;
  }

  // Try to fetch from Wikipedia
  try {
    const freshTopics = await fetchYearlyPopularTopics();

    if (freshTopics && freshTopics.length > 100) {
      cachedTopics = freshTopics;
      lastFetchTime = now;
      return cachedTopics;
    }
  } catch (error) {
    console.error('Failed to fetch Wikipedia topics:', error);
  }

  // Fall back to curated list
  console.log('Using fallback curated topic list');
  if (cachedTopics.length === 0) {
    cachedTopics = FALLBACK_TOPICS;
  }

  return cachedTopics;
}

export async function getRandomTopic() {
  const topics = await getTopics();

  // Reset used topics if we've used most of them
  if (usedTopics.size >= topics.length * 0.8) {
    usedTopics.clear();
  }

  // Find an unused topic
  let topic;
  let attempts = 0;
  do {
    topic = topics[Math.floor(Math.random() * topics.length)];
    attempts++;
  } while (usedTopics.has(topic) && attempts < 100);

  usedTopics.add(topic);
  return topic;
}

export function resetUsedTopics() {
  usedTopics.clear();
}

// Pre-fetch topics on module load
getTopics().then(() => {
  console.log('Wikipedia topics initialized');
}).catch(err => {
  console.error('Failed to initialize topics:', err);
});
