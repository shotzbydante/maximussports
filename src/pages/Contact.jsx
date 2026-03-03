import styles from './Contact.module.css';

const CONTACT_EMAIL = 'winning@maximussports.ai';

export default function Contact() {
  const handleSubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const message = form.message.value.trim();

    const subject = encodeURIComponent(`Message from ${name || 'a Maximus Sports visitor'}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\n\n${message}`
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Contact Us</h1>
        <p className={styles.pageSubtitle}>
          Have a question, suggestion, or press inquiry? We&rsquo;d love to hear from you.
          Reach us directly by email or use the form below.
        </p>
      </header>

      <div className={styles.body}>

        <div className={styles.emailCard}>
          <p className={styles.emailLabel}>Email</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className={styles.emailLink}
          >
            {CONTACT_EMAIL}
          </a>
          <p className={styles.emailNote}>
            We typically respond within 1&ndash;2 business days. For partnership or
            advertising inquiries, please include relevant details in your message.
          </p>
        </div>

        <div className={styles.divider} />

        <form className={styles.formCard} onSubmit={handleSubmit} noValidate>
          <h2 className={styles.formTitle}>Send a Message</h2>

          <div className={styles.formRow}>
            <div className={styles.fieldGroup}>
              <label htmlFor="contact-name" className={styles.label}>Name</label>
              <input
                id="contact-name"
                name="name"
                type="text"
                className={styles.input}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="contact-email" className={styles.label}>Email</label>
              <input
                id="contact-email"
                name="email"
                type="email"
                className={styles.input}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="contact-message" className={styles.label}>Message</label>
            <textarea
              id="contact-message"
              name="message"
              className={styles.textarea}
              placeholder="What's on your mind?"
              rows={5}
            />
          </div>

          <button type="submit" className={styles.submitBtn}>
            Send via Email
          </button>

          <p className={styles.formNote}>
            Submitting this form opens your default email client with your message
            pre-filled. No data is transmitted directly through this site.
          </p>
        </form>

      </div>
    </div>
  );
}
