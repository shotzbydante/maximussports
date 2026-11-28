/**
 * What Maximus Sports is, in words: one copy of the facts for every place
 * that states them: the signed-out landing page, the page shell that
 * crawlers and AI agents read (index.html, checked by siteCopy.test.js),
 * the server-rendered pages in api/seo, and public/llms.txt.
 *
 * It says what the product does. It does not say how the numbers are made.
 * Change a fact here first, then run `npm test`: the test fails if
 * index.html or llms.txt has drifted from it.
 */

export const ORIGIN = 'https://maximussports.ai';
export const PRO_PRICE = '$7.99';

export const SITE = {
  name: 'Maximus Sports',
  title: 'NFL Picks, Predictions and Betting Insights | Maximus Sports',
  description:
    'Free NFL picks against the spread, over/under and moneyline for every game, locked at a real sportsbook price and graded in public. Ask Maximus, the AI betting assistant, about any game. Built for sports betting and prediction markets.',
  tagline: 'Sports intelligence for prediction markets and betting',
};

/** The core value props, most important first. */
export const VALUE_PROPS = [
  {
    title: 'A call on every NFL game',
    body: 'Every game on the schedule gets a side against the spread, an over or under on the total, and a moneyline read, ranked from strongest to weakest with one line on why.',
  },
  {
    title: 'Picks locked at a real price, graded in public',
    body: 'A recommended pick is locked at one sportsbook’s line and price, with the time it was taken. Every result, win or lose, goes on the public record.',
  },
  {
    title: 'Ask Maximus, an AI assistant for NFL betting questions',
    body: 'Ask about any game, pick, price or injury in plain English and get a short answer from the same data the board uses.',
  },
  {
    title: 'A fair price and win probability for each side',
    body: 'Each game shows what the market says a side should cost and how often it should win, so you can check a sportsbook line or a prediction-market contract against it.',
  },
  {
    title: 'Matchups down to the position group',
    body: 'Every starter is rated. Starters roll up to position groups and the units that line up against each other, on a page for each game and each of the 32 teams.',
  },
  {
    title: 'Picks by email, and alerts the moment one locks',
    body: `Free accounts get the NFL picks email on Thursday and Sunday. Pro (${PRO_PRICE} a month) adds an email the moment a pick is locked, before the line moves.`,
  },
];

/** Ask Maximus: what it is and the three things people do with it. */
export const ASK = {
  title: 'Ask Maximus',
  lede: 'An AI assistant that answers NFL betting questions from the live board: the picks, the prices at each sportsbook, injuries, weather and matchups.',
  limits: 'Three questions a day with no account, ten with a free account, 150 with Pro.',
  journeys: [
    {
      step: 'Break down a game',
      ask: 'Break down the 49ers game',
      get: 'The line, the lean in each market, who is hurt, and the matchup that decides it.',
    },
    {
      step: 'Check a pick before you bet',
      ask: 'Show the DEN pick',
      get: 'The price and book it was locked at, the fair price, and whether that price is still there.',
    },
    {
      step: 'See how the picks did',
      ask: 'How did our picks do today?',
      get: 'Each pick with its final score, graded win or loss, and what is still pending.',
    },
  ],
};

export const FAQ = [
  {
    q: 'What is Maximus Sports?',
    a: 'Maximus Sports is a sports intelligence app for betting and prediction markets. It makes a call on every NFL game against the spread, on the over/under and on the moneyline, locks recommended picks at a real sportsbook price, and grades every result in public. It also covers the NBA, MLB and college basketball.',
  },
  {
    q: 'Are the NFL picks free?',
    a: `Yes. The top picks each week are open to everyone, and a free account opens the call on every game plus the NFL picks email on Thursday and Sunday. Pro costs ${PRO_PRICE} a month and adds an email alert the moment a pick is locked, more Ask Maximus questions, and every sportsbook’s price side by side.`,
  },
  {
    q: 'What is Ask Maximus?',
    a: 'Ask Maximus is the AI assistant inside Maximus Sports. You ask an NFL betting question in plain English, such as “Break down the 49ers game” or “How did our picks do today?”, and it answers from the same picks, prices, injuries and matchups shown in the app. It covers the NFL today.',
  },
  {
    q: 'Does Maximus Sports work for prediction markets such as Kalshi or Polymarket?',
    a: 'Maximus Sports shows a fair price and a win probability for each side of every NFL game, which you can compare with the price of a prediction-market contract on the same game. It does not show prediction-market prices or place trades.',
  },
  {
    q: 'How do I know the picks record is real?',
    a: 'Each recommended pick is saved with its line, price, sportsbook and the time it was locked, before the game starts. It is graded against the final score and stays on the public record page, win or lose.',
  },
  {
    q: 'What is the difference between a recommended pick and a lean?',
    a: 'A recommended pick is one where a sportsbook’s price beats the market’s fair price. A lean is the model’s side when no price beats the market: it is saved and graded, but it is not a recommendation to bet.',
  },
  {
    q: 'Which sportsbooks and sports does it cover?',
    a: 'Prices come from the major U.S. sportsbooks, including FanDuel, BetMGM and BetRivers. The NFL has the deepest coverage. The NBA, MLB and men’s college basketball each have their own section.',
  },
];

