import { ArchiveRestore, CalendarDays, CheckCircle2, CircleDashed, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { SavedTimetable } from "../types/timetable";

export function SavedTimetables({ onOpen }: { onOpen: (record: SavedTimetable) => void }) {
  const [items, setItems] = useState<SavedTimetable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setItems(await api.listTimetables()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Saved timetables could not be loaded."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  if (loading) return <div className="grid min-h-80 place-items-center rounded-2xl border border-slate-200 bg-white"><div className="text-center text-slate-500"><Loader2 className="mx-auto animate-spin text-ocean-600" /><p className="mt-3 text-sm">Loading saved timetables…</p></div></div>;
  return <section className="space-y-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-ocean-600">Coordinator archive</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Saved timetables</h1><p className="mt-1 text-sm text-slate-600">Reopen a draft to continue reviewing it, or inspect a published timetable.</p></div><button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArchiveRestore size={16} />Refresh list</button></div>{error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}{items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center"><CalendarDays className="mx-auto text-slate-400" size={32} /><h2 className="mt-4 font-semibold text-ink">No saved timetables yet</h2><p className="mt-2 text-sm text-slate-600">Generate a valid timetable, then save it as a draft from the timetable screen.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="font-semibold text-ink">{item.name}</h2><StatusBadge status={item.status} /></div><p className="mt-1 text-sm text-slate-500">Updated {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.updatedAt))}</p></div>{item.validation?.valid ? <CheckCircle2 className="text-moss-600" size={22} /> : <CircleDashed className="text-amber-500" size={22} />}</div><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-sm text-slate-600">{item.sessions.length} scheduled session{item.sessions.length === 1 ? "" : "s"}</p><button onClick={() => onOpen(item)} className="inline-flex items-center gap-2 text-sm font-semibold text-ocean-700 hover:text-ocean-800">Open timetable <ExternalLink size={15} /></button></div></article>)}</div>}</section>;
}

function StatusBadge({ status }: { status: SavedTimetable["status"] }) { return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${status === "published" ? "bg-moss-50 text-moss-600" : "bg-slate-100 text-slate-600"}`}>{status === "published" ? "Published" : "Draft"}</span>; }
