"use client";

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  Bell,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Database,
  GripVertical,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserRound,
  Users,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { APP_CONFIG } from "@/lib/config";
import { translate, type MessageKey } from "@/lib/i18n";
import {
  assignVolunteer,
  createServiceSection,
  deleteEventGroup,
  generateEventMonth,
  generateOccurrenceDates,
  getEventDeletionImpact,
  loadPlannerData,
  monthKeyAfter,
  monthKeyInTimeZone,
  publishSchedule,
  reorderServiceSections,
  removeAssignment,
  saveEventGroup,
  saveVolunteer,
  submitUnavailability,
  type EventGroup,
  type EventDeletionImpact,
  type EventOccurrence,
  type PlannerData,
  type ServiceSection,
  type Volunteer,
} from "@/lib/planner-data";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type View =
  | "overview"
  | "schedule"
  | "events"
  | "volunteers"
  | "unavailability"
  | "notifications"
  | "settings";

const NAV_ITEMS: Array<{
  key: View;
  label: MessageKey;
  icon: LucideIcon;
  coordinatorOnly?: boolean;
}> = [
  { key: "overview", label: "overview", icon: LayoutDashboard },
  { key: "schedule", label: "schedule", icon: CalendarDays },
  { key: "events", label: "events", icon: CalendarCheck, coordinatorOnly: true },
  { key: "volunteers", label: "volunteers", icon: Users, coordinatorOnly: true },
  { key: "unavailability", label: "unavailability", icon: UserRound },
  { key: "notifications", label: "notifications", icon: Bell, coordinatorOnly: true },
];

const WEEKDAYS = [
  { value: 0, label: "Minggu" },
  { value: 1, label: "Senin" },
  { value: 2, label: "Selasa" },
  { value: 3, label: "Rabu" },
  { value: 4, label: "Kamis" },
  { value: 5, label: "Jumat" },
  { value: 6, label: "Sabtu" },
];

const PATTERN_OPTIONS = [
  { value: "every_week", label: "Setiap minggu", weeks: [1, 2, 3, 4, 5] },
  { value: "weeks_1_3", label: "Minggu ke-1 dan ke-3", weeks: [1, 3] },
  { value: "weeks_2_4", label: "Minggu ke-2 dan ke-4", weeks: [2, 4] },
  { value: "except_5", label: "Setiap minggu kecuali minggu ke-5", weeks: [1, 2, 3, 4] },
  { value: "custom", label: "Pilihan khusus", weeks: [] },
] as const;

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function formatDate(value: string, timezone: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(new Date(value));
}

function formatShortDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function defaultScheduleMonth(data: PlannerData, eventGroupId: string) {
  const currentMonth = monthKeyInTimeZone(new Date(), data.organization.timezone);
  const eventMonths = Array.from(new Set(
    data.occurrences
      .filter((occurrence) => occurrence.event_group_id === eventGroupId)
      .map((occurrence) => monthKeyInTimeZone(occurrence.starts_at, data.organization.timezone)),
  )).sort();
  return eventMonths.find((month) => month >= currentMonth) ?? eventMonths.at(-1) ?? currentMonth;
}

function recurrenceLabel(event: EventGroup) {
  const pattern = PATTERN_OPTIONS.find((option) => option.value === event.recurrence_pattern);
  return `${pattern?.label ?? "Pola khusus"} • ${event.start_time.slice(0, 5)}`;
}

