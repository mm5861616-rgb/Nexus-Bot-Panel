import { NextResponse } from "next/server";
import { ensureDatabaseSchema } from "@/lib/database";
import { getDiscordSession, isPanelAdmin } from "@/lib/discord-panel-auth";

export async function GET() {
  const identity = await getDiscordSession();
  if (!identity) {
    return NextResponse.json({ error: "Bitte melde dich erneut mit Discord an." }, { status: 401 });
  }
  if (!isPanelAdmin(identity)) {
    return NextResponse.json({ error: "Du hast keinen Zugriff auf die Bot-Administration." }, { status: 403 });
  }

  try {
    const database = await ensureDatabaseSchema();
    const [metadata] = await database`
      SELECT bot_user_id, bot_username, application_id, application_name,
        owner_type, owner_id, owner_name, owner_user_id, owner_user_name, updated_at
      FROM nexus_bot_metadata
      WHERE singleton_key = 'primary'
      LIMIT 1
    `;
    const servers = await database`
      SELECT guild_id, guild_name, guild_icon, updated_at
      FROM nexus_bot_guilds
      ORDER BY guild_name
    `;
    return NextResponse.json({ bot: metadata ?? null, servers }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Nexus Panel: Bot-Administration konnte nicht geladen werden:", error);
    return NextResponse.json(
      { error: "Die Bot-Administration konnte nicht geladen werden. Bitte versuche es erneut." },
      { status: 502 },
    );
  }
}
