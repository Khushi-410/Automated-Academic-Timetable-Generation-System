import { BarChart3, BookOpenCheck, CalendarDays, CircleHelp, ClipboardList, Cog, Database, Menu, PanelLeftClose, Sparkles } from "lucide-react";
import { useState } from "react";
import { Configuration } from "./components/Configuration";
import { SavedTimetables } from "./components/SavedTimetables";
import { Timetable } from "./components/Timetable";
import { dfisConfig, impossibleConfig, initialValidation } from "./data/fixtures";
import { api, usingMockApi } from "./services/api";
import type { GenerateResponse, SavedTimetable, ScheduledSession, SchedulingConfig, ValidationResult } from "./types/timetable";

type Page = "dashboard" | "configuration" | "timetable" | "saved";
const nav: Array<{ id: Page; label: string; icon: typeof BarChart3 }> = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "configuration", label: "Configuration", icon: Cog },
  { id: "timetable", label: "Timetable", icon: CalendarDays },
  { id: "saved", label: "Saved timetables", icon: Database },
];

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [config, setConfig] = useState<SchedulingConfig>(() => structuredClone(dfisConfig));
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [response, setResponse] = useState<GenerateResponse | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const updateConfig = (next: SchedulingConfig) => {
    setConfig(next);
    if (sessions.length) setValidation(null);
    setNotice(sessions.length ? "Configuration changed - validate or regenerate before publishing." : null);
  };

  const generateWith = async (nextConfig: SchedulingConfig, regenerate = false) => {
    setGenerating(true); setNotice(null); setPage("timetable");
    try {
      const result = await api.generate({ config: nextConfig, lockedSessions: regenerate ? sessions.filter((item) => item.locked) : [] });
      setResponse(result);
      if (result.status === "feasible") {
        setSessions(result.sessions);
        setValidation(initialValidation);
        setNotice(regenerate ? "Unlocked sessions regenerated; coordinator locks were preserved." : "A complete valid timetable is ready for review.");
      } else {
        setSessions([]); setValidation(null);
      }
    } catch (error) {
      setResponse({ status: "unknown", sessions: [], diagnostics: [{ code: "NETWORK_ERROR", severity: "error", message: error instanceof Error ? error.message : "The timetable service could not be reached.", relatedEntityIds: [] }], unassignedRequirements: [], metrics: { requiredTheoryPeriods: 0, scheduledTheoryPeriods: 0, requiredPracticalSessions: 0, scheduledPracticalSessions: 0 } });
      setSessions([]); setValidation(null);
    } finally { setGenerating(false); }
  };

  const loadDfis = () => {
    setConfig(structuredClone(dfisConfig)); setSessions([]); setResponse(null); setValidation(null); setActiveDraftId(null); setNotice("Loaded fictional M.Sc. DFIS demo data. Review it, then generate the timetable."); setPage("configuration");
  };
  const loadImpossible = () => {
    const next = structuredClone(impossibleConfig);
    setConfig(next); setSessions([]); setResponse(null); setValidation(null); setActiveDraftId(null);
    void generateWith(next);
  };

  const updateSession = async (next: ScheduledSession) => {
    const proposed = sessions.map((item) => item.id === next.id ? next : item);
    try {
      const result = await api.validate({ config, sessions: proposed });
      if (result.valid) { setSessions(proposed); setValidation(result); setNotice("Session change is valid. Save a new draft to retain this revision."); }
      return result;
    } catch (error) {
      return { valid: false, conflicts: [{ code: "VALIDATION_UNAVAILABLE", severity: "error", message: error instanceof Error ? error.message : "Validation is unavailable.", relatedEntityIds: [next.id] }] };
    }
  };

  const saveDraft = async (): Promise<SavedTimetable | null> => {
    const suggested = activeDraftId ? "Updated timetable draft" : "M.Sc. DFIS Semester I - Week 1";
    const name = window.prompt("Name this timetable draft", suggested);
    if (!name?.trim()) return null;
    try {
      const saved = activeDraftId
        ? await api.updateTimetable(activeDraftId, { name: name.trim(), config, sessions })
        : await api.saveDraft({ name: name.trim(), config, sessions });
      setActiveDraftId(saved.id); setNotice(`Saved “${saved.name}” as a ${saved.status}.`); return saved;
    } catch (error) { setNotice(error instanceof Error ? error.message : "The draft could not be saved."); return null; }
  };

  const publish = async () => {
    if (!validation?.valid) { setNotice("Publishing is blocked until the timetable passes validation."); return; }
    try {
      const draft = activeDraftId ? null : await api.saveDraft({ name: "M.Sc. DFIS Semester I - Published timetable", config, sessions });
      const id = activeDraftId ?? draft!.id;
      const published = await api.publishTimetable(id);
      setActiveDraftId(published.id); setNotice(`“${published.name}” is published and validated.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "The timetable could not be published."); }
  };

  const exportCsv = (visibleSessions: ScheduledSession[]) => {
    const rows = [
      ["Session ID", "Subject code", "Subject name", "Kind", "Day", "Start", "End", "Faculty ID", "Room ID", "Batch ID", "Locked"],
      ...visibleSessions.map((session) => [session.id, session.subjectCode, session.subjectName, session.kind, session.day, session.startTime, session.endTime, session.facultyId, session.roomId, session.batchId ?? "", String(session.locked)]),
    ];
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const blob = new Blob([rows.map((row) => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "acadence-timetable.csv"; anchor.click(); URL.revokeObjectURL(url);
    setNotice("CSV export downloaded for the current timetable view.");
  };

  const openSaved = (record: SavedTimetable) => { setConfig(record.config); setSessions(record.sessions); setValidation(record.validation ?? null); setResponse(null); setActiveDraftId(record.id); setNotice(`Reopened “${record.name}”.`); setPage("timetable"); };

  return <div className="min-h-screen bg-[#f6f8fa] text-slate-800"><aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-ink p-4 text-slate-200 transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}><div className="flex items-center gap-3 px-2 py-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-ocean-500 text-white"><CalendarDays size={20} /></div><div><p className="font-semibold text-white">Acadence</p><p className="text-xs text-slate-400">Timetable coordinator</p></div><button onClick={() => setSidebarOpen(false)} className="ml-auto rounded p-1 lg:hidden"><PanelLeftClose size={18} /></button></div><nav className="mt-8 space-y-1">{nav.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setPage(id); setSidebarOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${page === id ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><Icon size={18} />{label}</button>)}</nav><div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-2 text-sm font-semibold text-white"><CircleHelp size={16} />Workflow guide</div><p className="mt-1 text-xs leading-5 text-slate-400">Configure resources, generate a validated timetable, then save or publish it.</p></div></aside><div className="lg:pl-72"><header className="no-print flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-7"><div className="flex items-center gap-3"><button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu size={21} /></button><p className="text-sm font-medium text-slate-500">Academic scheduling workspace</p></div><div className={`rounded-full px-3 py-1.5 text-xs font-bold ${usingMockApi ? "bg-amber-50 text-amber-700" : "bg-moss-50 text-moss-600"}`}>{usingMockApi ? "Mock mode" : "Live API"}</div></header><main className="mx-auto max-w-[1600px] p-4 sm:p-7"><PageContent page={page} config={config} sessions={sessions} response={response} validation={validation} generating={generating} notice={notice} setPage={setPage} updateConfig={updateConfig} loadDfis={loadDfis} loadImpossible={loadImpossible} onGenerate={(regenerate) => void generateWith(config, regenerate)} onUpdateSession={updateSession} onSaveDraft={() => void saveDraft()} onPublish={() => void publish()} onExport={exportCsv} onOpenSaved={openSaved} /></main></div>{sidebarOpen && <button aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="no-print fixed inset-0 z-30 bg-slate-950/40 lg:hidden" />}</div>;
}

function PageContent(props: { page: Page; config: SchedulingConfig; sessions: ScheduledSession[]; response: GenerateResponse | null; validation: ValidationResult | null; generating: boolean; notice: string | null; setPage: (page: Page) => void; updateConfig: (config: SchedulingConfig) => void; loadDfis: () => void; loadImpossible: () => void; onGenerate: (regenerate: boolean) => void; onUpdateSession: (session: ScheduledSession) => Promise<ValidationResult>; onSaveDraft: () => void; onPublish: () => void; onExport: (sessions: ScheduledSession[]) => void; onOpenSaved: (record: SavedTimetable) => void }) {
  if (props.page === "configuration") return <Configuration config={props.config} onChange={props.updateConfig} onLoadDfis={props.loadDfis} onLoadImpossible={props.loadImpossible} />;
  if (props.page === "timetable") return <Timetable config={props.config} sessions={props.sessions} response={props.response} validation={props.validation} generating={props.generating} notice={props.notice} onGenerate={props.onGenerate} onUpdateSession={props.onUpdateSession} onSaveDraft={props.onSaveDraft} onPublish={props.onPublish} onExport={props.onExport} />;
  if (props.page === "saved") return <SavedTimetables onOpen={props.onOpenSaved} />;
  return <Dashboard onConfigure={() => props.setPage("configuration")} onGenerate={() => props.onGenerate(false)} onLoadDemo={props.loadDfis} sessions={props.sessions.length} />;
}

function Dashboard({ onConfigure, onGenerate, onLoadDemo, sessions }: { onConfigure: () => void; onGenerate: () => void; onLoadDemo: () => void; sessions: number }) { return <section className="space-y-7"><div className="overflow-hidden rounded-3xl bg-ink px-6 py-8 text-white shadow-card sm:px-9 sm:py-10"><div className="max-w-3xl"><p className="text-sm font-semibold text-ocean-100">AUTOMATED ACADEMIC TIMETABLE</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Make every teaching constraint visible, then generate with confidence.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">A focused coordinator workspace for configuring teaching resources, reviewing a solver-validated schedule, and publishing only after all hard constraints are satisfied.</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={onConfigure} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-100"><Cog size={16} />Configure timetable</button><button onClick={onGenerate} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"><Sparkles size={16} />Generate demo</button></div></div></div><div className="grid gap-4 md:grid-cols-3"><Stat icon={ClipboardList} label="Teaching requirements" value="2" detail="3 theory periods + 2 practicals" /><Stat icon={BookOpenCheck} label="Current sessions" value={String(sessions)} detail={sessions ? "Ready for review" : "Awaiting generation"} /><Stat icon={CalendarDays} label="Demo timetable" value="M.Sc. DFIS" detail="Semester I - 40 students" /></div><div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card"><p className="text-xs font-bold uppercase tracking-[0.16em] text-ocean-600">Coordinator workflow</p><div className="mt-5 grid gap-4 sm:grid-cols-3"><Step n="01" title="Configure" detail="Set periods, people, rooms, batches, and hard constraints." /><Step n="02" title="Generate & review" detail="Inspect all views, locks, edits, and solver diagnostics." /><Step n="03" title="Save & publish" detail="Export a validated schedule when it is ready." /></div></div><div className="rounded-2xl border border-ocean-100 bg-ocean-50 p-6"><p className="font-semibold text-ink">Need a clean starting point?</p><p className="mt-2 text-sm leading-6 text-slate-600">Load the fictional M.Sc. DFIS preset: one class of 40, two batches of 20, three theory periods, and two 2-period practicals.</p><button onClick={onLoadDemo} className="mt-5 text-sm font-semibold text-ocean-700 hover:text-ocean-800">Load M.Sc. DFIS Demo →</button></div></div></section>; }
function Stat({ icon: Icon, label, value, detail }: { icon: typeof CalendarDays; label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><Icon className="text-ocean-600" size={20} /><p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></div>; }
function Step({ n, title, detail }: { n: string; title: string; detail: string }) { return <div><p className="text-xs font-bold text-ocean-600">{n}</p><p className="mt-2 font-semibold text-ink">{title}</p><p className="mt-1 text-sm leading-5 text-slate-600">{detail}</p></div>; }
