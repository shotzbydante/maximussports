import styles from './Privacy.module.css';

export default function Privacy() {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Privacy Policy</h1>
        <p className={styles.pageSubtitle}>
          Maximus Sports is committed to being transparent about how we collect,
          use, and protect your information.
        </p>
        <span className={styles.lastUpdated}>Last updated: March 2026</span>
      </header>

      <article className={styles.article}>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Information We Collect</h2>
          <p className={styles.sectionBody}>
            We collect information you provide directly to us, information collected
            automatically when you use the site, and information from third-party
            services. Specifically, we may collect:
          </p>
          <ul className={styles.list}>
            <li>
              <strong>Account information</strong> — email address and profile data when
              you create an account via Google OAuth or email one-time password (OTP)
              through Supabase authentication.
            </li>
            <li>
              <strong>Usage data</strong> — pages visited, features used, interactions
              with content, and time spent on the site.
            </li>
            <li>
              <strong>Device and browser data</strong> — browser type, operating system,
              referring URLs, and IP address.
            </li>
            <li>
              <strong>Cookies and localStorage</strong> — we use browser storage to
              remember your preferences, feature flags, pinned teams, and session state.
              See the Cookies section below for more detail.
            </li>
            <li>
              <strong>Communications</strong> — if you contact us by email, we retain
              that correspondence.
            </li>
          </ul>
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. How We Use Your Information</h2>
          <p className={styles.sectionBody}>
            We use the information we collect to operate, improve, and personalize
            Maximus Sports. Specific uses include:
          </p>
          <ul className={styles.list}>
            <li>Providing and improving the service, including AI-generated sports analysis and news aggregation.</li>
            <li>Personalizing your experience, such as showing content related to your pinned teams.</li>
            <li>Sending transactional emails (e.g., authentication OTP codes).</li>
            <li>Displaying relevant advertising through Google AdSense and similar ad networks.</li>
            <li>Tracking referrals and conversions through affiliate programs.</li>
            <li>Analyzing site performance and user behavior through analytics tools.</li>
            <li>Detecting and preventing abuse, fraud, or unauthorized access.</li>
          </ul>
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Third-Party Services</h2>
          <p className={styles.sectionBody}>
            Maximus Sports relies on the following third-party services, each of which
            has its own privacy practices:
          </p>
          <ul className={styles.list}>
            <li>
              <strong>Supabase</strong> — authentication and database services. Your
              email and session data are stored and processed by Supabase in accordance
              with their privacy policy.
            </li>
            <li>
              <strong>Google AdSense</strong> — we display advertisements served by
              Google, which may use cookies and interest-based targeting. You can manage
              Google ad personalization at{' '}
              <a
                href="https://adssettings.google.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                adssettings.google.com
              </a>.
            </li>
            <li>
              <strong>Google Analytics (future)</strong> — we may use Google Analytics
              to understand site usage. This service collects anonymized usage data.
            </li>
            <li>
              <strong>PostHog</strong> — we use PostHog for product analytics to
              understand how features are used.
            </li>
            <li>
              <strong>Affiliate partners</strong> — links to sportsbooks, ticketing
              platforms, merchandise retailers, and other partners may contain tracking
              parameters that allow those partners to attribute referrals to us. See
              the Affiliate Disclosure section below.
            </li>
            <li>
              <strong>Vercel</strong> — our hosting and infrastructure provider, which
              processes request logs and performance data.
            </li>
            <li>
              <strong>OpenAI / Anthropic (Claude)</strong> — AI services used to
              generate sports summaries and analysis. Content you interact with may be
              processed by these services.
            </li>
          </ul>
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. Cookies and Local Storage</h2>
          <p className={styles.sectionBody}>
            We use cookies and browser localStorage for essential site functionality
            and to improve your experience. Types of storage we use include:
          </p>
          <ul className={styles.list}>
            <li>
              <strong>Authentication cookies</strong> — session tokens provided by
              Supabase to keep you logged in.
            </li>
            <li>
              <strong>Preference storage (localStorage)</strong> — feature flags,
              pinned team selections, dismissed modals, and UI state.
            </li>
            <li>
              <strong>Analytics cookies</strong> — PostHog and, in the future, Google
              Analytics may set cookies to track anonymous usage patterns.
            </li>
            <li>
              <strong>Advertising cookies</strong> — Google AdSense may set cookies to
              personalize the ads shown to you based on your browsing history.
            </li>
          </ul>
          <p className={styles.sectionBody}>
            Most browsers allow you to control cookies through their settings. Disabling
            cookies may affect the functionality of certain features, including login.
          </p>
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. Affiliate Disclosure</h2>
          <div className={styles.note}>
            Maximus Sports participates in affiliate advertising programs. This means we
            may earn a commission when you click on certain links and make purchases or
            sign-ups through those links — at no additional cost to you. Affiliate
            relationships may include sportsbooks, ticketing platforms, fan merchandise
            retailers, Amazon, and other third parties. We only link to services we
            believe may be of value to our users, but we encourage you to do your own
            research before making any purchase or account decisions.
          </div>
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. Gambling & Betting Disclaimer</h2>
          <div className={styles.note}>
            Maximus Sports provides sports information, odds data, and AI-generated
            analysis for informational and entertainment purposes only. Nothing on this
            site constitutes betting advice, financial advice, or a recommendation to
            place any wager. Sports betting involves risk. You are solely responsible
            for any decisions you make. This site does not encourage gambling, and you
            must comply with all applicable laws in your jurisdiction. You must be at
            least 18 years of age (or the minimum legal age in your jurisdiction) to
            engage with betting-related content.
          </div>
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. Children's Privacy</h2>
          <p className={styles.sectionBody}>
            Maximus Sports is not directed to children under the age of 13. We do not
            knowingly collect personal information from children under 13. If you
            believe we have inadvertently collected information from a child under 13,
            please contact us at{' '}
            <a href="mailto:winning@maximussports.ai">winning@maximussports.ai</a>{' '}
            and we will promptly delete it.
          </p>
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. Data Retention</h2>
          <p className={styles.sectionBody}>
            We retain your account information for as long as your account is active or
            as needed to provide services. You may request deletion of your account and
            associated data at any time by emailing{' '}
            <a href="mailto:winning@maximussports.ai">winning@maximussports.ai</a>.
            Anonymous usage data and analytics may be retained longer in aggregated form.
          </p>
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. Security</h2>
          <p className={styles.sectionBody}>
            We take reasonable technical and organizational measures to protect your
            information from unauthorized access, alteration, disclosure, or destruction.
            Authentication is handled by Supabase, which employs industry-standard
            security practices. However, no system is completely secure, and we cannot
            guarantee absolute security of your data.
          </p>
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. California Privacy Rights</h2>
          <p className={styles.sectionBody}>
            If you are a California resident, you may have additional rights under the
            California Consumer Privacy Act (CCPA), including the right to know what
            personal information we collect, the right to request deletion, and the
            right to opt out of the sale of your personal information. We do not sell
            personal information. For more information or to exercise your rights,
            contact us at{' '}
            <a href="mailto:winning@maximussports.ai">winning@maximussports.ai</a>.
          </p>
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>11. Changes to This Policy</h2>
          <p className={styles.sectionBody}>
            We may update this Privacy Policy from time to time. When we do, we will
            revise the "Last updated" date at the top of this page. Continued use of
            Maximus Sports after changes are posted constitutes your acceptance of the
            updated policy. We encourage you to review this page periodically.
          </p>
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>12. Contact Us</h2>
          <p className={styles.sectionBody}>
            If you have any questions about this Privacy Policy or how we handle your
            data, please contact us at{' '}
            <a href="mailto:winning@maximussports.ai">winning@maximussports.ai</a>.
          </p>
        </section>

      </article>
    </div>
  );
}