/** The pages worth sending a reader, a crawler or an AI agent to. */
export const KEY_PAGES = [
  { path: '/', title: 'Home', desc: 'What Maximus Sports is, with this week’s NFL games live.' },
  { path: '/nfl-picks', title: 'NFL picks this week', desc: 'The current recommended NFL picks and top leans, with price, sportsbook and kickoff. Plain HTML, updated through the week.' },
  { path: '/nfl/insights', title: 'NFL picks board', desc: 'The interactive board: a call on every game in every market.' },
  { path: '/ask-maximus', title: 'Ask Maximus', desc: 'What the AI assistant answers, with example questions and real answers.' },
  { path: '/nfl/ask', title: 'Ask Maximus (the app)', desc: 'Ask an NFL betting question.' },
  { path: '/record', title: 'The public record', desc: 'Every graded pick and lean with its line, price and result.' },
  { path: '/nfl/games', title: 'NFL games', desc: 'This week’s schedule, lines and game pages with matchups and weather.' },
  { path: '/nfl/teams', title: 'NFL teams', desc: 'A page for each of the 32 teams: ratings, roster, schedule and news.' },
  { path: '/about', title: 'About Maximus Sports', desc: 'The product in one page, with questions and answers.' },
];

export const LEGAL = '21+. For entertainment and information only. Analysis does not guarantee outcomes. Gambling problem? Call 1-800-GAMBLER.';

/** schema.org graph for the home page and the page shell. */
/**
 * schema.org graph. `faq` adds the questions and answers: only for a page
 * that shows them (the landing page and /about), never the shared shell.
 */
export function siteJsonLd({ faq = true } = {}) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${ORIGIN}/#org`,
        name: SITE.name,
        url: ORIGIN,
        logo: `${ORIGIN}/brand/logo-navy.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${ORIGIN}/#site`,
        name: SITE.name,
        url: ORIGIN,
        description: SITE.description,
        publisher: { '@id': `${ORIGIN}/#org` },
      },
      {
        '@type': 'WebApplication',
        '@id': `${ORIGIN}/#app`,
        name: SITE.name,
        url: ORIGIN,
        applicationCategory: 'SportsApplication',
        operatingSystem: 'Web',
        description: SITE.description,
        featureList: VALUE_PROPS.map((v) => v.title),
        offers: [
          { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
          { '@type': 'Offer', name: 'Pro', price: PRO_PRICE.replace('$', ''), priceCurrency: 'USD' },
        ],
        publisher: { '@id': `${ORIGIN}/#org` },
      },
      ...(faq ? [faqJsonLd()] : []),
    ],
  };
}

export function faqJsonLd() {
  return {
    '@type': 'FAQPage',
    '@id': `${ORIGIN}/#faq`,
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

/** llms.txt: the site described for AI agents, in the llmstxt.org layout. */
export function llmsTxt() {
  const lines = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    `${SITE.name} (${ORIGIN}) is a web app. Category: NFL picks and predictions, sports betting insights, prediction-market research, AI sports betting assistant.`,
    '',
    '## What it offers',
    '',
    ...VALUE_PROPS.map((v) => `- **${v.title}.** ${v.body}`),
    '',
    '## Ask Maximus (AI assistant)',
    '',
    `${ASK.lede} ${ASK.limits}`,
    '',
    ...ASK.journeys.map((j) => `- ${j.step}: ask “${j.ask}”. You get: ${j.get}`),
    '',
    '## Pages',
    '',
    ...KEY_PAGES.map((p) => `- [${p.title}](${ORIGIN}${p.path === '/' ? '' : p.path}): ${p.desc}`),
    '',
    '## Plans',
    '',
    '- Free: the top picks with no account; a free account opens every call, the NFL picks email and ten Ask Maximus questions a day.',
    `- Pro, ${PRO_PRICE} a month: an email the moment a pick is locked, 150 Ask Maximus questions a day, and every sportsbook’s price side by side.`,
    '',
    '## Questions and answers',
    '',
    ...FAQ.flatMap((f) => [`### ${f.q}`, '', f.a, '']),
    '## Notes for agents',
    '',
    `- For the current picks in plain HTML, read ${ORIGIN}/nfl-picks. The app pages under /nfl need JavaScript.`,
    `- Each game this week has a plain-HTML page with its odds and matchups at ${ORIGIN}/nfl/<away>-vs-<home>-prediction, using team nicknames (for example ${ORIGIN}/nfl/chiefs-vs-bills-prediction). ${ORIGIN}/nfl-picks links to all of them.`,
    '- A pick is a price at one sportsbook at one time. Lines move: quote the time shown with it, and link to the page.',
    '- Sports covered: NFL (deepest), NBA, MLB, men’s college basketball.',
    `- ${LEGAL}`,
    '',
  ];
  return lines.join('\n');
}
