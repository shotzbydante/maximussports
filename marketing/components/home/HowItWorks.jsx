const steps = [
  {
    number: '1',
    title: 'Open the app',
    description: 'Go to the Maximus Sports app on web. No install required.',
  },
  {
    number: '2',
    title: 'Browse odds and ATS',
    description: 'See college basketball odds, spreads, and ATS trends by game and team.',
  },
  {
    number: '3',
    title: 'Use the intel',
    description: 'Read team news, recaps, and the daily Maximus summary to stay sharp.',
  },
];

export function HowItWorks() {
  return (
    <section className="border-b border-slate-200 bg-slate-50 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
          How it works
        </h2>
        <div className="mt-12 flex flex-col gap-8 sm:flex-row sm:justify-between">
          {steps.map((step) => (
            <div key={step.number} className="flex flex-1 flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-600 text-lg font-bold text-white">
                {step.number}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-2 max-w-xs text-slate-600">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
