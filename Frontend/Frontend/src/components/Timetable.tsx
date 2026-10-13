import { AlertCircle, CheckCircle2, ChevronDown, Download, FileText, Lock, LockKeyhole, RefreshCw, Save, Send, Sparkles, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import { buildPeriodSlots, endTimeFor, formatTime } from "../lib/time";
import type { DayOfWeek, GenerateResponse, ScheduledSession, SchedulingConfig, ValidationResult } from "../types/timetable";

type ViewMode = "class" | "faculty" | "room";
type TimetableProps = {
  config: SchedulingConfig;
  sessions: ScheduledSession[];
  response: GenerateResponse | null;
  validation: ValidationResult | null;
  generating: boolean;
  onGenerate: (regenerate: boolean) => void;
  onUpdateSession: (next: ScheduledSession) => Promise<ValidationResult>;
  onSaveDraft: () => void;
  onPublish: () => void;
  onExport: (sessions: ScheduledSession[]) => void;
  notice: string | null;
};

export function Timetable({ config, sessions, response, validation, generating, onGenerate, onUpdateSession, onSaveDraft, onPublish, onExport, notice }: TimetableProps) {
  const [view, setView] = useState<ViewMode>("class");
  const [filterId, setFilterId] = useState(config.studentGroups[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const currentOptions = view === "class" ? config.studentGroups : view === "faculty" ? config.faculty : config.rooms;
  const visibleSessions = useMemo(() => sessions.filter((session) => view === "class" ? session.studentGroupId === filterId : view === "faculty" ? session.facultyId === filterId : session.roomId === filterId), [sessions, view, filterId]);
  const selected = sessions.find((session) => session.id === selectedId) ?? null;

  const changeView = (next: ViewMode) => {
    setView(next);
    const options = next === "class" ? config.studentGroups : next === "faculty" ? config.faculty : config.rooms;
    setFilterId(options[0]?.id ?? "");
  };

  return <section className="space-y-5">
    <div className="no-print flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-card xl:flex-row xl:items-center">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-ocean-600">Generate - Review - Publish</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">Academic timetable</h1>
        <p className="mt-1 text-sm text-slate-600">Locks keep specific session assignments during the next solver run.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={generating} onClick={() => onGenerate(false)} className="inline-flex items-center gap-2 rounded-lg bg-ocean-600 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-50"><Sparkles size={16} />{generating ? "Generating…" : "Generate timetable"}</button>
        <button disabled={generating || sessions.length === 0} onClick={() => onGenerate(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} />Regenerate unlocked</button>
        <button disabled={!sessions.length} onClick={onSaveDraft} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save size={16} />Save draft</button>
        <button disabled={!validation?.valid || !sessions.length} onClick={onPublish} className="inline-flex items-center gap-2 rounded-lg bg-moss-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-moss-500 disabled:cursor-not-allowed disabled:opacity-50"><Send size={16} />Publish</button>
      </div>
    </div>

    {notice && <div className="no-print flex items-center gap-2 rounded-xl border border-ocean-200 bg-ocean-50 px-4 py-3 text-sm font-medium text-ocean-800"><CheckCircle2 size={18} />{notice}</div>}
    {response && <GenerationResult response={response} validation={validation} />}

    <div className="no-print flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-wrap gap-3"><label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">View<select value={view} onChange={(event) => changeView(event.target.value as ViewMode)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"><option value="class">Programme / class</option><option value="faculty">Faculty</option><option value="room">Room / laboratory</option></select></label><label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{view === "class" ? "Student group" : view === "faculty" ? "Faculty" : "Room"}<select value={filterId} onChange={(event) => setFilterId(event.target.value)} className="mt-1 block min-w-52 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800">{currentOptions.map((item) => <option key={item.id} value={item.id}>{"programme" in item ? `${item.programme} ${item.semester} - ${item.section}` : item.name}</option>)}</select></label></div>
      <div className="flex gap-2"><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileText size={16} />Print / PDF</button><button onClick={() => onExport(visibleSessions)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download size={16} />Export CSV</button></div>
    </div>

    {sessions.length > 0 ? <TimetableGrid config={config} sessions={visibleSessions} onOpen={setSelectedId} /> : <EmptyGrid status={response?.status} />}
    {selected && <SessionDialog session={selected} config={config} onClose={() => setSelectedId(null)} onUpdate={onUpdateSession} />}
  </section>;
}

function GenerationResult({ response, validation }: { response: GenerateResponse; validation: ValidationResult | null }) {
  const feasible = response.status === "feasible";
  const unknown = response.status === "unknown";
  return <div className={`rounded-2xl border p-5 ${feasible ? "border-moss-500/30 bg-moss-50" : unknown ? "border-amber-300 bg-amber-50" : "border-rose-300 bg-rose-50"}`}>
    <div className="flex gap-3"><div className={`mt-0.5 ${feasible ? "text-moss-600" : unknown ? "text-amber-600" : "text-rose-600"}`}>{feasible ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}</div><div className="min-w-0"><p className="font-semibold text-ink">{feasible ? "Feasible timetable generated" : unknown ? "Solver result unknown" : "No valid timetable exists for these inputs"}</p><p className="mt-1 text-sm text-slate-700">{feasible ? "Every required DFIS teaching session is present and ready for coordinator review." : unknown ? "A time limit or mock-scope limit is not proof that the configuration is impossible. Try the live solver or revise the inputs." : "Review the specific unmet requirements and related hard constraints below, then return to configuration."}</p></div></div>
    {feasible && <div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Theory periods" value={`${response.metrics.scheduledTheoryPeriods}/${response.metrics.requiredTheoryPeriods}`} /><Metric label="Practical sessions" value={`${response.metrics.scheduledPracticalSessions}/${response.metrics.requiredPracticalSessions}`} /><Metric label="Validation" value={validation?.valid ? "Valid" : "Recheck required"} /></div>}
    {response.diagnostics.length > 0 && <div className="mt-4 space-y-2">{response.diagnostics.map((diagnostic) => <div key={diagnostic.code} className="rounded-lg bg-white/70 p-3 text-sm text-slate-700"><p className="font-medium text-ink">{diagnostic.message}</p>{diagnostic.suggestedChanges && <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-600">{diagnostic.suggestedChanges.map((change) => <li key={change}>{change}</li>)}</ul>}</div>)}</div>}
    {response.unassignedRequirements.length > 0 && <div className="mt-3 rounded-lg border border-rose-200 bg-white/70 p-3 text-sm text-rose-800"><span className="font-semibold">Unmet requirement: </span>{response.unassignedRequirements.map((item) => `${item.subjectCode} (${item.scheduled}/${item.expected} ${item.unit})`).join(", ")}</div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-white/80 p-3"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-ink">{value}</p></div>; }

function EmptyGrid({ status }: { status?: GenerateResponse["status"] }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center"><CalendarIcon /><h2 className="mt-4 text-lg font-semibold text-ink">{status === "infeasible" ? "Return to configuration to resolve the conflict" : "Your timetable will appear here"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{status === "infeasible" ? "No partial schedule is shown as a success. Adjust the mandatory constraints and generate again." : "Load the demo preset or configure your department, then generate a valid schedule."}</p></div>; }
function CalendarIcon() { return <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-ocean-100 text-ocean-700"><ChevronDown className="-rotate-90" size={23} /></div>; }

function TimetableGrid({ config, sessions, onOpen }: { config: SchedulingConfig; sessions: ScheduledSession[]; onOpen: (id: string) => void }) {
  const slots = buildPeriodSlots(config.university);
  const periods = slots.filter((slot) => slot.kind === "period");
  const days = config.university.workingDays;
  const sameSlot = (session: ScheduledSession) => sessions.filter((item) => item.day === session.day && item.startTime === session.startTime);
  const templateRows = ["auto", ...slots.map((slot) => slot.kind === "break" ? "44px" : "108px")].join(" ");
  return <div className="print-grid overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card"><div className="grid min-w-[900px]" style={{ gridTemplateColumns: `142px repeat(${days.length}, minmax(145px, 1fr))`, gridTemplateRows: templateRows }}>
    <div className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Period</div>
    {days.map((day) => <div key={day} className="border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-ink">{day}</div>)}
    {slots.map((slot, rowIndex) => <div key={slot.id} className={`sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-3 ${slot.kind === "break" ? "bg-amber-50" : "bg-white"}`} style={{ gridColumn: 1, gridRow: rowIndex + 2 }}><p className={`text-sm font-semibold ${slot.kind === "break" ? "text-amber-800" : "text-ink"}`}>{slot.label}</p><p className="mt-0.5 text-xs text-slate-500">{formatTime(slot.startTime)} - {formatTime(slot.endTime)}</p></div>)}
    {slots.flatMap((slot, rowIndex) => days.map((day, dayIndex) => <div key={`${slot.id}-${day}`} className={`border-b border-r border-slate-200 ${slot.kind === "break" ? "bg-amber-50/80" : "bg-white"}`} style={{ gridColumn: dayIndex + 2, gridRow: rowIndex + 2 }} />))}
    {sessions.map((session) => {
      const startIndex = slots.findIndex((slot) => slot.startTime === session.startTime && slot.kind === "period");
      const dayIndex = days.indexOf(session.day);
      if (startIndex < 0 || dayIndex < 0) return null;
      const matching = sameSlot(session);
      const index = matching.findIndex((item) => item.id === session.id);
      const fixed = config.fixedCommitments.some((item) => item.teachingRequirementId === session.teachingRequirementId && item.occurrenceIndex === session.occurrenceIndex && item.day === session.day && item.startTime === session.startTime && item.roomId === session.roomId);
      return <button key={session.id} onClick={() => onOpen(session.id)} className={`group z-[1] m-1 min-w-0 overflow-hidden rounded-lg border p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${session.kind === "practical" ? "border-violet-200 bg-violet-50 text-violet-950" : "border-ocean-200 bg-ocean-50 text-ocean-950"}`} style={{ gridColumn: dayIndex + 2, gridRow: `${startIndex + 2} / span ${session.durationPeriods}`, width: `${100 / matching.length}%`, marginLeft: index === 0 ? "4px" : `calc(${index * (100 / matching.length)}% + 1px)`, alignSelf: "stretch" }} aria-label={`Open ${session.subjectCode} session details`}><div className="flex items-start justify-between gap-1"><span className="font-bold text-[11px] tracking-wide">{session.subjectCode}</span>{fixed ? <LockKeyhole size={13} className="shrink-0 text-slate-600" aria-label="Fixed commitment" /> : session.locked ? <Lock size={13} className="shrink-0 text-slate-600" aria-label="Coordinator lock" /> : null}</div><p className="mt-1 line-clamp-2 text-xs font-semibold leading-4">{session.subjectName}</p><p className="mt-2 text-[11px] leading-4 opacity-75">{nameOf(config, "faculty", session.facultyId)}<br />{nameOf(config, "rooms", session.roomId)}{session.batchId ? ` · ${nameOf(config, "batches", session.batchId)}` : ""}</p>{session.durationPeriods > 1 && <span className="mt-1 inline-block rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-bold">{session.durationPeriods} periods</span>}</button>;
    })}
  </div></div>;
}

function nameOf(config: SchedulingConfig, collection: "faculty" | "rooms" | "batches", id: string) { const item = config[collection].find((record) => record.id === id); return item?.name ?? "Unknown"; }

function SessionDialog({ session, config, onClose, onUpdate }: { session: ScheduledSession; config: SchedulingConfig; onClose: () => void; onUpdate: (session: ScheduledSession) => Promise<ValidationResult> }) {
  const [day, setDay] = useState<DayOfWeek>(session.day);
  const [startTime, setStartTime] = useState(session.startTime);
  const [roomId, setRoomId] = useState(session.roomId);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fixed = config.fixedCommitments.some((item) => item.teachingRequirementId === session.teachingRequirementId && item.occurrenceIndex === session.occurrenceIndex && item.day === session.day && item.startTime === session.startTime && item.roomId === session.roomId);
  const validStartSlots = buildPeriodSlots(config.university).filter((slot, index, all) => slot.kind === "period" && all.slice(index, index + session.durationPeriods).every((candidate) => candidate.kind === "period"));
  const submit = async () => {
    setSubmitting(true); setError(null);
    const result = await onUpdate({ ...session, day, startTime, endTime: endTimeFor(startTime, session.durationPeriods, config.university), roomId });
    setSubmitting(false);
    if (!result.valid) { setError(result.conflicts.map((item) => item.message).join(" ")); return; }
    onClose();
  };
  const toggleLock = async () => {
    setSubmitting(true); setError(null);
    const result = await onUpdate({ ...session, locked: !session.locked });
    setSubmitting(false);
    if (!result.valid) setError(result.conflicts.map((item) => item.message).join(" ")); else onClose();
  };
  return <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="session-dialog-title"><div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-ocean-600">Session details</p><h2 id="session-dialog-title" className="mt-1 text-xl font-semibold text-ink">{session.subjectCode} - {session.subjectName}</h2><p className="mt-1 text-sm text-slate-600">{session.kind === "practical" ? "Practical" : "Theory"} · {session.durationPeriods} period{session.durationPeriods > 1 ? "s" : ""}</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close session details">×</button></div>{fixed && <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><LockKeyhole className="shrink-0" size={17} />This is an original fixed commitment. Its initial assignment is mandatory.</div>}<div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Day<select disabled={fixed} value={day} onChange={(event) => setDay(event.target.value as DayOfWeek)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-800 disabled:bg-slate-100">{config.university.workingDays.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Start time<select disabled={fixed} value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-800 disabled:bg-slate-100">{validStartSlots.map((item) => <option key={item.id} value={item.startTime}>{formatTime(item.startTime)}</option>)}</select></label><label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 sm:col-span-2">Room / laboratory<select disabled={fixed} value={roomId} onChange={(event) => setRoomId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-800 disabled:bg-slate-100">{config.rooms.filter((room) => session.kind === "theory" || room.type === "laboratory").map((room) => <option key={room.id} value={room.id}>{room.name} ({room.capacity} seats)</option>)}</select></label></div>{error && <div className="mt-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="shrink-0" size={17} />{error}</div>}<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button disabled={fixed || submitting} onClick={toggleLock} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{session.locked ? <Unlock size={16} /> : <Lock size={16} />}{session.locked ? "Unlock session" : "Lock session"}</button><div className="flex gap-2"><button onClick={onClose} className="rounded-lg px-3.5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button disabled={fixed || submitting} onClick={submit} className="rounded-lg bg-ocean-600 px-3.5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Checking…" : "Validate & save edit"}</button></div></div></div></div>;
}
