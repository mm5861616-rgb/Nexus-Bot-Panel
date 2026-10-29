export const panelFeatures = [
  {
    id: "clear",
    name: "Nachrichten löschen",
    command: "/clear",
    description: "Löscht bis zu 100 aktuelle Nachrichten in einem Textkanal.",
  },
  {
    id: "kick",
    name: "Mitglieder kicken",
    command: "/kick",
    description: "Entfernt ein Mitglied vom Server.",
  },
  {
    id: "ban",
    name: "Mitglieder bannen",
    command: "/ban",
    description: "Bannt ein Mitglied vom Server.",
  },
  {
    id: "timeout",
    name: "Timeouts",
    command: "/timeout · /untimeout",
    description: "Vergibt oder entfernt einen Timeout für ein Mitglied.",
  },
  {
    id: "tickets",
    name: "Ticket-System",
    command: "/ticket-panel",
    description: "Erstellt Ticket-Panels und erlaubt Mitgliedern, Tickets zu öffnen.",
  },
] as const;

export type PanelFeatureId = (typeof panelFeatures)[number]["id"];

export function isPanelFeatureId(value: unknown): value is PanelFeatureId {
  return panelFeatures.some((feature) => feature.id === value);
}
