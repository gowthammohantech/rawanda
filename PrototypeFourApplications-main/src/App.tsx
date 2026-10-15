import { useEffect, useMemo, useState, type ReactNode } from "react";

type AppId = "clinical" | "worker" | "admin" | "citizen";
type IconName =
  | "activity"
  | "arrow"
  | "bell"
  | "calendar"
  | "check"
  | "chevron"
  | "clipboard"
  | "close"
  | "download"
  | "heart"
  | "home"
  | "menu"
  | "more"
  | "people"
  | "plus"
  | "search"
  | "settings"
  | "shield"
  | "sync"
  | "trend"
  | "user"
  | "wallet";

const appMeta: Record<AppId, { label: string; short: string; role: string }> = {
  clinical: {
    label: "Clinical Portal",
    short: "Clinical",
    role: "Clinical reviewer",
  },
  worker: {
    label: "Health Worker",
    short: "Field work",
    role: "Community health worker",
  },
  admin: {
    label: "Programme Dashboard",
    short: "Programme",
    role: "Programme analyst",
  },
  citizen: {
    label: "Citizen Wallet",
    short: "My health",
    role: "Citizen",
  },
};

const queue = [
  {
    initials: "UM",
    name: "Uwimana Marie",
    id: "CC-00471",
    readings: "BP 152/96 · Glucose 7.8 mmol/L",
    time: "Today, 09:42",
    status: "High priority",
    tone: "danger",
    due: "Review within 2h",
  },
  {
    initials: "HN",
    name: "Habimana Noël",
    id: "CC-00468",
    readings: "BP 148/92 · Glucose 5.4 mmol/L",
    time: "Today, 08:25",
    status: "Needs review",
    tone: "warning",
    due: "Due today",
  },
  {
    initials: "IM",
    name: "Iradukunda Mireille",
    id: "CC-00455",
    readings: "BP 138/88 · Glucose 8.1 mmol/L",
    time: "Yesterday, 16:10",
    status: "Overdue",
    tone: "danger",
    due: "Overdue by 4h",
  },
  {
    initials: "KN",
    name: "Kamanzi Nathan",
    id: "CC-00449",
    readings: "BP 142/90 · Glucose 6.2 mmol/L",
    time: "Yesterday, 14:48",
    status: "Needs review",
    tone: "warning",
    due: "Due today",
  },
];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    activity: <><path d="M3 12h4l2.2-6 4 12 2.3-6H21" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    calendar: <><path d="M4 5h16v16H4zM8 3v4M16 3v4M4 10h16" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    chevron: <><path d="m9 18 6-6-6-6" /></>,
    clipboard: <><path d="M9 5H6v16h12V5h-3M9 3h6v4H9zM9 12h6M9 16h4" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M5 21h14" /></>,
    heart: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></>,
    home: <><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3z" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    sync: <><path d="M20 7h-5V2M4 17h5v5M19 12a7 7 0 0 0-12-5l-3 3M5 12a7 7 0 0 0 12 5l3-3" /></>,
    trend: <><path d="m3 17 6-6 4 4 8-9M15 6h6v6" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    wallet: <><path d="M3 6h16v14H3zM3 6l3-3h11v3M15 12h6v4h-6z" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function RwandaMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? "brand-mark--compact" : ""}`}>
      <div className="brand-symbol" aria-hidden="true">
        <span className="sun-core" />
        {Array.from({ length: 12 }).map((_, index) => (
          <span className="sun-ray" key={index} style={{ transform: `rotate(${index * 30}deg)` }} />
        ))}
      </div>
      <div className="brand-copy">
        <strong>CareConnect</strong>
        <span>Rwanda</span>
      </div>
    </div>
  );
}

function Button({
  children,
  kind = "primary",
  icon,
  onClick,
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  kind?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button className={`btn btn--${kind} ${className}`} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  );
}

function Loader({ leaving }: { leaving: boolean }) {
  return (
    <div className={`loader ${leaving ? "loader--leaving" : ""}`}>
      <div className="loader-glow" />
      <RwandaMark />
      <div className="loader-message">Connecting care, from community to clinic</div>
      <div className="loader-progress"><span /></div>
      <div className="loader-foot">Secure care coordination · Rwanda</div>
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="demo-banner">
      <Icon name="shield" size={15} />
      <span><strong>DEMONSTRATION</strong> · SYNTHETIC PATIENT DATA · NOT FOR CLINICAL USE</span>
    </div>
  );
}

function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`status status--${tone}`}><i />{children}</span>;
}

function AppSwitcher({ active, onChange }: { active: AppId; onChange: (id: AppId) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-switcher">
      <button className="switcher-trigger" onClick={() => setOpen(!open)}>
        <span className={`app-glyph app-glyph--${active}`}><Icon name={active === "clinical" ? "activity" : active === "worker" ? "clipboard" : active === "admin" ? "trend" : "heart"} size={17} /></span>
        <span><small>Application</small><strong>{appMeta[active].label}</strong></span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="switcher-menu">
          <div className="switcher-heading">CareConnect suite</div>
          {(Object.keys(appMeta) as AppId[]).map((id) => (
            <button key={id} className={active === id ? "active" : ""} onClick={() => { onChange(id); setOpen(false); }}>
              <span className={`app-glyph app-glyph--${id}`}><Icon name={id === "clinical" ? "activity" : id === "worker" ? "clipboard" : id === "admin" ? "trend" : "heart"} size={17} /></span>
              <span><strong>{appMeta[id].label}</strong><small>{appMeta[id].role}</small></span>
              {active === id && <Icon name="check" size={17} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Topbar({ active, onChange }: { active: AppId; onChange: (id: AppId) => void }) {
  return (
    <header className="topbar">
      <RwandaMark compact />
      <div className="topbar-centre">
        <AppSwitcher active={active} onChange={onChange} />
        <label className="global-search">
          <Icon name="search" size={17} />
          <input
            aria-label="Global search"
            placeholder={
              active === "clinical"
                ? "Search patients, tasks or referrals"
                : active === "admin"
                  ? "Search reports, facilities or metrics"
                  : "Search CareConnect"
            }
          />
          <kbd>⌘K</kbd>
        </label>
      </div>
      <div className="topbar-actions">
        <button className="icon-button" aria-label="Notifications"><Icon name="bell" /><span className="notification-dot" /></button>
        <div className="profile"><span>DN</span><div><strong>Dr. Diane N.</strong><small>{appMeta[active].role}</small></div></div>
      </div>
    </header>
  );
}

function Sidebar({ active }: { active: AppId }) {
  const links: Record<AppId, [IconName, string][]> = {
    clinical: [["home", "Overview"], ["clipboard", "Review queue"], ["people", "Patients"], ["activity", "Referrals"], ["calendar", "Care tasks"]],
    worker: [["home", "Today"], ["search", "Find patient"], ["plus", "New screening"], ["clipboard", "My tasks"], ["sync", "Sync centre"]],
    admin: [["home", "Overview"], ["trend", "Care pathway"], ["activity", "Timeliness"], ["people", "Workload"], ["shield", "Governance"]],
    citizen: [["home", "My health"], ["clipboard", "Next steps"], ["bell", "Reminders"], ["activity", "Timeline"], ["shield", "Privacy"]],
  };
  return (
    <aside className="sidebar">
      <nav>
        <div className="nav-label">{active === "citizen" ? "MY CARE" : "WORKSPACE"}</div>
        {links[active].map(([icon, label], index) => (
          <button key={label} className={index === (active === "clinical" ? 1 : 0) ? "active" : ""}>
            <Icon name={icon} size={19} /><span>{label}</span>{label === "Review queue" && <b>8</b>}{label === "Sync centre" && <b>3</b>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button><Icon name="settings" size={19} /><span>Settings</span></button>
        <div className="facility">
          <Icon name="shield" size={18} />
          <div><small>Active facility</small><strong>Kigali Demo Health Centre</strong></div>
        </div>
      </div>
    </aside>
  );
}

function DesktopShell({ active, onChange, children }: { active: AppId; onChange: (id: AppId) => void; children: ReactNode }) {
  return (
    <div className="desktop-shell">
      <DemoBanner />
      <Topbar active={active} onChange={onChange} />
      <div className="shell-body"><Sidebar active={active} /><main>{children}</main></div>
    </div>
  );
}

function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="page-title">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<div className="display-title">{title}</div><p>{subtitle}</p></div>
      {action}
    </div>
  );
}

function Metric({ label, value, change, icon, tone = "teal" }: { label: string; value: string; change: string; icon: IconName; tone?: string }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon metric-icon--${tone}`}><Icon name={icon} /></div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <div className={`metric-change ${change.startsWith("+") ? "up" : ""}`}><Icon name="trend" size={14} />{change}</div>
    </div>
  );
}

