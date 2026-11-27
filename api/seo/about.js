/**
 * GET /about — Maximus Sports in one plain-HTML page, for search engines
 * and AI agents. Rewritten from vercel.json.
 */
import { SITE, VALUE_PROPS, ASK, FAQ, PRO_PRICE, siteJsonLd } from '../../src/seo/siteCopy.js';
import { page, send, esc, faqHtml, propsHtml } from './_site.js';

export function renderAbout() {
  const body = `
<h1>NFL picks, predictions and betting insights, graded in public</h1>
<p class="lead">${esc(SITE.description)}</p>
<p><a class="cta" href="/nfl-picks">See this week’s NFL picks</a><a class="cta" href="/nfl/ask">Ask Maximus a question</a></p>

<h2>What Maximus Sports does</h2>
${propsHtml(VALUE_PROPS)}

<h2>${esc(ASK.title)}: an AI assistant for NFL betting questions</h2>
<p>${esc(ASK.lede)} ${esc(ASK.limits)}</p>
<ol>
${ASK.journeys.map((j) => `<li><strong>${esc(j.step)}.</strong> Ask “${esc(j.ask)}”. ${esc(j.get)}</li>`).join('\n')}
</ol>
<p><a href="/ask-maximus">More about Ask Maximus, with real answers</a></p>

<h2>Free and Pro</h2>
<table>
<tr><th></th><th>No account</th><th>Free account</th><th>Pro, ${PRO_PRICE} a month</th></tr>
<tr><td>NFL picks</td><td>The top picks each week</td><td>The call on every game</td><td>The call on every game</td></tr>
<tr><td>Email</td><td>None</td><td>NFL picks Thursday and Sunday</td><td>Plus an alert the moment a pick locks</td></tr>
<tr><td>Ask Maximus</td><td>3 questions a day</td><td>10 questions a day</td><td>150 a day, with every sportsbook’s price</td></tr>
</table>

<h2>Questions and answers</h2>
${faqHtml(FAQ)}
`;
  return page({ title: SITE.title, description: SITE.description, path: '/about', body, jsonLd: siteJsonLd() });
}

export default function handler(req, res) {
  return send(res, renderAbout(), { maxAge: 86400 });
}
