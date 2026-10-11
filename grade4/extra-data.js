// Original, bite-sized lessons. Sources support the science, French and coin facts.
// Keep these IDs stable: saved learning progress refers to them.
export const EXTRA_TOPICS = [
  { id: 'division', title: 'Division', icon: '÷', description: 'Turn multiplication around. Share into equal groups.', color: '#e7a86e', studyTip: 'Ask: what number times the divisor makes the total?' },
  { id: 'fractions', title: 'Fractions', icon: '◒', description: 'See equal parts, compare sizes, and find matching fractions.', color: '#bb9fda', studyTip: 'Compare the same-sized whole. The bottom number counts equal parts.' },
  { id: 'time-money', title: 'Time & money', icon: '◷', description: 'Read clocks, count Canadian coins, and work out change.', color: '#75b8b7', studyTip: 'For time, count forward. For change, count up from the price.' },
  { id: 'french', title: 'Bonjour, French!', icon: '💬', description: 'Greetings, colours, numbers, animals, and classroom words.', color: '#da9fae', studyTip: 'Say each French word out loud, then picture its meaning.' },
  { id: 'reading', title: 'Reading detective', icon: '📖', description: 'Read a little story. Find clues and explain what happened.', color: '#a8b981', studyTip: 'Read once for the story, then look back for evidence.' },
  { id: 'science-plus', title: 'Science explorer', icon: '🔎', description: 'Explore food chains, habitats, light, sound, and rocks.', color: '#85afd0', studyTip: 'Connect each new word to something you have seen or heard.' },
];

const source = (title, url) => ({ title, url });
const mint = source('Royal Canadian Mint: Canadian circulation coins', 'https://www.mint.ca/en/discover/canadian-circulation');
const card = (topic, id, question, answer, distractors, hint, explanation, title, text, extras = {}) => ({
  id, topic, question, answer, choices: [answer, ...distractors], hint, explanation,
  study: { title, text }, ...extras,
});

// Every inverse fact for multiplication tables 1–10, with no remainders.
const division = Array.from({ length: 10 }, (_, groupIndex) => {
  const groups = groupIndex + 1;
  return Array.from({ length: 10 }, (_, eachIndex) => {
    const each = eachIndex + 1;
    const total = groups * each;
    const distractors = [1, 2, 4].map((offset) => String((each - 1 + offset) % 10 + 1));
    return card('division', `div-${total}-by-${groups}`, `What is ${total} ÷ ${groups}?`, String(each), distractors,
      `Think: ${groups} × what number = ${total}?`,
      `${groups} × ${each} = ${total}, so ${total} ÷ ${groups} = ${each}.`,
      `${total} shared into ${groups} equal ${groups === 1 ? 'group' : 'groups'}`,
      `${groups} equal ${groups === 1 ? 'group' : 'groups'} of ${each} make ${total}. Division finds how many belong in each group: ${total} ÷ ${groups} = ${each}.`,
      { visual: { type: 'groups', groups, each } });
  });
}).flat();

