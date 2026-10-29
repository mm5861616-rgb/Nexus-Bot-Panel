import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createDiscordSession,
  getDiscordCredentials,
  getOAuthStateCookieName,
  getPanelBaseUrl,
  getPanelCookieName,
  isValidOAuthState,
} from "@/lib/discord-panel-auth";

type DiscordTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type DiscordUserResponse = {
  id: string;
  username: string;
  avatar: string | null;
};

function panelRedirect(path: string) {
  return NextResponse.redirect(new URL(path, getPanelBaseUrl()));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = getPanelBaseUrl();
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(getOAuthStateCookieName())?.value;
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code || !isValidOAuthState(stateCookie, state)) {
    const failedResponse = panelRedirect("/panel?login=failed");
    failedResponse.cookies.delete(getOAuthStateCookieName());
    return failedResponse;
  }

  const { clientId, clientSecret } = getDiscordCredentials();
  const redirectUri = `${baseUrl}/api/discord/callback`;
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) {
    console.error(`Discord OAuth token exchange failed with status ${tokenResponse.status}.`);
    const failedResponse = panelRedirect("/panel?login=failed");
    failedResponse.cookies.delete(getOAuthStateCookieName());
    return failedResponse;
  }

  const tokens = await tokenResponse.json() as DiscordTokenResponse;
  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store",
  });
  if (!userResponse.ok) {
    console.error(`Discord profile lookup failed with status ${userResponse.status}.`);
    const failedResponse = panelRedirect("/panel?login=failed");
    failedResponse.cookies.delete(getOAuthStateCookieName());
    return failedResponse;
  }

  const user = await userResponse.json() as DiscordUserResponse;
  const session = await createDiscordSession({
    user,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });
  const successResponse = panelRedirect("/panel");
  successResponse.cookies.set(getPanelCookieName(), session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: session.maxAge,
  });
  successResponse.cookies.delete(getOAuthStateCookieName());
  return successResponse;
}
