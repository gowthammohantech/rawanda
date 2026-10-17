/**
 * Clinical shell (CLN-01 task 8): `@laif/ui-web` AppShell (SkipLink + DemoBanner always) with the
 * grouped Sidebar (capability-aware items, count-badge slots, Settings / Help footer), the Topbar
 * (search link → Patients, bell, Demo tools, EN/RW LanguageSwitcher, role chip + active facility,
 * PersonaSwitcher with facility switch and Sign out) and the RoleBanner
 * ("… — demo role switch, not authentication") + the ConnectionBanner (CLN-02) under it.
 */
import { roleLabelKey } from "@laif/auth-demo";
import {
  AppShell,
  DemoToolsMenu,
  Drawer,
  Icon,
  PersonaSwitcher,
  RoleBanner,
  Sidebar,
  useToast,
  useTx,
  type SidebarSection,
} from "@laif/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { useDemoTools } from "../../app/demo-tools.tsx";
import { ConnectionBanner } from "../ConnectionBanner.tsx";
import { facilityLabel, personaOption } from "../../app/persona-labels.ts";
import { clinicalKeys } from "../../data/queryKeys.ts";
import { useRepository } from "../../data/useRepository.ts";
import { routes } from "../../app/routes.ts";
import { recordSessionEnded, recordSessionStarted } from "../../session/session-audit.ts";
import { permittedFacilityIdsFor } from "../../session/session-store.ts";
import { useSession } from "../../session/useSession.ts";
import { NAV_FOOTER, NAV_SECTIONS, type NavItemId } from "./navConfig.ts";

export type ClinicalShellProps = {
  /** Count-badge slots per nav item (CLN-05/08/09); the queue count is wired here already. */
  badgeCounts?: Partial<Record<NavItemId, number>>;
};

/** Keyboard hint glyph (not translatable); the ⌘K behaviour is out of scope until search lands. */
const SEARCH_SHORTCUT = "⌘K";

const FOOTER_LINK =
  "target-min flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors";

export function ClinicalShell(props: ClinicalShellProps) {
  const { epoch } = useDemoTools();
  return <ShellChrome key={epoch} {...props} />;
}

