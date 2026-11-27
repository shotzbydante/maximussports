/**
 * The ideas page inside the chat: everything Maximus can do, as prompts to
 * tap. One tap sends the question. Shown when the conversation is empty,
 * and from the Ideas button once it is not.
 */

import a from './ask.module.css';

export default function AskIdeas({ sections, onAsk, disabled = false }) {
  return (
    <div className={a.ideas}>
      {sections.map((section) => (
        <section key={section.title} aria-label={section.title}>
          <h3 className={a.ideasTitle}>{section.title}</h3>
          <ul className={a.ideasList}>
            {section.items.map((item) => (
              <li key={item.question}>
                <button type="button" className={a.idea} onClick={() => onAsk(item.question)} disabled={disabled}>
                  <span className={a.ideaEmoji} aria-hidden="true">{item.emoji}</span>
                  <span className={a.ideaText}>
                    <b>{item.title}{item.pro && <span className={a.ideaPro}>Pro</span>}</b>
                    <span>{item.sub}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
