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

// September–January school sheets, read left to right and top to bottom.
// Repeated words share a card ID and progress, including across learning groups.
export const WORD_GROUPS = [
  { id: 'short-words', title: 'VC & CVC words', words: 'I a at am an as it in if on up us has can ran had big did his him sit six not got hot run but cut red get yes let ten yet and'.split(' ') },
  { id: 'doubling', title: 'Double consonants', words: 'all will call fall off well tell'.split(' ') },
  { id: 'open-syllables', title: 'Open syllables', words: 'go no so we be he me she'.split(' ') },
  { id: 'digraphs', title: 'Digraphs', words: 'she wish much three with that this then them both thank think those these when which why white sing know going'.split(' ') },
  { id: 'blends', title: 'Blends', words: 'jump went must stop best cold help just its fast'.split(' ') },
  { id: 'bossy-e', title: 'Bossy e', words: 'make came ate made gave take like ride white five live write those use these here'.split(' ') },
  { id: 'heart-words', title: 'Heart words', words: 'do to as said the was for is of are from look book your want go no so goes says she we he they there their were talk walk wash where what'.split(' ') },
];

const WORD_EXAMPLES = {
  I: 'I can hop.', a: 'I see a cat.', at: 'Look at the cat.', am: 'I am big.', an: 'It is an egg.',
  as: 'Run as fast as me.', it: 'It is red.', in: 'The cat is in bed.', if: 'Jump if you can.', on: 'The hat is on me.',
  up: 'The sun is up.', us: 'Come with us.', has: 'She has a dog.', can: 'I can run.', ran: 'He ran to me.',
  had: 'I had a nap.', big: 'The dog is big.', did: 'I did it.', his: 'It is his hat.', him: 'I can help him.',
  sit: 'Sit with me.', six: 'I see six cats.', not: 'It is not hot.', got: 'I got a book.', hot: 'The sun is hot.',
  run: 'We can run.', but: 'I ran, but she sat.', cut: 'I cut the paper.', red: 'The hat is red.', get: 'Get the ball.',
  yes: 'Yes, I can!', let: 'Let me help.', ten: 'I see ten dots.', yet: 'We are not there yet.', and: 'A cat and a dog.',
  all: 'We can all play.', will: 'I will help.', call: 'Call me when you can.', fall: 'The leaves fall.', off: 'Take off your hat.',
  well: 'I feel well.', tell: 'Tell me a story.', go: 'We go home.', no: 'No, it is not red.', so: 'It is so cold.',
  we: 'We can run.', be: 'Be kind.', he: 'He can run.', me: 'Look at me.', she: 'She can hop.',
  wish: 'Make a wish.', much: 'Thank you so much.', three: 'I see three birds.', with: 'I play with you.', that: 'That is my dog.',
  this: 'This is my hat.', then: 'Sit, then stand.', them: 'I can help them.', both: 'We both like cats.', thank: 'Thank you for the book.',
  think: 'Think of a word.', those: 'Those are my shoes.', these: 'These are red apples.', when: 'When can we go?', which: 'Which book do you like?',
  why: 'Why is it so cold?', white: 'The snow is white.', sing: 'We can sing.', know: 'I know that word.', going: 'We are going home.',
  jump: 'I can jump.', went: 'We went to school.', must: 'We must stop here.', stop: 'Stop at the red light.', best: 'Do your best.',
  cold: 'The snow is cold.', help: 'I can help you.', just: 'I just got here.', its: 'The dog wags its tail.', fast: 'I can run fast.',
  make: 'We can make a kite.', came: 'She came with us.', ate: 'I ate an apple.', made: 'I made a card.', gave: 'He gave me a book.',
  take: 'Take my hand.', like: 'I like apples.', ride: 'I can ride a bike.', five: 'I see five stars.', live: 'A live bug can hop.',
  write: 'I can write my name.', use: 'Use a red pen.', here: 'Here is my cat.', do: 'I can do it.', to: 'We go to school.',
  said: 'I said, "Hi!"', the: 'The sun is up.', was: 'It was fun.', for: 'This is for you.', is: 'It is red.',
  of: 'A cup of water.', are: 'We are here.', from: 'This is from me.', look: 'Look at the cat.', book: 'I like this book.',
  your: 'Is this your hat?', want: 'I want to play.', goes: 'She goes to school.', says: 'He says hello.', they: 'They can play.',
  there: 'The dog is over there.', their: 'That is their ball.', were: 'We were at school.', talk: 'We can talk.', walk: 'We walk to school.',
  wash: 'Wash your hands.', where: 'Where is my hat?', what: 'What is in the bag?',
};

export const WORD_PACKS = WORD_GROUPS.flatMap(({ id, title, words }) => {
  const parts = Math.ceil(words.length / 10);
  const size = Math.ceil(words.length / parts);
  return Array.from({ length: parts }, (_, index) => ({
    id: `${id}-${index + 1}`, groupId: id,
    title: `${title}${parts > 1 ? ` · ${index + 1}` : ''}`,
    ids: words.slice(index * size, (index + 1) * size).map((word) => `word-${word.toLowerCase()}`),
  }));
});
const SCHOOL_WORDS = [...new Set(WORD_GROUPS.flatMap(({ words }) => words))];

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
  ...SCHOOL_WORDS.map((word) => ({
    id: `word-${word.toLowerCase()}`, topic: 'words',
    front: word, back: WORD_EXAMPLES[word], example: WORD_EXAMPLES[word], speech: word,
  })),
  ...Array.from({ length: 100 }, (_, index) => {
    const number = index + 1;
    const name = numberName(number);
    return {
      id: `number-${number}`, topic: 'numbers', number,
      front: String(number), back: name, example: placeValue(number), speech: name,
    };
  }),
];