const fractionVisual = (numerator, denominator, compareNumerator, compareDenominator) => ({
  type: 'fraction', numerator, denominator,
  ...(compareDenominator ? { compareNumerator, compareDenominator } : {}),
});
const fractions = [
  card('fractions', 'frac-one-half', 'What fraction of the bar is shaded?', '1/2', ['1/3', '1/4', '2/2'],
    'Count the shaded parts, then count all the equal parts.', 'One of two equal parts is shaded: 1/2.',
    'One half', 'A whole split into 2 equal parts has halves. One of those parts is one half, written 1/2.', { visual: fractionVisual(1, 2) }),
  card('fractions', 'frac-three-fourths', 'What fraction of the bar is shaded?', '3/4', ['1/4', '4/3', '3/3'],
    'The top number counts shaded parts. The bottom counts all equal parts.', 'Three of four equal parts are shaded: 3/4.',
    'Three fourths', 'In 3/4, the 3 counts shaded parts and the 4 counts all equal parts. Fourths are also called quarters.', { visual: fractionVisual(3, 4) }),
  card('fractions', 'frac-two-fifths', 'What fraction of the bar is shaded?', '2/5', ['3/5', '5/2', '2/3'],
    'Count the filled pieces out of all five equal pieces.', 'Two of five equal parts are shaded: 2/5.',
    'Two fifths', 'Split a whole into 5 equal parts. Shade 2 parts and you have 2/5.', { visual: fractionVisual(2, 5) }),
  card('fractions', 'frac-whole-fourths', 'Which fraction describes all four parts shaded?', '4/4', ['1/4', '3/4', '4/8'],
    'The shaded count and the total count match.', 'All four of four parts are shaded. 4/4 is one whole.',
    'A whole made of parts', 'When all equal parts are included, the fraction is one whole. Four fourths, or 4/4, makes 1.', { visual: fractionVisual(4, 4) }),
  card('fractions', 'frac-half-equivalent', 'Which fraction is equal to 1/2?', '2/4', ['1/4', '3/4', '2/3'],
    'Which fraction fills exactly half of a same-sized bar?', 'Two fourths cover the same amount as one half: 2/4 = 1/2.',
    'Different names, same amount', 'If each half is split in two again, the whole has four equal parts. Two of those fourths still cover one half.', { visual: fractionVisual(1, 2, 2, 4) }),
  card('fractions', 'frac-third-equivalent', 'Which fraction is equal to 1/3?', '2/6', ['1/6', '3/6', '2/3'],
    'Split each third into two equal pieces.', 'One third covers two of six equal parts, so 1/3 = 2/6.',
    'Thirds and sixths', 'Splitting every third in half makes sixths. One third becomes two sixths, without changing the amount.', { visual: fractionVisual(1, 3, 2, 6) }),
  card('fractions', 'frac-three-fourths-equivalent', 'Which fraction is equal to 3/4?', '6/8', ['3/8', '4/8', '7/8'],
    'Double both the top and bottom numbers.', '3 × 2 = 6 and 4 × 2 = 8, so 3/4 = 6/8.',
    'Fourth pieces become eighth pieces', 'Divide each fourth into two equal pieces. Three shaded fourths become six shaded eighths.', { visual: fractionVisual(3, 4, 6, 8) }),
  card('fractions', 'frac-two-fifths-equivalent', 'Which fraction is equal to 2/5?', '4/10', ['2/10', '5/10', '6/10'],
    'Split each fifth in two. How many smaller shaded parts will there be?', 'Two fifths become four tenths: 2/5 = 4/10.',
    'Fifths and tenths', 'There are twice as many tenths as fifths in a whole. Double both numbers to keep the same amount: 2/5 = 4/10.', { visual: fractionVisual(2, 5, 4, 10) }),
  card('fractions', 'frac-order-fourths', 'Which list goes from smallest to largest, using the same-sized whole?', '1/4, 2/4, 3/4', ['3/4, 2/4, 1/4', '2/4, 1/4, 3/4', '1/4, 3/4, 2/4'],
    'All pieces are fourths, so compare how many pieces each fraction has.', 'One fourth is less than two fourths, and two fourths is less than three fourths.',
    'Same-sized pieces', 'When the bottom numbers match, more pieces make a greater fraction. For the same-sized whole: 1/4 < 2/4 < 3/4.', { visual: fractionVisual(1, 4, 3, 4) }),
  card('fractions', 'frac-compare-unit', 'Which is the greater amount of the same-sized whole: 1/2 or 1/4?', '1/2', ['1/4', 'They are equal', 'The whole size must change'],
    'Cutting a whole into fewer equal pieces makes each piece bigger.', 'A half is larger than a fourth of the same-sized whole.',
    'Halves and fourths', 'Two fourths fill one half. That means one half is greater than just one fourth.', { visual: fractionVisual(1, 2, 1, 4) }),
  card('fractions', 'frac-compare-sixths', 'Which is the greater amount of the same-sized whole: 5/6 or 2/6?', '5/6', ['2/6', 'They are equal', 'The whole size must change'],
    'The parts have the same size. Compare the shaded counts.', 'Five sixths is greater than two sixths because five equal pieces are more than two.',
    'Compare the top numbers', 'Both fractions use sixths. Compare 5 with 2: 5/6 > 2/6.', { visual: fractionVisual(5, 6, 2, 6) }),
  card('fractions', 'frac-complete-whole', 'A bar has 3/8 shaded. What fraction is still unshaded?', '5/8', ['3/8', '4/8', '8/8'],
    'There are eight equal parts altogether. Subtract the three shaded parts.', '8 − 3 = 5, so five of eight parts are unshaded: 5/8.',
    'Parts make a whole', 'Three shaded eighths and five unshaded eighths make all eight eighths: 3/8 + 5/8 = 8/8.', { visual: fractionVisual(3, 8) }),
];

