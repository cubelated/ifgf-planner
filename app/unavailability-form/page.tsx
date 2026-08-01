"use client";

import {
  AlertCircle,
  CalendarDays,
  Check,
  LoaderCircle,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { APP_CONFIG } from "@/lib/config";
import {
  loadPublicUnavailabilityForm,
  submitPublicUnavailability,
  type PublicUnavailabilityForm,
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

function formatSelectedDate(dateKey: string) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

function calendarCells(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const blanks = Array.from({ length: firstDay }, (_, index) => ({
    key: `blank-${index}`,
    date: null as string | null,
    day: null as number | null,
  }));
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return {
      key: `${monthKey}-${String(day).padStart(2, "0")}`,
      date: `${monthKey}-${String(day).padStart(2, "0")}`,
      day,
    };
  });
  return [...blanks, ...days];
}

function Logo() {
  return (
    <div className="public-form-logo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ifgf-logo.png" alt={APP_CONFIG.logoAlt} />
      <div><strong>{APP_CONFIG.name}</strong><span>Form ketidakhadiran relawan</span></div>
    </div>
  );
}

export default function UnavailabilityFormPage() {
  const [token, setToken] = useState("");
  const [form, setForm] = useState<PublicUnavailabilityForm | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "success">("loading");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [volunteerId, setVolunteerId] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token")?.trim();
    const requestToken = fragmentToken
      ?? new URLSearchParams(window.location.search).get("token")?.trim()
      ?? "";
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setToken(requestToken);
      if (!isSupabaseConfigured()) {
        setError("Formulir belum terhubung ke database.");
        setState("error");
        return;
      }
      if (!requestToken) {
        setError("Tautan formulir tidak lengkap.");
        setState("error");
        return;
      }

      try {
        const loadedForm = await loadPublicUnavailabilityForm(requestToken);
        if (!active) return;
        if (!loadedForm) {
          setError("Tautan formulir tidak valid, sudah ditutup, atau telah diganti.");
          setState("error");
          return;
        }
        setForm(loadedForm);
        setState("ready");
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Formulir tidak dapat dibuka.");
        setState("error");
      }
    });
    return () => { active = false; };
  }, []);

  const suggestions = useMemo(() => {
    if (!form || name.trim().length < 1) return [];
    const query = name.trim().toLocaleLowerCase("id-ID");
    return form.volunteers
      .filter((volunteer) => volunteer.name.toLocaleLowerCase("id-ID").includes(query))
      .slice(0, 6);
  }, [form, name]);

  function updateName(value: string) {
    setName(value);
    const normalized = value.trim().toLocaleLowerCase("id-ID");
    const exact = form?.volunteers.find(
      (volunteer) => volunteer.name.toLocaleLowerCase("id-ID") === normalized,
    );
    setVolunteerId(exact?.id ?? null);
    setSuggestionsOpen(true);
  }

  function selectVolunteer(id: string, fullName: string) {
    setName(fullName);
    setVolunteerId(id);
    setSuggestionsOpen(false);
  }

  function toggleDate(date: string) {
    setSelectedDates((current) => current.includes(date)
      ? current.filter((item) => item !== date)
      : [...current, date].sort());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Masukkan nama Anda.");
      return;
    }
    if (!selectedDates.length) {
      setError("Pilih setidaknya satu tanggal.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await submitPublicUnavailability({
        token,
        name,
        volunteerId,
        dates: selectedDates,
        reason,
      });
      setState("success");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Jawaban tidak dapat dikirim.");
    } finally {
      setSaving(false);
    }
  }

  if (state === "loading") {
    return <main className="public-form-page"><section className="public-form-shell public-form-state"><Logo /><LoaderCircle className="spin" size={30} /><p>Memuat formulir...</p></section></main>;
  }

  if (state === "error" && !form) {
    return <main className="public-form-page"><section className="public-form-shell public-form-state"><Logo /><span className="state-icon error"><AlertCircle size={26} /></span><h1>Formulir tidak tersedia</h1><p>{error}</p></section></main>;
  }

  if (state === "success" && form) {
    return (
      <main className="public-form-page">
        <section className="public-form-shell public-form-state public-form-success">
          <Logo />
          <span className="public-success-icon"><Check size={30} /></span>
          <h1>Jawaban berhasil dikirim</h1>
          <p><strong>{name.trim()}</strong> tercatat tidak tersedia pada {selectedDates.length} tanggal di {formatMonth(form.month)}.</p>
          <div className="public-selected-summary">{selectedDates.map((date) => <span key={date}>{formatSelectedDate(date)}</span>)}</div>
          <p className="public-form-privacy"><ShieldCheck size={16} /> Hanya koordinator yang dapat melihat laporan lengkap.</p>
        </section>
      </main>
    );
  }

  if (!form) return null;

  return (
    <main className="public-form-page">
      <section className="public-form-shell">
        <Logo />
        <header className="public-form-header">
          <span className="eyebrow"><CalendarDays size={16} /> PERMINTAAN KETERSEDIAAN</span>
          <h1>Tanggal berapa Anda tidak dapat melayani?</h1>
          <p>{form.organizationName} sedang mengumpulkan ketidakhadiran untuk <strong>{formatMonth(form.month)}</strong>.</p>
        </header>

        <form className="public-unavailability-form" onSubmit={submit}>
          <div className="public-name-field">
            <label htmlFor="respondent-name">Nama Anda</label>
            <div className="public-name-input"><Search size={18} /><input id="respondent-name" autoComplete="name" value={name} onChange={(event) => updateName(event.target.value)} onFocus={() => setSuggestionsOpen(true)} onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)} placeholder="Ketik atau pilih nama relawan" maxLength={120} required /></div>
            {suggestionsOpen && suggestions.length ? <div className="public-name-suggestions" role="listbox" aria-label="Pilihan relawan">{suggestions.map((volunteer) => <button key={volunteer.id} type="button" role="option" aria-selected={volunteer.id === volunteerId} onMouseDown={(event) => event.preventDefault()} onClick={() => selectVolunteer(volunteer.id, volunteer.name)}><span><UserRound size={16} /></span>{volunteer.name}{volunteer.id === volunteerId ? <Check size={15} /> : null}</button>)}</div> : null}
            {volunteerId ? <small className="name-match"><Check size={13} /> Terhubung ke daftar relawan</small> : name.trim().length >= 2 ? <small>Nama ini akan dikirim sebagai nama baru dan tidak mengubah daftar relawan.</small> : null}
          </div>

          <fieldset className="public-calendar-fieldset">
            <legend>Pilih tanggal yang tidak tersedia</legend>
            <div className="public-calendar-weekdays" aria-hidden="true">{["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="public-calendar-grid">{calendarCells(form.month).map((cell) => cell.date ? <button key={cell.key} type="button" className={selectedDates.includes(cell.date) ? "selected" : ""} onClick={() => toggleDate(cell.date!)} aria-pressed={selectedDates.includes(cell.date)} aria-label={`${cell.day} ${formatMonth(form.month)}`}>{cell.day}{selectedDates.includes(cell.date) ? <Check size={13} /> : null}</button> : <span key={cell.key} />)}</div>
            <p>{selectedDates.length ? `${selectedDates.length} tanggal dipilih` : "Belum ada tanggal dipilih"}</p>
          </fieldset>

          {selectedDates.length ? <div className="public-selected-summary">{selectedDates.map((date) => <button key={date} type="button" onClick={() => toggleDate(date)}>{formatSelectedDate(date)} <span aria-hidden="true">×</span></button>)}</div> : null}

          <label className="reason-field">Catatan untuk koordinator <span>(opsional)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Contoh: Sedang berada di luar kota" /></label>

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary button-block public-submit" type="submit" disabled={saving || !name.trim() || !selectedDates.length}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} {saving ? "Mengirim..." : "Konfirmasi ketidakhadiran"}</button>
          <p className="public-form-privacy"><ShieldCheck size={16} /> Memilih nama dari daftar akan langsung memblokir penugasan pada tanggal tersebut.</p>
        </form>
      </section>
    </main>
  );
}
