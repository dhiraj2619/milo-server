// Fixed choices the app offers. The server validates against these so clients can't invent values.
// The app keeps the same interest and prompt lists in src/config/profileOptions.js.

const INTERESTS = [
  "Music", "Movies", "Cricket", "Football", "Travel", "Food", "Cooking", "Gaming", "Fitness", "Yoga",
  "Dance", "Books", "Bollywood", "Web series", "Anime", "Fashion", "Photography", "Art", "Tech", "Pets",
  "Comedy", "Spirituality", "Cars & bikes", "Startups",
];
const MAX_INTERESTS = 5;

const PROMPTS = [
  "My perfect Sunday is…",
  "I can talk for hours about…",
  "The way to win me over is…",
  "My go-to song right now is…",
  "A fun fact about me…",
  "My hidden talent is…",
  "The best trip I've taken…",
  "Ask me about…",
];
const MAX_PROMPTS = 2;
const MAX_PROMPT_ANSWER = 80;

// Price in coins. Sending a gift spends the sender's coins; the receiver collects it on their profile.
const GIFTS = [
  {id: "rose", name: "Rose", emoji: "🌹", coins: 10},
  {id: "heart", name: "Heart", emoji: "❤️", coins: 20},
  {id: "chocolate", name: "Chocolate", emoji: "🍫", coins: 30},
  {id: "teddy", name: "Teddy", emoji: "🧸", coins: 50},
  {id: "bouquet", name: "Bouquet", emoji: "💐", coins: 80},
  {id: "ring", name: "Ring", emoji: "💍", coins: 150},
  {id: "crown", name: "Crown", emoji: "👑", coins: 300},
  {id: "rocket", name: "Rocket", emoji: "🚀", coins: 500},
];
const GIFTS_BY_ID = Object.fromEntries(GIFTS.map(gift => [gift.id, gift]));

// Returns a cleaned list, or null when the input is not acceptable.
function cleanInterests(value) {
  if (!Array.isArray(value)) return null;
  const interests = [...new Set(value)];
  if (interests.length > MAX_INTERESTS || interests.some(item => !INTERESTS.includes(item))) return null;
  return interests;
}

function cleanPrompts(value) {
  if (!Array.isArray(value) || value.length > MAX_PROMPTS) return null;
  const prompts = value.map(item => ({
    question: typeof item?.question === "string" ? item.question : "",
    answer: typeof item?.answer === "string" ? item.answer.trim().replace(/\s+/g, " ") : "",
  }));
  const questions = prompts.map(item => item.question);
  if (new Set(questions).size !== questions.length) return null;
  if (prompts.some(item => !PROMPTS.includes(item.question) || !item.answer || item.answer.length > MAX_PROMPT_ANSWER)) return null;
  return prompts;
}

module.exports = {INTERESTS, MAX_INTERESTS, PROMPTS, MAX_PROMPTS, MAX_PROMPT_ANSWER, GIFTS, GIFTS_BY_ID, cleanInterests, cleanPrompts};
