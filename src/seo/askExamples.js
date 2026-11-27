/**
 * Real Ask Maximus exchanges, word for word, asked in the live app by the
 * owner on the date below. Used as examples on the landing page and on
 * /ask-maximus, and as the text in the product screenshots
 * (public/brand/ask). They are dated because prices and injuries move.
 */
export const ASK_EXAMPLES_DATE = 'November 26, 2026';

export const ASK_EXAMPLES = [
  {
    id: 'game',
    q: 'Break down the 49ers game',
    a: 'No recommended pick here. SF is -3 (-148 ML) at 9-1, but Brock Purdy is questionable, so prices may move. The model projects SF by 1.6, total 47.2, which is only a lean. SF\'s rush offense (grade 80) faces SEA\'s run defense (grade 59), and SEA\'s rush offense (35) is outmatched. The tracked leans are SEA +3 at -112 (BetMGM), Over 43.5 at -110 (BetMGM) and SF -146 (FanDuel). All are negative expected value. Wait for Purdy\'s status.',
  },
  {
    id: 'pick',
    q: 'Show the DEN pick',
    a: 'DEN -200 at BetRivers is a recommended pick, locked Thursday at 3:10 PM ET. The market fair price is -216, worth +2.6% expected value, with 12 books putting DEN at 68.4% to win. The game kicks off Friday at 3:00 PM ET.',
    then: {
      q: 'Compare prices for DEN at PIT',
      a: 'Best DEN moneyline is -220 at Circa Sports. BetRivers now shows -265, not the -200 on the pick, so re-check before acting. Prices are as of 2:37 AM ET and may have moved.',
    },
  },
  {
    id: 'results',
    q: 'How did our picks do today?',
    a: 'The Thanksgiving slate went 2-1. The Over 48 in PHI at DAL won at -108 (BetMGM), finishing 77 points. The Under 47.5 in KC at BUF won at -109 (BetRivers), finishing 23. The miss was DET +116 (FanDuel), which lost 39-35 to CHI, though DET outgained them by 91 yards. DEN -200 (BetRivers) at PIT is still pending, kicking off at 3:00 PM ET.',
  },
];
