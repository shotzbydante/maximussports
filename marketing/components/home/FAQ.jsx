const faqs = [
  {
    q: 'What is ATS (against the spread)?',
    a: 'ATS means whether a team beat the point spread. If a team was favored by 5 and won by 7, they covered (won ATS). We surface ATS trends and records so you can see how teams perform relative to the spread.',
  },
  {
    q: 'How often are odds and ATS data updated?',
    a: 'Odds and ATS insights are updated regularly throughout the day. Game recaps and the daily Maximus summary are posted after games and each morning so you stay current.',
  },
  {
    q: 'Do I need an account to use the app?',
    a: 'You can open the app and browse odds, ATS, and news without an account. Create an account when we support it to save preferences and get updates.',
  },
  {
    q: 'What kind of team news do you cover?',
    a: 'We focus on news that matters for brackets and betting: injuries, roster changes, and key storylines that can move lines and outcomes.',
  },
];

export function FAQ() {
  return (
    <section className="border-b border-slate-200 bg-slate-50 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
          Frequently asked questions
        </h2>
        <dl className="mt-12 space-y-8">
          {faqs.map(({ q, a }) => (
            <div key={q}>
              <dt className="text-lg font-semibold text-slate-900">{q}</dt>
              <dd className="mt-2 text-slate-600">{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
