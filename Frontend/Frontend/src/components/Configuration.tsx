import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, ChevronRight, CopyPlus, FlaskConical, GraduationCap, Plus, Trash2, UsersRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { createId } from "../lib/ids";
import { buildPeriodSlots, formatTime } from "../lib/time";
import type { Batch, DayOfWeek, Faculty, FixedCommitment, Room, SchedulingConfig, StudentGroup, TeachingRequirement, TimeRange } from "../types/timetable";

type ConfigurationProps = {
  config: SchedulingConfig;
  onChange: (config: SchedulingConfig) => void;
  onLoadDfis: () => void;
  onLoadImpossible: () => void;
};

type Tab = "timings" | "rooms" | "groups" | "faculty" | "requirements" | "commitments";

const tabs: Array<{ id: Tab; label: string; icon: typeof CalendarClock }> = [
  { id: "timings", label: "University timings", icon: CalendarClock },
  { id: "rooms", label: "Rooms & laboratories", icon: FlaskConical },
  { id: "groups", label: "Student groups", icon: GraduationCap },
  { id: "faculty", label: "Faculty", icon: UsersRound },
  { id: "requirements", label: "Teaching requirements", icon: CopyPlus },
  { id: "commitments", label: "Fixed commitments", icon: CalendarClock },
];

const allDays: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const tinyInput = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-ocean-500 focus:ring-2 focus:ring-ocean-100";
const label = "block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500";

