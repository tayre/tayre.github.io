/** Local flashcard content. Speech names letters and words, rather than phonics. */
export const TOPICS = [
  { id: 'alphabet', title: 'Alphabet' },
  { id: 'words', title: 'Popcorn words' },
  { id: 'numbers', title: 'Numbers' },
];

const LETTERS = [
  ['A', 'apple', '🍎'], ['B', 'ball', '⚽'], ['C', 'cat', '🐱'],
  ['D', 'dog', '🐶'], ['E', 'elephant', '🐘'], ['F', 'fish', '🐟'],
  ['G', 'goat', '🐐'], ['H', 'hat', '🎩'], ['I', 'ice', '🧊'],
  ['J', 'juice', '🧃'], ['K', 'kite', '🪁'], ['L', 'lion', '🦁'],
  ['M', 'moon', '🌙'], ['N', 'nest', '🪺'], ['O', 'orange', '🍊'],
  ['P', 'pig', '🐷'], ['Q', 'queen', '👑'], ['R', 'rabbit', '🐰'],
  ['S', 'sun', '☀️'], ['T', 'tree', '🌳'], ['U', 'umbrella', '☂️'],
  ['V', 'van', '🚐'], ['W', 'whale', '🐳'], ['X', 'x-ray', '🩻'],
  ['Y', 'yo-yo', '🪀'], ['Z', 'zebra', '🦓'],
];

const WORD_GROUPS = [
  {
    id: 'pack-1', title: 'First words',
    words: [
      ['a', 'I see a cat.'], ['I', 'I can hop.'],
      ['the', 'The sun is up.'], ['and', 'A cat and a dog.'],
      ['is', 'It is red.'], ['in', 'The cat is in bed.'],
      ['it', 'It is a dog.'], ['to', 'We go to school.'],
      ['we', 'We can run.'], ['see', 'I see the moon.'],
    ],
  },
  {
    id: 'pack-2', title: 'More words',
    words: [
      ['you', 'You can hop.'], ['me', 'Look at me.'],
      ['my', 'My dog is big.'], ['can', 'I can run.'],
      ['go', 'We go home.'], ['like', 'I like apples.'],
      ['look', 'Look at the cat.'], ['up', 'The sun is up.'],
      ['on', 'The hat is on me.'], ['at', 'Look at the cat.'],
    ],
  },
  {
    id: 'pack-3', title: 'Keep going',
    words: [
      ['he', 'He can run.'], ['she', 'She can hop.'],
      ['said', 'I said, "Hi!"'], ['have', 'I have a ball.'],
      ['here', 'Here is my cat.'], ['come', 'Come and play.'],
      ['for', 'This is for you.'], ['are', 'We are here.'],
      ['was', 'It was fun.'], ['with', 'I play with you.'],
    ],
  },
];

export const WORD_PACKS = WORD_GROUPS.map(({ id, title, words }) => ({
  id, title, ids: words.map(([word]) => `word-${word.toLowerCase()}`),
}));

const SMALL_NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numberName(number) {
  if (number === 100) return 'one hundred';
  if (number < 20) return SMALL_NUMBERS[number];
  const tens = TENS[Math.floor(number / 10)];
  return number % 10 ? `${tens}-${SMALL_NUMBERS[number % 10]}` : tens;
}

function placeValue(number) {
  if (number === 100) return '1 hundred';
  if (number < 10) return `${number} ${number === 1 ? 'one' : 'ones'}`;
  const tens = Math.floor(number / 10);
  const ones = number % 10;
  return `${tens} ${tens === 1 ? 'ten' : 'tens'} and ${ones} ${ones === 1 ? 'one' : 'ones'}`;
}

export const CARDS = [
  ...LETTERS.map(([letter, example, picture]) => ({
    id: `letter-${letter.toLowerCase()}`, topic: 'alphabet',
    front: `${letter} ${letter.toLowerCase()}`, back: `${letter} is for ${example}.`,
    example, picture, speech: `This is the letter ${letter}. ${letter} is for ${example}.`,
  })),
  ...WORD_GROUPS.flatMap(({ words }) => words.map(([word, example]) => ({
    id: `word-${word.toLowerCase()}`, topic: 'words',
    front: word, back: example, example, speech: word,
  }))),
  ...Array.from({ length: 100 }, (_, index) => {
    const number = index + 1;
    const name = numberName(number);
    return {
      id: `number-${number}`, topic: 'numbers', number,
      front: String(number), back: name, example: placeValue(number), speech: name,
    };
  }),
];
