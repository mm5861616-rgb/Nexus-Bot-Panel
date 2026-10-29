import styles from "./panel.module.css";
import Link from "next/link";
import PanelDashboard from "./panel-dashboard";
import { getDiscordSession, isPanelAdmin } from "@/lib/discord-panel-auth";

type PanelPageProps = {
  searchParams: Promise<{ login?: string }>;
};

export default async function PanelPage({ searchParams }: PanelPageProps) {
  const [identity, query] = await Promise.all([getDiscordSession(), searchParams]);
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>N</span>
          <span>NEXUS <b>BOT</b></span>
        </Link>
        <span className={styles.topbarLabel}>SERVER PANEL</span>
        {identity ? <span className={styles.topbarUser}>{identity.username}</span> : (
          <a className={styles.loginLink} href="/api/discord/login">Mit Discord anmelden</a>
        )}
      </header>

      {identity ? (
        <PanelDashboard identity={identity} isAdmin={isPanelAdmin(identity)} />
      ) : (
        <section className={styles.loginPanel}>
          <div className={styles.loginGlow} />
          <span className={styles.eyebrow}>NEXUS BOT · SERVER VERWALTUNG</span>
          <h1>Dein Server.<br /><span>Deine Einstellungen.</span></h1>
          <p>Melde dich mit Discord an, um den Nexus Bot auf deinen Servern einzurichten und Funktionen zu verwalten.</p>
          {query.login === "failed" && (
            <p className={styles.error} role="alert">Die Discord-Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.</p>
          )}
          <a className={styles.primaryButton} href="/api/discord/login">
            <DiscordIcon />
            Mit Discord anmelden
          </a>
          <small>Wir fragen nur nach deinem Profil und den Servern, die du verwalten darfst.</small>
        </section>
      )}
    </main>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M19.7 5.2a18.7 18.7 0 0 0-4.6-1.4l-.6 1.2a17.2 17.2 0 0 0-5 0L8.9 3.8a18.7 18.7 0 0 0-4.6 1.4C1.4 9.5.6 13.7 1 17.9a18.8 18.8 0 0 0 5.6 2.8l1.2-2a12 12 0 0 1-1.9-.9l.5-.4a13.4 13.4 0 0 0 11.2 0l.5.4a12 12 0 0 1-1.9.9l1.2 2a18.8 18.8 0 0 0 5.6-2.8c.5-4.9-.8-9-3.3-12.7ZM8.7 14.8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Zm6.6 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Z" />
    </svg>
  );
}
