"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./panel.module.css";
import type { PanelIdentity } from "@/lib/discord-panel-auth";

type PanelServer = {
  id: string;
  name: string;
  iconUrl: string | null;
  botInstalled: boolean;
  inviteUrl: string;
};

type Feature = {
  id: string;
  name: string;
  command: string;
  description: string;
  enabled: boolean;
};

type BotMetadata = {
  bot_user_id: string;
  bot_username: string;
  application_id: string;
  application_name: string;
  owner_type: "user" | "team" | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_user_id: string | null;
  owner_user_name: string | null;
  updated_at: string;
};

type AdminServer = {
  guild_id: string;
  guild_name: string;
  guild_icon: string | null;
  updated_at: string;
};

type PanelDashboardProps = { identity: PanelIdentity; isAdmin: boolean };

export default function PanelDashboard({ identity, isAdmin }: PanelDashboardProps) {
  const router = useRouter();
  const [servers, setServers] = useState<PanelServer[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [features, setFeatures] = useState<Feature[]>([]);
  const [featuresServerId, setFeaturesServerId] = useState("");
  const [loadingServers, setLoadingServers] = useState(true);
  const [pendingFeature, setPendingFeature] = useState("");
  const [error, setError] = useState("");
  const [adminData, setAdminData] = useState<{ bot: BotMetadata | null; servers: AdminServer[] } | null>(null);
  const [adminError, setAdminError] = useState("");

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedId) ?? null,
    [servers, selectedId],
  );
  const loadingFeatures = Boolean(selectedServer?.botInstalled && featuresServerId !== selectedServer.id);
  const loadingAdminData = isAdmin && adminData === null && adminError === "";
  const botMissingServers = servers.filter((server) => !server.botInstalled);

  useEffect(() => {
    let active = true;
    fetch("/api/panel/servers", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { servers?: PanelServer[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Server konnten nicht geladen werden.");
        if (!active) return;
        const loadedServers = data.servers ?? [];
        setServers(loadedServers);
        setSelectedId(loadedServers.find((server) => server.botInstalled)?.id ?? loadedServers[0]?.id ?? "");
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Server konnten nicht geladen werden.");
      })
      .finally(() => {
        if (active) setLoadingServers(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    fetch("/api/panel/admin", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as {
          bot?: BotMetadata | null;
          servers?: AdminServer[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Bot-Administration konnte nicht geladen werden.");
        if (active) setAdminData({ bot: data.bot ?? null, servers: data.servers ?? [] });
      })
      .catch((cause: unknown) => {
        if (active) setAdminError(cause instanceof Error ? cause.message : "Bot-Administration konnte nicht geladen werden.");
      })
    return () => { active = false; };
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedServer?.botInstalled) {
      return;
    }

    const controller = new AbortController();
    fetch(`/api/panel/servers/${selectedServer.id}/features`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as { features?: Feature[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Funktionen konnten nicht geladen werden.");
        setFeatures(data.features ?? []);
        setFeaturesServerId(selectedServer.id);
        setError("");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setFeatures([]);
          setFeaturesServerId(selectedServer.id);
          setError(cause instanceof Error ? cause.message : "Funktionen konnten nicht geladen werden.");
        }
      })
    return () => controller.abort();
  }, [selectedServer]);

  async function toggleFeature(feature: Feature) {
    if (!selectedServer || pendingFeature) return;
    setPendingFeature(feature.id);
    setError("");
    try {
      const response = await fetch(`/api/panel/servers/${selectedServer.id}/features`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature: feature.id, enabled: !feature.enabled }),
      });
      const data = await response.json() as { enabled?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Die Einstellung konnte nicht gespeichert werden.");
      setFeatures((current) => current.map((item) =>
        item.id === feature.id ? { ...item, enabled: data.enabled ?? item.enabled } : item,
      ));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Einstellung konnte nicht gespeichert werden.");
    } finally {
      setPendingFeature("");
    }
  }

  async function logout() {
    const response = await fetch("/api/discord/logout", { method: "POST" });
    if (response.ok) {
      router.push("/panel");
      router.refresh();
    }
    else setError("Die Abmeldung ist fehlgeschlagen. Bitte lade die Seite neu.");
  }

  return (
    <section className={styles.dashboard}>
      <div className={styles.welcomeRow}>
        <div>
          <span className={styles.eyebrow}>NEXUS BOT · KONTROLLZENTRUM</span>
          <h1>Server Panel</h1>
          <p>{isAdmin ? "Bot-Administration und Serverfunktionen verwalten." : "Verwalte Bot-Funktionen für die Server, die du administrierst."}</p>
        </div>
        <div className={styles.userCard}>
          {identity.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.userAvatar} src={`https://cdn.discordapp.com/avatars/${identity.id}/${identity.avatar}.png?size=64`} alt="" />
          ) : <span className={styles.userAvatarFallback}>{identity.username.slice(0, 1).toUpperCase()}</span>}
          <span>{identity.username}</span>
          {isAdmin && <span className={styles.accountBadge}>BOT ADMIN</span>}
          <button type="button" onClick={logout}>Abmelden</button>
        </div>
      </div>

      {isAdmin && (
        <section className={styles.adminOverview} aria-labelledby="admin-overview-title">
          <div className={styles.adminOverviewHeader}>
            <div>
              <span className={styles.eyebrow}>NUR FÜR BOT-ADMIN</span>
              <h2 id="admin-overview-title">Bot-Übersicht</h2>
            </div>
            <span className={styles.adminBadge}>ADMIN</span>
          </div>
          {adminError && <p className={styles.error} role="alert">{adminError}</p>}
          {loadingAdminData ? <p className={styles.muted}>Bot-Informationen werden geladen …</p> : adminData ? (
            <div className={styles.adminOverviewGrid}>
              <div className={styles.adminMeta}>
                <span>BOT-BESITZER</span>
                <strong>{adminData.bot?.owner_name ?? "Noch nicht synchronisiert"}</strong>
                <small>
                  {adminData.bot?.owner_id
                    ? `${adminData.bot.owner_type === "team" ? "Team-ID" : "Discord-ID"}: ${adminData.bot.owner_id}`
                    : "Starte den aktualisierten Bot, um den Besitzer zu synchronisieren."}
                </small>
                {adminData.bot?.owner_type === "team" && adminData.bot.owner_user_id && (
                  <small>
                    Team-Owner: {adminData.bot.owner_user_name ?? "Unbekannt"} · Discord-ID: {adminData.bot.owner_user_id}
                  </small>
                )}
                {adminData.bot && (
                  <small>Bot: {adminData.bot.bot_username} · Application ID: {adminData.bot.application_id}</small>
                )}
              </div>
              <div className={styles.adminServerSummary}>
                <div className={styles.adminServerSummaryHeader}>
                  <div><span>BOT-SERVER</span><strong>{adminData.servers.length}</strong></div>
                  <span className={styles.adminServerSync}>
                    {adminData.bot ? `Zuletzt aktualisiert ${new Date(adminData.bot.updated_at).toLocaleString("de-DE")}` : "Wartet auf Bot-Synchronisierung"}
                  </span>
                </div>
                {adminData.servers.length ? (
                  <ul className={styles.adminServerList}>
                    {adminData.servers.map((server) => (
                      <li key={server.guild_id}>
                        <ServerIcon server={{
                          id: server.guild_id,
                          name: server.guild_name,
                          iconUrl: server.guild_icon
                            ? `https://cdn.discordapp.com/icons/${server.guild_id}/${server.guild_icon}.${server.guild_icon.startsWith("a_") ? "gif" : "png"}?size=64`
                            : null,
                          botInstalled: true,
                          inviteUrl: "",
                        }} />
                        <span><strong>{server.guild_name}</strong><small>{server.guild_id}</small></span>
                      </li>
                    ))}
                  </ul>
                ) : <p className={styles.muted}>Der Bot hat noch keine Server synchronisiert.</p>}
              </div>
            </div>
          ) : null}
        </section>
      )}

      <div className={styles.panelGrid}>
        <aside className={styles.serverPanel}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>DEINE SERVER</span><h2>Server auswählen</h2></div>
            <span className={styles.serverCount}>{servers.length}</span>
          </div>
          {loadingServers ? <p className={styles.muted}>Server werden geladen …</p> : null}
          {!loadingServers && servers.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>⌂</span>
              <b>Keine verwaltbaren Server</b>
              <p>Du brauchst auf einem Server die Berechtigung „Server verwalten“.</p>
            </div>
          ) : null}
          <div className={styles.serverList}>
            {servers.map((server) => (
              <button
                className={`${styles.serverButton} ${selectedId === server.id ? styles.serverButtonSelected : ""}`}
                key={server.id}
                onClick={() => {
                  setSelectedId(server.id);
                  setError("");
                }}
                type="button"
              >
                <ServerIcon server={server} />
                <span className={styles.serverName}>{server.name}</span>
                <span className={server.botInstalled ? styles.statusDot : styles.statusDotMissing} title={server.botInstalled ? "Bot ist installiert" : "Bot fehlt"} />
              </button>
            ))}
          </div>
          {botMissingServers.length > 0 && (
            <div className={styles.installHint}>
              <span className={styles.installIcon}>+</span>
              <div><b>Bot fehlt?</b><p>Wähle einen Server aus und füge Nexus hinzu.</p></div>
            </div>
          )}
        </aside>

        <section className={styles.featurePanel}>
          {selectedServer ? (
            <>
              <div className={styles.serverHeader}>
                <ServerIcon server={selectedServer} large />
                <div>
                  <span className={styles.eyebrow}>SERVER EINSTELLUNGEN</span>
                  <h2>{selectedServer.name}</h2>
                </div>
                <span className={selectedServer.botInstalled ? styles.installedBadge : styles.missingBadge}>
                  <i />{selectedServer.botInstalled ? "Bot aktiv" : "Bot nicht installiert"}
                </span>
              </div>
              {error && <p className={styles.error} role="alert">{error}</p>}
              {!selectedServer.botInstalled ? (
                <div className={styles.installCard}>
                  <div className={styles.installCardIcon}>N</div>
                  <h3>Verbinde Nexus Bot mit diesem Server</h3>
                  <p>Nach der Installation erscheint der Server hier mit seinen verwaltbaren Bot-Funktionen.</p>
                  <a className={styles.primaryButton} href={selectedServer.inviteUrl} target="_blank" rel="noreferrer">Nexus Bot hinzufügen <span aria-hidden="true">↗</span></a>
                </div>
              ) : (
                <>
                  <div className={styles.featureIntro}>
                    <div><h3>Bot-Funktionen</h3><p>Änderungen werden sofort für diesen Server übernommen.</p></div>
                    <span className={styles.featureCount}>{features.filter((feature) => feature.enabled).length} / {features.length} aktiv</span>
                  </div>
                  {loadingFeatures ? <p className={styles.muted}>Einstellungen werden geladen …</p> : (
                    <div className={styles.featureList}>
                      {features.map((feature) => (
                        <article className={styles.featureRow} key={feature.id}>
                          <div className={styles.featureCopy}>
                            <div className={styles.featureTitle}>
                              <h4>{feature.name}</h4>
                              <code>{feature.command}</code>
                            </div>
                            <p>{feature.description}</p>
                          </div>
                          <button
                            className={`${styles.toggle} ${feature.enabled ? styles.toggleOn : ""}`}
                            type="button"
                            role="switch"
                            aria-checked={feature.enabled}
                            aria-label={`${feature.name} ${feature.enabled ? "deaktivieren" : "aktivieren"}`}
                            disabled={pendingFeature !== "" || loadingFeatures}
                            onClick={() => void toggleFeature(feature)}
                          >
                            <span />
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                  <div className={styles.permissionNote}>
                    <span>i</span>
                    <p>Discord-Berechtigungen bleiben aktiv: Moderationsbefehle können weiterhin nur Personen mit den passenden Serverrechten ausführen.</p>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className={styles.emptyFeature}>
              <span className={styles.emptyIcon}>⌂</span>
              <h2>Wähle einen Server</h2>
              <p>Die Nexus Bot Einstellungen werden hier angezeigt.</p>
            </div>
          )}
        </section>
      </div>
      <footer className={styles.footer}>
        <span>NEXUS STUDIOS</span>
        <span>Deine Einstellungen werden sicher gespeichert.</span>
      </footer>
    </section>
  );
}

function ServerIcon({ server, large = false }: { server: PanelServer; large?: boolean }) {
  return server.iconUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={large ? styles.serverIconLarge : styles.serverIcon} src={server.iconUrl} alt="" />
  ) : (
    <span className={large ? styles.serverIconFallbackLarge : styles.serverIconFallback}>
      {server.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