export function Configuration({ config, onChange, onLoadDfis, onLoadImpossible }: ConfigurationProps) {
  const [activeTab, setActiveTab] = useState<Tab>("timings");
  const [editingId, setEditingId] = useState<string | null>(null);

  const remove = (collection: keyof Pick<SchedulingConfig, "rooms" | "studentGroups" | "batches" | "faculty" | "teachingRequirements" | "fixedCommitments">, id: string) => {
    const isReferenced = (collection === "rooms" && config.fixedCommitments.some((item) => item.roomId === id))
      || (collection === "studentGroups" && (config.batches.some((item) => item.studentGroupId === id) || config.teachingRequirements.some((item) => item.studentGroupId === id)))
      || (collection === "faculty" && config.teachingRequirements.some((item) => item.facultyId === id))
      || (collection === "teachingRequirements" && config.fixedCommitments.some((item) => item.teachingRequirementId === id));
    const warning = isReferenced ? "This record is referenced by another configuration item. Removing it may make the configuration invalid." : "Remove this record?";
    if (!window.confirm(warning)) return;
    if (collection === "rooms") onChange({ ...config, rooms: config.rooms.filter((item) => item.id !== id) });
    else if (collection === "studentGroups") onChange({ ...config, studentGroups: config.studentGroups.filter((item) => item.id !== id) });
    else if (collection === "batches") onChange({ ...config, batches: config.batches.filter((item) => item.id !== id) });
    else if (collection === "faculty") onChange({ ...config, faculty: config.faculty.filter((item) => item.id !== id) });
    else if (collection === "teachingRequirements") onChange({ ...config, teachingRequirements: config.teachingRequirements.filter((item) => item.id !== id) });
    else onChange({ ...config, fixedCommitments: config.fixedCommitments.filter((item) => item.id !== id) });
    setEditingId(null);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-ocean-100 bg-ocean-50/60 p-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-semibold text-ocean-700">Demo presets</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Start with a real scheduling scenario</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Demo records are fictional and can be edited. The impossible preset is designed to exercise clear solver diagnostics.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onLoadDfis} className="rounded-lg bg-ocean-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ocean-700">Load M.Sc. DFIS Demo</button>
          <button onClick={onLoadImpossible} className="rounded-lg border border-ocean-200 bg-white px-4 py-2.5 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50">Load Impossible Demo</button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm xl:block xl:space-y-1">
          {tabs.map(({ id, label: tabLabel, icon: Icon }) => (
            <button key={id} onClick={() => { setActiveTab(id); setEditingId(null); }} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition xl:w-full ${activeTab === id ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <Icon size={17} />{tabLabel}<ChevronRight className="ml-auto hidden xl:block" size={15} />
            </button>
          ))}
        </aside>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
          {activeTab === "timings" && <TimingsEditor config={config} onChange={onChange} />}
          {activeTab === "rooms" && <RoomsEditor config={config} onChange={onChange} editingId={editingId} setEditingId={setEditingId} onDelete={(id) => remove("rooms", id)} />}
          {activeTab === "groups" && <GroupsEditor config={config} onChange={onChange} editingId={editingId} setEditingId={setEditingId} onDelete={(id) => remove("studentGroups", id)} />}
          {activeTab === "faculty" && <FacultyEditor config={config} onChange={onChange} editingId={editingId} setEditingId={setEditingId} onDelete={(id) => remove("faculty", id)} />}
          {activeTab === "requirements" && <RequirementsEditor config={config} onChange={onChange} editingId={editingId} setEditingId={setEditingId} onDelete={(id) => remove("teachingRequirements", id)} />}
          {activeTab === "commitments" && <CommitmentsEditor config={config} onChange={onChange} editingId={editingId} setEditingId={setEditingId} onDelete={(id) => remove("fixedCommitments", id)} />}
        </div>
      </div>
    </section>
  );
}

const timingSchema = z.object({
  officialStartTime: z.string().regex(/^\d{2}:\d{2}$/, "Use a 24-hour time"),
  officialEndTime: z.string().regex(/^\d{2}:\d{2}$/, "Use a 24-hour time"),
  periodDurationMinutes: z.coerce.number().min(20, "Periods must be at least 20 minutes").max(180),
});
type TimingForm = z.infer<typeof timingSchema>;

function TimingsEditor({ config, onChange }: Pick<ConfigurationProps, "config" | "onChange">) {
  const { register, handleSubmit, formState: { errors } } = useForm<TimingForm>({
    resolver: zodResolver(timingSchema),
    values: {
      officialStartTime: config.university.officialStartTime,
      officialEndTime: config.university.officialEndTime,
      periodDurationMinutes: config.university.periodDurationMinutes,
    },
  });
  const slots = buildPeriodSlots(config.university);
  const submit = (values: TimingForm) => onChange({ ...config, university: { ...config.university, ...values } });
  const toggleDay = (day: DayOfWeek) => {
    const workingDays = config.university.workingDays.includes(day)
      ? config.university.workingDays.filter((item) => item !== day)
      : [...config.university.workingDays, day];
    onChange({ ...config, university: { ...config.university, workingDays } });
  };
  const updateBreak = (key: "startTime" | "endTime", value: string) => onChange({
    ...config,
    university: { ...config.university, breaks: config.university.breaks.map((item, index) => index === 0 ? { ...item, [key]: value } : item) },
  });

  return <div className="space-y-7">
    <Header eyebrow="Mandatory constraints" title="University timings" description="Periods are calculated from these official working hours. Breaks will never be treated as teaching slots." />
    <form onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-3">
      <Input label="Official start" type="time" error={errors.officialStartTime?.message} registration={register("officialStartTime")} />
      <Input label="Official end" type="time" error={errors.officialEndTime?.message} registration={register("officialEndTime")} />
      <Input label="Period duration (minutes)" type="number" error={errors.periodDurationMinutes?.message} registration={register("periodDurationMinutes")} />
      <div className="sm:col-span-3 flex justify-end"><button className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white">Apply timing changes</button></div>
    </form>
    <div>
      <p className={label}>Working days</p>
      <div className="mt-2 flex flex-wrap gap-2">{allDays.map((day) => <button key={day} onClick={() => toggleDay(day)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${config.university.workingDays.includes(day) ? "bg-ocean-100 text-ocean-700" : "bg-slate-100 text-slate-500"}`}>{day}</button>)}</div>
    </div>
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between"><div><p className="font-semibold text-ink">Scheduled break</p><p className="text-sm text-slate-500">Mandatory - sessions cannot be allocated here.</p></div><span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">Blocked</span></div>
      {config.university.breaks[0] && <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className={label}>Label<input className={tinyInput} value={config.university.breaks[0].label} onChange={(event) => onChange({ ...config, university: { ...config.university, breaks: [{ ...config.university.breaks[0], label: event.target.value }] } })} /></label><label className={label}>Start<input className={tinyInput} type="time" value={config.university.breaks[0].startTime} onChange={(event) => updateBreak("startTime", event.target.value)} /></label><label className={label}>End<input className={tinyInput} type="time" value={config.university.breaks[0].endTime} onChange={(event) => updateBreak("endTime", event.target.value)} /></label></div>}
    </div>
    <div><p className="font-semibold text-ink">Resulting period structure</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{slots.map((slot) => <div key={slot.id} className={`rounded-lg border px-3 py-2 text-sm ${slot.kind === "break" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}><span className="font-semibold">{slot.label}</span><span className="ml-2 text-slate-500">{formatTime(slot.startTime)} - {formatTime(slot.endTime)}</span></div>)}</div></div>
  </div>;
}

function RoomsEditor({ config, onChange, editingId, setEditingId, onDelete }: EntityProps) {
  const selected = config.rooms.find((item) => item.id === editingId);
  const update = (room: Room) => onChange({ ...config, rooms: config.rooms.map((item) => item.id === room.id ? room : item) });
  const add = () => { const room: Room = { id: createId("room"), name: "New room", type: "classroom", capacity: 30, availability: {} }; onChange({ ...config, rooms: [...config.rooms, room] }); setEditingId(room.id); };
  return <RecordLayout title="Rooms & laboratories" description="Capacity, laboratory type, and availability are mandatory solver inputs." addLabel="Add room" onAdd={add} items={config.rooms.map((room) => ({ id: room.id, title: room.name, subtitle: `${room.type === "laboratory" ? room.laboratoryType ?? "Laboratory" : "Classroom"} - ${room.capacity} seats` }))} editingId={editingId} onSelect={setEditingId} onDelete={onDelete}>
    {selected && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Input label="Room name" value={selected.name} onChange={(value) => update({ ...selected, name: value })} /><Input label="Capacity" type="number" value={selected.capacity} onChange={(value) => update({ ...selected, capacity: Number(value) })} /><Select label="Space type" value={selected.type} options={[{ value: "classroom", label: "Classroom" }, { value: "laboratory", label: "Laboratory" }]} onChange={(value) => update({ ...selected, type: value as Room["type"] })} />{selected.type === "laboratory" && <Input label="Laboratory type" value={selected.laboratoryType ?? ""} placeholder="e.g. Data forensics" onChange={(value) => update({ ...selected, laboratoryType: value })} />}</div><AvailabilityEditor availability={selected.availability} workingDays={config.university.workingDays} onChange={(availability) => update({ ...selected, availability })} /></div>}
  </RecordLayout>;
}

function GroupsEditor({ config, onChange, editingId, setEditingId, onDelete }: EntityProps) {
  const isBatch = editingId?.startsWith("batch-");
  const group = config.studentGroups.find((item) => item.id === editingId);
  const batch = config.batches.find((item) => item.id === editingId);
  const updateGroup = (next: StudentGroup) => onChange({ ...config, studentGroups: config.studentGroups.map((item) => item.id === next.id ? next : item) });
  const updateBatch = (next: Batch) => onChange({ ...config, batches: config.batches.map((item) => item.id === next.id ? next : item) });
  const addGroup = () => { const record: StudentGroup = { id: createId("group"), programme: "New programme", semester: "Semester I", section: "A", strength: 30 }; onChange({ ...config, studentGroups: [...config.studentGroups, record] }); setEditingId(record.id); };
  const addBatch = () => { const record: Batch = { id: createId("batch"), studentGroupId: config.studentGroups[0]?.id ?? "", name: "New batch", strength: 15 }; onChange({ ...config, batches: [...config.batches, record] }); setEditingId(record.id); };
  const deleteSelected = (id: string) => isBatch ? (window.confirm("Remove this batch?") && onChange({ ...config, batches: config.batches.filter((item) => item.id !== id) })) : onDelete(id);
  const items = [...config.studentGroups.map((item) => ({ id: item.id, title: `${item.programme} - ${item.semester}`, subtitle: `Section ${item.section} - ${item.strength} students` })), ...config.batches.map((item) => ({ id: item.id, title: item.name, subtitle: `Batch - ${item.strength} students` }))];
  return <RecordLayout title="Programmes & student groups" description="Every practical batch belongs to a parent student group." addLabel="Add student group" onAdd={addGroup} secondaryAction={{ label: "Add practical batch", onClick: addBatch }} items={items} editingId={editingId} onSelect={setEditingId} onDelete={deleteSelected}>
    {group && <div className="grid gap-4 sm:grid-cols-2"><Input label="Programme" value={group.programme} onChange={(value) => updateGroup({ ...group, programme: value })} /><Input label="Semester" value={group.semester} onChange={(value) => updateGroup({ ...group, semester: value })} /><Input label="Section" value={group.section} onChange={(value) => updateGroup({ ...group, section: value })} /><Input label="Student strength" type="number" value={group.strength} onChange={(value) => updateGroup({ ...group, strength: Number(value) })} /></div>}
    {batch && <div className="grid gap-4 sm:grid-cols-2"><Input label="Batch name" value={batch.name} onChange={(value) => updateBatch({ ...batch, name: value })} /><Input label="Batch strength" type="number" value={batch.strength} onChange={(value) => updateBatch({ ...batch, strength: Number(value) })} /><Select label="Parent student group" value={batch.studentGroupId} options={config.studentGroups.map((item) => ({ value: item.id, label: `${item.programme} ${item.semester} - ${item.section}` }))} onChange={(value) => updateBatch({ ...batch, studentGroupId: value })} /></div>}
  </RecordLayout>;
}

function FacultyEditor({ config, onChange, editingId, setEditingId, onDelete }: EntityProps) {
  const selected = config.faculty.find((item) => item.id === editingId);
  const update = (faculty: Faculty) => onChange({ ...config, faculty: config.faculty.map((item) => item.id === faculty.id ? faculty : item) });
  const add = () => { const record: Faculty = { id: createId("faculty"), name: "New faculty", available: {}, unavailableSlots: [], maxTeachingPeriodsPerDay: 4 }; onChange({ ...config, faculty: [...config.faculty, record] }); setEditingId(record.id); };
  return <RecordLayout title="Faculty availability" description="Set available days and an optional daily teaching cap. Unavailable slots become hard scheduling constraints." addLabel="Add faculty" onAdd={add} items={config.faculty.map((item) => ({ id: item.id, title: item.name, subtitle: `${Object.keys(item.available).length || 0} available days - max ${item.maxTeachingPeriodsPerDay ?? "unlimited"} periods/day` }))} editingId={editingId} onSelect={setEditingId} onDelete={onDelete}>
    {selected && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Input label="Faculty name" value={selected.name} onChange={(value) => update({ ...selected, name: value })} /><Input label="Max teaching periods / day" type="number" value={selected.maxTeachingPeriodsPerDay ?? ""} onChange={(value) => update({ ...selected, maxTeachingPeriodsPerDay: Number(value) || undefined })} /></div><AvailabilityEditor availability={selected.available} workingDays={config.university.workingDays} onChange={(available) => update({ ...selected, available })} /><UnavailableSlotsEditor slots={selected.unavailableSlots} workingDays={config.university.workingDays} onChange={(unavailableSlots) => update({ ...selected, unavailableSlots })} /></div>}
  </RecordLayout>;
}

function RequirementsEditor({ config, onChange, editingId, setEditingId, onDelete }: EntityProps) {
  const selected = config.teachingRequirements.find((item) => item.id === editingId);
  const update = (record: TeachingRequirement) => onChange({ ...config, teachingRequirements: config.teachingRequirements.map((item) => item.id === record.id ? record : item) });
  const add = () => { const record: TeachingRequirement = { id: createId("requirement"), subjectCode: "NEW101", subjectName: "New subject", studentGroupId: config.studentGroups[0]?.id ?? "", kind: "theory", facultyId: config.faculty[0]?.id ?? "", theoryPeriodsPerWeek: 1 }; onChange({ ...config, teachingRequirements: [...config.teachingRequirements, record] }); setEditingId(record.id); };
  return <RecordLayout title="Teaching requirements" description="Weekly requirements are hard constraints; preferred slots are soft preferences when the solver can accommodate them." addLabel="Add teaching requirement" onAdd={add} items={config.teachingRequirements.map((item) => ({ id: item.id, title: `${item.subjectCode} - ${item.subjectName}`, subtitle: item.kind === "theory" ? `Theory - ${item.theoryPeriodsPerWeek ?? 0} periods/week` : `Practical - ${item.practicalSessionsPerWeekPerBatch ?? 0} session(s)/batch` }))} editingId={editingId} onSelect={setEditingId} onDelete={onDelete}>
    {selected && <div className="grid gap-4 sm:grid-cols-2"><Input label="Subject code" value={selected.subjectCode} onChange={(value) => update({ ...selected, subjectCode: value })} /><Input label="Subject name" value={selected.subjectName} onChange={(value) => update({ ...selected, subjectName: value })} /><Select label="Teaching type" value={selected.kind} options={[{ value: "theory", label: "Theory" }, { value: "practical", label: "Practical" }]} onChange={(value) => update({ ...selected, kind: value as TeachingRequirement["kind"], theoryPeriodsPerWeek: value === "theory" ? selected.theoryPeriodsPerWeek || 1 : undefined, practicalSessionsPerWeekPerBatch: value === "practical" ? selected.practicalSessionsPerWeekPerBatch || 1 : undefined })} /><Select label="Assigned faculty" value={selected.facultyId} options={config.faculty.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => update({ ...selected, facultyId: value })} /><Select label="Student group" value={selected.studentGroupId} options={config.studentGroups.map((item) => ({ value: item.id, label: `${item.programme} ${item.semester} - ${item.section}` }))} onChange={(value) => update({ ...selected, studentGroupId: value })} />{selected.kind === "theory" ? <Input label="Theory periods / week" type="number" value={selected.theoryPeriodsPerWeek ?? 1} onChange={(value) => update({ ...selected, theoryPeriodsPerWeek: Number(value) })} /> : <><Input label="Sessions / batch / week" type="number" value={selected.practicalSessionsPerWeekPerBatch ?? 1} onChange={(value) => update({ ...selected, practicalSessionsPerWeekPerBatch: Number(value) })} /><Input label="Consecutive periods / session" type="number" value={selected.consecutivePeriodsPerSession ?? 2} onChange={(value) => update({ ...selected, consecutivePeriodsPerSession: Number(value) })} /><Input label="Required laboratory type" value={selected.requiredLaboratoryType ?? ""} onChange={(value) => update({ ...selected, requiredLaboratoryType: value })} /></>}</div>}
  </RecordLayout>;
}

function CommitmentsEditor({ config, onChange, editingId, setEditingId, onDelete }: EntityProps) {
  const selected = config.fixedCommitments.find((item) => item.id === editingId);
  const update = (record: FixedCommitment) => onChange({ ...config, fixedCommitments: config.fixedCommitments.map((item) => item.id === record.id ? record : item) });
  const add = () => { const record: FixedCommitment = { id: createId("fixed"), teachingRequirementId: config.teachingRequirements[0]?.id ?? "", batchId: null, occurrenceIndex: 1, day: "Monday", startTime: "09:00", roomId: config.rooms[0]?.id ?? "" }; onChange({ ...config, fixedCommitments: [...config.fixedCommitments, record] }); setEditingId(record.id); };
  return <RecordLayout title="Fixed commitments" description="These are mandatory assignments. User session locks are separate and are sent during regeneration." addLabel="Add fixed commitment" onAdd={add} items={config.fixedCommitments.map((item) => { const requirement = config.teachingRequirements.find((record) => record.id === item.teachingRequirementId); return { id: item.id, title: requirement?.subjectCode ?? "Unknown requirement", subtitle: `${item.day}, ${item.startTime} - occurrence ${item.occurrenceIndex}` }; })} editingId={editingId} onSelect={setEditingId} onDelete={onDelete}>
    {selected && <div className="grid gap-4 sm:grid-cols-2"><Select label="Teaching requirement" value={selected.teachingRequirementId} options={config.teachingRequirements.map((item) => ({ value: item.id, label: `${item.subjectCode} - ${item.subjectName}` }))} onChange={(value) => update({ ...selected, teachingRequirementId: value })} /><Select label="Batch (if practical)" value={selected.batchId ?? ""} options={[{ value: "", label: "Whole class / no batch" }, ...config.batches.map((item) => ({ value: item.id, label: item.name }))]} onChange={(value) => update({ ...selected, batchId: value || null })} /><Select label="Day" value={selected.day} options={config.university.workingDays.map((item) => ({ value: item, label: item }))} onChange={(value) => update({ ...selected, day: value as DayOfWeek })} /><Input label="Start time" type="time" value={selected.startTime} onChange={(value) => update({ ...selected, startTime: value })} /><Select label="Room" value={selected.roomId} options={config.rooms.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => update({ ...selected, roomId: value })} /><Input label="Session occurrence" type="number" value={selected.occurrenceIndex} onChange={(value) => update({ ...selected, occurrenceIndex: Number(value) })} /></div>}
  </RecordLayout>;
}

type EntityProps = { config: SchedulingConfig; onChange: (config: SchedulingConfig) => void; editingId: string | null; setEditingId: (id: string | null) => void; onDelete: (id: string) => void };
function RecordLayout({ title, description, addLabel, onAdd, secondaryAction, items, editingId, onSelect, onDelete, children }: { title: string; description: string; addLabel: string; onAdd: () => void; secondaryAction?: { label: string; onClick: () => void }; items: Array<{ id: string; title: string; subtitle: string }>; editingId: string | null; onSelect: (id: string) => void; onDelete: (id: string) => void; children: ReactNode }) {
  return <div className="space-y-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><Header eyebrow="Configuration" title={title} description={description} /><div className="flex flex-wrap gap-2"><button onClick={onAdd} className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white"><Plus size={16} />{addLabel}</button>{secondaryAction && <button onClick={secondaryAction.onClick} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">{secondaryAction.label}</button>}</div></div><div className="grid gap-5 lg:grid-cols-[minmax(230px,.8fr)_minmax(0,1.2fr)]"><div className="space-y-2">{items.map((item) => <button key={item.id} onClick={() => onSelect(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${editingId === item.id ? "border-ocean-500 bg-ocean-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}><p className="font-semibold text-ink">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.subtitle}</p></button>)}{items.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No records added yet.</p>}</div><div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">{editingId ? <><div className="mb-5 flex items-center justify-between"><p className="font-semibold text-ink">Edit record</p><button onClick={() => onDelete(editingId)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700 hover:text-rose-800"><Trash2 size={15} />Delete</button></div>{children}</> : <div className="flex min-h-52 items-center justify-center text-center"><p className="max-w-xs text-sm text-slate-500">Select a record to edit it, or use the add button to create one.</p></div>}</div></div></div>;
}