const timeMoney = [
  card('time-money', 'time-quarter-past-three', 'What time does this clock show?', '3:15', ['3:30', '3:45', '12:15'],
    'Each big number on the clock counts five minutes for the long hand.', 'The long hand points to 3 for 15 minutes. The short hand is just past 3.',
    'Quarter past three', 'Fifteen minutes is a quarter of an hour. At 3:15, the long hand points to 3 and the short hand has passed 3.', { visual: { type: 'clock', hour: 3, minute: 15 } }),
  card('time-money', 'time-half-past-seven', 'What time does this clock show?', '7:30', ['6:35', '7:06', '7:15'],
    'The long hand at 6 means thirty minutes.', 'The short hand is between 7 and 8. Thirty minutes past 7 is 7:30.',
    'Half past seven', 'An hour has 60 minutes. After 30 minutes, half an hour has passed, so 7:30 is half past seven.', { visual: { type: 'clock', hour: 7, minute: 30 } }),
  card('time-money', 'time-quarter-to-ten', 'What time does this clock show?', '9:45', ['9:15', '10:45', '9:09'],
    'The long hand at 9 means forty-five minutes past the hour.', 'The short hand is nearly at 10, but it is still the 9 o’clock hour. The time is 9:45.',
    'Quarter to ten', 'At 9:45, fifteen minutes remain until 10:00. We can call this quarter to ten.', { visual: { type: 'clock', hour: 9, minute: 45 } }),
  card('time-money', 'time-add-thirty', 'Reading starts at 2:20 p.m. and lasts 30 minutes. When does it end?', '2:50 p.m.', ['2:30 p.m.', '3:20 p.m.', '2:40 p.m.'],
    'Add thirty minutes to twenty minutes past two.', '20 + 30 = 50, so the reading ends at 2:50 p.m.',
    'Count forward in minutes', 'Start at 2:20. Count three jumps of ten minutes: 2:30, 2:40, 2:50.', { visual: { type: 'clock', hour: 2, minute: 20 } }),
  card('time-money', 'time-cross-hour', 'A game starts at 10:45 a.m. and lasts 30 minutes. When does it end?', '11:15 a.m.', ['10:75 a.m.', '11:45 a.m.', '10:15 a.m.'],
    'First count fifteen minutes to eleven. Then count fifteen more.', '15 minutes gets from 10:45 to 11:00, and another 15 gets to 11:15 a.m.',
    'Crossing an hour', 'After :59, a clock starts the next hour at :00. Split a 30-minute jump from 10:45 into 15 minutes plus 15 minutes.', { visual: { type: 'clock', hour: 10, minute: 45 } }),
  card('time-money', 'time-elapsed-forty', 'Art starts at 1:10 p.m. and ends at 1:50 p.m. How long is it?', '40 minutes', ['30 minutes', '50 minutes', '60 minutes'],
    'Both times are in the same hour. Find the difference between 10 and 50.', '50 − 10 = 40, so the art activity lasts 40 minutes.',
    'Elapsed time', 'Elapsed time means how long something takes. Count forward from the starting time to the ending time.', { visual: { type: 'clock', hour: 1, minute: 10 } }),
  card('time-money', 'money-count-forty-five', 'How much are these Canadian coins worth altogether?', '45¢', ['35¢', '40¢', '50¢'],
    'Start with 25¢, then add 10¢, 5¢, and 5¢.', '25 + 10 + 5 + 5 = 45 cents.',
    'Add coin values', 'Count the value written on each coin. A 25-cent coin, a 10-cent coin, and two 5-cent coins total 45¢.', { visual: { type: 'coins', values: [25, 10, 5, 5] }, source: mint }),
  card('time-money', 'money-count-dollar', 'What is the total value of four Canadian 25-cent coins?', '$1.00', ['$0.75', '$1.25', '$2.00'],
    'Count by twenty-fives: 25, 50, 75…', '4 × 25¢ = 100¢. One hundred cents is one dollar.',
    'Four quarters make a dollar', 'A quarter is 25 cents. Four quarters make 100 cents, written as $1.00.', { visual: { type: 'coins', values: [25, 25, 25, 25] }, source: mint }),
  card('time-money', 'money-count-three-fifty', 'How much are these Canadian coins worth altogether?', '$3.50', ['$2.50', '$3.25', '$4.00'],
    'Add the two-dollar coin and one-dollar coin, then the two quarters.', '$2.00 + $1.00 + $0.25 + $0.25 = $3.50.',
    'Dollars and cents together', 'Count the dollars first. Then two 25-cent coins add 50 cents. Three dollars and fifty cents is $3.50.', { visual: { type: 'coins', values: [200, 100, 25, 25] }, source: mint }),
  card('time-money', 'money-change-seventy-five', 'The total price is $1.25. You pay $2.00. How much change should you get?', '$0.75', ['$0.25', '$1.25', '$1.75'],
    'Count up by quarters from $1.25 until you reach $2.00.', '$1.25 + $0.75 = $2.00, so the change is 75 cents.',
    'Change is the difference', 'Count from the total price to the amount paid. From $1.25, three 25-cent jumps reach $2.00.', { source: mint }),
  card('time-money', 'money-two-prices', 'A pencil costs $0.50 and a notebook costs $2.25. These are the final prices. What is the total?', '$2.75', ['$2.50', '$3.25', '$1.75'],
    'Add fifty cents to two dollars and twenty-five cents.', '$2.25 + $0.50 = $2.75.',
    'Add prices', 'Keep dollars lined up with dollars and cents with cents. Twenty-five cents plus fifty cents makes seventy-five cents.', { source: mint }),
  card('time-money', 'money-change-one-sixty', 'The total price is $3.40. You pay $5.00. How much change should you get?', '$1.60', ['$1.40', '$2.40', '$2.60'],
    'Count from $3.40 to $4.00, then from $4.00 to $5.00.', '60 cents reaches $4.00, then one dollar reaches $5.00. The change is $1.60.',
    'Count up in two steps', 'Break a change problem into easy jumps. $0.60 + $1.00 = $1.60.', { source: mint }),
];

