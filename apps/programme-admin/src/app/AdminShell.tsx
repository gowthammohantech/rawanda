/**
 * Admin shell (ADM-01 task 8, ref-images): AppShell (grey canvas, rounded shell, DemoBanner
 * always) + grouped Sidebar (mono section labels, active state, items the role lacks are locked)
 * + Topbar (disabled search placeholder, demo tools, EN/RW switcher, persona menu with "Switch
 * demo persona" / "End session") + RoleBanner ("Demo role … not authentication") +
 * OfflineBanner (demo Offline switch or `navigator.onLine === false`) + the routed page.
 */
import {
  AppShell,
  Button,
  DemoToolsMenu,
  OfflineBanner,
  PersonaSwitcher,
  RoleBanner,
  SearchInput,
  Sidebar,
  useToast,
  useTx,
} from "@laif/ui-web";
import { useEffect, useMemo, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { ADMIN_PERSONAS, findAdminPersona } from "../auth/personas.ts";
import { useReturnToPersona } from "../features/governance/mutations.ts";
import { resolveScopeFromSearch } from "../auth/scope.ts";
import { endAdminSession, loginPathFor } from "../auth/signIn.ts";
import { useDemoTools } from "./demo-tools.tsx";
import { FaultPill } from "./FaultPill.tsx";
import { IconRail } from "./IconRail.tsx";
import { paths, scopeSearchOf, sidebarSections } from "./nav.ts";
import { grantScopeLabel, personaOption, reportingScopeLabel } from "./persona-labels.ts";
import { useAdminSession, useServices } from "./providers.tsx";
import { useOnline } from "./useOnline.ts";
import { prefetchPageChunks } from "./pageChunks.ts";
import { useRouteFocus } from "./useRouteFocus.ts";

export function AdminShell() {
  const { epoch } = useDemoTools();
  return <ShellChrome key={epoch} />;
}

function ShellChrome() {
  const t = useTx();
  const services = useServices();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const online = useOnline();
  useRouteFocus();
  // ADM-09: warm every page chunk once the shell is up (offline navigation keeps working).
  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    const handle = window.setTimeout(prefetchPageChunks, 1500);
    return () => window.clearTimeout(handle);
  }, []);
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const session = useAdminSession((s) => s.session);
  const grantChanges = useAdminSession((s) => s.grantChanges);
  const { faults, setFault, reset, loadScenario, scenarios } = useDemoTools();
  // ADM-09: Reset demo restores the baseline, ends the session and returns to the sign-in.
  const resetDemo = async () => {
    if (await reset()) void navigate(paths.login, { replace: true });
  };
  const returnTo = findAdminPersona(session?.returnToPersonaId ?? null);
  const returnToPersona = useReturnToPersona();

  const scopeSearch = scopeSearchOf(location.search);
  const sections = useMemo(
    () =>
      sidebarSections(
        persona === null ? null : { persona, grant },
        scopeSearch,
        t("admin:shell.nav.locked"),
      ),
    [persona, grant, scopeSearch, t],
  );
  const personas = useMemo(
    () => ADMIN_PERSONAS.map((p) => personaOption(p, t, grantScopeLabel(p, null, t))),
    [t],
  );

  const seenChanges = useRef(grantChanges);
  useEffect(() => {
    if (grantChanges > seenChanges.current) toast({ title: t("admin:shell.grantChanged") });
    seenChanges.current = grantChanges;
  }, [grantChanges, toast, t]);

  const end = async (next?: string) => {
    await endAdminSession(services);
    if (next === undefined) toast({ title: t("admin:shell.persona.ended") });
    void navigate(next ?? loginPathFor(null), { replace: true });
  };

  const scopeLabel =
    persona === null
      ? undefined
      : reportingScopeLabel(persona, grant, session, resolveScopeFromSearch(location.search), t);

  return (
    <AppShell
      sidebar={<Sidebar sections={sections} LinkComponent={NavLink} />}
      rail={<IconRail sections={sections} />}
      compactSidebar
      topbar={{
        searchSlot: (
          <div role="search" className="max-w-md" title={t("admin:shell.search.comingLater")}>
            <SearchInput
              label={t("shell:search.label")}
              placeholder={t("admin:shell.search.comingLater")}
              value=""
              onValueChange={() => undefined}
              disabled
            />
          </div>
        ),
        demoTools: (
          <>
            <FaultPill />
            <DemoToolsMenu
              faults={faults}
              onFaultChange={setFault}
              onReset={resetDemo}
              scenarios={scenarios}
              onLoadScenario={(id) => void loadScenario(id)}
            />
          </>
        ),
        persona: (
          <PersonaSwitcher
            personas={personas}
            value={persona?.id ?? ""}
            onChange={(personaId) => {
              if (personaId !== persona?.id) void end(loginPathFor(null, personaId));
            }}
            extraItems={[
              {
                id: "switch",
                label: t("shell:persona.switch"),
                onSelect: () => void end(loginPathFor(null)),
              },
              { id: "end", label: t("admin:shell.persona.end"), onSelect: () => void end() },
            ]}
          />
        ),
      }}
      banners={
        <>
          {persona === null ? null : (
            <RoleBanner
              personaName={persona.displayName}
              roleLabel={personaOption(persona, t).roleLabel}
              {...(scopeLabel === undefined ? {} : { scopeLabel })}
            />
          )}
          {returnTo === null || persona === null ? null : (
            <div
              role="region"
              aria-label={t("admin:governance.sim.returnBannerLabel")}
              data-testid="simulation-return-banner"
              className="border-risk-warning/25 bg-risk-warning-soft text-ink flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-2 text-[13px]"
            >
              <span>
                {t("admin:governance.sim.returnBanner", {
                  persona: persona.displayName,
                  original: returnTo.displayName,
                })}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  returnToPersona(returnTo.id).catch(() =>
                    toast({ title: t("demo:tools.actionFailed"), tone: "danger" }),
                  )
                }
              >
                {t("admin:governance.sim.returnTo", { persona: returnTo.displayName })}
              </Button>
            </div>
          )}
          {faults.offline || !online ? <OfflineBanner /> : null}
        </>
      }
    >
      <Outlet />
    </AppShell>
  );
}