function ClinicalApp({ onChange }: { onChange: (id: AppId) => void }) {
  const [filter, setFilter] = useState("All pending");
  const [selected, setSelected] = useState<(typeof queue)[number] | null>(null);
  const filtered = filter === "All pending" ? queue : queue.filter((item) => item.status === filter);
  return (
    <DesktopShell active="clinical" onChange={onChange}>
      <PageTitle eyebrow="CLINICAL WORKSPACE" title="Review queue" subtitle="Prioritised screening records awaiting a clinical decision." action={<Button icon="plus">Create care task</Button>} />
      <div className="metric-grid clinical-metrics">
        <Metric label="Awaiting review" value="8" change="+2 since yesterday" icon="clipboard" />
        <Metric label="High priority" value="3" change="Requires attention" icon="activity" tone="red" />
        <Metric label="Due today" value="5" change="Within target" icon="calendar" tone="amber" />
        <Metric label="Reviewed this week" value="42" change="+12% from last week" icon="check" tone="green" />
      </div>
      <section className="panel queue-panel">
        <div className="panel-header">
          <div><div className="section-title">Pending reviews</div><p>Assigned to your facility · Updated just now</p></div>
          <div className="filters">
            {["All pending", "High priority", "Overdue"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
          </div>
        </div>
        <div className="search-row">
          <div className="search-box"><Icon name="search" size={18} /><input aria-label="Search queue" placeholder="Search patient name or ID" /></div>
          <Button kind="secondary" icon="settings">Filters</Button>
        </div>
        <div className="queue-table">
          <div className="table-head"><span>Patient</span><span>Latest screening</span><span>Status</span><span>Review target</span><span /></div>
          {filtered.map((patient) => (
            <button className="queue-row" key={patient.id} onClick={() => setSelected(patient)}>
              <span className="patient-cell"><i>{patient.initials}</i><span><strong>{patient.name}</strong><small>{patient.id} · Female · 46 yrs</small></span></span>
              <span><strong>{patient.readings}</strong><small>{patient.time} · Community screening</small></span>
              <span><Status tone={patient.tone}>{patient.status}</Status></span>
              <span><strong>{patient.due}</strong><small>Protocol demo v0.4</small></span>
              <Icon name="chevron" size={18} />
            </button>
          ))}
        </div>
      </section>
      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="review-drawer" onClick={(event) => event.stopPropagation()}>
            <button className="drawer-close" onClick={() => setSelected(null)}><Icon name="close" /></button>
            <div className="eyebrow">SCREENING REVIEW</div>
            <div className="drawer-person"><span>{selected.initials}</span><div><div className="section-title">{selected.name}</div><p>{selected.id} · Kigali Demo Health Centre</p></div></div>
            <div className="review-alert"><Icon name="activity" /><div><strong>Illustrative flag for review</strong><p>This is not a diagnosis. Review recorded observations and context.</p></div></div>
            <div className="reading-grid">
              <div><small>Blood pressure</small><strong>152/96 <i>mmHg</i></strong><span>Recorded today, 09:42</span></div>
              <div><small>Blood glucose</small><strong>7.8 <i>mmol/L</i></strong><span>Non-fasting context</span></div>
            </div>
            <div className="drawer-section"><div className="label">FIELD OBSERVATION</div><p>Patient reports no current symptoms. Reading repeated after five minutes of rest.</p></div>
            <div className="drawer-section"><div className="label">PROVENANCE</div><p>Recorded by Aline M. · Device HW-014 · Ruleset demo v0.4</p></div>
            <div className="drawer-actions"><Button kind="secondary" onClick={() => setSelected(null)}>Request repeat</Button><Button icon="arrow" onClick={() => setSelected(null)}>Record decision</Button></div>
          </aside>
        </div>
      )}
    </DesktopShell>
  );
}