function ShellChrome({ badgeCounts = {} }: ClinicalShellProps) {
  const t = useTx();
  const repo = useRepository();
  const session = useSession();
  const { state, can, store } = session;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { faults, setFault, reset, loadScenario, scenarios } = useDemoTools();
  const [helpOpen, setHelpOpen] = useState(false);

  const canReadQueue = can("review.read");
  const pending = useQuery({
    queryKey: clinicalKeys.reviewCounts(state?.activeFacilityId ?? "none", { shell: "pending" }),
    queryFn: () => repo.countReviews(),
    select: (counts) => counts.pending,
    retry: false,
    enabled: canReadQueue,
  });

  const counts: Partial<Record<NavItemId, number>> = useMemo(
    () => ({ ...(pending.data === undefined ? {} : { queue: pending.data }), ...badgeCounts }),
    [pending.data, badgeCounts],
  );

  const sections = useMemo<readonly SidebarSection[]>(
    () =>
      NAV_SECTIONS.map((section) => ({
        id: section.id,
        labelKey: section.labelKey,
        items: section.items.map((item) => {
          const disabled = item.capability !== null && !can(item.capability);
          const count = counts[item.id];
          return {
            to: item.to,
            labelKey: item.labelKey,
            icon: item.icon,
            ...(item.countTone === undefined ? {} : { countTone: item.countTone }),
            ...(count === undefined || disabled ? {} : { count }),
            ...(disabled
              ? { disabled: true, disabledReason: t("clinical:errors.permissionDenied.navHint") }
              : {}),
          };
        }),
      })),
    [can, counts, t],
  );

  const personas = useMemo(
    () => store.available().map((option) => personaOption(option, t)),
    [store, t],
  );

  if (state === null) return null; // RequireSession redirects

  const { persona, activeFacilityId, permittedFacilityIds } = state;
  const roleLabel = t(roleLabelKey(persona.role));
  const activeFacility = facilityLabel(activeFacilityId, t);

  const switchPersona = async (personaId: string) => {
    if (personaId === persona.id) return;
    const next = store.available().find((candidate) => candidate.id === personaId);
    if (next === undefined) return;
    const permitted = permittedFacilityIdsFor(next);
    const facility = permitted.includes(activeFacilityId) ? activeFacilityId : permitted[0];
    if (facility === undefined) return;
    await recordSessionEnded(repo, state, "persona_switch");
    const result = store.signIn(personaId, facility);
    if (!result.ok) return;
    queryClient.clear();
    await recordSessionStarted(repo, result.state);
  };

  const switchFacility = (facilityId: string) => {
    if (store.setActiveFacility(facilityId)) {
      queryClient.clear();
      toast({
        title: t("clinical:common.facilitySwitched", { facility: facilityLabel(facilityId, t) }),
      });
    }
  };

  const signOut = async () => {
    await recordSessionEnded(repo, state, "sign_out");
    // Commit the login route first (flushSync) so RequireSession never sees the signed-out
    // shell and adds a `?redirect=` back to it.
    await Promise.resolve(navigate(routes.login(), { replace: true, flushSync: true }));
    store.signOut();
    queryClient.clear();
    toast({ title: t("clinical:common.signedOut") });
  };

  const extraItems = [
    ...permittedFacilityIds
      .filter((id) => id !== activeFacilityId)
      .map((id) => ({
        id: `facility-${id}`,
        label: t("clinical:common.switchFacility", { facility: facilityLabel(id, t) }),
        onSelect: () => switchFacility(id),
      })),
    {
      id: "choose-persona",
      label: t("clinical:common.choosePersona"),
      onSelect: () => {
        void navigate(routes.login(`${location.pathname}${location.search}`));
      },
    },
    { id: "sign-out", label: t("clinical:common.signOut"), onSelect: () => void signOut() },
  ];

  const footer = (
    <div className="space-y-3">
      <ul className="m-0 list-none space-y-0.5 p-0">
        {NAV_FOOTER.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `${FOOTER_LINK} ${
                  isActive
                    ? "bg-surface text-ink shadow-card font-semibold"
                    : "text-ink/80 hover:bg-surface/60 hover:text-ink"
                }`
              }
            >
              <Icon name={item.icon} size={18} className="text-muted shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className={`${FOOTER_LINK} text-ink/80 hover:bg-surface/60 hover:text-ink w-full text-start`}
          >
            <Icon name="info" size={18} className="text-muted shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t("clinical:nav.help")}</span>
          </button>
        </li>
      </ul>
      <p className="border-border-soft bg-surface text-muted rounded-md border px-3 py-2 text-xs">
        {t("clinical:common.activeFacility", { facility: activeFacility })}
      </p>
    </div>
  );

  return (
    <>
      <AppShell
        sidebar={<Sidebar sections={sections} LinkComponent={NavLink} footer={footer} />}
        topbar={{
          searchSlot: (
            <Link
              to={routes.patients()}
              aria-describedby="clinical-search-hint"
              className="rounded-pill border-border-soft bg-surface/80 text-muted hover:text-ink flex h-10 w-full max-w-md items-center gap-2 border px-3 text-sm"
            >
              <Icon name="search" size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t("clinical:common.searchLink")}</span>
              <kbd className="border-border-soft text-muted hidden rounded-sm border px-1.5 font-mono text-[11px] sm:inline">
                {SEARCH_SHORTCUT}
              </kbd>
              <span id="clinical-search-hint" className="sr-only">
                {t("clinical:common.searchHint")}
              </span>
            </Link>
          ),
          notifications: {
            hasUnread: false,
            onClick: () => toast({ title: t("clinical:common.notifications") }),
          },
          demoTools: (
            <DemoToolsMenu
              faults={faults}
              onFaultChange={setFault}
              onReset={reset}
              scenarios={scenarios}
              onLoadScenario={(id) => void loadScenario(id)}
            />
          ),
          persona: (
            <div className="flex items-center gap-2">
              <span className="hidden flex-col items-end leading-tight md:flex">
                <span
                  data-testid="role-chip"
                  className="micro-label rounded-pill bg-primary-soft text-primary-dark px-2 py-0.5"
                >
                  {roleLabel}
                </span>
                <span className="text-muted mt-0.5 max-w-48 truncate text-xs">
                  {activeFacility}
                </span>
              </span>
              <PersonaSwitcher
                personas={personas}
                value={persona.id}
                onChange={(personaId) => void switchPersona(personaId)}
                extraItems={extraItems}
              />
            </div>
          ),
        }}
        banners={
          <>
            <RoleBanner
              personaName={persona.displayName}
              roleLabel={roleLabel}
              scopeLabel={activeFacility}
            />
            <ConnectionBanner />
          </>
        }
      >
        <Outlet />
      </AppShell>
      <Drawer open={helpOpen} onOpenChange={setHelpOpen} title={t("clinical:common.help.title")}>
        <div className="text-ink space-y-3 text-sm">
          <p>{t("clinical:common.help.body")}</p>
          <p>{t("clinical:common.help.roles")}</p>
          <p>{t("clinical:common.help.tools")}</p>
        </div>
      </Drawer>
    </>
  );
}