const frenchRows = [
  ['bonjour', 'Bonjour', 'Hello', ['Goodbye', 'Thank you', 'Please'], 'A friendly word to start a conversation.', 'Use Bonjour to greet someone during the day.', 'https://www.larousse.fr/dictionnaires/french-english/bonjour/10045'],
  ['merci', 'Merci', 'Thank you', ['Hello', 'Goodbye', 'Please'], 'Say this after someone helps you.', 'Merci is a polite way to thank someone.', 'https://www.larousse.fr/dictionnaires/francais-anglais/merci/50471'],
  ['au-revoir', 'Au revoir', 'Goodbye', ['Hello', 'Thank you', 'Please'], 'Say it when you leave.', 'Au revoir is a way to say goodbye.', 'https://www.larousse.fr/dictionnaires/francais-anglais/revoir/665625'],
  ['sil-vous-plait', 'S’il vous plaît', 'Please', ['Goodbye', 'Hello', 'Thank you'], 'It makes a request polite.', 'S’il vous plaît means please. Use it when politely asking for something.', 'https://www.larousse.fr/dictionnaires/anglais-francais/please/602566'],
  ['rouge', 'rouge', 'Red', ['Blue', 'Green', 'Yellow'], 'Picture the colour of a ripe strawberry.', 'Rouge means red. Picture a red strawberry when you say rouge.', 'https://www.larousse.fr/dictionnaires/francais-anglais/rouge/69244'],
  ['bleu', 'bleu', 'Blue', ['Red', 'Green', 'Yellow'], 'Picture a clear daytime sky.', 'Bleu means blue. Say bleu and picture a blue sky.', 'https://www.larousse.fr/dictionnaires/francais-anglais/bleu/9732'],
  ['vert', 'vert', 'Green', ['Red', 'Blue', 'Yellow'], 'Picture fresh grass.', 'Vert means green. Picture green grass when you say vert.', 'https://www.larousse.fr/dictionnaires/francais-anglais/vert/80698'],
  ['jaune', 'jaune', 'Yellow', ['Red', 'Green', 'Blue'], 'Picture the colour of a ripe banana peel.', 'Jaune means yellow. Say jaune and picture a yellow banana.', 'https://www.larousse.fr/dictionnaires/francais-anglais/jaune/44740'],
  ['un', 'un', 'One', ['Two', 'Three', 'Ten'], 'This number starts our counting.', 'Un means one. Practise the start of counting: un, deux, trois.', 'https://www.larousse.fr/dictionnaires/anglais-francais/one/598899'],
  ['deux', 'deux', 'Two', ['One', 'Three', 'Ten'], 'Think of a pair of socks.', 'Deux means two. A pair has deux things.', 'https://www.larousse.fr/dictionnaires/francais-anglais/deux/24791'],
  ['trois', 'trois', 'Three', ['One', 'Two', 'Ten'], 'This number comes just after deux.', 'Trois means three. Count three fingers: un, deux, trois.', 'https://www.larousse.fr/dictionnaires/francais-anglais/trois/78914'],
  ['quatre', 'quatre', 'Four', ['Three', 'Five', 'Eight'], 'Think of the number of sides on a square.', 'Quatre means four. A square has quatre sides.', 'https://www.larousse.fr/dictionnaires/francais-anglais/quatre/64827'],
  ['cinq', 'cinq', 'Five', ['Four', 'Six', 'Ten'], 'Think of the number of fingers on one hand.', 'Cinq means five. Hold up one hand and count to cinq.', 'https://www.larousse.fr/dictionnaires/francais-anglais/cinq/15953'],
  ['six', 'six', 'Six', ['Five', 'Seven', 'Nine'], 'Think of three pairs: two plus two plus two.', 'Six means six. It is spelled the same in French and English, but sounds different.', 'https://www.larousse.fr/dictionnaires/francais-anglais/six/72162'],
  ['sept', 'sept', 'Seven', ['Six', 'Eight', 'Ten'], 'Think of the number of days in a week.', 'Sept means seven. There are sept days in a week.', 'https://www.larousse.fr/dictionnaires/anglais-francais/seven/610876'],
  ['huit', 'huit', 'Eight', ['Four', 'Seven', 'Nine'], 'Think of four plus four.', 'Huit means eight. Count onward: six, sept, huit.', 'https://www.larousse.fr/dictionnaires/french-english/huit/40497'],
  ['neuf', 'neuf', 'Nine', ['Six', 'Eight', 'Ten'], 'This number comes just before dix.', 'When counting, neuf means nine. Finish counting to ten: huit, neuf, dix.', 'https://www.larousse.fr/dictionnaires/anglais-francais/nine/597675'],
  ['dix', 'dix', 'Ten', ['One', 'Two', 'Three'], 'Think of all the fingers on two hands.', 'Dix means ten. The final number in counting from one to ten is dix.', 'https://www.larousse.fr/dictionnaires/francais-anglais/dix/26073'],
  ['chat', 'un chat', 'A cat', ['A dog', 'A fish', 'A bird'], 'This pet may purr and meow.', 'Un chat means a cat. Learn the small word un together with chat.', 'https://www.larousse.fr/dictionnaires/francais/chat/14892'],
  ['chien', 'un chien', 'A dog', ['A cat', 'A fish', 'A bird'], 'This pet may bark and wag its tail.', 'Un chien means a dog. Say the two words together: un chien.', 'https://www.larousse.fr/dictionnaires/francais-anglais/chien/15154'],
  ['poisson', 'un poisson', 'A fish', ['A cat', 'A dog', 'A bird'], 'Picture an animal with fins swimming underwater.', 'Un poisson means a fish. Picture a fish when you say un poisson.', 'https://www.larousse.fr/dictionnaires/francais-anglais/poisson/61368'],
  ['oiseau', 'un oiseau', 'A bird', ['A cat', 'A dog', 'A fish'], 'This animal has feathers.', 'Un oiseau means a bird. Picture feathers and a beak.', 'https://www.larousse.fr/dictionnaires/francais-anglais/oiseau/55434'],
  ['livre', 'un livre', 'A book', ['A pencil', 'A chair', 'A school'], 'You turn its pages to read.', 'Un livre means a book. A book is something you can read.', 'https://www.larousse.fr/dictionnaires/francais/livre/47531'],
  ['crayon', 'un crayon', 'A pencil', ['A book', 'A chair', 'A school'], 'You can write with it, sharpen it, and erase its marks.', 'Un crayon means a pencil. The French word crayon does not usually mean a wax crayon.', 'https://www.larousse.fr/dictionnaires/francais-anglais/crayon/20164'],
  ['chaise', 'une chaise', 'A chair', ['A book', 'A pencil', 'A school'], 'You sit on one at a desk.', 'Une chaise means a chair. Learn une together with chaise.', 'https://www.larousse.fr/dictionnaires/francais-anglais/chaise/14323'],
  ['ecole', 'une école', 'A school', ['A book', 'A pencil', 'A chair'], 'It is a place where students learn.', 'Une école means a school. École begins with an accented é.', 'https://www.larousse.fr/dictionnaires/francais-anglais/%C3%A9cole/27462'],
];
const frenchPictures = {
  bonjour: '👋', merci: '💛', 'au-revoir': '👋', 'sil-vous-plait': '🤲',
  rouge: '🔴', bleu: '🔵', vert: '🟢', jaune: '🟡',
  un: '1️⃣', deux: '2️⃣', trois: '3️⃣', quatre: '4️⃣', cinq: '5️⃣', six: '6️⃣', sept: '7️⃣', huit: '8️⃣', neuf: '9️⃣', dix: '🔟',
  chat: '🐈', chien: '🐕', poisson: '🐟', oiseau: '🐦',
  livre: '📖', crayon: '✏️', chaise: '🪑', ecole: '🏫',
};
const french = frenchRows.map(([id, word, meaning, distractors, hint, explanation, url]) => card(
  'french', `fr-${id}`, ['un', 'neuf'].includes(id) ? `When counting, what does “${word}” mean?` : `What does “${word}” mean?`, meaning, distractors,
  hint, explanation, word, `${word} → ${meaning}. Say it out loud, then picture its meaning.`,
  { picture: frenchPictures[id], speech: { text: word, lang: 'fr-CA' }, source: source(`Larousse dictionary: ${word}`, url) },
));

