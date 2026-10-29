import postgres from "postgres";

declare global {
  var nexusSql: ReturnType<typeof postgres> | undefined;
  var nexusSchemaReady: Promise<void> | undefined;
}

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("Set DATABASE_URL or POSTGRES_URL to the connection string from your Neon project.");
  }

  globalThis.nexusSql ??= postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
  });
  return globalThis.nexusSql;
}

export async function ensureDatabaseSchema() {
  if (!globalThis.nexusSchemaReady) {
    const sql = getDatabase();
    globalThis.nexusSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS nexus_download_stats (
          slug TEXT PRIMARY KEY,
          downloads BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS nexus_resources (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL CHECK (category IN ('FiveM', 'Discord Bots', 'Roblox')),
          translations JSONB NOT NULL,
          author TEXT NOT NULL,
          tags JSONB NOT NULL,
          version TEXT NOT NULL,
          requirement TEXT NOT NULL,
          download_url TEXT NOT NULL,
          page_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS nexus_admin_login_attempts (
          address_hash TEXT NOT NULL,
          attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS nexus_admin_login_attempts_recent
        ON nexus_admin_login_attempts (address_hash, attempted_at DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS nexus_panel_sessions (
          session_token_hash TEXT PRIMARY KEY,
          discord_user_id TEXT NOT NULL,
          username TEXT NOT NULL,
          avatar TEXT,
          access_token_encrypted TEXT NOT NULL,
          refresh_token_encrypted TEXT NOT NULL,
          access_token_expires_at TIMESTAMPTZ NOT NULL,
          session_expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS nexus_panel_sessions_expiry
        ON nexus_panel_sessions (session_expires_at)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS nexus_bot_guilds (
          guild_id TEXT PRIMARY KEY,
          guild_name TEXT NOT NULL,
          guild_icon TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS nexus_bot_metadata (
          singleton_key TEXT PRIMARY KEY CHECK (singleton_key = 'primary'),
          bot_user_id TEXT NOT NULL,
          bot_username TEXT NOT NULL,
          application_id TEXT NOT NULL,
          application_name TEXT NOT NULL,
          owner_type TEXT,
          owner_id TEXT,
          owner_name TEXT,
          owner_user_id TEXT,
          owner_user_name TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        ALTER TABLE nexus_bot_metadata
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT
      `;
      await sql`
        ALTER TABLE nexus_bot_metadata
        ADD COLUMN IF NOT EXISTS owner_user_name TEXT
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS nexus_guild_feature_settings (
          guild_id TEXT NOT NULL,
          feature TEXT NOT NULL,
          enabled BOOLEAN NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (guild_id, feature)
        )
      `;
    })().catch((error: unknown) => {
      globalThis.nexusSchemaReady = undefined;
      throw error;
    });
  }
  await globalThis.nexusSchemaReady;
  return getDatabase();
}
