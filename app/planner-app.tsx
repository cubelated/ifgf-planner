"use client";

import {
  AlertCircle,
  Bell,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserRound,
  Users,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { APP_CONFIG } from "@/lib/config";
import { translate, type MessageKey } from "@/lib/i18n";

type View =
  | "overview"
  | "schedule"
  | "events"
  | "volunteers"
  | "unavailability"
  | "notifications"
  | "settings";

type EventGroup = {
  id: number;
  name: string;
  cadence: string;
  nextDate: string;
  sections: number;
  tone: "blue" | "violet" | "teal" | "amber";
};

const NAV_ITEMS: Array<{
  key: View;
  label: MessageKey;
  icon: LucideIcon;
  badge?: number;
}> = [
  { key: "overview", label: "overview", icon: LayoutDashboard },
  { key: "schedule", label: "schedule", icon: CalendarDays, badge: 2 },
  { key: "events", label: "events", icon: CalendarCheck },
  { key: "volunteers", label: "volunteers", icon: Users },
  {
    key: "unavailability",
    label: "unavailability",
    icon: UserRound,
    badge: 3,
  },
  { key: "notifications", label: "notifications", icon: Bell },
];

const INITIAL_EVENTS: EventGroup[] = [
  {
    id: 1,
    name: "Sunday Service",
    cadence: "Setiap Minggu • 09.00",
    nextDate: "2 Agustus 2026",
    sections: 6,
    tone: "blue",
  },
  {
    id: 2,
    name: "Doa Sabtu",
    cadence: "Minggu ke-1 & 3 • 18.30",
    nextDate: "15 Agustus 2026",
    sections: 3,
    tone: "violet",
  },
  {
    id: 3,
    name: "Komsel Rabu",
    cadence: "Setiap Rabu • 19.00",
    nextDate: "5 Agustus 2026",
    sections: 2,
    tone: "teal",
  },
];

const VOLUNTEERS = [
  {
    name: "Alicia Tan",
    initials: "AT",
    sections: ["Worship", "Vokal"],
    events: "Sunday Service",
    served: 3,
    status: "Aktif",
  },
  {
    name: "Budi Santoso",
    initials: "BS",
    sections: ["Usher", "Multimedia"],
    events: "Sunday Service, Doa Sabtu",
    served: 2,
    status: "Aktif",
  },
  {
    name: "Christina Lim",
    initials: "CL",
    sections: ["Kids", "Usher"],
    events: "Sunday Service",
    served: 4,
    status: "Aktif",
  },
  {
    name: "Daniel Wijaya",
    initials: "DW",
    sections: ["Worship", "Multimedia"],
    events: "Sunday Service, Komsel Rabu",
    served: 2,
    status: "Aktif",
  },
  {
    name: "Evelyn Hartono",
    initials: "EH",
    sections: ["Prayer", "Vokal"],
    events: "Doa Sabtu, Komsel Rabu",
    served: 1,
    status: "Istirahat",
  },
];

const ABSENCE_DATES = [
  { day: "Min", date: "02", month: "Agu" },
  { day: "Rab", date: "05", month: "Agu" },
  { day: "Sab", date: "08", month: "Agu" },
  { day: "Min", date: "09", month: "Agu" },
  { day: "Rab", date: "12", month: "Agu" },
  { day: "Sab", date: "15", month: "Agu" },
];

const SCHEDULE_COLUMNS = [
  { day: "Min, 2 Agu", event: "Sunday Service" },
  { day: "Min, 9 Agu", event: "Sunday Service" },
  { day: "Sab, 15 Agu", event: "Doa Sabtu" },
];

const SCHEDULE_ROWS = [
  {
    section: "Worship",
    count: "2 orang",
    cells: [
      ["Alicia Tan", "Daniel Wijaya"],
      ["Alicia Tan", "Perlu relawan"],
      ["Evelyn Hartono"],
    ],
  },
  {
    section: "Usher",
    count: "2 orang",
    cells: [
      ["Budi Santoso", "Christina Lim"],
      ["Budi Santoso", "Christina Lim"],
      ["Perlu relawan"],
    ],
  },
  {
    section: "Multimedia",
    count: "1 orang",
    cells: [["Budi Santoso"], ["Daniel Wijaya"], ["Budi Santoso"]],
  },
  {
    section: "Kids",
    count: "2 orang",
    cells: [
      ["Christina Lim", "Grace Ho"],
      ["Grace Ho", "Perlu relawan"],
      ["—"],
    ],
  },
];

function Logo({ large = false }: { large?: boolean }) {
  return (
    <div className={large ? "logo-crop logo-crop-large" : "logo-crop"}>
      {/* The supplied asset intentionally has generous transparent padding. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ifgf-logo.png" alt={APP_CONFIG.logoAlt} />
    </div>
  );
}

function Avatar({ initials, tone = 0 }: { initials: string; tone?: number }) {
  return <span className={`avatar avatar-${tone % 5}`}>{initials}</span>;
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

export default function PlannerApp() {
  const configured = isSupabaseConfigured();
  const [authenticated, setAuthenticated] = useState(!configured);
  const [view, setView] = useState<View>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [eventDialog, setEventDialog] = useState(false);
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [toast, setToast] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [loginState, setLoginState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, [configured]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setAuthenticated(true);
      return;
    }

    setLoginState("sending");
    setLoginError("");
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setLoginState("error");
      setLoginError(error.message);
      return;
    }
    setLoginState("sent");
  }

  async function handleLogout() {
    if (configured) await getSupabaseBrowserClient().auth.signOut();
    setAuthenticated(false);
    setView("overview");
  }

  function showToast(message: string) {
    setToast(null);
    window.setTimeout(() => setToast(message), 20);
  }

  if (!authenticated) {
    return (
      <LoginScreen
        configured={configured}
        email={email}
        setEmail={setEmail}
        loginState={loginState}
        loginError={loginError}
        onSubmit={handleLogin}
        onDemo={() => setAuthenticated(true)}
      />
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Lewati ke konten utama
      </a>
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Logo />
          <div>
            <strong>{APP_CONFIG.name}</strong>
            <span>{APP_CONFIG.workspaceLabel}</span>
          </div>
          <button
            type="button"
            className="icon-button sidebar-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Tutup menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="side-nav" aria-label="Navigasi utama">
          <p className="nav-caption">RUANG KERJA</p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={view === item.key ? "nav-item active" : "nav-item"}
                onClick={() => {
                  setView(item.key);
                  setMenuOpen(false);
                }}
              >
                <Icon size={19} strokeWidth={1.9} />
                <span>{translate(item.label)}</span>
                {item.badge ? <b>{item.badge}</b> : null}
              </button>
            );
          })}
          <p className="nav-caption nav-caption-second">SISTEM</p>
          <button
            type="button"
            className={view === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setView("settings");
              setMenuOpen(false);
            }}
          >
            <Settings size={19} strokeWidth={1.9} />
            <span>{translate("settings")}</span>
          </button>
        </nav>

        <div className="sidebar-account">
          <Avatar initials="HW" tone={1} />
          <div>
            <strong>Hanssen Wijaya</strong>
            <span>{translate("coordinator")}</span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={handleLogout}
            aria-label={translate("signOut")}
            title={translate("signOut")}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {menuOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Tutup menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Buka menu"
          >
            <Menu size={22} />
          </button>
          <div className="mobile-brand">
            <strong>{APP_CONFIG.name}</strong>
          </div>
          <label className="global-search">
            <Search size={18} />
            <span className="sr-only">Cari relawan, kegiatan, atau jadwal</span>
            <input placeholder="Cari relawan, kegiatan, atau jadwal..." />
            <kbd>⌘ K</kbd>
          </label>
          <div className="topbar-actions">
            {!configured ? <span className="demo-badge">Mode demo</span> : null}
            <button type="button" className="icon-button" aria-label="Bantuan">
              <CircleHelp size={20} />
            </button>
            <button
              type="button"
              className="icon-button notification-button"
              aria-label="Notifikasi baru"
              onClick={() => setView("notifications")}
            >
              <Bell size={20} />
              <span />
            </button>
          </div>
        </header>

        <main id="main-content" className="content">
          {view === "overview" ? (
            <Overview
              onNavigate={setView}
              onAddEvent={() => setEventDialog(true)}
              showToast={showToast}
            />
          ) : null}
          {view === "schedule" ? <Schedule showToast={showToast} /> : null}
          {view === "events" ? (
            <Events events={events} onAdd={() => setEventDialog(true)} />
          ) : null}
          {view === "volunteers" ? <Volunteers /> : null}
          {view === "unavailability" ? (
            <Unavailability showToast={showToast} />
          ) : null}
          {view === "notifications" ? (
            <Notifications showToast={showToast} />
          ) : null}
          {view === "settings" ? <SettingsView /> : null}
        </main>
      </div>

      {eventDialog ? (
        <EventDialog
          onClose={() => setEventDialog(false)}
          onSave={(newEvent) => {
            setEvents((current) => [...current, newEvent]);
            setEventDialog(false);
            setView("events");
            showToast("Kegiatan baru berhasil ditambahkan.");
          }}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          <span className="toast-check">
            <Check size={16} />
          </span>
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Tutup">
            <X size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function LoginScreen({
  configured,
  email,
  setEmail,
  loginState,
  loginError,
  onSubmit,
  onDemo,
}: {
  configured: boolean;
  email: string;
  setEmail: (email: string) => void;
  loginState: "idle" | "sending" | "sent" | "error";
  loginError: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDemo: () => void;
}) {
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand">
          <Logo large />
          <div>
            <strong>{APP_CONFIG.name}</strong>
            <span>{APP_CONFIG.tagline}</span>
          </div>
        </div>
        <div className="story-copy">
          <span className="eyebrow eyebrow-dark">
            <Sparkles size={16} /> SATU TEMPAT UNTUK TIM PELAYANAN
          </span>
          <h1>Rencanakan pelayanan tanpa bentrok.</h1>
          <p>
            Kelola jadwal, ketidakhadiran, dan komunikasi relawan dengan lebih
            tenang—supaya tim dapat fokus melayani.
          </p>
          <div className="story-points">
            <div>
              <CalendarCheck />
              <span>
                <strong>Jadwal yang jelas</strong>
                Semua pelayanan dalam satu kalender
              </span>
            </div>
            <div>
              <WandSparkles />
              <span>
                <strong>Otomatis, tetap terkendali</strong>
                Draft dibuat sistem, keputusan tetap pada koordinator
              </span>
            </div>
            <div>
              <MessageCircle />
              <span>
                <strong>Siap terhubung ke LINE</strong>
                Pengingat dan konfirmasi langsung ke relawan
              </span>
            </div>
          </div>
        </div>
        <p className="story-footer">Dibuat untuk tim yang melayani bersama.</p>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <span className="mobile-login-logo">
            <Logo large />
          </span>
          <div className="login-heading">
            <p className="eyebrow">PORTAL KOORDINATOR</p>
            <h2>Selamat datang kembali</h2>
            <p>Masuk menggunakan email yang terdaftar sebagai koordinator.</p>
          </div>

          {loginState === "sent" ? (
            <div className="login-success" role="status">
              <span>
                <Check size={22} />
              </span>
              <div>
                <strong>Periksa email Anda</strong>
                <p>Tautan masuk telah dikirim ke {email}.</p>
              </div>
            </div>
          ) : (
            <form className="login-form" onSubmit={onSubmit}>
              <label>
                Alamat email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nama@ifgf.org"
                  autoComplete="email"
                  required={configured}
                />
              </label>
              {loginState === "error" ? (
                <p className="form-error" role="alert">
                  {loginError}
                </p>
              ) : null}
              <button
                className="button button-primary button-block"
                type="submit"
                disabled={!configured || loginState === "sending"}
              >
                {loginState === "sending" ? "Mengirim..." : "Kirim tautan masuk"}
                <ChevronRight size={18} />
              </button>
            </form>
          )}

          {!configured ? (
            <div className="demo-entry">
              <span>Supabase belum dihubungkan</span>
              <button type="button" className="button button-secondary" onClick={onDemo}>
                Buka demo koordinator
              </button>
            </div>
          ) : null}

          <p className="login-note">
            Dengan masuk, Anda menyetujui kebijakan penggunaan data gereja.
          </p>
        </div>
      </section>
    </main>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

function Overview({
  onNavigate,
  onAddEvent,
  showToast,
}: {
  onNavigate: (view: View) => void;
  onAddEvent: () => void;
  showToast: (message: string) => void;
}) {
  return (
    <>
      <PageHeader
        eyebrow="SABTU, 1 AGUSTUS 2026"
        title="Selamat siang, Hanssen"
        description="Berikut keadaan tim pelayanan Anda minggu ini."
        actions={
          <>
            <button className="button button-secondary" type="button" onClick={onAddEvent}>
              <Plus size={18} /> Tambah kegiatan
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                onNavigate("schedule");
                showToast("Draft jadwal Agustus siap diperiksa.");
              }}
            >
              <WandSparkles size={18} /> Buat jadwal
            </button>
          </>
        }
      />

      <section className="metric-grid" aria-label="Ringkasan minggu ini">
        <MetricCard
          icon={CalendarCheck}
          label="Kegiatan minggu ini"
          value="4"
          detail="3 jenis kegiatan"
          tone="blue"
        />
        <MetricCard
          icon={UserCheck}
          label="Relawan terjadwal"
          value="18"
          detail="dari 24 relawan aktif"
          tone="teal"
        />
        <MetricCard
          icon={AlertCircle}
          label="Posisi belum terisi"
          value="2"
          detail="Perlu tindakan"
          tone="amber"
          action={() => onNavigate("schedule")}
        />
        <MetricCard
          icon={Clock3}
          label="Ketidakhadiran baru"
          value="3"
          detail="Sejak kemarin"
          tone="violet"
          action={() => onNavigate("unavailability")}
        />
      </section>

      <section className="dashboard-grid">
        <div className="card upcoming-card">
          <div className="card-heading">
            <div>
              <h2>Jadwal terdekat</h2>
              <p>Pelayanan dalam 14 hari ke depan</p>
            </div>
            <button className="text-button" type="button" onClick={() => onNavigate("schedule")}>
              Lihat semua <ChevronRight size={16} />
            </button>
          </div>
          <div className="upcoming-list">
            <UpcomingItem
              date="02"
              month="AGU"
              day="Besok"
              title="Sunday Service"
              time="09.00–11.30"
              coverage="12/12 posisi terisi"
              status="ready"
              people={["AT", "BS", "CL", "DW"]}
            />
            <UpcomingItem
              date="05"
              month="AGU"
              day="Rabu"
              title="Komsel Rabu"
              time="19.00–21.00"
              coverage="4/4 posisi terisi"
              status="ready"
              people={["EH", "DW", "GH"]}
            />
            <UpcomingItem
              date="09"
              month="AGU"
              day="Minggu"
              title="Sunday Service"
              time="09.00–11.30"
              coverage="10/12 posisi terisi"
              status="attention"
              people={["AT", "BS", "GH"]}
            />
          </div>
        </div>

        <div className="card attention-card">
          <div className="card-heading">
            <div>
              <h2>Perlu perhatian</h2>
              <p>Selesaikan sebelum jadwal diterbitkan</p>
            </div>
            <span className="count-badge">3</span>
          </div>
          <div className="attention-list">
            <button type="button" onClick={() => onNavigate("schedule")}>
              <span className="attention-icon amber"><Users size={18} /></span>
              <span>
                <strong>2 posisi belum terisi</strong>
                <small>Sunday Service • 9 Agustus</small>
              </span>
              <ChevronRight size={18} />
            </button>
            <button type="button" onClick={() => onNavigate("unavailability")}>
              <span className="attention-icon violet"><Clock3 size={18} /></span>
              <span>
                <strong>3 ketidakhadiran baru</strong>
                <small>Berpotensi memengaruhi 2 jadwal</small>
              </span>
              <ChevronRight size={18} />
            </button>
            <button type="button" onClick={() => onNavigate("notifications")}>
              <span className="attention-icon blue"><Bell size={18} /></span>
              <span>
                <strong>5 konfirmasi tertunda</strong>
                <small>Pengingat terakhir 2 hari lalu</small>
              </span>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>

      <section className="card quick-card">
        <div className="quick-copy">
          <span className="quick-icon"><Sparkles size={20} /></span>
          <div>
            <h2>Siap menyiapkan jadwal bulan September?</h2>
            <p>12 relawan sudah memperbarui ketersediaan mereka.</p>
          </div>
        </div>
        <button className="button button-dark" type="button" onClick={() => onNavigate("schedule")}>
          Mulai dari ketersediaan <ChevronRight size={17} />
        </button>
      </section>
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  action,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: string;
  action?: () => void;
}) {
  return (
    <article className="metric-card">
      <span className={`metric-icon ${tone}`}><Icon size={21} /></span>
      <div className="metric-copy">
        <p>{label}</p>
        <strong>{value}</strong>
        {action ? (
          <button type="button" onClick={action}>{detail} <ChevronRight size={14} /></button>
        ) : (
          <span>{detail}</span>
        )}
      </div>
    </article>
  );
}

function UpcomingItem({
  date,
  month,
  day,
  title,
  time,
  coverage,
  status,
  people,
}: {
  date: string;
  month: string;
  day: string;
  title: string;
  time: string;
  coverage: string;
  status: "ready" | "attention";
  people: string[];
}) {
  return (
    <article className="upcoming-item">
      <div className="date-block"><strong>{date}</strong><span>{month}</span></div>
      <div className="upcoming-copy">
        <span className="day-label">{day}</span>
        <h3>{title}</h3>
        <p><Clock3 size={14} /> {time}</p>
      </div>
      <div className="avatar-stack" aria-label={`${people.length} relawan ditampilkan`}>
        {people.map((person, index) => <Avatar key={person} initials={person} tone={index} />)}
        <span className="avatar avatar-more">+{Math.max(0, 12 - people.length)}</span>
      </div>
      <StatusPill tone={status === "ready" ? "ready" : "attention"}>{coverage}</StatusPill>
      <button className="icon-button" type="button" aria-label={`Buka ${title}`}><ChevronRight size={18} /></button>
    </article>
  );
}

function Schedule({ showToast }: { showToast: (message: string) => void }) {
  const [published, setPublished] = useState(false);
  return (
    <>
      <PageHeader
        eyebrow="AGUSTUS 2026"
        title="Jadwal pelayanan"
        description="Periksa kebutuhan, isi kekosongan, lalu terbitkan untuk relawan."
        actions={
          <>
            <button className="button button-secondary" type="button" onClick={() => showToast("Tautan jadwal disalin.")}>
              <Copy size={17} /> Salin tautan
            </button>
            <button className="button button-primary" type="button" onClick={() => {
              setPublished(true);
              showToast("Jadwal diterbitkan. Notifikasi siap dikirim.");
            }}>
              <Bell size={17} /> {published ? "Sudah diterbitkan" : "Terbitkan jadwal"}
            </button>
          </>
        }
      />
      <div className="schedule-toolbar card">
        <div className="segmented-control" role="group" aria-label="Tampilan jadwal">
          <button className="active" type="button">Bulan</button>
          <button type="button">Agenda</button>
        </div>
        <label>
          <span className="sr-only">Pilih kegiatan</span>
          <select defaultValue="all"><option value="all">Semua kegiatan</option><option>Sunday Service</option><option>Doa Sabtu</option></select>
        </label>
        <span className="schedule-draft"><span /> Draft dibuat 12 menit lalu</span>
        <button className="button button-secondary regenerate" type="button" onClick={() => showToast("Draft dijadwalkan ulang dengan aturan terbaru.")}>
          <RefreshCw size={16} /> Buat ulang draft
        </button>
      </div>

      <section className="card schedule-board" aria-label="Papan jadwal pelayanan">
        <div className="schedule-table-wrap">
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Bagian pelayanan</th>
                {SCHEDULE_COLUMNS.map((column) => <th key={column.day}><strong>{column.day}</strong><span>{column.event}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {SCHEDULE_ROWS.map((row) => (
                <tr key={row.section}>
                  <th><strong>{row.section}</strong><span>{row.count} dibutuhkan</span></th>
                  {row.cells.map((cell, index) => (
                    <td key={`${row.section}-${index}`}>
                      {cell.map((person) => (
                        <button key={person} type="button" className={person === "Perlu relawan" ? "assignment missing" : person === "—" ? "assignment empty" : "assignment"}>
                          {person === "Perlu relawan" ? <Plus size={14} /> : null}{person}
                        </button>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-agenda">
          {SCHEDULE_COLUMNS.map((column, columnIndex) => (
            <article key={column.day}>
              <header><div><strong>{column.day}</strong><span>{column.event}</span></div>{columnIndex === 1 ? <StatusPill tone="attention">2 kosong</StatusPill> : <StatusPill tone="ready">Siap</StatusPill>}</header>
              {SCHEDULE_ROWS.map((row) => (
                <div className="mobile-assignment" key={row.section}>
                  <span>{row.section}</span>
                  <div>{row.cells[columnIndex].map((person) => <button type="button" key={person} className={person === "Perlu relawan" ? "assignment missing" : "assignment"}>{person}</button>)}</div>
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function Events({ events, onAdd }: { events: EventGroup[]; onAdd: () => void }) {
  return (
    <>
      <PageHeader
        title="Kegiatan"
        description="Atur hari, pola mingguan, dan kebutuhan pelayanan setiap kegiatan."
        actions={<button className="button button-primary" type="button" onClick={onAdd}><Plus size={18} /> Tambah kegiatan</button>}
      />
      <section className="event-grid">
        {events.map((event) => (
          <article className="card event-card" key={event.id}>
            <div className={`event-mark ${event.tone}`}><CalendarCheck size={22} /></div>
            <div className="event-title"><div><h2>{event.name}</h2><p>{event.cadence}</p></div><button className="icon-button" type="button" aria-label={`Menu ${event.name}`}><ChevronDown size={18} /></button></div>
            <div className="event-meta"><span>Berikutnya</span><strong>{event.nextDate}</strong></div>
            <div className="event-footer"><span><Users size={16} /> {event.sections} bagian</span><button className="text-button" type="button">Kelola <ChevronRight size={15} /></button></div>
          </article>
        ))}
        <button className="add-event-card" type="button" onClick={onAdd}><span><Plus size={22} /></span><strong>Tambah kegiatan baru</strong><small>Atur jadwal berulang dan kebutuhan tim</small></button>
      </section>
      <section className="card recurrence-note"><span><CalendarDays size={22} /></span><div><h2>Pola kegiatan yang fleksibel</h2><p>Dukung setiap minggu, minggu ke-1 & 3, kecuali minggu ke-5, atau pilihan khusus—dengan pratinjau tanggal sebelum disimpan.</p></div></section>
    </>
  );
}

function Volunteers() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => VOLUNTEERS.filter((volunteer) => `${volunteer.name} ${volunteer.sections.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return (
    <>
      <PageHeader
        title="Relawan"
        description="Kelola siapa dapat melayani pada setiap bagian dan kegiatan."
        actions={<button className="button button-primary" type="button"><Plus size={18} /> Tambah relawan</button>}
      />
      <section className="card people-card">
        <div className="people-toolbar">
          <label className="inline-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau bagian..." /></label>
          <select aria-label="Filter status"><option>Semua status</option><option>Aktif</option><option>Istirahat</option></select>
          <span>{filtered.length} relawan</span>
        </div>
        <div className="people-table-wrap">
          <table className="people-table">
            <thead><tr><th>Relawan</th><th>Bagian yang dikuasai</th><th>Kegiatan</th><th>Pelayanan bulan ini</th><th>Status</th><th /></tr></thead>
            <tbody>{filtered.map((volunteer, index) => <tr key={volunteer.name}><td><Avatar initials={volunteer.initials} tone={index} /><strong>{volunteer.name}</strong></td><td><div className="chip-row">{volunteer.sections.map((section) => <span key={section}>{section}</span>)}</div></td><td>{volunteer.events}</td><td><span className="serve-count">{volunteer.served}×</span></td><td><StatusPill tone={volunteer.status === "Aktif" ? "ready" : "neutral"}>{volunteer.status}</StatusPill></td><td><button type="button" className="icon-button" aria-label={`Buka ${volunteer.name}`}><ChevronRight size={17} /></button></td></tr>)}</tbody>
          </table>
        </div>
        <div className="people-mobile">
          {filtered.map((volunteer, index) => <article key={volunteer.name}><Avatar initials={volunteer.initials} tone={index} /><div><strong>{volunteer.name}</strong><p>{volunteer.events}</p><div className="chip-row">{volunteer.sections.map((section) => <span key={section}>{section}</span>)}</div></div><ChevronRight size={18} /></article>)}
        </div>
      </section>
    </>
  );
}

function Unavailability({ showToast }: { showToast: (message: string) => void }) {
  const [selectedDates, setSelectedDates] = useState<string[]>(["09"]);
  const toggleDate = (date: string) => setSelectedDates((current) => current.includes(date) ? current.filter((value) => value !== date) : [...current, date]);
  return (
    <>
      <PageHeader title="Ketidakhadiran" description="Relawan melaporkan tanggal ketika mereka tidak dapat melayani." actions={<button className="button button-secondary" type="button"><Copy size={17} /> Salin tautan relawan</button>} />
      <section className="absence-grid">
        <div className="card absence-form-card">
          <div className="portal-label"><span><UserRound size={17} /></span> TAMPILAN RELAWAN</div>
          <h2>Kapan Anda tidak dapat melayani?</h2>
          <p>Pilih satu atau beberapa tanggal kegiatan yang akan datang.</p>
          <div className="date-picker-row">
            {ABSENCE_DATES.map((item) => <button key={item.date} type="button" className={selectedDates.includes(item.date) ? "selected" : ""} onClick={() => toggleDate(item.date)} aria-pressed={selectedDates.includes(item.date)}><span>{item.day}</span><strong>{item.date}</strong><small>{item.month}</small>{selectedDates.includes(item.date) ? <i><Check size={11} /></i> : null}</button>)}
          </div>
          <label className="reason-field">Catatan untuk koordinator <span>(opsional)</span><textarea placeholder="Contoh: Sedang berada di luar kota" /></label>
          <button className="button button-primary button-block" type="button" disabled={selectedDates.length === 0} onClick={() => showToast(`${selectedDates.length} tanggal ketidakhadiran berhasil dicatat.`)}><Check size={17} /> Laporkan tidak tersedia</button>
          <p className="privacy-note"><ShieldCheck size={15} /> Catatan hanya dapat dilihat oleh koordinator.</p>
        </div>

        <div className="card absence-list-card">
          <div className="card-heading"><div><h2>Laporan terbaru</h2><p>Ketidakhadiran langsung memblokir penjadwalan.</p></div><StatusPill tone="attention">3 baru</StatusPill></div>
          <div className="absence-list">
            <AbsenceItem initials="BS" name="Budi Santoso" date="9 Agustus 2026" reason="Acara keluarga" impact="Sudah terjadwal • perlu pengganti" tone={1} urgent />
            <AbsenceItem initials="CL" name="Christina Lim" date="15 Agustus 2026" reason="Di luar kota" impact="Belum ada bentrok jadwal" tone={2} />
            <AbsenceItem initials="EH" name="Evelyn Hartono" date="19 Agustus 2026" reason="—" impact="Belum ada bentrok jadwal" tone={4} />
          </div>
        </div>
      </section>
    </>
  );
}

function AbsenceItem({ initials, name, date, reason, impact, tone, urgent = false }: { initials: string; name: string; date: string; reason: string; impact: string; tone: number; urgent?: boolean }) {
  return <article className="absence-item"><Avatar initials={initials} tone={tone} /><div><h3>{name}</h3><p><CalendarDays size={14} /> {date}</p><small>{reason}</small><span className={urgent ? "impact urgent" : "impact"}>{urgent ? <AlertCircle size={13} /> : <Check size={13} />}{impact}</span></div><button className="icon-button" type="button" aria-label={`Buka laporan ${name}`}><ChevronRight size={18} /></button></article>;
}

function Notifications({ showToast }: { showToast: (message: string) => void }) {
  return (
    <>
      <PageHeader title="Notifikasi" description="Atur kapan dan bagaimana relawan menerima kabar pelayanan." />
      <section className="notification-grid">
        <article className="card line-card">
          <div className="line-logo">LINE</div>
          <div><span className="eyebrow">INTEGRASI</span><h2>Hubungkan LINE Official Account</h2><p>Kirim penugasan, permintaan konfirmasi, dan pengingat langsung kepada relawan.</p></div>
          <StatusPill tone="neutral">Belum terhubung</StatusPill>
          <button className="button button-primary" type="button" onClick={() => showToast("Panduan koneksi LINE akan dibuka pada tahap integrasi.")}>Siapkan koneksi <ChevronRight size={17} /></button>
        </article>
        <article className="card notification-rules">
          <div className="card-heading"><div><h2>Alur pengingat</h2><p>Urutan otomatis sebelum jadwal diterbitkan.</p></div></div>
          <ol>
            <li><span>1</span><div><strong>Minta ketersediaan</strong><p>Setiap tanggal 15 untuk bulan berikutnya</p></div><StatusPill tone="ready">Aktif</StatusPill></li>
            <li><span>2</span><div><strong>Ingatkan sebelum tenggat</strong><p>2 hari sebelum batas pengisian</p></div><StatusPill tone="ready">Aktif</StatusPill></li>
            <li><span>3</span><div><strong>Konfirmasi penugasan</strong><p>Segera setelah jadwal diterbitkan</p></div><StatusPill tone="ready">Aktif</StatusPill></li>
          </ol>
        </article>
      </section>
    </>
  );
}

function SettingsView() {
  return (
    <>
      <PageHeader title="Pengaturan" description="Atur identitas organisasi, bahasa, dan aturan penjadwalan." />
      <section className="settings-grid">
        <article className="card settings-card"><div><span className="settings-icon"><MessageCircle size={20} /></span><div><h2>Bahasa aplikasi</h2><p>Bahasa untuk koordinator dan portal relawan.</p></div></div><div className="language-options"><button className="selected" type="button"><span>ID</span><strong>Bahasa Indonesia</strong><Check size={17} /></button><button type="button" disabled><span>EN</span><strong>English</strong><small>Segera</small></button><button type="button" disabled><span>繁</span><strong>繁體中文</strong><small>Segera</small></button></div></article>
        <article className="card settings-card"><div><span className="settings-icon"><LineChart size={20} /></span><div><h2>Aturan pemerataan</h2><p>Preferensi saat sistem membuat draft jadwal.</p></div></div><label className="toggle-row"><span><strong>Hindari minggu berturut-turut</strong><small>Jika tersedia relawan lain yang memenuhi syarat</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><strong>Batasi satu tugas per hari</strong><small>Mencegah relawan mendapat dua bagian sekaligus</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><strong>Pertahankan penugasan manual</strong><small>Tugas yang dikunci tidak diubah saat membuat ulang</small></span><input type="checkbox" defaultChecked /></label></article>
      </section>
    </>
  );
}

function EventDialog({ onClose, onSave }: { onClose: () => void; onSave: (event: EventGroup) => void }) {
  const [name, setName] = useState("");
  const [day, setDay] = useState("Minggu");
  const [pattern, setPattern] = useState("Setiap minggu");
  const previewDates = useMemo(() => {
    const datesByDay: Record<string, Array<{ label: string; occurrence: number }>> = {
      Minggu: [
        { label: "2 Agu", occurrence: 1 },
        { label: "9 Agu", occurrence: 2 },
        { label: "16 Agu", occurrence: 3 },
        { label: "23 Agu", occurrence: 4 },
        { label: "30 Agu", occurrence: 5 },
        { label: "6 Sep", occurrence: 1 },
        { label: "13 Sep", occurrence: 2 },
        { label: "20 Sep", occurrence: 3 },
      ],
      Sabtu: [
        { label: "1 Agu", occurrence: 1 },
        { label: "8 Agu", occurrence: 2 },
        { label: "15 Agu", occurrence: 3 },
        { label: "22 Agu", occurrence: 4 },
        { label: "29 Agu", occurrence: 5 },
        { label: "5 Sep", occurrence: 1 },
        { label: "12 Sep", occurrence: 2 },
        { label: "19 Sep", occurrence: 3 },
      ],
      Rabu: [
        { label: "5 Agu", occurrence: 1 },
        { label: "12 Agu", occurrence: 2 },
        { label: "19 Agu", occurrence: 3 },
        { label: "26 Agu", occurrence: 4 },
        { label: "2 Sep", occurrence: 1 },
        { label: "9 Sep", occurrence: 2 },
        { label: "16 Sep", occurrence: 3 },
      ],
      Jumat: [
        { label: "7 Agu", occurrence: 1 },
        { label: "14 Agu", occurrence: 2 },
        { label: "21 Agu", occurrence: 3 },
        { label: "28 Agu", occurrence: 4 },
        { label: "4 Sep", occurrence: 1 },
        { label: "11 Sep", occurrence: 2 },
        { label: "18 Sep", occurrence: 3 },
      ],
    };
    const candidates = datesByDay[day];
    const filtered = candidates.filter(({ occurrence }) => {
      if (pattern === "Minggu ke-1 dan ke-3") return occurrence === 1 || occurrence === 3;
      if (pattern === "Minggu ke-2 dan ke-4") return occurrence === 2 || occurrence === 4;
      if (pattern === "Setiap minggu kecuali minggu ke-5") return occurrence !== 5;
      return true;
    });
    return filtered.slice(0, 4).map(({ label }) => label);
  }, [day, pattern]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ id: Date.now(), name, cadence: `${pattern} • 09.00`, nextDate: "23 Agustus 2026", sections: 0, tone: "amber" });
  }
  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title">
        <header><div><p className="eyebrow">KEGIATAN BARU</p><h2 id="event-dialog-title">Atur jadwal berulang</h2><p>Lihat tanggal yang akan dibuat sebelum menyimpan.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Tutup"><X size={20} /></button></header>
        <form onSubmit={submit}>
          <label>Nama kegiatan<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Sunday Service" required /></label>
          <div className="form-row"><label>Hari<select value={day} onChange={(event) => setDay(event.target.value)}><option>Minggu</option><option>Sabtu</option><option>Rabu</option><option>Jumat</option></select></label><label>Waktu<input type="time" defaultValue="09:00" /></label></div>
          <label>Pola pengulangan<select value={pattern} onChange={(event) => setPattern(event.target.value)}><option>Setiap minggu</option><option>Minggu ke-1 dan ke-3</option><option>Minggu ke-2 dan ke-4</option><option>Setiap minggu kecuali minggu ke-5</option><option>Pilihan khusus</option></select></label>
          <div className="date-preview"><div><CalendarDays size={18} /><span><strong>Pratinjau tanggal berikutnya</strong><small>{day} • {pattern}</small></span></div><div className="preview-dates">{previewDates.map((date) => <span key={date}>{date}</span>)}</div></div>
          <footer><button className="button button-secondary" type="button" onClick={onClose}>Batal</button><button className="button button-primary" type="submit">Simpan kegiatan</button></footer>
        </form>
      </section>
    </div>
  );
}
