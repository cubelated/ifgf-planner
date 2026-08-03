import { APP_CONFIG } from "./config";

export const defaultLocale = "id" as const;

export const messages = {
  id: {
    appName: APP_CONFIG.name,
    overview: "Ringkasan",
    schedule: "Jadwal",
    events: "Kegiatan",
    volunteers: "Pelayan",
    unavailability: "Ketidakhadiran",
    notifications: "Notifikasi",
    settings: "Pengaturan",
    signOut: "Keluar",
    search: "Cari",
    coordinator: "Koordinator",
  },
} as const;

export type Locale = keyof typeof messages;
export type MessageKey = keyof (typeof messages)[typeof defaultLocale];

export function translate(key: MessageKey, locale: Locale = defaultLocale) {
  return messages[locale][key];
}
