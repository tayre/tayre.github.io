/** Small, local picture-card sets. Existing school words live in data.js. */
export const LEARNING_TOPICS = [
  { id: 'phonics', title: 'Letter sounds', description: 'Say a word. Find its first sound.', icon: '🗣️', category: 'Read & say', theme: 'mint', prompt: 'SAY THE WORD. LISTEN FOR THE SOUND.' },
  { id: 'families', title: 'Word families', description: 'Change the start. Keep the rhyme.', icon: '🏡', category: 'Read & say', theme: 'peach', prompt: 'SOUND IT OUT. SAY THE WHOLE WORD.' },
  { id: 'arithmetic', title: 'Little sums', description: 'Make ten, put together, take away.', icon: '➕', category: 'Count & notice', theme: 'mint', prompt: 'COUNT THE DOTS. SAY THE NUMBER SENTENCE.' },
  { id: 'shapes', title: 'Shapes & patterns', description: 'Notice a shape. Find what repeats.', icon: '🔶', category: 'Count & notice', theme: 'peach', prompt: 'LOOK CLOSELY. WHAT DO YOU NOTICE?' },
  { id: 'money', title: 'Canadian coins', description: 'Meet coins and count their value.', icon: '🪙', category: 'Count & notice', theme: 'yellow', prompt: 'NAME THE COIN. COUNT THE CENTS.' },
  { id: 'calendar', title: 'Days & seasons', description: 'Days, months and our changing year.', icon: '📅', category: 'Our big world', theme: 'lilac', prompt: 'SAY THE NAME. WHAT COMES NEXT?' },
  { id: 'nature', title: 'Living things', description: 'Animals, plants and their homes.', icon: '🌱', category: 'Our big world', theme: 'mint', prompt: 'NAME THE PICTURE. DISCOVER SOMETHING.' },
];

export const LEARNING_CARDS = [];
export const LEARNING_PACKS = [];
function pack(topic, key, title, entries) {
  const cards = entries.map((entry, index) => ({
    id: `${topic}-${key}-${index + 1}`, topic,
    example: entry.back, speech: `${entry.front}. ${entry.back}`, ...entry,
  }));
  LEARNING_CARDS.push(...cards);
  LEARNING_PACKS.push({ id: `${topic}-${key}`, topic, title, ids: cards.map(({ id }) => id) });
}

pack('phonics', 'vowels', 'Short vowel sounds', [
  ['a', 'apple', '🍎'], ['e', 'egg', '🥚'], ['i', 'insect', '🐛'], ['o', 'octopus', '🐙'], ['u', 'umbrella', '☂️'],
].map(([front, word, picture]) => ({ front, picture, back: `Short ${front}, as in ${word}.`, example: `Say ${word}. Listen to its first sound.`, speech: `${word}. Listen to the first sound in ${word}.` })));
pack('phonics', 'starts', 'Beginning sounds', [
  ['m', 'moon', '🌙'], ['s', 'sun', '☀️'], ['t', 'turtle', '🐢'], ['p', 'pig', '🐷'],
  ['f', 'fish', '🐟'], ['n', 'nest', '🪺'], ['b', 'ball', '⚽'], ['d', 'dog', '🐶'],
].map(([front, word, picture]) => ({ front, picture, back: `${word} begins with the ${front} sound.`, example: `Say ${word} slowly. What sound comes first?`, speech: `${word}. Listen to the first sound in ${word}.` })));
pack('phonics', 'pairs', 'Two letters, one sound', [
  { front: 'sh', picture: '🚢', back: 'sh works together in ship.', example: 'Try the quiet sound at the start of ship.' },
  { front: 'ch', picture: '🪑', back: 'ch works together in chair.', example: 'Say chair. Listen to its first sound.' },
  { front: 'th', picture: '👍', back: 'th works together in thumb.', example: 'Say thumb. Let your tongue touch your teeth.' },
  { front: 'ck', picture: '🦆', back: 'ck works together at the end of duck.', example: 'Say duck. Listen to its last sound.' },
]);

for (const [ending, words] of [
  ['at', [['cat','🐱'],['hat','🎩'],['bat','🦇'],['rat','🐀']]],
  ['an', [['fan','🪭'],['man','👨'],['pan','🍳'],['van','🚐']]],
  ['ig', [['pig','🐷'],['big','🐘'],['dig','⛏️'],['wig','💇']]],
  ['op', [['hop','🐇'],['mop','🧹'],['top','🔝'],['pop','🍿']]],
  ['ug', [['bug','🐞'],['hug','🤗'],['mug','☕'],['rug','🟨']]],
  ['en', [['hen','🐔'],['pen','🖊️'],['ten','🔟'],['men','👬']]],
]) pack('families', ending, `The -${ending} family`, words.map(([word,picture]) => ({ front: word, picture, back: `${word[0]} + ${ending} → ${word}`, example: `Same ending: -${ending}. Change the first sound.`, wordParts: [word[0], ending], ...(['wig','mop','top','rug'].includes(word) ? {picture: '', visual: {type: 'object', object: word}} : {}) })));

