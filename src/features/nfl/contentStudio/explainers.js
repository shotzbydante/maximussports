/**
 * Evergreen explainers: short, saveable posts that teach the three ideas the
 * whole account rests on. Static copy, plus one worked example taken from
 * this week's top pick when there is one.
 */
export const NFL_EXPLAINERS = [
  {
    id: 'fair-price',
    label: 'What a fair price is',
    kicker: 'Betting, explained',
    title: 'What is a fair price?',
    points: [
      'Every bet has a true chance of winning. The fair price is the payout that exactly matches it.',
      'Sportsbooks charge more than fair. That gap is their cut.',
      'A bet is only worth making when a book offers better than fair. That is rare.',
    ],
    example: (k) => (k?.fairPrice && k?.offeredPrice
      ? `This week: ${k.label} is fair at ${k.fairPrice}. ${k.book || 'One book'} is offering ${k.offeredPrice}.`
      : null),
    closer: 'We only post a pick when the price beats fair.',
  },
  {
    id: 'closing-line',
    label: 'Why the closing line matters',
    kicker: 'Betting, explained',
    title: 'Why we track the closing line',
    points: [
      'The last price before kickoff is the sharpest one. Everyone has bet into it.',
      'If your number was better than the close, you made a good bet, whatever happened in the game.',
      'Win rate over a few weeks is mostly luck. Beating the close is the skill.',
    ],
    example: () => null,
    closer: 'It is why our record shows both.',
  },
  {
    id: 'passing',
    label: 'Why we pass on most games',
    kicker: 'Betting, explained',
    title: 'Most games are a pass',
    points: [
      'A dozen sharp books price every game. Most of the time they are right.',
      'Betting a fair price is paying a fee to flip a coin.',
      'The edge is in waiting for the one number that is wrong.',
    ],
    example: (k, meta) => (meta?.marketsChecked > 0
      ? `This week we priced ${meta.marketsChecked} markets and passed on ${meta.held}.`
      : null),
    closer: 'No bet is a position too.',
  },
];