function BarChart() {
  const data = [52, 64, 60, 72, 68, 81, 76, 88, 83, 92, 87, 96];
  return (
    <div className="chart">
      <div className="chart-grid"><span>100%</span><span>75%</span><span>50%</span><span>25%</span></div>
      <div className="bars">{data.map((value, index) => <div key={index} className="bar-wrap"><div className="bar" style={{ height: `${value}%` }}><i /></div><span>{["Jan", "", "Mar", "", "May", "", "Jul", "", "Sep", "", "Nov", "Dec"][index]}</span></div>)}</div>
    </div>
  );
}

function AdminApp({ onChange }: { onChange: (id: AppId) => void }) {
  const [period, setPeriod] = useState("Last 30 days");
  return (
    <DesktopShell active="admin" onChange={onChange}>
      <PageTitle eyebrow="PROGRAMME PERFORMANCE" title="Good morning, Diane" subtitle="Here’s how the care pathway is performing across your authorised scope." action={<div className="date-select"><Icon name="calendar" size={18} /><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Last 30 days</option><option>Last 90 days</option><option>This year</option></select></div>} />
      <div className="scope-strip"><span><Icon name="shield" size={17} />Viewing aggregate data</span><strong>Kigali Demo District · 3 facilities</strong><Button kind="ghost">Change scope</Button></div>
      <div className="metric-grid">
        <Metric label="People screened" value={period === "This year" ? "12,806" : "1,284"} change="+8.4% vs previous period" icon="people" />
        <Metric label="Flagged for review" value="186" change="14.5% of screenings" icon="activity" tone="amber" />
        <Metric label="Clinical reviews" value="154" change="+11.2% completed" icon="clipboard" tone="green" />
        <Metric label="Follow-ups completed" value="121" change="78.6% completion rate" icon="check" tone="blue" />
      </div>
      <div className="admin-grid">
        <section className="panel trend-panel">
          <div className="panel-header">
            <div><div className="section-title">Care completion trend</div><p>Percentage reaching a verified follow-up outcome</p></div>
            <Status tone="positive">On track</Status>
          </div>
          <BarChart />
        </section>
        <section className="panel pathway-panel">
          <div className="panel-header"><div><div className="section-title">Care pathway</div><p>Current reporting period</p></div><button className="text-button">View details <Icon name="arrow" size={15} /></button></div>
          {[
            ["Screened", "1,284", "100%", "teal"],
            ["Flagged", "186", "14.5%", "amber"],
            ["Reviewed", "154", "82.8%", "blue"],
            ["Follow-up complete", "121", "78.6%", "green"],
          ].map(([label, value, percent, tone], index) => (
            <div className="pathway-row" key={label}><span className={`path-dot ${tone}`}>{index + 1}</span><div><strong>{label}</strong><small>{percent} of previous stage</small></div><b>{value}</b></div>
          ))}
        </section>
        <section className="panel facility-panel">
          <div className="panel-header"><div><div className="section-title">Facility performance</div><p>Follow-up completion by facility</p></div><Button kind="secondary" icon="download">Export aggregate</Button></div>
          <div className="facility-row"><div><strong>Kigali Demo Health Centre</strong><small>612 screenings · 74 follow-ups</small></div><div className="progress"><i style={{ width: "86%" }} /></div><b>86%</b></div>
          <div className="facility-row"><div><strong>Nyota Community Clinic</strong><small>408 screenings · 31 follow-ups</small></div><div className="progress"><i style={{ width: "74%" }} /></div><b>74%</b></div>
          <div className="facility-row"><div><strong>Ubumwe Health Post</strong><small>264 screenings · 16 follow-ups</small></div><div className="progress"><i style={{ width: "61%" }} /></div><b>61%</b></div>
        </section>
      </div>
    </DesktopShell>
  );
}

