import { NextResponse } from "next/server";
import {
  createOAuthState,
  getDiscordCredentials,
  getOAuthStateCookieName,
  getPanelBaseUrl,
} from "@/lib/discord-panel-auth";

export async function GET() {
  const { clientId } = getDiscordCredentials();
  const state = createOAuthState();
  const callback = `${getPanelBaseUrl()}/api/discord/callback`;
  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    scope: "identify guilds",
    state: state.split(".")[0],
  }).toString();

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(getOAuthStateCookieName(), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
