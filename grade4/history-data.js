/** Short Canadian history questions, checked against the linked primary sources. */
const historySource = {
  title: 'Government of Canada: History of Canada',
  url: 'https://www.canada.ca/en/canadian-heritage/services/history-canada.html',
};
const discoverHistorySource = {
  title: 'Government of Canada: Discover Canada — Canada’s history',
  url: 'https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/discover-canada/read-online/canadas-history.html',
};

export const HISTORY_FACTS = [
  {
    id: 'hist-first-peoples', topic: 'history',
    question: 'Who lived in what is now Canada long before Europeans arrived?',
    answer: 'First Nations and Inuit peoples',
    choices: ['French settlers', 'First Nations and Inuit peoples', 'British settlers', 'Norse sailors'],
    hint: 'Think of Indigenous peoples, whose histories here began long before European settlement.',
    explanation: 'First Nations and Inuit societies had their own cultures and histories here long before Europeans arrived.',
    source: historySource,
  },
  {
    id: 'hist-confederation', topic: 'history',
    question: 'In which year did Canadian Confederation take place?', answer: '1867',
    choices: ['1608', '1949', '1867', '1965'],
    hint: 'It was in the 1800s, and the year ends in 67.',
    explanation: 'Confederation brought four provinces together as the Dominion of Canada on July 1, 1867.',
    source: discoverHistorySource,
  },
  {
    id: 'hist-first-four-provinces', topic: 'history',
    question: 'Which province was one of Canada’s first four provinces in 1867?', answer: 'New Brunswick',
    choices: ['New Brunswick', 'Manitoba', 'British Columbia', 'Alberta'],
    hint: 'Its name begins with “New”.',
    explanation: 'The first four provinces were Ontario, Quebec, Nova Scotia and New Brunswick.',
    source: historySource,
  },
  {
    id: 'hist-canada-day', topic: 'history',
    question: 'On which date is Canada Day?', answer: 'July 1',
    choices: ['January 1', 'June 1', 'November 11', 'July 1'],
    hint: 'It is the first day of the seventh month.',
    explanation: 'Canada Day is July 1, the anniversary of Confederation in 1867.',
    source: discoverHistorySource,
  },
  {
    id: 'hist-name-canada', topic: 'history',
    question: 'Canada’s name likely comes from “kanata”. What does that word mean?',
    answer: 'A village or settlement',
    choices: ['A snowy mountain', 'A village or settlement', 'A deep lake', 'A maple leaf'],
    hint: 'Think of a place where people live together.',
    explanation: 'The name Canada likely comes from the Huron-Iroquois word “kanata”, meaning village or settlement.',
    source: {
      title: 'Government of Canada: Origin of the name Canada',
      url: 'https://www.canada.ca/en/canadian-heritage/services/origin-name-canada.html',
    },
  },
  {
    id: 'hist-fur-trade', topic: 'history',
    question: 'Which animal’s fur was especially important for making hats in the fur trade?', answer: 'Beaver',
    choices: ['Moose', 'Loon', 'Beaver', 'Salmon'],
    hint: 'This swimming mammal has a broad, flat tail.',
    explanation: 'Beaver fur was traded to make the felt hats that were popular in Europe.',
    source: {
      title: 'Government of Canada: Official symbols — the beaver',
      url: 'https://www.canada.ca/en/canadian-heritage/services/official-symbols-canada.html',
    },
  },
  {
    id: 'hist-champlain', topic: 'history',
    question: 'Who established a French settlement at Québec in 1608?', answer: 'Samuel de Champlain',
    choices: ['Samuel de Champlain', 'Jacques Cartier', 'John Cabot', 'Henry Hudson'],
    hint: 'His first name is Samuel.',
    explanation: 'Samuel de Champlain established the French settlement at Québec in 1608, on land with a long Indigenous history.',
    source: {
      title: 'Parks Canada: Samuel de Champlain — the French arrive at Chambly',
      url: 'https://parks.canada.ca/lhn-nhs/qc/fortchambly/culture/histoire-history/site/samuel-de-champlain',
    },
  },
  {
    id: 'hist-railway', topic: 'history',
    question: 'In which year was the Canadian Pacific Railway’s famous last spike driven?', answer: '1885',
    choices: ['1867', '1905', '1949', '1885'],
    hint: 'It happened in the 1880s.',
    explanation: 'The last spike was driven on November 7, 1885. Chinese and European workers helped build the railway.',
    source: discoverHistorySource,
  },
  {
    id: 'hist-maple-leaf-flag', topic: 'history',
    question: 'In which year did Canada’s red-and-white maple leaf flag become the national flag?', answer: '1965',
    choices: ['1867', '1965', '1982', '1999'],
    hint: 'It was in the 1960s, and the year ends in 5.',
    explanation: 'The maple leaf flag became Canada’s national flag in 1965 and was first raised on Parliament Hill on February 15.',
    source: {
      title: 'Parks Canada: The creation of the national flag',
      url: 'https://www.canada.ca/en/parks-canada/news/2017/04/the_creation_of_thenationalflag.html',
    },
  },
  {
    id: 'hist-nunavut', topic: 'history',
    question: 'Which Canadian territory was created on April 1, 1999?', answer: 'Nunavut',
    choices: ['Yukon', 'Northwest Territories', 'Nunavut', 'Alberta'],
    hint: 'Its name begins with N and ends with t.',
    explanation: 'Nunavut became a territory in 1999 after years of work by Inuit leaders. Its name means “our land” in Inuktitut.',
    source: {
      title: 'Government of Canada: Nunavut — history and symbols',
      url: 'https://www.canada.ca/en/canadian-heritage/services/provincial-territorial-symbols-canada/nunavut.html',
    },
  },
  {
    id: 'hist-newfoundland', topic: 'history',
    question: 'In which year did Newfoundland, now Newfoundland and Labrador, join Canada?', answer: '1949',
    choices: ['1949', '1867', '1885', '1999'],
    hint: 'It happened near the end of the 1940s.',
    explanation: 'Newfoundland joined Confederation in 1949, becoming Canada’s tenth province.',
    source: historySource,
  },
  {
    id: 'hist-charter', topic: 'history',
    question: 'What does the Canadian Charter of Rights and Freedoms help protect?',
    answer: 'People’s rights and freedoms',
    choices: ['Railway timetables', 'Weather forecasts', 'Sports scores', 'People’s rights and freedoms'],
    hint: 'Think about fair treatment and being free to express your ideas.',
    explanation: 'Added to Canada’s Constitution in 1982, the Charter protects rights such as freedom of expression and equality.',
    source: {
      title: 'Government of Canada: Guide to the Canadian Charter of Rights and Freedoms',
      url: 'https://www.canada.ca/en/canadian-heritage/services/how-rights-protected/guide-canadian-charter-rights-freedoms.html',
    },
  },
];
