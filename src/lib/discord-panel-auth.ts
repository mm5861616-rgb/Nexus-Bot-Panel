import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { ensureDatabaseSchema, getDatabase } from "@/lib/database";

const SESSION_COOKIE = "nexus-panel-session";
const STATE_COOKIE = "nexus-discord-oauth-state";
const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;
const PANEL_ADMIN_DISCORD_ID = "1030398392968425522";

type PanelSession = {
  session_token_hash: string;
  discord_user_id: string;
  username: string;
  avatar: string | null;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: Date;
  session_expires_at: Date;
};

export type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
  owner?: boolean;
};

export type PanelIdentity = {
  id: string;
  username: string;
  avatar: string | null;
};

export function isPanelAdmin(identity: PanelIdentity) {
  return identity.id === PANEL_ADMIN_DISCORD_ID;
}

export function getPanelBaseUrl() {
  const value = process.env.NEXUS_PANEL_URL;
  if (!value) {
    throw new Error("NEXUS_PANEL_URL must be set to the public base URL of the Nexus website.");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("NEXUS_PANEL_URL must use HTTPS outside local development.");
  }
  return url.origin;
}

export function getDiscordCredentials() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET for Discord OAuth.");
  }
  return { clientId, clientSecret };
}

function getSessionSecret() {
  const secret = process.env.NEXUS_PANEL_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("NEXUS_PANEL_SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function getEncryptionKey() {
  return createHash("sha256").update(getSessionSecret()).digest();
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(value: string) {
  const [encodedIv, encodedTag, encodedData, extra] = value.split(".");
  if (!encodedIv || !encodedTag || !encodedData || extra) {
    throw new Error("Stored Discord token has an invalid encrypted format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedData, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function signState(state: string) {
  return createHmac("sha256", getSessionSecret()).update(state).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function createOAuthState() {
  const state = randomBytes(32).toString("base64url");
  return `${state}.${signState(state)}`;
}

export function isValidOAuthState(cookieValue: string | undefined, state: string | null) {
  if (!cookieValue || !state) return false;
  const [cookieState, signature, extra] = cookieValue.split(".");
  if (!cookieState || !signature || extra || !safeEqual(cookieState, state)) return false;
  return safeEqual(signature, signState(cookieState));
}

export function getOAuthStateCookieName() {
  return STATE_COOKIE;
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createDiscordSession(input: {
  user: PanelIdentity;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  const token = randomBytes(32).toString("base64url");
  const database = await ensureDatabaseSchema();
  await database`DELETE FROM nexus_panel_sessions WHERE session_expires_at <= NOW()`;
  await database`
    INSERT INTO nexus_panel_sessions (
      session_token_hash, discord_user_id, username, avatar,
      access_token_encrypted, refresh_token_encrypted, access_token_expires_at, session_expires_at
    )
    VALUES (
      ${hashSessionToken(token)}, ${input.user.id}, ${input.user.username}, ${input.user.avatar},
      ${encryptToken(input.accessToken)}, ${encryptToken(input.refreshToken)},
      ${new Date(Date.now() + input.expiresIn * 1000)},
      ${new Date(Date.now() + SESSION_DURATION_SECONDS * 1000)}
    )
  `;
  return { token, maxAge: SESSION_DURATION_SECONDS };
}

async function findSession(token: string): Promise<PanelSession | null> {
  await ensureDatabaseSchema();
  const database = getDatabase();
  const [session] = await database<PanelSession[]>`
    SELECT session_token_hash, discord_user_id, username, avatar,
      access_token_encrypted AS access_token, refresh_token_encrypted AS refresh_token,
      access_token_expires_at, session_expires_at
    FROM nexus_panel_sessions
    WHERE session_token_hash = ${hashSessionToken(token)}
      AND session_expires_at > NOW()
    LIMIT 1
  `;
  return session ?? null;
}

export async function getDiscordSession(): Promise<PanelIdentity | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await findSession(token);
  if (!session) return null;
  return {
    id: session.discord_user_id,
    username: session.username,
    avatar: session.avatar,
  };
}

export async function getDiscordAccessToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await findSession(token);
  if (!session) return null;

  if (session.access_token_expires_at.getTime() > Date.now() + 60_000) {
    return decryptToken(session.access_token);
  }

  const { clientId, clientSecret } = getDiscordCredentials();
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptToken(session.refresh_token),
    }),
    cache: "no-store",
  });

  if (response.status === 400 || response.status === 401) {
    const database = getDatabase();
    await database`
      DELETE FROM nexus_panel_sessions
      WHERE session_token_hash = ${session.session_token_hash}
    `;
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }
  if (!response.ok) {
    throw new Error(`Discord token refresh failed with status ${response.status}.`);
  }

  const tokenData = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  await getDatabase()`
    UPDATE nexus_panel_sessions
    SET access_token_encrypted = ${encryptToken(tokenData.access_token)},
      refresh_token_encrypted = ${encryptToken(tokenData.refresh_token)},
      access_token_expires_at = ${new Date(Date.now() + tokenData.expires_in * 1000)}
    WHERE session_token_hash = ${session.session_token_hash}
  `;
  return tokenData.access_token;
}

export async function getDiscordGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const response = await fetch("https://discord.com/api/users/@me/guilds?limit=200", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Discord server lookup failed with status ${response.status}.`);
  }
  return await response.json() as DiscordGuild[];
}

export function canManageGuild(guild: DiscordGuild) {
  try {
    const permissions = BigInt(guild.permissions);
    return Boolean(guild.owner) ||
      (permissions & BigInt(0x8)) !== BigInt(0) ||
      (permissions & BigInt(0x20)) !== BigInt(0);
  } catch {
    return false;
  }
}

export async function isSamePanelOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === getPanelBaseUrl();
}

export function getPanelCookieName() {
  return SESSION_COOKIE;
}
