import { NextResponse } from "next/server";
import { ensureDatabaseSchema } from "@/lib/database";
import {
  canManageGuild,
  getDiscordAccessToken,
  getDiscordGuilds,
  isSamePanelOrigin,
} from "@/lib/discord-panel-auth";
import { isPanelFeatureId, panelFeatures } from "@/lib/panel-features";

type RouteContext = { params: Promise<{ guildId: string }> };

async function authorizeGuild(guildId: string) {
  if (!/^\d{17,20}$/.test(guildId)) {
    return { response: NextResponse.json({ error: "Ungültiger Server." }, { status: 400 }) };
  }

  const accessToken = await getDiscordAccessToken();
  if (!accessToken) {
    return { response: NextResponse.json({ error: "Bitte melde dich erneut mit Discord an." }, { status: 401 }) };
  }

  const userGuilds = await getDiscordGuilds(accessToken);
  const guild = userGuilds.find((entry) => entry.id === guildId);
  if (!guild || !canManageGuild(guild)) {
    return { response: NextResponse.json({ error: "Du darfst diesen Server nicht verwalten." }, { status: 403 }) };
  }

  const database = await ensureDatabaseSchema();
  const [botGuild] = await database`
    SELECT guild_id FROM nexus_bot_guilds WHERE guild_id = ${guildId} LIMIT 1
  `;
  if (!botGuild) {
    return { response: NextResponse.json({ error: "Der Nexus Bot ist nicht auf diesem Server." }, { status: 404 }) };
  }

  return { database };
}

export async function GET(_request: Request, context: RouteContext) {
  const { guildId } = await context.params;
  try {
    const authorization = await authorizeGuild(guildId);
    if ("response" in authorization) return authorization.response;

    const settings = await authorization.database`
      SELECT feature, enabled
      FROM nexus_guild_feature_settings
      WHERE guild_id = ${guildId}
    `;
    const enabledByFeature = new Map(settings.map((setting) => [setting.feature, setting.enabled]));
    return NextResponse.json({
      features: panelFeatures.map((feature) => ({
        ...feature,
        enabled: enabledByFeature.get(feature.id) ?? true,
      })),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(`Nexus Panel: Funktionen für Server ${guildId} konnten nicht geladen werden:`, error);
    return NextResponse.json(
      { error: "Die Serverfunktionen konnten nicht geladen werden. Bitte versuche es erneut." },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isSamePanelOrigin(request))) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 403 });
  }

  const { guildId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("feature" in body) ||
    !("enabled" in body) ||
    !isPanelFeatureId(body.feature) ||
    typeof body.enabled !== "boolean"
  ) {
    return NextResponse.json({ error: "Ungültige Funktionseinstellung." }, { status: 400 });
  }

  try {
    const authorization = await authorizeGuild(guildId);
    if ("response" in authorization) return authorization.response;
    await authorization.database`
      INSERT INTO nexus_guild_feature_settings (guild_id, feature, enabled, updated_at)
      VALUES (${guildId}, ${body.feature}, ${body.enabled}, NOW())
      ON CONFLICT (guild_id, feature) DO UPDATE
      SET enabled = EXCLUDED.enabled, updated_at = NOW()
    `;
    return NextResponse.json({ feature: body.feature, enabled: body.enabled });
  } catch (error) {
    console.error(`Nexus Panel: Funktion ${String(body.feature)} konnte für Server ${guildId} nicht gespeichert werden:`, error);
    return NextResponse.json(
      { error: "Die Einstellung konnte nicht gespeichert werden. Bitte versuche es erneut." },
      { status: 502 },
    );
  }
}