function Header({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-ocean-600">{eyebrow}</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">{title}</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</p></div>; }
function Input({ label: inputLabel, type = "text", value, placeholder, onChange, error, registration }: { label: string; type?: string; value?: string | number; placeholder?: string; onChange?: (value: string) => void; error?: string; registration?: UseFormRegisterReturn }) { return <label className={label}>{inputLabel}<input className={tinyInput} type={type} value={value} placeholder={placeholder} onChange={onChange ? (event) => onChange(event.target.value) : undefined} {...registration} />{error && <span className="mt-1 block text-xs normal-case tracking-normal text-rose-600">{error}</span>}</label>; }
function Select({ label: selectLabel, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) { return <label className={label}>{selectLabel}<select className={tinyInput} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>; }

function AvailabilityEditor({ availability, workingDays, onChange }: { availability: Partial<Record<DayOfWeek, TimeRange[]>>; workingDays: DayOfWeek[]; onChange: (availability: Partial<Record<DayOfWeek, TimeRange[]>>) => void }) {
  const enabledDays = workingDays.filter((day) => availability[day]);
  const toggle = (day: DayOfWeek) => {
    const next = { ...availability };
    if (next[day]) delete next[day]; else next[day] = [{ startTime: "09:00", endTime: "14:30" }];
    onChange(next);
  };
  const edit = (day: DayOfWeek, key: keyof TimeRange, value: string) => onChange({ ...availability, [day]: [{ ...(availability[day]?.[0] ?? { startTime: "09:00", endTime: "14:30" }), [key]: value }] });
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="font-semibold text-ink">Availability by day and time</p><p className="mt-1 text-xs text-slate-500">Selected days are available. Unselected days are unavailable.</p><div className="mt-3 flex flex-wrap gap-2">{workingDays.map((day) => <button key={day} onClick={() => toggle(day)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${availability[day] ? "bg-moss-50 text-moss-600 ring-1 ring-moss-500/30" : "bg-slate-100 text-slate-500"}`}>{day}</button>)}</div>{enabledDays.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{enabledDays.map((day) => <div key={day} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-semibold text-ink">{day}</p><div className="mt-2 grid grid-cols-2 gap-2"><label className={label}>Start<input type="time" className={tinyInput} value={availability[day]?.[0]?.startTime ?? "09:00"} onChange={(event) => edit(day, "startTime", event.target.value)} /></label><label className={label}>End<input type="time" className={tinyInput} value={availability[day]?.[0]?.endTime ?? "14:30"} onChange={(event) => edit(day, "endTime", event.target.value)} /></label></div></div>)}</div>}</div>;
}

function UnavailableSlotsEditor({ slots, workingDays, onChange }: { slots: Faculty["unavailableSlots"]; workingDays: DayOfWeek[]; onChange: (slots: Faculty["unavailableSlots"]) => void }) {
  const add = () => onChange([...slots, { day: workingDays[0] ?? "Monday", startTime: "09:00", endTime: "09:50" }]);
  const edit = (index: number, key: "day" | "startTime" | "endTime", value: string) => onChange(slots.map((slot, current) => current === index ? { ...slot, [key]: value } as typeof slot : slot));
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-ink">Unavailable slots</p><p className="mt-1 text-xs text-slate-500">These hard blocks take precedence over broad availability.</p></div><button onClick={add} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold text-slate-700"><Plus size={14} />Add block</button></div>{slots.length > 0 ? <div className="mt-3 space-y-2">{slots.map((slot, index) => <div key={`${slot.day}-${index}`} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2"><Select label="Day" value={slot.day} options={workingDays.map((day) => ({ value: day, label: day }))} onChange={(value) => edit(index, "day", value)} /><Input label="Start" type="time" value={slot.startTime} onChange={(value) => edit(index, "startTime", value)} /><Input label="End" type="time" value={slot.endTime} onChange={(value) => edit(index, "endTime", value)} /><button onClick={() => onChange(slots.filter((_, current) => current !== index))} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50" aria-label="Remove unavailable slot"><Trash2 size={16} /></button></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No specific blocks have been added.</p>}</div>;
}
