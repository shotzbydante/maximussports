/**
 * GET /ask-maximus — what the AI assistant does, in plain HTML, with real
 * answers it gave. Rewritten from vercel.json.
 */
import { ASK, FAQ, ORIGIN, SITE } from '../../src/seo/siteCopy.js';
import { ASK_EXAMPLES, ASK_EXAMPLES_DATE } from '../../src/seo/askExamples.js';
import { page, send, esc } from './_site.js';

export function renderAskMaximus() {
  const title = 'Ask Maximus: AI Assistant for NFL Betting Questions | Maximus Sports';
  const description = 'Ask Maximus answers NFL betting questions in plain English: game breakdowns, the price and sportsbook behind each pick, injuries, and how the picks did. Free to try, no account needed.';
  const faq = FAQ.filter((f) => /Ask Maximus|free|prediction/i.test(f.q));
  const body = `
<h1>Ask Maximus: an AI assistant for NFL betting questions</h1>
<p class="lead">${esc(ASK.lede)}</p>
<p class="meta">${esc(ASK.limits)}</p>
<p><a class="cta" href="/nfl/ask">Ask a question now</a><a class="cta" href="/nfl-picks">See this week’s picks</a></p>

<div class="shots">
<img src="/brand/ask/ask-game.webp" width="312" height="640" alt="Ask Maximus on a phone answering “Break down the 49ers game” with the line, the leans and the matchup to watch" loading="lazy">
<img src="/brand/ask/ask-pick.webp" width="312" height="640" alt="Ask Maximus showing the price, sportsbook and fair price of a recommended NFL pick" loading="lazy">
<img src="/brand/ask/ask-results.webp" width="312" height="640" alt="Ask Maximus grading the day’s NFL picks against the final scores" loading="lazy">
</div>

<h2>Three things people ask</h2>
${ASK.journeys.map((j) => `<div class="card"><h3>${esc(j.step)}</h3><p>Ask: “${esc(j.ask)}”</p><p>${esc(j.get)}</p></div>`).join('\n')}

<h2>Real answers</h2>
<p class="meta">Questions asked in the app on ${esc(ASK_EXAMPLES_DATE)}, with the answers as given. Prices and injuries were correct at that time and have since changed.</p>
${ASK_EXAMPLES.map((e) => `<h3>“${esc(e.q)}”</h3><blockquote>${esc(e.a)}</blockquote>`).join('\n')}

<h2>What it knows</h2>
<ul>
<li>Every NFL game this week: the spread, total and moneyline, and the call in each.</li>
<li>Each recommended pick: the line, price and sportsbook it was locked at, and when.</li>
<li>Injury reports, the kickoff forecast, and position-group matchups.</li>
<li>Results: every pick and lean graded against the final score.</li>
<li>With Pro: the price at every sportsbook, side by side.</li>
</ul>
<p>It answers about the NFL today. It does not place bets, and it says so when it does not have something.</p>

<h2>Questions and answers</h2>
${faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('\n')}
`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Ask Maximus',
    url: `${ORIGIN}/ask-maximus`,
    applicationCategory: 'SportsApplication',
    operatingSystem: 'Web',
    description,
    isPartOf: { '@type': 'WebSite', name: SITE.name, url: ORIGIN },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  return page({ title, description, path: '/ask-maximus', body, jsonLd });
}

export default function handler(req, res) {
  return send(res, renderAskMaximus(), { maxAge: 86400 });
}