function MobileFrame({ active, onChange, children }: { active: AppId; onChange: (id: AppId) => void; children: ReactNode }) {
  const labels = active === "worker"
    ? [["home", "Today"], ["search", "Find"], ["plus", "Screen"], ["clipboard", "Tasks"], ["sync", "Sync"]]
    : [["home", "Health"], ["clipboard", "Next steps"], ["bell", "Reminders"], ["activity", "Timeline"], ["user", "Profile"]];
  return (
    <div className={`mobile-canvas mobile-canvas--${active}`}>
      <div className="prototype-switch"><AppSwitcher active={active} onChange={onChange} /></div>
      <div className="phone">
        <DemoBanner />
        <div className="phone-top">
          <RwandaMark compact />
          <div className="phone-actions"><button><Icon name="bell" size={20} /></button><span>{active === "worker" ? "AM" : "UM"}</span></div>
        </div>
        <div className="phone-content">{children}</div>
        <nav className="bottom-nav">
          {labels.map(([icon, label], index) => <button key={label} className={index === 0 ? "active" : ""}><Icon name={icon as IconName} size={20} /><span>{label}</span></button>)}
        </nav>
      </div>
      <div className="mobile-note"><Icon name="shield" size={17} />Interactive mobile prototype · 390 viewport</div>
    </div>
  );
}