// These three passages and all their questions were written for this app.
const gardenPassage = 'Maya and Leo planted bean seeds in two pots. They gave both pots the same amount of water. Maya put one pot by a sunny window. Leo put the other in a dark cupboard. After a week, they compared the seedlings. The window seedling had green leaves. The cupboard seedling was pale. “Next time, let’s draw them every day,” said Leo. Maya found a notebook and made a page for each pot.';
const bridgePassage = 'A small bridge crossed the stream on the class nature trail. One morning, Amira saw a loose board on it. She stopped before stepping onto the bridge and told her teacher. The teacher led the class along another path and reported the loose board to the park staff. The next week, the class returned. The board was fixed. Amira smiled when everyone crossed safely to watch the ducks.';
const libraryPassage = 'Noah wanted a book about the Moon, but he could not find one on the library shelf. He asked the librarian for help. Together they searched the library catalogue. The book was already borrowed, so the librarian helped Noah reserve it. Before leaving, Noah found a different book about space. On Friday, a message arrived: the Moon book was ready. Noah packed the space book in his bag to return it.';
const reading = [
  card('reading', 'read-garden-place', 'Where did Leo put his pot?', 'In a dark cupboard', ['By a sunny window', 'Outside in the snow', 'Under a desk'],
    'Look for the sentence that begins “Leo put…”', 'The passage says that Leo put the other pot in a dark cupboard.',
    'Two bean plants', gardenPassage, { passage: gardenPassage }),
  card('reading', 'read-garden-same', 'What did Maya and Leo keep the same for both pots?', 'The amount of water', ['The amount of light', 'The colour of the leaves', 'The place where they grew'],
    'Find the sentence containing the word “same.”', 'Both pots received the same amount of water, but they were placed in different light.',
    'Two bean plants', gardenPassage, { passage: gardenPassage }),
  card('reading', 'read-garden-notebook', 'Why did Maya probably make a notebook page for each pot?', 'To record how each plant changed', ['To teach the plants to read', 'To stop the pots getting water', 'To hide the seeds from Leo'],
    'Leo had just suggested drawing the seedlings every day.', 'A separate page for each pot would help them record and compare their daily drawings.',
    'Two bean plants', gardenPassage, { passage: gardenPassage }),
  card('reading', 'read-bridge-problem', 'What problem did Amira notice?', 'A loose board on the bridge', ['A missing library book', 'A fallen tree across the path', 'An empty duck pond'],
    'The problem appears near the beginning of the story.', 'Amira saw a loose board on the small bridge.',
    'The loose board', bridgePassage, { passage: bridgePassage }),
  card('reading', 'read-bridge-next', 'What did the teacher do after Amira reported the board?', 'Led the class along another path', ['Asked Amira to fix the bridge', 'Sent the class across the loose board', 'Cancelled every future nature walk'],
    'Look at the sentence after Amira tells her teacher.', 'The teacher chose another path and reported the loose board to the park staff.',
    'The loose board', bridgePassage, { passage: bridgePassage }),
  card('reading', 'read-bridge-main', 'Which sentence best tells the main idea of this story?', 'Noticing and reporting a problem helped the class stay safe.', ['The class learned how to build a bridge.', 'Amira wanted to take a duck home.', 'The stream dried up before the class arrived.'],
    'Think about the problem, Amira’s action, and how the story ends.', 'Amira noticed a problem and told her teacher. The class used another path until the bridge was fixed.',
    'The loose board', bridgePassage, { passage: bridgePassage }),
  card('reading', 'read-library-unavailable', 'Why could Noah not borrow the Moon book right away?', 'Someone else had borrowed it', ['The library had never owned it', 'He did not want to read it', 'The librarian had lost the catalogue'],
    'Look at what Noah and the librarian discovered in the catalogue.', 'The Moon book was already borrowed, so Noah reserved it.',
    'A book worth waiting for', libraryPassage, { passage: libraryPassage }),
  card('reading', 'read-library-reserve', 'In this story, what does “reserve” mean?', 'Ask for a turn when the book is available', ['Write a new book about space', 'Keep a book forever', 'Hide a book on a different shelf'],
    'Noah could not take the book immediately, but he received a message later.', 'Reserving the book let Noah ask for a turn to borrow it once it became available.',
    'A book worth waiting for', libraryPassage, { passage: libraryPassage }),
  card('reading', 'read-library-return', 'Which book did Noah pack to return?', 'The different book about space', ['The Moon book he had reserved', 'A book about ducks', 'A book about bean plants'],
    'Read the last sentence and think about the book he took home first.', 'Noah packed the space book. He had not yet collected the reserved Moon book.',
    'A book worth waiting for', libraryPassage, { passage: libraryPassage }),
];