function Logo({ large = false }: { large?: boolean }) {
  return (
    <div className={large ? "logo-crop logo-crop-large" : "logo-crop"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ifgf-logo.png" alt={APP_CONFIG.logoAlt} />
    </div>
  );
}

function Avatar({ name, tone = 0 }: { name: string; tone?: number }) {
  return <span className={`avatar avatar-${tone % 5}`}>{initials(name)}</span>;
}

function StatusPill({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

function EmptyState({ icon: Icon, title, description, action }: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span><Icon size={24} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export default function PlannerApp() {
  const configured = isSupabaseConfigured();
  const [authChecked, setAuthChecked] = useState(!configured);
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<PlannerData | null>(null);
  const [dataState, setDataState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dataError, setDataError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [eventDialog, setEventDialog] = useState<EventGroup | "new" | null>(null);
  const [eventDeleteTarget, setEventDeleteTarget] = useState<EventGroup | null>(null);
  const [volunteerDialog, setVolunteerDialog] = useState<Volunteer | "new" | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<{
    occurrence: EventOccurrence;
    section: ServiceSection;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [loginState, setLoginState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [loginError, setLoginError] = useState("");

  const refresh = useCallback(async (targetUser: User) => {
    setDataState("loading");
    setDataError("");
    try {
      setData(await loadPlannerData(targetUser));
      setDataState("ready");
    } catch (error) {
      setDataState("error");
      setDataError(error instanceof Error ? error.message : "Data tidak dapat dimuat.");
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: sessionData }) => {
      const sessionUser = sessionData.session?.user ?? null;
      setUser(sessionUser);
      setAuthChecked(true);
      if (sessionUser) void refresh(sessionUser);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      setAuthChecked(true);
      if (sessionUser) void refresh(sessionUser);
      else setData(null);
    });
    return () => listener.subscription.unsubscribe();
  }, [configured, refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showToast(message: string) {
    setToast(null);
    window.setTimeout(() => setToast(message), 20);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginState("sending");
    setLoginError("");
    const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
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
    setUser(null);
    setData(null);
    setView("overview");
  }

  if (!configured) return <ConfigurationRequired />;
  if (!authChecked) return <LoadingScreen label="Memeriksa sesi..." />;
  if (!user) {
    return (
      <LoginScreen
        email={email}
        setEmail={setEmail}
        loginState={loginState}
        loginError={loginError}
        onSubmit={handleLogin}
      />
    );
  }
  if (dataState === "loading" && !data) return <LoadingScreen label="Memuat data pelayanan..." />;
  if (dataState === "error" || !data) {
    return <DataError message={dataError} onRetry={() => void refresh(user)} onLogout={handleLogout} />;
  }

  const canManage = data.membership.role === "owner" || data.membership.role === "coordinator";
  const upcoming = data.occurrences.filter((occurrence) => new Date(occurrence.starts_at) >= new Date());
  const unfilled = countUnfilled(data, upcoming.slice(0, 8));
  const visibleNav = NAV_ITEMS.filter((item) => canManage || !item.coordinatorOnly);
  const roleLabel = data.membership.role === "owner"
    ? "Pemilik"
    : data.membership.role === "coordinator"
      ? "Koordinator"
      : "Relawan";

  function navBadge(key: View) {
    if (key === "schedule" && unfilled > 0) return unfilled;
    if (key === "unavailability" && data.unavailability.length > 0) return data.unavailability.length;
    return 0;
  }

  async function changed(message: string) {
    await refresh(user);
    showToast(message);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Lewati ke konten utama</a>
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Logo />
          <div><strong>{APP_CONFIG.name}</strong><span>{data.organization.name}</span></div>
          <button type="button" className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Tutup menu"><X size={20} /></button>
        </div>
        <nav className="side-nav" aria-label="Navigasi utama">
          <p className="nav-caption">RUANG KERJA</p>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const badge = navBadge(item.key);
            return (
              <button key={item.key} type="button" className={view === item.key ? "nav-item active" : "nav-item"} onClick={() => { setView(item.key); setMenuOpen(false); }}>
                <Icon size={19} strokeWidth={1.9} />
                <span>{translate(item.label)}</span>
                {badge ? <b>{badge > 99 ? "99+" : badge}</b> : null}
              </button>
            );
          })}
          {canManage ? (
            <>
              <p className="nav-caption nav-caption-second">SISTEM</p>
              <button type="button" className={view === "settings" ? "nav-item active" : "nav-item"} onClick={() => { setView("settings"); setMenuOpen(false); }}>
                <Settings size={19} strokeWidth={1.9} /><span>{translate("settings")}</span>
              </button>
            </>
          ) : null}
        </nav>
        <div className="sidebar-account">
          <Avatar name={data.profile.full_name} tone={1} />
          <div><strong>{data.profile.full_name}</strong><span>{roleLabel}</span></div>
          <button className="icon-button" type="button" onClick={handleLogout} aria-label={translate("signOut")} title={translate("signOut")}><LogOut size={18} /></button>
        </div>
      </aside>

      {menuOpen ? <button type="button" className="sidebar-backdrop" aria-label="Tutup menu" onClick={() => setMenuOpen(false)} /> : null}

      <div className="app-main">
        <header className="topbar">
          <button type="button" className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Buka menu"><Menu size={22} /></button>
          <div className="mobile-brand"><strong>{APP_CONFIG.name}</strong></div>
          <label className="global-search"><Search size={18} /><span className="sr-only">Cari relawan, kegiatan, atau jadwal</span><input placeholder="Cari relawan, kegiatan, atau jadwal..." /><kbd>⌘ K</kbd></label>
          <div className="topbar-actions">
            {dataState === "loading" ? <LoaderCircle className="spin" size={18} aria-label="Memperbarui data" /> : null}
            <button type="button" className="icon-button" aria-label="Bantuan"><CircleHelp size={20} /></button>
            <button type="button" className="icon-button notification-button" aria-label="Notifikasi" onClick={() => canManage && setView("notifications")}><Bell size={20} />{unfilled ? <span /> : null}</button>
          </div>
        </header>

        <main id="main-content" className="content">
          {view === "overview" ? <Overview data={data} canManage={canManage} onNavigate={setView} onAddEvent={() => setEventDialog("new")} /> : null}
          {view === "schedule" ? <Schedule data={data} canManage={canManage} onAssign={setAssignmentTarget} onChanged={changed} showToast={showToast} /> : null}
          {view === "events" && canManage ? <Events data={data} onAdd={() => setEventDialog("new")} onEdit={setEventDialog} onDelete={setEventDeleteTarget} /> : null}
          {view === "volunteers" && canManage ? <Volunteers data={data} onAdd={() => setVolunteerDialog("new")} onEdit={setVolunteerDialog} /> : null}
          {view === "unavailability" ? <Unavailability data={data} onChanged={changed} showToast={showToast} /> : null}
          {view === "notifications" && canManage ? <Notifications showToast={showToast} /> : null}
          {view === "settings" && canManage ? <SettingsView key={data.sections.map((section) => section.id).join("|")} data={data} onChanged={changed} /> : null}
        </main>
      </div>

      {eventDialog ? <EventDialog data={data} eventGroup={eventDialog === "new" ? null : eventDialog} onClose={() => setEventDialog(null)} onSaved={async () => { const editing = eventDialog !== "new"; setEventDialog(null); setView("events"); await changed(editing ? "Kegiatan berhasil diperbarui." : "Kegiatan dan tanggal bulan ini berhasil dibuat."); }} /> : null}
      {eventDeleteTarget ? <EventDeleteDialog eventGroup={eventDeleteTarget} onClose={() => setEventDeleteTarget(null)} onDeleted={async () => { setEventDeleteTarget(null); await changed("Kegiatan dan seluruh data terkait berhasil dihapus."); }} /> : null}
      {volunteerDialog ? <VolunteerDialog data={data} volunteer={volunteerDialog === "new" ? null : volunteerDialog} onClose={() => setVolunteerDialog(null)} onSaved={async () => { setVolunteerDialog(null); await changed(volunteerDialog === "new" ? "Relawan berhasil ditambahkan." : "Data relawan berhasil diperbarui."); }} /> : null}
      {assignmentTarget ? <AssignmentDialog data={data} target={assignmentTarget} onClose={() => setAssignmentTarget(null)} onChanged={async (message) => { await changed(message); }} /> : null}

      {toast ? <div className="toast" role="status"><span className="toast-check"><Check size={16} /></span><span>{toast}</span><button type="button" onClick={() => setToast(null)} aria-label="Tutup"><X size={16} /></button></div> : null}
    </div>
  );
}

function ConfigurationRequired() {
  return (
    <main className="state-page">
      <Logo large />
      <span className="state-icon"><Database size={26} /></span>
      <h1>Supabase belum terhubung</h1>
      <p>Tambahkan URL proyek dan publishable key ke <code>.env.local</code>, lalu mulai ulang aplikasi.</p>
      <pre>NEXT_PUBLIC_SUPABASE_URL=...{"\n"}NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...</pre>
    </main>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return <main className="state-page"><Logo large /><LoaderCircle className="spin state-spinner" size={30} /><p>{label}</p></main>;
}

function DataError({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout: () => void }) {
  return (
    <main className="state-page">
      <Logo large /><span className="state-icon error"><AlertCircle size={26} /></span><h1>Data belum dapat dibuka</h1><p>{message}</p>
      <div className="state-actions"><button className="button button-primary" type="button" onClick={onRetry}><RefreshCw size={17} /> Coba lagi</button><button className="button button-secondary" type="button" onClick={onLogout}>Keluar</button></div>
    </main>
  );
}

function LoginScreen({ email, setEmail, loginState, loginError, onSubmit }: {
  email: string;
  setEmail: (email: string) => void;
  loginState: "idle" | "sending" | "sent" | "error";
  loginError: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand"><Logo large /><div><strong>{APP_CONFIG.name}</strong><span>{APP_CONFIG.tagline}</span></div></div>
        <div className="story-copy">
          <span className="eyebrow eyebrow-dark"><Sparkles size={16} /> SATU TEMPAT UNTUK TIM PELAYANAN</span>
          <h1>Rencanakan pelayanan tanpa bentrok.</h1>
          <p>Kelola jadwal, ketidakhadiran, dan komunikasi relawan dengan lebih tenang—supaya tim dapat fokus melayani.</p>
          <div className="story-points">
            <div><CalendarCheck /><span><strong>Jadwal yang jelas</strong>Semua pelayanan dalam satu kalender</span></div>
            <div><WandSparkles /><span><strong>Otomatis, tetap terkendali</strong>Draft dibuat sistem, keputusan tetap pada koordinator</span></div>
            <div><MessageCircle /><span><strong>Siap terhubung ke LINE</strong>Pengingat dan konfirmasi langsung ke relawan</span></div>
          </div>
        </div>
        <p className="story-footer">Dibuat untuk tim yang melayani bersama.</p>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <span className="mobile-login-logo"><Logo large /></span>
          <div className="login-heading"><p className="eyebrow">PORTAL IFGF</p><h2>Selamat datang kembali</h2><p>Masuk menggunakan email yang sudah terdaftar.</p></div>
          {loginState === "sent" ? (
            <div className="login-success" role="status"><span><Check size={22} /></span><div><strong>Periksa email Anda</strong><p>Tautan masuk telah dikirim ke {email}.</p></div></div>
          ) : (
            <form className="login-form" onSubmit={onSubmit}>
              <label>Alamat email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@ifgf.org" autoComplete="email" required /></label>
              {loginState === "error" ? <p className="form-error" role="alert">{loginError}</p> : null}
              <button className="button button-primary button-block" type="submit" disabled={loginState === "sending"}>{loginState === "sending" ? "Mengirim..." : "Kirim tautan masuk"}<ChevronRight size={18} /></button>
            </form>
          )}
          <p className="login-note">Dengan masuk, Anda menyetujui kebijakan penggunaan data gereja.</p>
        </div>
      </section>
    </main>
  );
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h1>{title}</h1><p>{description}</p></div>{actions ? <div className="page-actions">{actions}</div> : null}</header>;
}

function requirementsFor(data: PlannerData, occurrence: EventOccurrence) {
  return data.requirements.filter((requirement) => requirement.event_group_id === occurrence.event_group_id);
}

function assignmentsFor(data: PlannerData, occurrenceId: string, sectionId?: string) {
  return data.assignments.filter((assignment) => assignment.occurrence_id === occurrenceId && (!sectionId || assignment.section_id === sectionId));
}

function coverageFor(data: PlannerData, occurrence: EventOccurrence) {
  const needed = requirementsFor(data, occurrence).reduce((total, requirement) => total + requirement.needed_count, 0);
  const assigned = assignmentsFor(data, occurrence.id).length;
  return { needed, assigned, missing: Math.max(0, needed - assigned) };
}

function countUnfilled(data: PlannerData, occurrences: EventOccurrence[]) {
  return occurrences.reduce((total, occurrence) => total + coverageFor(data, occurrence).missing, 0);
}

function Overview({ data, canManage, onNavigate, onAddEvent }: { data: PlannerData; canManage: boolean; onNavigate: (view: View) => void; onAddEvent: () => void }) {
  const now = new Date();
  const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
  const upcoming = data.occurrences.filter((occurrence) => new Date(occurrence.starts_at) >= now);
  const thisWeek = upcoming.filter((occurrence) => new Date(occurrence.starts_at) <= weekEnd);
  const activeVolunteers = data.volunteers.filter((volunteer) => volunteer.status === "active");
  const scheduledVolunteerIds = new Set(data.assignments.filter((assignment) => thisWeek.some((occurrence) => occurrence.id === assignment.occurrence_id)).map((assignment) => assignment.volunteer_id));
  const unfilled = countUnfilled(data, upcoming.slice(0, 8));
  const recentAbsences = data.unavailability.filter((absence) => now.getTime() - new Date(absence.created_at).getTime() < 86_400_000 * 2);
  const firstName = data.profile.full_name.split(" ")[0];
  const dateLabel = new Intl.DateTimeFormat("id-ID", { timeZone: data.organization.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now).toUpperCase();

  return (
    <>
      <PageHeader eyebrow={dateLabel} title={`Selamat datang, ${firstName}`} description="Berikut keadaan nyata tim pelayanan Anda saat ini." actions={canManage ? <><button className="button button-secondary" type="button" onClick={onAddEvent}><Plus size={18} /> Tambah kegiatan</button><button className="button button-primary" type="button" onClick={() => onNavigate("schedule")}><CalendarDays size={18} /> Buka jadwal</button></> : undefined} />
      <section className="metric-grid" aria-label="Ringkasan pelayanan">
        <MetricCard icon={CalendarCheck} label="Kegiatan minggu ini" value={String(thisWeek.length)} detail={`${data.events.length} kelompok kegiatan`} tone="blue" />
        <MetricCard icon={UserCheck} label="Relawan terjadwal" value={String(scheduledVolunteerIds.size)} detail={`dari ${activeVolunteers.length} relawan aktif`} tone="teal" />
        <MetricCard icon={AlertCircle} label="Posisi belum terisi" value={String(unfilled)} detail={unfilled ? "Perlu tindakan" : "Semua posisi terisi"} tone="amber" action={() => onNavigate("schedule")} />
        <MetricCard icon={Clock3} label="Ketidakhadiran baru" value={String(recentAbsences.length)} detail={`${data.unavailability.length} laporan tersimpan`} tone="violet" action={() => onNavigate("unavailability")} />
      </section>

      <section className="dashboard-grid">
        <div className="card upcoming-card">
          <div className="card-heading"><div><h2>Jadwal terdekat</h2><p>Pelayanan dalam waktu dekat</p></div><button className="text-button" type="button" onClick={() => onNavigate("schedule")}>Lihat semua <ChevronRight size={16} /></button></div>
          {upcoming.length ? <div className="upcoming-list">{upcoming.slice(0, 3).map((occurrence) => <UpcomingItem key={occurrence.id} data={data} occurrence={occurrence} />)}</div> : <EmptyState icon={CalendarDays} title="Belum ada jadwal" description="Tambahkan kegiatan untuk membuat tanggal pelayanan pertama." action={canManage ? <button className="button button-primary" type="button" onClick={onAddEvent}><Plus size={17} /> Tambah kegiatan</button> : undefined} />}
        </div>
        <div className="card attention-card">
          <div className="card-heading"><div><h2>Perlu perhatian</h2><p>Tindakan berdasarkan data saat ini</p></div><span className="count-badge">{Number(unfilled > 0) + Number(recentAbsences.length > 0)}</span></div>
          {unfilled || recentAbsences.length ? <div className="attention-list">{unfilled ? <button type="button" onClick={() => onNavigate("schedule")}><span className="attention-icon amber"><Users size={18} /></span><span><strong>{unfilled} posisi belum terisi</strong><small>Pada jadwal mendatang</small></span><ChevronRight size={18} /></button> : null}{recentAbsences.length ? <button type="button" onClick={() => onNavigate("unavailability")}><span className="attention-icon violet"><Clock3 size={18} /></span><span><strong>{recentAbsences.length} ketidakhadiran baru</strong><small>Periksa dampak terhadap jadwal</small></span><ChevronRight size={18} /></button> : null}</div> : <EmptyState icon={Check} title="Tidak ada masalah terbuka" description="Data jadwal saat ini tidak memerlukan tindakan." />}
        </div>
      </section>

      {canManage && data.sections.length === 0 ? <section className="card quick-card"><div className="quick-copy"><span className="quick-icon"><Sparkles size={20} /></span><div><h2>Mulai dengan bagian pelayanan</h2><p>Buat bagian seperti Worship, Usher, Multimedia, atau Kids.</p></div></div><button className="button button-dark" type="button" onClick={() => onNavigate("settings")}>Atur bagian <ChevronRight size={17} /></button></section> : null}
    </>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone, action }: { icon: LucideIcon; label: string; value: string; detail: string; tone: string; action?: () => void }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}><Icon size={21} /></span><div className="metric-copy"><p>{label}</p><strong>{value}</strong>{action ? <button type="button" onClick={action}>{detail} <ChevronRight size={14} /></button> : <span>{detail}</span>}</div></article>;
}

function UpcomingItem({ data, occurrence }: { data: PlannerData; occurrence: EventOccurrence }) {
  const event = data.events.find((item) => item.id === occurrence.event_group_id);
  const coverage = coverageFor(data, occurrence);
  const assignedNames = assignmentsFor(data, occurrence.id).map((assignment) => data.volunteers.find((volunteer) => volunteer.id === assignment.volunteer_id)?.full_name).filter((name): name is string => Boolean(name));
  const date = new Date(occurrence.starts_at);
  const day = new Intl.DateTimeFormat("id-ID", { timeZone: data.organization.timezone, day: "2-digit" }).format(date);
  const month = new Intl.DateTimeFormat("id-ID", { timeZone: data.organization.timezone, month: "short" }).format(date).toUpperCase();
  return <article className="upcoming-item"><div className="date-block"><strong>{day}</strong><span>{month}</span></div><div className="upcoming-copy"><span className="day-label">{formatShortDate(occurrence.starts_at, data.organization.timezone).split(",")[0]}</span><h3>{event?.name ?? "Kegiatan"}</h3><p><Clock3 size={14} /> {formatTime(occurrence.starts_at, data.organization.timezone)}–{formatTime(occurrence.ends_at, data.organization.timezone)}</p></div><div className="avatar-stack" aria-label={`${assignedNames.length} relawan ditampilkan`}>{assignedNames.slice(0, 4).map((name, index) => <Avatar key={name} name={name} tone={index} />)}{assignedNames.length > 4 ? <span className="avatar avatar-more">+{assignedNames.length - 4}</span> : null}</div><StatusPill tone={coverage.missing ? "attention" : "ready"}>{coverage.assigned}/{coverage.needed} terisi</StatusPill><ChevronRight size={18} /></article>;
}

function Schedule({ data, canManage, onAssign, onChanged, showToast }: { data: PlannerData; canManage: boolean; onAssign: (target: { occurrence: EventOccurrence; section: ServiceSection }) => void; onChanged: (message: string) => Promise<void>; showToast: (message: string) => void }) {
  const [publishing, setPublishing] = useState(false);
  const initialEventId = data.events[0]?.id ?? "";
  const [eventFilter, setEventFilter] = useState(initialEventId);
  const [selectedMonth, setSelectedMonth] = useState(() => defaultScheduleMonth(data, initialEventId));
  const [generating, setGenerating] = useState(false);
  const selectedEvent = data.events.find((event) => event.id === eventFilter) ?? null;
  const eventOccurrences = data.occurrences.filter(
    (occurrence) => occurrence.event_group_id === eventFilter,
  );
  const availableMonths = Array.from(new Set([
    ...eventOccurrences.map((occurrence) =>
      monthKeyInTimeZone(occurrence.starts_at, data.organization.timezone),
    ),
    selectedMonth,
  ])).sort();
  const occurrences = eventOccurrences.filter(
    (occurrence) =>
      monthKeyInTimeZone(occurrence.starts_at, data.organization.timezone) === selectedMonth,
  );
  const sectionIds = new Set(occurrences.flatMap((occurrence) => requirementsFor(data, occurrence).map((requirement) => requirement.section_id)));
  const sections = data.sections.filter((section) => sectionIds.has(section.id));
  const published = data.scheduleVersions.some((version) => version.status === "published");

  function selectEvent(eventGroupId: string) {
    setEventFilter(eventGroupId);
    setSelectedMonth(defaultScheduleMonth(data, eventGroupId));
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await publishSchedule({ organizationId: data.organization.id, userId: data.user.id, occurrences });
      await onChanged("Jadwal berhasil diterbitkan.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Jadwal tidak dapat diterbitkan.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleAddMonth() {
    if (!selectedEvent) return;
    const latestMonth = availableMonths.at(-1) ?? selectedMonth;
    const nextMonth = monthKeyAfter(latestMonth);
    setGenerating(true);
    try {
      const generatedCount = await generateEventMonth({
        organizationId: data.organization.id,
        event: selectedEvent,
        timezone: data.organization.timezone,
        month: nextMonth,
      });
      setSelectedMonth(nextMonth);
      await onChanged(
        generatedCount
          ? `${generatedCount} tanggal ${formatMonthKey(nextMonth)} berhasil dibuat.`
          : `${formatMonthKey(nextMonth)} tidak memiliki tanggal yang sesuai dengan pola kegiatan.`,
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Bulan jadwal berikutnya tidak dapat dibuat.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <PageHeader title="Jadwal pelayanan" description="Pilih satu kegiatan dan kelola penugasan satu bulan pada satu waktu." actions={<>{<button className="button button-secondary" type="button" onClick={() => { void navigator.clipboard?.writeText(window.location.href); showToast("Tautan jadwal disalin."); }}><Copy size={17} /> Salin tautan</button>}{canManage ? <button className="button button-primary" type="button" disabled={publishing || !occurrences.length} onClick={handlePublish}><Bell size={17} /> {publishing ? "Menerbitkan..." : published ? "Terbitkan ulang" : "Terbitkan jadwal"}</button> : null}</>} />
      <div className="schedule-toolbar card">
        <div className="segmented-control" role="group" aria-label="Tampilan jadwal"><button className="active" type="button">Agenda</button></div>
        <label className="event-filter"><span className="sr-only">Pilih kegiatan</span><select value={eventFilter} onChange={(event) => selectEvent(event.target.value)} aria-label="Tampilkan jadwal kegiatan" disabled={!data.events.length}>{data.events.length ? data.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>) : <option value="">Belum ada kegiatan</option>}</select></label>
        <label className="month-filter"><span className="sr-only">Pilih bulan</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} aria-label="Tampilkan bulan jadwal" disabled={!selectedEvent}>{availableMonths.map((month) => <option key={month} value={month}>{formatMonthKey(month)}</option>)}</select></label>
        <span className="schedule-draft"><span /> {selectedEvent?.name ?? "Pilih kegiatan"}</span>
        {canManage ? <button className="button button-secondary regenerate" type="button" onClick={handleAddMonth} disabled={!selectedEvent || generating}><Plus size={16} /> {generating ? "Membuat..." : `Tambah ${formatMonthKey(monthKeyAfter(availableMonths.at(-1) ?? selectedMonth))}`}</button> : null}
      </div>
      <section className="card schedule-board" aria-label="Papan jadwal pelayanan">
        {!selectedEvent ? <EmptyState icon={CalendarDays} title="Belum ada kegiatan" description="Tambahkan kegiatan sebelum membuat jadwal bulanan." /> : !occurrences.length ? <EmptyState icon={CalendarDays} title={`Belum ada tanggal pada ${formatMonthKey(selectedMonth)}`} description="Gunakan tombol Tambah bulan berikutnya untuk membuat tanggal dari pola kegiatan ini." /> : !sections.length ? <EmptyState icon={Users} title="Belum ada kebutuhan tim" description="Tambahkan bagian pelayanan, lalu atur kebutuhan relawan pada kegiatan ini." /> : <>
          <div className="schedule-table-wrap"><table className="schedule-table"><thead><tr><th>Bagian pelayanan</th>{occurrences.map((occurrence) => <th key={occurrence.id}><strong>{formatShortDate(occurrence.starts_at, data.organization.timezone)}</strong><span>{selectedEvent.name}</span></th>)}</tr></thead><tbody>{sections.map((section) => <tr key={section.id}><th><strong>{section.name}</strong></th>{occurrences.map((occurrence) => <ScheduleCell key={occurrence.id} data={data} occurrence={occurrence} section={section} canManage={canManage} onOpen={() => onAssign({ occurrence, section })} />)}</tr>)}</tbody></table></div>
          <div className="mobile-agenda">{occurrences.map((occurrence) => { const coverage = coverageFor(data, occurrence); const requiredSectionIds = new Set(requirementsFor(data, occurrence).map((requirement) => requirement.section_id)); const occurrenceSections = data.sections.filter((section) => requiredSectionIds.has(section.id)); return <article key={occurrence.id}><header><div><strong>{formatShortDate(occurrence.starts_at, data.organization.timezone)}</strong><span>{selectedEvent.name}</span></div><StatusPill tone={coverage.missing ? "attention" : "ready"}>{coverage.missing ? `${coverage.missing} kosong` : "Siap"}</StatusPill></header>{occurrenceSections.map((section) => <div className="mobile-assignment" key={section.id}><span>{section.name}</span><ScheduleCell mobile data={data} occurrence={occurrence} section={section} canManage={canManage} onOpen={() => onAssign({ occurrence, section })} /></div>)}</article>; })}</div>
        </>}
      </section>
      <section className="card recurrence-note"><span><CalendarDays size={22} /></span><div><h2>Cara tanggal berulang dibuat</h2><p>Setiap kegiatan menyimpan hari dan minggu dalam bulan sebagai pola. IFGF Planner hanya membuat tanggal bulan awal saat kegiatan disimpan; bulan berikutnya dibuat saat Anda menekan tombol Tambah, lalu langsung dibuka untuk dijadwalkan.</p></div></section>
    </>
  );
}

function ScheduleCell({ data, occurrence, section, canManage, onOpen, mobile = false }: { data: PlannerData; occurrence: EventOccurrence; section: ServiceSection; canManage: boolean; onOpen: () => void; mobile?: boolean }) {
  const requirement = requirementsFor(data, occurrence).find((item) => item.section_id === section.id);
  const assignments = assignmentsFor(data, occurrence.id, section.id);
  const content = !requirement ? <span className="assignment empty">—</span> : <>{assignments.map((assignment) => { const volunteer = data.volunteers.find((item) => item.id === assignment.volunteer_id); return <button key={assignment.id} type="button" className="assignment" onClick={canManage ? onOpen : undefined}>{volunteer?.full_name ?? "Relawan"}</button>; })}{Array.from({ length: Math.max(0, requirement.needed_count - assignments.length) }, (_, index) => <button key={`missing-${index}`} type="button" className="assignment missing" disabled={!canManage} onClick={onOpen}><Plus size={14} /> Perlu relawan</button>)}</>;
  return mobile ? <div>{content}</div> : <td>{content}</td>;
}

function Events({ data, onAdd, onEdit, onDelete }: { data: PlannerData; onAdd: () => void; onEdit: (event: EventGroup) => void; onDelete: (event: EventGroup) => void }) {
  return <><PageHeader title="Kegiatan" description="Atur hari, pola mingguan, dan kebutuhan pelayanan setiap kegiatan." actions={<button className="button button-primary" type="button" onClick={onAdd}><Plus size={18} /> Tambah kegiatan</button>} /><section className="event-grid">{data.events.map((event, index) => { const next = data.occurrences.find((occurrence) => occurrence.event_group_id === event.id && new Date(occurrence.starts_at) >= new Date()); const requirements = data.requirements.filter((requirement) => requirement.event_group_id === event.id); const neededVolunteers = requirements.reduce((total, requirement) => total + requirement.needed_count, 0); return <article className="card event-card" key={event.id}><div className={`event-mark ${["blue", "violet", "teal", "amber"][index % 4]}`}><CalendarCheck size={22} /></div><div className="event-title"><div><h2>{event.name}</h2><p>{recurrenceLabel(event)}</p></div><div className="event-card-actions"><button className="icon-button" type="button" aria-label={`Edit ${event.name}`} title="Edit kegiatan" onClick={() => onEdit(event)}><Pencil size={17} /></button><button className="icon-button danger" type="button" aria-label={`Hapus ${event.name}`} title="Hapus kegiatan" onClick={() => onDelete(event)}><Trash2 size={17} /></button></div></div><div className="event-meta"><span>Berikutnya</span><strong>{next ? formatDate(next.starts_at, data.organization.timezone) : "Belum ada tanggal"}</strong></div><div className="event-footer"><span><Users size={16} /> {requirements.length} jenis • {neededVolunteers} relawan</span><button className="text-button" type="button" onClick={() => onEdit(event)}>Edit kegiatan <ChevronRight size={15} /></button></div></article>; })}<button className="add-event-card" type="button" onClick={onAdd}><span><Plus size={22} /></span><strong>Tambah kegiatan baru</strong><small>Atur jadwal berulang dan kebutuhan tim</small></button></section>{!data.events.length ? <section className="card recurrence-note"><span><CalendarDays size={22} /></span><div><h2>Belum ada kegiatan</h2><p>Buat kegiatan pertama; tanggal pelayanan bulan ini akan dihasilkan dan disimpan otomatis.</p></div></section> : null}</>;
}

function EventDeleteDialog({ eventGroup, onClose, onDeleted }: { eventGroup: EventGroup; onClose: () => void; onDeleted: () => Promise<void> }) {
  const [impact, setImpact] = useState<EventDeletionImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getEventDeletionImpact(eventGroup.id)
      .then((result) => { if (active) setImpact(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Dampak penghapusan tidak dapat diperiksa."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventGroup.id]);

  async function confirmDelete() {
    setDeleting(true);
    setError("");
    try {
      await deleteEventGroup(eventGroup.id);
      await onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kegiatan tidak dapat dihapus.");
      setDeleting(false);
    }
  }

  return <Modal title={`Hapus ${eventGroup.name}?`} eyebrow="TINDAKAN PERMANEN" description="Penghapusan tidak dapat dibatalkan." onClose={() => !deleting && onClose()}><div className="delete-confirmation">{loading ? <div className="delete-loading"><LoaderCircle className="spin" size={22} /><span>Memeriksa data yang akan terhapus...</span></div> : <><div className="delete-warning"><AlertCircle size={21} /><div><strong>Semua data kegiatan ini akan dihapus permanen.</strong><p>Periksa dampaknya sebelum melanjutkan.</p></div></div>{impact ? <dl className="delete-impact"><div><dt>Tanggal kegiatan</dt><dd>{impact.occurrences}</dd></div><div><dt>Penugasan relawan</dt><dd>{impact.assignments}</dd></div><div><dt>Laporan ketidakhadiran</dt><dd>{impact.unavailability}</dd></div></dl> : null}</>}{error ? <p className="form-error" role="alert">{error}</p> : null}<footer><button className="button button-secondary" type="button" onClick={onClose} disabled={deleting}>Batal</button><button className="button button-danger" type="button" onClick={confirmDelete} disabled={loading || !impact || deleting}><Trash2 size={17} /> {deleting ? "Menghapus..." : "Hapus permanen"}</button></footer></div></Modal>;
}

function Volunteers({ data, onAdd, onEdit }: { data: PlannerData; onAdd: () => void; onEdit: (volunteer: Volunteer) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => data.volunteers.filter((volunteer) => { const sectionNames = data.eligibilities.filter((item) => item.volunteer_id === volunteer.id).map((item) => data.sections.find((section) => section.id === item.section_id)?.name).join(" "); return `${volunteer.full_name} ${sectionNames}`.toLowerCase().includes(query.toLowerCase()); }), [data, query]);
  return <><PageHeader title="Relawan" description="Kelola bagian dan kegiatan yang dapat dilayani setiap orang." actions={<button className="button button-primary" type="button" onClick={onAdd}><Plus size={18} /> Tambah relawan</button>} /><section className="card people-card"><div className="people-toolbar"><label className="inline-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau bagian..." /></label><span>{filtered.length} relawan</span></div>{filtered.length ? <><div className="people-table-wrap"><table className="people-table"><thead><tr><th>Relawan</th><th>Bagian yang dikuasai</th><th>Kegiatan</th><th>Status</th><th /></tr></thead><tbody>{filtered.map((volunteer, index) => { const sections = data.eligibilities.filter((item) => item.volunteer_id === volunteer.id).map((item) => data.sections.find((section) => section.id === item.section_id)?.name).filter(Boolean); const events = data.eventGroupVolunteers.filter((item) => item.volunteer_id === volunteer.id).map((item) => data.events.find((event) => event.id === item.event_group_id)?.name).filter(Boolean); return <tr key={volunteer.id}><td><Avatar name={volunteer.full_name} tone={index} /><strong>{volunteer.full_name}</strong></td><td><div className="chip-row">{sections.length ? sections.map((section) => <span key={section}>{section}</span>) : <small>Belum ditetapkan</small>}</div></td><td>{events.join(", ") || "Belum ditetapkan"}</td><td><StatusPill tone={volunteer.status === "active" ? "ready" : "neutral"}>{volunteer.status === "active" ? "Aktif" : volunteer.status === "resting" ? "Istirahat" : "Nonaktif"}</StatusPill></td><td><button type="button" className="icon-button" aria-label={`Kelola ${volunteer.full_name}`} onClick={() => onEdit(volunteer)}><ChevronRight size={17} /></button></td></tr>; })}</tbody></table></div><div className="people-mobile">{filtered.map((volunteer, index) => <button type="button" className="people-mobile-button" key={volunteer.id} onClick={() => onEdit(volunteer)}><Avatar name={volunteer.full_name} tone={index} /><div><strong>{volunteer.full_name}</strong><p>{volunteer.email || "Tanpa email"}</p></div><ChevronRight size={18} /></button>)}</div></> : <EmptyState icon={Users} title="Belum ada relawan" description="Tambahkan relawan pertama dan tetapkan bagian yang dapat dilayani." action={<button className="button button-primary" type="button" onClick={onAdd}><Plus size={17} /> Tambah relawan</button>} />}</section></>;
}

function Unavailability({ data, onChanged, showToast }: { data: PlannerData; onChanged: (message: string) => Promise<void>; showToast: (message: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const upcoming = data.occurrences.filter((occurrence) => new Date(occurrence.starts_at) >= new Date()).slice(0, 12);
  const existing = new Set(data.unavailability.filter((absence) => absence.volunteer_id === data.currentVolunteer?.id).map((absence) => absence.occurrence_id));
  async function save() {
    if (!data.currentVolunteer) return;
    setSaving(true);
    try {
      await submitUnavailability({ organizationId: data.organization.id, volunteerId: data.currentVolunteer.id, occurrences: upcoming.filter((occurrence) => selected.includes(occurrence.id)), reason });
      setSelected([]); setReason("");
      await onChanged("Ketidakhadiran berhasil disimpan.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Ketidakhadiran tidak dapat disimpan.");
    } finally { setSaving(false); }
  }
  return <><PageHeader title="Ketidakhadiran" description="Laporkan tanggal ketika Anda tidak dapat melayani." actions={<button className="button button-secondary" type="button" onClick={() => { void navigator.clipboard?.writeText(window.location.href); showToast("Tautan portal relawan disalin."); }}><Copy size={17} /> Salin tautan</button>} /><section className="absence-grid"><div className="card absence-form-card"><div className="portal-label"><span><UserRound size={17} /></span> TAMPILAN RELAWAN</div><h2>Kapan Anda tidak dapat melayani?</h2><p>Pilih satu atau beberapa kegiatan yang akan datang.</p>{!data.currentVolunteer ? <div className="inline-alert"><AlertCircle size={18} /><span>Akun ini belum ditautkan ke profil relawan.</span></div> : !upcoming.length ? <EmptyState icon={CalendarDays} title="Belum ada tanggal" description="Koordinator belum membuat kegiatan mendatang." /> : <><div className="date-picker-row">{upcoming.map((occurrence) => { const date = new Date(occurrence.starts_at); const isExisting = existing.has(occurrence.id); const isSelected = selected.includes(occurrence.id); const eventName = data.events.find((event) => event.id === occurrence.event_group_id)?.name; return <button key={occurrence.id} type="button" disabled={isExisting} className={isSelected || isExisting ? "selected" : ""} onClick={() => setSelected((current) => current.includes(occurrence.id) ? current.filter((id) => id !== occurrence.id) : [...current, occurrence.id])} aria-pressed={isSelected || isExisting} title={eventName}><span>{new Intl.DateTimeFormat("id-ID", { timeZone: data.organization.timezone, weekday: "short" }).format(date)}</span><strong>{new Intl.DateTimeFormat("id-ID", { timeZone: data.organization.timezone, day: "2-digit" }).format(date)}</strong><small>{new Intl.DateTimeFormat("id-ID", { timeZone: data.organization.timezone, month: "short" }).format(date)}</small><em>{isExisting ? "Tercatat" : eventName}</em>{isSelected || isExisting ? <i><Check size={11} /></i> : null}</button>; })}</div><label className="reason-field">Catatan untuk koordinator <span>(opsional)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Contoh: Sedang berada di luar kota" /></label><button className="button button-primary button-block" type="button" disabled={!selected.length || saving} onClick={save}><Check size={17} /> {saving ? "Menyimpan..." : "Laporkan tidak tersedia"}</button></>}<p className="privacy-note"><ShieldCheck size={15} /> Catatan hanya dapat dilihat oleh koordinator.</p></div><div className="card absence-list-card"><div className="card-heading"><div><h2>Laporan terbaru</h2><p>Data ketidakhadiran yang tersimpan.</p></div><StatusPill tone="attention">{data.unavailability.length}</StatusPill></div>{data.unavailability.length ? <div className="absence-list">{data.unavailability.slice(0, 10).map((absence, index) => { const volunteer = data.volunteers.find((item) => item.id === absence.volunteer_id); const occurrence = data.occurrences.find((item) => item.id === absence.occurrence_id); const affected = data.assignments.some((assignment) => assignment.volunteer_id === absence.volunteer_id && assignment.occurrence_id === absence.occurrence_id); return <AbsenceItem key={absence.id} name={volunteer?.full_name ?? "Relawan"} date={occurrence ? formatDate(occurrence.starts_at, data.organization.timezone) : absence.unavailable_date} reason={absence.reason || "Tanpa catatan"} impact={affected ? "Sudah terjadwal • perlu pengganti" : "Belum ada bentrok jadwal"} tone={index} urgent={affected} />; })}</div> : <EmptyState icon={Check} title="Belum ada laporan" description="Ketidakhadiran yang dikirim relawan akan muncul di sini." />}</div></section></>;
}

function AbsenceItem({ name, date, reason, impact, tone, urgent = false }: { name: string; date: string; reason: string; impact: string; tone: number; urgent?: boolean }) {
  return <article className="absence-item"><Avatar name={name} tone={tone} /><div><h3>{name}</h3><p><CalendarDays size={14} /> {date}</p><small>{reason}</small><span className={urgent ? "impact urgent" : "impact"}>{urgent ? <AlertCircle size={13} /> : <Check size={13} />}{impact}</span></div></article>;
}

function Notifications({ showToast }: { showToast: (message: string) => void }) {
  return <><PageHeader title="Notifikasi" description="Hubungkan LINE setelah data jadwal inti selesai disiapkan." /><section className="notification-grid"><article className="card line-card"><div className="line-logo">LINE</div><div><span className="eyebrow">INTEGRASI</span><h2>LINE Official Account</h2><p>Kirim penugasan, konfirmasi, dan pengingat langsung kepada relawan.</p></div><StatusPill tone="neutral">Belum terhubung</StatusPill><button className="button button-primary" type="button" onClick={() => showToast("Integrasi LINE akan dikerjakan pada tahap berikutnya.")}>Lihat tahap berikutnya <ChevronRight size={17} /></button></article></section></>;
}

function SortableServiceSection({
  section,
  position,
  disabled,
}: {
  section: ServiceSection;
  position: number;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled });

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? "service-section-item is-dragging" : "service-section-item"}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="drag-handle"
        type="button"
        aria-label={`Ubah urutan ${section.name}`}
        title="Seret atau gunakan tombol panah untuk mengubah urutan"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={19} />
      </button>
      <span className="service-section-position">{position}</span>
      <strong>{section.name}</strong>
    </li>
  );
}

function SettingsView({ data, onChanged }: { data: PlannerData; onChanged: (message: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState("");
  const [orderedSections, setOrderedSections] = useState(data.sections);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function addSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const sortOrder = orderedSections.reduce(
      (highest, section) => Math.max(highest, section.sort_order),
      -1,
    ) + 1;
    try {
      await createServiceSection({
        organizationId: data.organization.id,
        name,
        sortOrder,
      });
      setName("");
      await onChanged("Bagian pelayanan berhasil ditambahkan.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bagian tidak dapat disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function finishReorder(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const previousIndex = orderedSections.findIndex((section) => section.id === event.active.id);
    const nextIndex = orderedSections.findIndex((section) => section.id === event.over?.id);
    if (previousIndex < 0 || nextIndex < 0) return;

    const previousOrder = orderedSections;
    const nextOrder = arrayMove(previousOrder, previousIndex, nextIndex);
    setOrderedSections(nextOrder);
    setReordering(true);
    setError("");
    try {
      await reorderServiceSections({
        organizationId: data.organization.id,
        sectionIds: nextOrder.map((section) => section.id),
      });
      await onChanged("Urutan bagian pelayanan berhasil diperbarui.");
    } catch (cause) {
      setOrderedSections(previousOrder);
      setError(cause instanceof Error ? cause.message : "Urutan tidak dapat disimpan.");
    } finally {
      setReordering(false);
    }
  }

  return <><PageHeader title="Pengaturan" description="Atur struktur pelayanan dan bahasa aplikasi." /><section className="settings-grid"><article className="card settings-card section-settings"><div><span className="settings-icon"><Users size={20} /></span><div><h2>Bagian pelayanan</h2><p>Bagian ini digunakan untuk kualifikasi dan kebutuhan jadwal.</p></div></div><form className="section-form" onSubmit={addSection}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Worship" required /><button className="button button-primary" type="submit" disabled={saving || reordering}><Plus size={17} /> Tambah</button></form>{error ? <p className="form-error" role="alert">{error}</p> : null}{orderedSections.length ? <div className="service-section-order"><div className="service-section-order-heading"><div><strong>Urutan tampilan</strong><small>Seret jenis pelayanan untuk menentukan urutannya pada jadwal.</small></div>{reordering ? <span><LoaderCircle className="spin" size={15} /> Menyimpan...</span> : null}</div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finishReorder}><SortableContext items={orderedSections.map((section) => section.id)} strategy={verticalListSortingStrategy}><ol className="service-section-list">{orderedSections.map((section, index) => <SortableServiceSection key={section.id} section={section} position={index + 1} disabled={reordering} />)}</ol></SortableContext></DndContext></div> : <small>Belum ada bagian pelayanan.</small>}</article><article className="card settings-card"><div><span className="settings-icon"><MessageCircle size={20} /></span><div><h2>Bahasa aplikasi</h2><p>Bahasa untuk koordinator dan portal relawan.</p></div></div><div className="language-options"><button className="selected" type="button"><span>ID</span><strong>Bahasa Indonesia</strong><Check size={17} /></button><button type="button" disabled><span>EN</span><strong>English</strong><small>Segera</small></button><button type="button" disabled><span>繁</span><strong>繁體中文</strong><small>Segera</small></button></div></article></section></>;
}

function EventDialog({ data, eventGroup, onClose, onSaved }: { data: PlannerData; eventGroup: EventGroup | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const editing = Boolean(eventGroup);
  const [name, setName] = useState(eventGroup?.name ?? "");
  const [weekday, setWeekday] = useState(eventGroup?.weekday ?? 0);
  const [startTime, setStartTime] = useState(eventGroup?.start_time.slice(0, 5) ?? "09:00");
  const [duration, setDuration] = useState(eventGroup?.duration_minutes ?? 120);
  const [pattern, setPattern] = useState<(typeof PATTERN_OPTIONS)[number]["value"]>((eventGroup?.recurrence_pattern as (typeof PATTERN_OPTIONS)[number]["value"] | undefined) ?? "every_week");
  const [customWeeks, setCustomWeeks] = useState<number[]>(eventGroup ? [...eventGroup.week_occurrences] : [1, 3]);
  const [requirements, setRequirements] = useState<Array<{ sectionId: string; neededCount: number }>>(
    eventGroup
      ? data.sections.flatMap((section) => {
          const requirement = data.requirements.find(
            (item) => item.event_group_id === eventGroup.id && item.section_id === section.id,
          );
          return requirement
            ? [{ sectionId: section.id, neededCount: requirement.needed_count }]
            : [];
        })
      : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const weeks = useMemo(
    () => pattern === "custom" ? customWeeks : [...(PATTERN_OPTIONS.find((option) => option.value === pattern)?.weeks ?? [])],
    [customWeeks, pattern],
  );
  const preview = useMemo(() => generateOccurrenceDates({ weekday, startTime, durationMinutes: duration, weekOccurrences: weeks, timezone: data.organization.timezone, count: 4 }), [weekday, startTime, duration, weeks, data.organization.timezone]);
  const selectedSectionIds = new Set(requirements.map((requirement) => requirement.sectionId));

  function addRequirement() {
    const availableSection = data.sections.find((section) => !selectedSectionIds.has(section.id));
    if (!availableSection) return;
    setRequirements((current) => [...current, { sectionId: availableSection.id, neededCount: 1 }]);
  }

  function changeRequirementSection(index: number, sectionId: string) {
    setRequirements((current) => current.map((requirement, currentIndex) => currentIndex === index ? { ...requirement, sectionId } : requirement));
  }

  function changeRequirementCount(index: number, value: number) {
    const neededCount = Math.min(50, Math.max(1, Number.isFinite(value) ? Math.trunc(value) : 1));
    setRequirements((current) => current.map((requirement, currentIndex) => currentIndex === index ? { ...requirement, neededCount } : requirement));
  }

  function removeRequirement(index: number) {
    setRequirements((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!weeks.length) { setError("Pilih sedikitnya satu minggu dalam bulan."); return; } setSaving(true); setError("");
    try { await saveEventGroup({ id: eventGroup?.id, existingEvent: eventGroup ?? undefined, organizationId: data.organization.id, userId: data.user.id, timezone: data.organization.timezone, name, weekday, startTime, durationMinutes: duration, recurrencePattern: pattern, weekOccurrences: weeks, requirements }); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Kegiatan tidak dapat disimpan."); setSaving(false); }
  }

  return <Modal title={editing ? "Edit kegiatan" : "Atur jadwal berulang"} eyebrow={editing ? "PERBARUI KEGIATAN" : "KEGIATAN BARU"} description={editing ? "Perubahan pola akan diterapkan pada tanggal mendatang yang belum memiliki penugasan atau laporan ketidakhadiran." : "Setiap kegiatan dapat memiliki jenis pelayanan dan jumlah relawan yang berbeda."} onClose={onClose}><form onSubmit={submit}><label>Nama kegiatan<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Sunday Service" required /></label><div className="form-row"><label>Hari<select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>{WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label><label>Waktu<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label></div><label>Durasi<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={60}>1 jam</option><option value={90}>1,5 jam</option><option value={120}>2 jam</option><option value={180}>3 jam</option></select></label><label>Pola pengulangan<select value={pattern} onChange={(event) => setPattern(event.target.value as typeof pattern)}>{PATTERN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{pattern === "custom" ? <fieldset className="week-options"><legend>Minggu dalam bulan</legend>{[1, 2, 3, 4, 5].map((week) => <label key={week}><input type="checkbox" checked={customWeeks.includes(week)} onChange={() => setCustomWeeks((current) => current.includes(week) ? current.filter((item) => item !== week) : [...current, week].sort())} /> Ke-{week}</label>)}</fieldset> : null}<fieldset className="requirement-options"><legend>Kebutuhan relawan</legend><div className="requirement-heading"><div><strong>Jenis pelayanan</strong><span>Atur khusus untuk kegiatan ini. Minimum satu relawan per jenis.</span></div><button className="button button-secondary button-compact" type="button" onClick={addRequirement} disabled={!data.sections.length || requirements.length >= data.sections.length}><Plus size={16} /> Tambah jenis</button></div>{requirements.length ? <div className="requirement-list">{requirements.map((requirement, index) => { const section = data.sections.find((item) => item.id === requirement.sectionId); return <div className="requirement-row" key={requirement.sectionId}><label className="sr-only" htmlFor={`requirement-section-${index}`}>Jenis pelayanan {index + 1}</label><select id={`requirement-section-${index}`} value={requirement.sectionId} onChange={(event) => changeRequirementSection(index, event.target.value)}>{data.sections.filter((item) => item.id === requirement.sectionId || !selectedSectionIds.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="number-stepper" role="group" aria-label={`Jumlah relawan untuk ${section?.name ?? `jenis ${index + 1}`}`}><button type="button" onClick={() => changeRequirementCount(index, requirement.neededCount - 1)} disabled={requirement.neededCount <= 1} aria-label="Kurangi jumlah relawan"><Minus size={15} /></button><label className="sr-only" htmlFor={`requirement-count-${index}`}>Jumlah relawan</label><input id={`requirement-count-${index}`} type="number" inputMode="numeric" min="1" max="50" value={requirement.neededCount} onChange={(event) => changeRequirementCount(index, Number(event.target.value))} /><button type="button" onClick={() => changeRequirementCount(index, requirement.neededCount + 1)} disabled={requirement.neededCount >= 50} aria-label="Tambah jumlah relawan"><Plus size={15} /></button></div><button className="icon-button danger requirement-remove" type="button" onClick={() => removeRequirement(index)} aria-label={`Hapus ${section?.name ?? "jenis pelayanan"}`}><Trash2 size={17} /></button></div>; })}</div> : <div className="requirement-empty"><Users size={19} /><span><strong>Belum ada kebutuhan relawan</strong><small>{data.sections.length ? "Klik Tambah jenis untuk menentukan tim kegiatan ini." : "Tambahkan jenis pelayanan melalui Pengaturan terlebih dahulu."}</small></span></div>}</fieldset><div className="date-preview"><div><CalendarDays size={18} /><span><strong>Pratinjau tanggal berikutnya</strong><small>{WEEKDAYS.find((day) => day.value === weekday)?.label}</small></span></div><div className="preview-dates">{preview.map((date) => <span key={date.startsAt}>{formatShortDate(date.startsAt, data.organization.timezone)}</span>)}</div></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<footer><button className="button button-secondary" type="button" onClick={onClose}>Batal</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Menyimpan..." : editing ? "Simpan perubahan" : "Simpan kegiatan"}</button></footer></form></Modal>;
}

function VolunteerDialog({ data, volunteer, onClose, onSaved }: { data: PlannerData; volunteer: Volunteer | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(volunteer?.full_name ?? "");
  const [email, setEmail] = useState(volunteer?.email ?? "");
  const [status, setStatus] = useState<"active" | "resting" | "inactive">((volunteer?.status as "active" | "resting" | "inactive") ?? "active");
  const [sectionIds, setSectionIds] = useState<string[]>(volunteer ? data.eligibilities.filter((item) => item.volunteer_id === volunteer.id).map((item) => item.section_id) : []);
  const [eventIds, setEventIds] = useState<string[]>(volunteer ? data.eventGroupVolunteers.filter((item) => item.volunteer_id === volunteer.id).map((item) => item.event_group_id) : []);
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); try { await saveVolunteer({ id: volunteer?.id, organizationId: data.organization.id, fullName: name, email, status, sectionIds, eventGroupIds: eventIds }); await onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Relawan tidak dapat disimpan."); setSaving(false); } }
  return <Modal title={volunteer ? "Kelola relawan" : "Tambah relawan"} eyebrow="RELAWAN" description="Tetapkan bagian dan kegiatan yang dapat dilayani." onClose={onClose}><form onSubmit={submit}><label>Nama lengkap<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required /></label><label>Email <span>(opsional)</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="active">Aktif</option><option value="resting">Istirahat</option><option value="inactive">Nonaktif</option></select></label><fieldset className="selection-options"><legend>Bagian yang dikuasai</legend>{data.sections.length ? data.sections.map((section) => <label key={section.id}><input type="checkbox" checked={sectionIds.includes(section.id)} onChange={() => setSectionIds((current) => current.includes(section.id) ? current.filter((id) => id !== section.id) : [...current, section.id])} /> {section.name}</label>) : <p>Tambahkan bagian pelayanan melalui Pengaturan terlebih dahulu.</p>}</fieldset><fieldset className="selection-options"><legend>Kegiatan yang diikuti</legend>{data.events.length ? data.events.map((eventGroup) => <label key={eventGroup.id}><input type="checkbox" checked={eventIds.includes(eventGroup.id)} onChange={() => setEventIds((current) => current.includes(eventGroup.id) ? current.filter((id) => id !== eventGroup.id) : [...current, eventGroup.id])} /> {eventGroup.name}</label>) : <p>Belum ada kegiatan.</p>}</fieldset>{error ? <p className="form-error" role="alert">{error}</p> : null}<footer><button className="button button-secondary" type="button" onClick={onClose}>Batal</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan relawan"}</button></footer></form></Modal>;
}

function AssignmentDialog({ data, target, onClose, onChanged }: { data: PlannerData; target: { occurrence: EventOccurrence; section: ServiceSection }; onClose: () => void; onChanged: (message: string) => Promise<void> }) {
  const [working, setWorking] = useState(false); const [error, setError] = useState("");
  const existing = assignmentsFor(data, target.occurrence.id, target.section.id);
  const assignedHere = new Set(existing.map((assignment) => assignment.volunteer_id));
  const occurrenceAssignments = assignmentsFor(data, target.occurrence.id);
  const unavailable = new Set(data.unavailability.filter((absence) => absence.occurrence_id === target.occurrence.id).map((absence) => absence.volunteer_id));
  const eligible = new Set(data.eligibilities.filter((item) => item.section_id === target.section.id).map((item) => item.volunteer_id));
  const groupMembers = new Set(data.eventGroupVolunteers.filter((item) => item.event_group_id === target.occurrence.event_group_id).map((item) => item.volunteer_id));
  const qualified = data.volunteers.filter((volunteer) => eligible.has(volunteer.id));
  const candidates = qualified.filter((volunteer) => volunteer.status === "active" && !assignedHere.has(volunteer.id) && !unavailable.has(volunteer.id));
  const blocked = qualified.filter((volunteer) => !assignedHere.has(volunteer.id) && !candidates.some((candidate) => candidate.id === volunteer.id));
  const eventName = data.events.find((event) => event.id === target.occurrence.event_group_id)?.name ?? "kegiatan ini";
  function otherSectionNames(volunteerId: string) {
    const sectionIds = new Set(
      occurrenceAssignments
        .filter((assignment) => assignment.volunteer_id === volunteerId && assignment.section_id !== target.section.id)
        .map((assignment) => assignment.section_id),
    );
    return data.sections.filter((section) => sectionIds.has(section.id)).map((section) => section.name);
  }
  function blockedReason(volunteer: Volunteer) {
    if (volunteer.status !== "active") return volunteer.status === "resting" ? "Sedang istirahat" : "Tidak aktif";
    if (unavailable.has(volunteer.id)) return "Tidak tersedia pada tanggal ini";
    return "Tidak dapat dipilih";
  }
  async function assign(volunteerId: string) { const addToEventGroup = !groupMembers.has(volunteerId); setWorking(true); setError(""); try { await assignVolunteer({ organizationId: data.organization.id, eventGroupId: target.occurrence.event_group_id, occurrenceId: target.occurrence.id, sectionId: target.section.id, volunteerId, addToEventGroup }); await onChanged(addToEventGroup ? `Relawan ditambahkan ke ${eventName} dan berhasil ditugaskan.` : "Relawan berhasil ditugaskan."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Penugasan gagal."); } finally { setWorking(false); } }
  async function remove(id: string) { setWorking(true); setError(""); try { await removeAssignment(id); await onChanged("Penugasan berhasil dihapus."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Penugasan tidak dapat dihapus."); } finally { setWorking(false); } }
  return <Modal title={target.section.name} eyebrow="ATUR PENUGASAN" description={`${eventName} • ${formatDate(target.occurrence.starts_at, data.organization.timezone)}`} onClose={onClose}><div className="assignment-manager"><h3>Sudah ditugaskan</h3>{existing.length ? existing.map((assignment) => { const volunteer = data.volunteers.find((item) => item.id === assignment.volunteer_id); return <div className="assignment-person" key={assignment.id}><Avatar name={volunteer?.full_name ?? "Relawan"} /><strong>{volunteer?.full_name}</strong><button type="button" className="icon-button danger" disabled={working} onClick={() => remove(assignment.id)} aria-label="Hapus penugasan"><Trash2 size={17} /></button></div>; }) : <p>Belum ada relawan.</p>}<h3>Relawan yang menguasai bagian ini</h3>{candidates.length ? candidates.map((volunteer, index) => { const isGroupMember = groupMembers.has(volunteer.id); const otherSections = otherSectionNames(volunteer.id); const className = ["candidate-button", !isGroupMember ? "candidate-add-group" : "", otherSections.length ? "candidate-already-assigned" : ""].filter(Boolean).join(" "); return <button type="button" className={className} key={volunteer.id} disabled={working} onClick={() => assign(volunteer.id)}><Avatar name={volunteer.full_name} tone={index} /><span><strong>{volunteer.full_name}</strong>{otherSections.length ? <small className="candidate-warning"><AlertCircle size={13} /><span>Sudah bertugas: {otherSections.join(", ")} • tetap dapat ditambahkan</span></small> : <small>{isGroupMember ? "Tersedia dan siap ditugaskan" : `Belum tergabung ${eventName} • tambahkan dan tugaskan`}</small>}</span><Plus size={17} /></button>; }) : <div className="inline-alert"><AlertCircle size={18} /><span>Belum ada relawan aktif yang menguasai bagian ini dan tersedia pada tanggal tersebut.</span></div>}{blocked.length ? <div className="blocked-candidates"><h3>Tidak dapat dipilih saat ini</h3>{blocked.map((volunteer, index) => <div className="candidate-blocked" key={volunteer.id}><Avatar name={volunteer.full_name} tone={index + candidates.length} /><span><strong>{volunteer.full_name}</strong><small>{blockedReason(volunteer)}</small></span></div>)}</div> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}</div></Modal>;
}

function Modal({ title, eyebrow, description, onClose, children }: { title: string; eyebrow: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><p className="eyebrow">{eyebrow}</p><h2 id="modal-title">{title}</h2><p>{description}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Tutup"><X size={20} /></button></header>{children}</section></div>;
}