pack('arithmetic', 'ten', 'Make ten', Array.from({length:9},(_,i)=>i+1).map(first => ({
  front: `${first} + ${10-first} = 10`, back: `${first} and ${10-first} fill the ten-frame.`,
  example: 'Count the purple dots, then the gold dots.', visual: {type:'tenframe',first,second:10-first,operation:'make10'},
})));
pack('arithmetic', 'add', 'Put together · add', [[2,3],[4,2],[5,3],[1,4],[3,3]].map(([first,second])=>({
  front: `${first} + ${second} = ${first+second}`, back: `${first} dots and ${second} more make ${first+second}.`,
  example: 'Add the two colours. How many altogether?', visual:{type:'tenframe',first,second,operation:'add'},
})));
pack('arithmetic', 'subtract', 'Take away · subtract', [[5,2],[7,3],[8,4],[9,2],[10,5]].map(([first,second])=>({
  front: `${first} − ${second} = ${first-second}`, back: `Start with ${first}. Take away ${second}. ${first-second} are left.`,
  example: 'Crossed-out dots are taken away. Count what is left.', visual:{type:'tenframe',first,second,operation:'subtract'},
})));

pack('shapes', 'names', 'Meet the shapes', [
  ['circle','Circle','A circle is round. It has no corners.'],
  ['triangle','Triangle','A triangle has 3 straight sides and 3 corners.'],
  ['square','Square','A square has 4 equal sides and 4 square corners.'],
  ['rectangle','Rectangle','A rectangle has 4 square corners. Opposite sides match.'],
  ['oval','Oval','An oval is a stretched, rounded shape with no corners.'],
  ['hexagon','Hexagon','A hexagon has 6 straight sides and 6 corners.'],
].map(([shape,front,back])=>({front,back,example:'Trace the edge with your finger. Count the corners.',visual:{type:'shape',shape}})));
pack('shapes', 'patterns', 'Find the repeating part', [
  {front:'Red, blue, repeat',back:'The part that repeats is red, blue. Red comes next.',example:'Red, blue, red, blue, red, blue.',visual:{type:'pattern',items:['🔴','🔵','🔴','🔵','🔴','🔵'],next:'🔴'}},
  {front:'Sun, moon, repeat',back:'The part that repeats is sun, moon. Sun comes next.',example:'Sun, moon, sun, moon, sun, moon.',visual:{type:'pattern',items:['☀️','🌙','☀️','🌙','☀️','🌙'],next:'☀️'}},
  {front:'One, two, two',back:'The part that repeats is apple, pear, pear. Apple is next.',example:'Apple, pear, pear, apple, pear, pear.',visual:{type:'pattern',items:['🍎','🍐','🍐','🍎','🍐','🍐'],next:'🍎'}},
  {front:'Three things repeat',back:'The part that repeats is cat, dog, rabbit. Cat is next.',example:'Cat, dog, rabbit, cat, dog, rabbit.',visual:{type:'pattern',items:['🐱','🐶','🐰','🐱','🐶','🐰'],next:'🐱'}},
  {front:'Two, then one',back:'The part that repeats is leaf, leaf, flower. Leaf is next.',example:'Leaf, leaf, flower, leaf, leaf, flower.',visual:{type:'pattern',items:['🍃','🍃','🌸','🍃','🍃','🌸'],next:'🍃'}},
  {front:'Clap, tap, repeat',back:'Clap, tap, clap, tap. A clap comes next. Try the actions!',example:'Clap your hands, then tap your knees. Repeat.',visual:{type:'pattern',items:['👏','🦵','👏','🦵'],next:'👏'}},
]);

const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
pack('calendar','days','Days of the week',days.map((front,i)=>({front,visual:{type:'calendar',kind:'day',position:i+1,label:front},back:`${days[(i+1)%7]} comes after ${front}.`,example:'Say all 7 days in order. Then start again.'})));
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
for(let part=0;part<2;part++) pack('calendar',`months${part+1}`,part?'Months · July–December':'Months · January–June',months.slice(part*6,part*6+6).map(front=>({front,visual:{type:'calendar',kind:'month',position:months.indexOf(front)+1,label:front},back:`${front} is month ${months.indexOf(front)+1}. ${months[(months.indexOf(front)+1)%12]} comes next.`,example:'There are 12 months in a year.'})));
pack('calendar','seasons','Our four seasons',[
  {front:'Spring',picture:'🌷',back:'Spring comes after winter. Many plants begin to grow.',example:'Our seasons in Canada: spring, summer, fall, winter.'},
  {front:'Summer',picture:'☀️',back:'Summer comes after spring. Days are long and warm.',example:'Our seasons in Canada: spring, summer, fall, winter.'},
  {front:'Fall',picture:'🍂',back:'Fall is also called autumn. Many trees lose their leaves.',example:'Fall comes after summer and before winter.'},
  {front:'Winter',picture:'❄️',back:'Winter comes after fall. It is our coldest season.',example:'After winter, spring comes again.'},
]);

