const items = [
  {
    title: 'Team news',
    description: 'Stay on top of roster moves, injuries, and storylines that move lines and brackets.',
  },
  {
    title: 'Odds and ATS insights',
    description:
      'College basketball odds, spreads, and against-the-spread (ATS) trends in one place.',
  },
  {
    title: 'Game recaps',
    description: 'Quick recaps and key stats so you know what happened and what it means.',
  },
  {
    title: 'Maximus daily summary',
    description: 'A daily digest of the most important intel so you never miss a beat.',
  },
];

export function ValueProps() {
  return (
    <section className="border-b border-slate-200 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
          Everything you need for March Madness
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">
          Built for fans who care about odds, ATS, and bracket intel as much as the games.
        </p>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ title, description }) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
