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

// ---------- MILO Special ----------

// Matching rooms. anyGender rooms ignore the usual opposite-gender preference.
// maxSeconds ends the call automatically (Speed Talk).
const ROOMS = [
  {key: "night", anyGender: false, questions: ["What's keeping you up tonight?", "What's something you've never told anyone?", "What do you think about when you can't sleep?"]},
  {key: "language", anyGender: true, questions: ["Teach me one phrase in your language.", "What's a word in your language that has no translation?", "Which language would you love to learn?"]},
  {key: "music", anyGender: false, questions: ["What song are you playing on repeat?", "Which singer would you love to see live?", "What song reminds you of your childhood?"]},
  {key: "friends", anyGender: true, questions: ["What did you do last weekend?", "What's your favourite place in your city?", "What's one thing that always makes you laugh?"]},
  {key: "speed", anyGender: false, maxSeconds: 180, questions: ["Describe your perfect day in one sentence.", "What's the best thing that happened to you this week?", "Tea or coffee, and why?"]},
];
const ROOMS_BY_KEY = Object.fromEntries(ROOMS.map(room => [room.key, room]));

// What's free and what MILO Connect unlocks (per day, Asia/Kolkata).
const SPECIAL_LIMITS = {
  freeMatches: 1,
  subscriberMatches: 3,
  extraMatchCoins: 20,
  maxMatchesPerDay: 8,
  freeSpeedRounds: 3,
};

// One question per day for everyone; the day number picks it.
const DAILY_QUESTIONS = [
  "What's the best street food in your city?",
  "Which movie can you watch again and again?",
  "What's one thing on your bucket list?",
  "What was your favourite subject in school?",
  "Mountains or beaches, and why?",
  "What's a small thing that makes your day better?",
  "Which festival do you love the most?",
  "What's the last song you sang out loud?",
  "If you could live in any city, which one?",
  "What's your comfort food after a long day?",
  "What's a skill you'd love to learn this year?",
  "Who was your childhood hero?",
  "What's the best advice you've ever got?",
  "Morning person or night owl?",
];
const MAX_DAILY_ANSWER = 120;

module.exports.ROOMS = ROOMS;
module.exports.ROOMS_BY_KEY = ROOMS_BY_KEY;
module.exports.SPECIAL_LIMITS = SPECIAL_LIMITS;
module.exports.DAILY_QUESTIONS = DAILY_QUESTIONS;
module.exports.MAX_DAILY_ANSWER = MAX_DAILY_ANSWER;