const coinNames={5:'Nickel',10:'Dime',25:'Quarter',100:'Loonie',200:'Toonie'};
pack('money','names','Meet Canadian coins',[
  [5,'A nickel is worth 5 cents.'],[10,'A dime is worth 10 cents.'],[25,'A quarter is worth 25 cents.'],[100,'A loonie is worth 1 dollar, or 100 cents.'],[200,'A toonie is worth 2 dollars, or 200 cents.'],
].map(([cents,back])=>({front:coinNames[cents],back,example:'The value tells us how much the coin is worth.',visual:{type:'coin',cents}})));
pack('money','count','Count some coins',[[5,5],[10,10],[10,5,5],[25,5],[25,25,25,25],[100,100]].map(coins=>{
  const total=coins.reduce((sum,value)=>sum+value,0);
  return {front:total>=100?`${total/100} ${total===100?'dollar':'dollars'}`:`${total} cents`,back:`${coins.map(cents=>cents>=100?`$${cents/100}`:`${cents}¢`).join(' + ')} = ${total>=100?`$${total/100}`:`${total}¢`}`,example:'Count the value of each coin, not just the number of coins.',visual:{type:'coins',coins}};
}));

pack('nature','animals','Meet some animals',[
  {front:'Bird',picture:'🐦',back:'Birds have feathers.',example:'Look for the beak, wings and feathers.'},
  {front:'Fish',picture:'🐟',back:'Fish live in water and breathe using gills.',example:'Look for fins that help a fish move.'},
  {front:'Butterfly',picture:'🦋',back:'A butterfly is an insect. Insects have 6 legs.',example:'It begins life as an egg, then becomes a caterpillar.'},
  {front:'Frog',picture:'🐸',back:'A young frog begins life as a tadpole.',example:'A tadpole grows legs as it becomes a frog.'},
  {front:'Dog',picture:'🐶',back:'Dogs are mammals. Mother dogs feed their babies milk.',example:'Dogs have hair or fur on their bodies.'},
]);
pack('nature','plants','Parts of a plant',[
  {front:'Roots',picture:'🌱',back:'Roots take in water and help hold a plant in place.',example:'Roots often branch out under the ground.'},
  {front:'Stem',picture:'🌻',back:'The stem holds a plant up and carries water.',example:'Follow the stem from the roots to the leaves.'},
  {front:'Leaves',picture:'🍃',back:'Green leaves use light to help make food for a plant.',example:'Plants need water and air, too.'},
  {front:'Flowers',picture:'🌸',back:'Flowers help flowering plants make seeds.',example:'Look for petals around the middle.'},
  {front:'Seed',picture:'🌰',back:'A seed can grow into a new plant.',example:'With the right conditions, a tiny plant begins to grow.'},
].map(card => ({...card, picture: '', visual: {type: 'plant', part: card.front.toLowerCase()}})));
pack('nature','homes','Animal homes',[
  {front:'Pond',picture:'🐸',back:'A pond can be a home for frogs and fish.',example:'A habitat is a place where a living thing finds what it needs.'},
  {front:'Forest',picture:'🐿️',back:'A forest can be a home for squirrels and birds.',example:'Trees can provide food and shelter.'},
  {front:'Ocean',picture:'🐠',back:'The ocean is a saltwater habitat for many animals.',example:'Fish and many other animals live in the ocean.'},
  {front:'Desert',picture:'🐪',back:'A desert gets very little rain.',example:'Camels can live in hot, dry deserts.'},
].map(card => ({...card, picture: '', visual: {type: 'habitat', habitat: card.front.toLowerCase()}})));
pack('nature','needs','What living things need',[
  {front:'Water',picture:'💧',back:'Plants and animals need water.',example:'Think about watering a plant or filling a pet’s bowl.'},
  {front:'Food',picture:'🥕',back:'Animals need food for energy and growth.',example:'Some animals eat plants. Some eat other animals.'},
  {front:'Air',picture:'🌬️',back:'People and other animals need oxygen to live.',example:'Fish take oxygen from water using their gills.'},
  {front:'Shelter',picture:'🪺',back:'Shelter helps protect animals from danger and weather.',example:'Think of a nest, a burrow or a place under a rock.'},
  {front:'Light',picture:'🌞',back:'Green plants use light to help make their own food.',example:'A plant’s leaves can catch light.'},
]);

export const CONTENT_SOURCES = [
  {title:'Royal Canadian Mint: Canadian circulation coins',url:'https://www.mint.ca/en/discover/canadian-circulation'},
  {title:'Reading Rockets: Phonics and decoding',url:'https://www.readingrockets.org/reading-101/reading-and-writing-basics/phonics-and-decoding'},
  {title:'National Park Service: Food, water, shelter, space',url:'https://www.nps.gov/teachers/classrooms/food-water-shelter-space.htm'},
  {title:'University of Illinois: Plant parts',url:'https://web.extension.illinois.edu/gpe/case1/c1facts2a.html'},
];
