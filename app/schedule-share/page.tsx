"use client";

import {
  AlertCircle,
  CalendarDays,
  Check,
  LoaderCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { APP_CONFIG } from "@/lib/config";
import {
  loadPublicScheduleShare,
  type PublicScheduleShare,
} from "@/lib/planner-data";
import { isSupabaseConfigured } from "@/lib/supabase";

function formatMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatOccurrence(value: string, timezone: string) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function Logo() {
  return (
    <div className="public-form-logo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ifgf-logo.png" alt={APP_CONFIG.logoAlt} />
      <div>
        <strong>{APP_CONFIG.name}</strong>
        <span>Jadwal pelayanan</span>
      </div>
    </div>
  );
}

export default function ScheduleSharePage() {
  const [schedule, setSchedule] = useState<PublicScheduleShare | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1))
      .get("token")
      ?.trim();
    const queryToken = new URLSearchParams(window.location.search)
      .get("token")
      ?.trim();
    const token = fragmentToken ?? queryToken ?? "";
    let active = true;

    void Promise.resolve().then(async () => {
      if (!active) return;
      if (!isSupabaseConfigured()) {
        setError("Jadwal belum terhubung ke database.");
        setState("error");
        return;
      }
      if (!token) {
        setError("Tautan jadwal tidak lengkap.");
        setState("error");
        return;
      }

      try {
        const result = await loadPublicScheduleShare(token);
        if (!active) return;
        if (!result) {
          setError("Tautan jadwal tidak valid atau sudah tidak tersedia.");
          setState("error");
          return;
        }
        setSchedule(result);
        setState("ready");
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Jadwal tidak dapat dibuka sekarang.",
        );
        setState("error");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <main className="public-schedule-page">
        <section className="public-schedule-shell public-schedule-state">
          <Logo />
          <LoaderCircle className="spin" size={30} />
          <p>Memuat jadwal...</p>
        </section>
      </main>
    );
  }

  if (state === "error" || !schedule) {
    return (
      <main className="public-schedule-page">
        <section className="public-schedule-shell public-schedule-state">
          <Logo />
          <span className="state-icon error"><AlertCircle size={26} /></span>
          <h1>Jadwal tidak tersedia</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="public-schedule-page">
      <section className="public-schedule-shell">
        <Logo />
        <header className="public-schedule-header">
          <div>
            <span className="eyebrow"><CalendarDays size={16} /> JADWAL DIBAGIKAN</span>
            <h1>{schedule.eventName}</h1>
            <p>{schedule.organizationName} • {formatMonth(schedule.month)}</p>
          </div>
          <span className="read-only-badge"><ShieldCheck size={15} /> Hanya lihat</span>
        </header>

        {!schedule.occurrences.length ? (
          <div className="public-schedule-empty">
            <CalendarDays size={28} />
            <h2>Belum ada tanggal kegiatan</h2>
            <p>Koordinator belum membuat tanggal untuk bulan ini.</p>
          </div>
        ) : !schedule.sections.length ? (
          <div className="public-schedule-empty">
            <Users size={28} />
            <h2>Belum ada bagian pelayanan</h2>
            <p>Koordinator belum mengatur kebutuhan tim untuk kegiatan ini.</p>
          </div>
        ) : (
          <>
            <div className="public-schedule-table-wrap">
              <table className="public-schedule-table">
                <thead>
                  <tr>
                    <th>Bagian pelayanan</th>
                    {schedule.occurrences.map((occurrence) => (
                      <th key={occurrence.startsAt}>
                        {formatOccurrence(occurrence.startsAt, schedule.timezone)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedule.sections.map((section) => (
                    <tr key={section.name}>
                      <th>
                        <strong>{section.name}</strong>
                        <span>{section.neededCount} pelayan diperlukan</span>
                      </th>
                      {schedule.occurrences.map((occurrence, index) => {
                        const names = section.volunteersByOccurrence[index] ?? [];
                        return (
                          <td key={occurrence.startsAt}>
                            {names.length ? names.map((name) => (
                              <span className="public-assignment" key={name}>
                                <Check size={14} /> {name}
                              </span>
                            )) : <span className="public-assignment empty">Belum ditugaskan</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="public-schedule-agenda">
              {schedule.occurrences.map((occurrence, occurrenceIndex) => (
                <article key={occurrence.startsAt}>
                  <header>
                    <CalendarDays size={18} />
                    <strong>{formatOccurrence(occurrence.startsAt, schedule.timezone)}</strong>
                  </header>
                  {schedule.sections.map((section) => {
                    const names = section.volunteersByOccurrence[occurrenceIndex] ?? [];
                    return (
                      <div key={section.name}>
                        <span>{section.name}</span>
                        <strong>{names.join(", ") || "Belum ditugaskan"}</strong>
                      </div>
                    );
                  })}
                </article>
              ))}
            </div>
          </>
        )}

        <footer className="public-schedule-footer">
          <ShieldCheck size={16} /> Tautan ini hanya menampilkan kegiatan dan bulan yang dipilih.
        </footer>
      </section>
    </main>
  );
}
