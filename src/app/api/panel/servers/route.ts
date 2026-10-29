import { NextResponse } from "next/server";
import { ensureDatabaseSchema } from "@/lib/database";
import {
  canManageGuild,
  getDiscordCredentials,
  getDiscordAccessToken,
  getDiscordGuilds,
} from "@/lib/discord-panel-auth";

export async function GET() {
  const accessToken = await getDiscordAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Bitte melde dich erneut mit Discord an." }, { status: 401 });
  }

  try {
    const userGuilds = await getDiscordGuilds(accessToken);
    const manageableGuilds = userGuilds.filter(canManageGuild);
    const { clientId } = getDiscordCredentials();
    const database = await ensureDatabaseSchema();
    const botGuilds = await database`
      SELECT guild_id, guild_name, guild_icon
      FROM nexus_bot_guilds
    `;
    const installedGuildIds = new Set(botGuilds.map((guild) => guild.guild_id));

    return NextResponse.json({
      servers: manageableGuilds
        .map((guild) => {
          const botGuild = botGuilds.find((entry) => entry.guild_id === guild.id);
          const icon = botGuild?.guild_icon ?? guild.icon;
          return {
            id: guild.id,
            name: botGuild?.guild_name ?? guild.name,
            iconUrl: icon
              ? `https://cdn.discordapp.com/icons/${guild.id}/${icon}.${icon.startsWith("a_") ? "gif" : "png"}?size=64`
              : null,
            botInstalled: installedGuildIds.has(guild.id),
            inviteUrl: `https://discord.com/oauth2/authorize?${new URLSearchParams({
              client_id: clientId,
              scope: "bot applications.commands",
              permissions: "1101659208430",
              guild_id: guild.id,
              disable_guild_select: "true",
            })}`,
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name)),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Nexus Panel: Serverliste konnte nicht geladen werden:", error);
    return NextResponse.json(
      { error: "Die Discord-Serverliste konnte nicht geladen werden. Bitte versuche es erneut." },
      { status: 502 },
    );
  }
}
