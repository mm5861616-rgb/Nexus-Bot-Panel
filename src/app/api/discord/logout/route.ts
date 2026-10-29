import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureDatabaseSchema, getDatabase } from "@/lib/database";
import {
  getPanelCookieName,
  hashSessionToken,
  isSamePanelOrigin,
} from "@/lib/discord-panel-auth";

export async function POST(request: Request) {
  if (!(await isSamePanelOrigin(request))) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 403 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(getPanelCookieName())?.value;
  if (sessionToken) {
    await ensureDatabaseSchema();
    await getDatabase()`
      DELETE FROM nexus_panel_sessions
      WHERE session_token_hash = ${hashSessionToken(sessionToken)}
    `;
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(getPanelCookieName());
  return response;
}