function WorkerApp({ onChange }: { onChange: (id: AppId) => void }) {
  const [formOpen, setFormOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  if (formOpen) {
    return (
      <MobileFrame active="worker" onChange={onChange}>
        <div className="mobile-back"><button onClick={() => setFormOpen(false)}>‹</button><div><strong>New screening</strong><small>Draft saves automatically</small></div><Status tone="neutral">Offline</Status></div>
        {saved ? (
          <div className="success-state"><span><Icon name="check" size={30} /></span><div className="mobile-title">Saved on this device</div><p>This screening is safely queued and will sync when a connection is available.</p><Button onClick={() => { setSaved(false); setFormOpen(false); }} className="full">Back to today</Button></div>
        ) : (
          <div className="screening-form">
            <div className="patient-mini"><span>UM</span><div><strong>Uwimana Marie</strong><small>CC-00471 · Female · 46 yrs</small></div><button>Change</button></div>
            <div className="form-section-title">Blood pressure</div>
            <div className="field-row"><label><span>Systolic</span><div><input defaultValue="152" inputMode="numeric" /><i>mmHg</i></div></label><label><span>Diastolic</span><div><input defaultValue="96" inputMode="numeric" /><i>mmHg</i></div></label></div>
            <div className="form-section-title">Blood glucose</div>
            <label className="wide-field"><span>Reading</span><div><input defaultValue="7.8" inputMode="decimal" /><i>mmol/L</i></div></label>
            <label className="select-field"><span>Reading context</span><select defaultValue="non-fasting"><option value="non-fasting">Non-fasting</option><option value="fasting">Fasting</option><option value="unknown">Not recorded</option></select></label>
            <label className="notes-field"><span>Observation notes</span><textarea placeholder="Add relevant context (optional)" defaultValue="Reading repeated after five minutes of rest." /></label>
            <div className="local-save-note"><Icon name="shield" size={18} /><span>This draft will be encrypted and saved on this device before syncing.</span></div>
            <Button onClick={() => setSaved(true)} icon="check" className="full">Review and save</Button>
          </div>
        )}
      </MobileFrame>
    );
  }
  return (
    <MobileFrame active="worker" onChange={onChange}>
      <div className="worker-greeting"><div className="eyebrow">MONDAY, 16 OCTOBER</div><div className="mobile-title">Good morning, Aline</div><p>Kigali Demo Health Centre</p></div>
      <div className="offline-strip"><span><Icon name="sync" size={18} />Working offline</span><strong>3 items pending</strong></div>
      <button className="primary-task" onClick={() => setFormOpen(true)}><span><Icon name="plus" size={23} /></span><div><strong>Start a new screening</strong><small>Find a patient and record observations</small></div><Icon name="chevron" /></button>
      <div className="mobile-section-head"><div><strong>Today’s work</strong><small>4 tasks assigned</small></div><button>View all</button></div>
      <div className="task-summary">
        <div><span className="task-number danger">2</span><small>Overdue</small></div>
        <div><span className="task-number amber">2</span><small>Due today</small></div>
        <div><span className="task-number green">6</span><small>Completed</small></div>
      </div>
      <div className="mobile-section-head"><div><strong>Next follow-ups</strong><small>Prioritised by due date</small></div></div>
      {[["HN", "Habimana Noël", "Blood pressure follow-up", "Overdue · 1 day", "danger"], ["IM", "Iradukunda Mireille", "Confirm clinic attendance", "Due today · 14:00", "warning"]].map(([initials, name, task, due, tone]) => (
        <button className="mobile-task" key={name}><span className="mini-avatar">{initials}</span><span><strong>{name}</strong><small>{task}</small><Status tone={tone}>{due}</Status></span><Icon name="chevron" size={18} /></button>
      ))}
    </MobileFrame>
  );
}

function CitizenApp({ onChange }: { onChange: (id: AppId) => void }) {
  const [reminder, setReminder] = useState(true);
  return (
    <MobileFrame active="citizen" onChange={onChange}>
      <div className="citizen-hero">
        <div><div className="eyebrow">MY HEALTH</div><div className="mobile-title">Muraho, Marie</div><p>Your care information, in one place.</p></div>
        <span><Icon name="heart" size={28} /></span>
      </div>
      <section className="next-step-card">
        <div className="card-kicker"><Icon name="calendar" size={17} />YOUR NEXT STEP</div>
        <div className="section-title">Blood pressure review</div>
        <p>Your care team has asked you to attend a follow-up appointment.</p>
        <div className="appointment"><span><strong>Thursday, 19 October</strong><small>10:30 · Kigali Demo Health Centre</small></span><Icon name="chevron" size={18} /></div>
        <Button className="full">View appointment</Button>
      </section>
      <div className="mobile-section-head"><div><strong>Latest screening</strong><small>Recorded 16 October 2026</small></div><button>History</button></div>
      <section className="result-card">
        <div className="result-top"><span><Icon name="activity" size={21} /></span><div><strong>Reviewed by your care team</strong><small>Dr. Diane N. · Today, 11:20</small></div><Status tone="positive">Reviewed</Status></div>
        <div className="plain-language"><strong>Your blood pressure needs follow-up</strong><p>This result is not a diagnosis. Your care team will review it with you at your appointment.</p></div>
        <button className="learn-link">Understand my result <Icon name="arrow" size={16} /></button>
      </section>
      <section className="reminder-card">
        <span className="reminder-icon"><Icon name="bell" /></span>
        <div><strong>Appointment reminders</strong><small>{reminder ? "We’ll remind you one day before." : "Reminders are currently paused."}</small></div>
        <button className={`toggle ${reminder ? "on" : ""}`} onClick={() => setReminder(!reminder)} aria-label="Toggle reminders"><i /></button>
      </section>
      <div className="privacy-note"><Icon name="shield" size={17} /><span>Only you and authorised care team members can view this information.</span></div>
    </MobileFrame>
  );
}

export default function App() {
  const [active, setActive] = useState<AppId>("clinical");
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const title = useMemo(() => `${appMeta[active].label} · CareConnect Rwanda`, [active]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), 1250);
    const remove = window.setTimeout(() => setLoading(false), 1650);
    return () => { window.clearTimeout(leave); window.clearTimeout(remove); };
  }, []);

  const changeApp = (next: AppId) => {
    if (next === active) return;
    setLeaving(false);
    setLoading(true);
    window.setTimeout(() => setLeaving(true), 480);
    window.setTimeout(() => { setActive(next); setLoading(false); }, 760);
  };

  return (
    <>
      {active === "clinical" && <ClinicalApp onChange={changeApp} />}
      {active === "admin" && <AdminApp onChange={changeApp} />}
      {active === "worker" && <WorkerApp onChange={changeApp} />}
      {active === "citizen" && <CitizenApp onChange={changeApp} />}
      {loading && <Loader leaving={leaving} />}
    </>
  );
}