const foodSource = source('National Park Service: Food Chains', 'https://www.nps.gov/teachers/classrooms/food-chain.htm');
const habitatSource = source('National Park Service: Food, Water, Shelter, Space', 'https://www.nps.gov/teachers/classrooms/food-water-shelter-space.htm');
const telescopeSource = source('NASA Space Place: How Do Telescopes Work?', 'https://spaceplace.nasa.gov/telescopes/en/');
const science = [
  card('science-plus', 'sci-producer', 'Grass → rabbit → fox. Which living thing is the producer?', 'Grass', ['Rabbit', 'Fox', 'All three'],
    'A producer makes its own food using energy from sunlight.', 'Grass is a plant. It makes its own food using sunlight.',
    'Producers start food chains', 'Plants such as grass are producers. They use sunlight to make food.', { visual: { type: 'foodchain', items: ['🌱', '🐇', '🦊'] }, source: foodSource }),
  card('science-plus', 'sci-consumer', 'A rabbit eats grass. What is the rabbit’s role in this food chain?', 'Consumer', ['Producer', 'Sunlight', 'Mineral'],
    'It gets food by eating another living thing.', 'The rabbit is a consumer because it eats the grass.',
    'Consumers eat other living things', 'Consumers get food by eating plants or animals. A rabbit eating grass is a consumer.', { visual: { type: 'foodchain', items: ['🌱', '🐇', '🦊'] }, source: foodSource }),
  card('science-plus', 'sci-decomposer', 'What do decomposers do?', 'Break down dead plants and animals', ['Make sunlight', 'Turn every rock into a plant', 'Stop all plants from growing'],
    'Think about what happens to dead leaves over time.', 'Decomposers break down dead living things.',
    'Decomposers help recycle matter', 'Decomposers break down dead plants and animals. This helps return materials to the environment.', { source: foodSource }),
  card('science-plus', 'sci-habitat-needs', 'What does an animal’s habitat need to provide?', 'Food, water, shelter, and space', ['Only sunshine', 'Only a place to sleep', 'A house built by people'],
    'Think about eating, drinking, protection, and room to live.', 'A suitable habitat supplies the animal’s basic needs.',
    'A habitat is a place to live', 'Animals need food, water, shelter, and enough space. A suitable habitat provides these needs.', { source: habitatSource }),
  card('science-plus', 'sci-habitat-loss', 'A pond dries up. Why might animals that live there struggle?', 'They may lose water, food, or shelter', ['They no longer need food', 'They all turn into desert animals', 'They stop needing a habitat'],
    'Think about what a pond provides for its animals.', 'Changing a habitat can remove things its animals need to survive.',
    'Changes to a habitat matter', 'When a habitat changes, the food, water, shelter, or space an animal needs may disappear.', { source: habitatSource }),
  card('science-plus', 'sci-shadow', 'Why does an opaque object make a shadow in sunlight?', 'It blocks the light', ['It makes extra sunlight', 'It turns the air into rock', 'It changes sunlight into sound'],
    'Opaque means light cannot pass through it.', 'A shadow forms where the object blocks light from reaching a surface.',
    'Light and shadows', 'An opaque object blocks light. The darker area behind it is a shadow.', { source: source('NASA: The Physics of Light', 'https://www.nasa.gov/blogs/watch-the-skies/2017/07/14/total-solar-eclipse-the-physics-of-light/') }),
  card('science-plus', 'sci-reflection', 'What happens when light reflects from a mirror?', 'It bounces off the mirror', ['It becomes a sound', 'It always passes straight through', 'It turns into a rock'],
    'Reflection changes the direction the light travels.', 'Reflection is light bouncing off a surface, such as a mirror.',
    'Mirrors reflect light', 'Light can bounce off a mirror. This is called reflection.', { source: telescopeSource }),
  card('science-plus', 'sci-lens', 'What can a clear glass lens do to light passing through it?', 'Bend the light', ['Turn light into water', 'Make all light disappear', 'Change light into a plant'],
    'Lenses help focus light in glasses and some telescopes.', 'A lens can bend light as it passes through, helping focus an image.',
    'Lenses bend light', 'A clear lens lets light pass through and can bend it. Some telescopes use lenses to help us see distant objects.', { source: telescopeSource }),
  card('science-plus', 'sci-sound-vibration', 'Sound is linked to which kind of movement?', 'Vibrations', ['Only melting', 'Only freezing', 'Only growing taller'],
    'This means moving back and forth quickly.', 'Sound travels through vibrations in matter, such as air, water, or a solid.',
    'Sound and vibration', 'A vibration is a back-and-forth movement. Sound can travel through vibrating matter.', { source: source('Exploratorium: Sound Bite', 'https://www.exploratorium.edu/snacks/sound-bite') }),
  card('science-plus', 'sci-eardrum', 'Which part of your ear vibrates when sound waves reach it?', 'Eardrum', ['Eyelid', 'Tongue', 'Kneecap'],
    'Its name includes an instrument that also has a vibrating surface.', 'Sound waves travel through the ear canal and make the eardrum vibrate.',
    'From sound waves to hearing', 'Sound waves make the eardrum vibrate. Other parts of the ear help send signals to the brain.', { source: source('NIH: How Do We Hear?', 'https://www.nidcd.nih.gov/health/how-do-we-hear') }),
  card('science-plus', 'sci-protect-hearing', 'Which action helps protect your hearing when using headphones?', 'Lower the volume', ['Always use the loudest setting', 'Move closer to a loud speaker', 'Listen to loud sounds for longer'],
    'Too much loud sound can harm the parts of the ear that help us hear.', 'Lowering the volume reduces exposure to loud sound.',
    'Care for your ears', 'Very loud sound can damage hearing. Lower the volume, move away from loud noise, or use hearing protection when needed.', { source: source('NIH: How Does Noise Damage Your Hearing?', 'https://www.nidcd.nih.gov/health/how-does-noise-damage-your-hearing') }),
  card('science-plus', 'sci-igneous', 'Which type of rock forms when melted rock cools and becomes solid?', 'Igneous rock', ['Sedimentary rock', 'Metamorphic rock', 'A living plant'],
    'Think of melted rock cooling after a volcanic eruption.', 'Igneous rock forms as melted rock cools and solidifies.',
    'Igneous: cooled from a melt', 'Melted rock can cool underground or at the surface. When it becomes solid, it forms igneous rock.', { source: source('USGS: What Are Igneous Rocks?', 'https://www.usgs.gov/faqs/what-are-igneous-rocks') }),
  card('science-plus', 'sci-sedimentary', 'Sand is buried, pressed together, and cemented into sandstone. What type of rock is it?', 'Sedimentary rock', ['Igneous rock', 'Metamorphic rock', 'A cloud'],
    'The name begins like sediment: loose material that settles.', 'Sandstone is sedimentary rock made from grains of sand joined together.',
    'Sedimentary: built from sediment', 'Some sedimentary rocks form when loose pieces are pressed and cemented together. Sandstone is one example.', { source: source('USGS: What Are Sedimentary Rocks?', 'https://www.usgs.gov/faqs/what-are-sedimentary-rocks') }),
  card('science-plus', 'sci-metamorphic', 'What type of rock forms when existing rock changes under heat and pressure without melting?', 'Metamorphic rock', ['Igneous rock', 'Loose sand', 'Liquid water'],
    'This rock changes while staying solid.', 'Heat and pressure can change solid rock into metamorphic rock.',
    'Metamorphic: changed while solid', 'A rock can change under heat and pressure without melting. The changed rock is metamorphic.', { source: source('USGS: Metamorphic Rocks', 'https://apps.usgs.gov/thesaurus/term-simple.php?code=5&thcode=4') }),
  card('science-plus', 'sci-mineral-quartz', 'Which of these is a mineral found in many rocks?', 'Quartz', ['Plastic', 'Wood', 'Paper'],
    'This natural material can form crystals.', 'Quartz is a mineral. Rocks can contain one or more minerals.',
    'Minerals help make rocks', 'Quartz is a common mineral. A rock can be made of one mineral or several minerals together.', { source: source('USGS: What Is the Difference Between a Rock and a Mineral?', 'https://www.usgs.gov/faqs/what-difference-between-a-rock-and-a-mineral') }),
];

export const EXTRA_CARDS = [...division, ...fractions, ...timeMoney, ...french, ...reading, ...science];
