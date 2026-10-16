/**
 * Clinical shell chrome (FND-11 task 5): AppShell (DemoBanner always, sticky) + grouped Sidebar
 * + Topbar (search placeholder, DemoToolsMenu, LanguageSwitcher, PersonaSwitcher limited to
 * clinical personas) + RoleBanner (demo role switch disclaimer) + OfflineBanner when the
 * Offline switch is on.
 */
import { queryKeys } from "@laif/repositories";
import {
  AppShell,
  DemoToolsMenu,
  OfflineBanner,
  PersonaSwitcher,
  RoleBanner,
  Sidebar,
  useTx,
  type SidebarSection,
} from "@laif/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { NavLink, Outlet } from "react-router";

import { useDemoTools } from "./demo-tools.tsx";
import { COUNT_ITEM_PATH, NAV_SECTIONS } from "./nav.ts";
import { personaOption, personaScopeLabel } from "./persona-labels.ts";
import { usePersona, useRepository, useSession } from "./providers.tsx";

export function ShellLayout() {
  const { epoch } = useDemoTools();
  return <ShellChrome key={epoch} />;
}

function ShellChrome() {
  const t = useTx();
  const repo = useRepository();
  const session = useSession();
  const persona = usePersona();
  const queryClient = useQueryClient();
  const { faults, setFault, reset, loadScenario, scenarios } = useDemoTools();

  const pending = useQuery({
    queryKey: queryKeys.reviews.count({ shell: "pending" }),
    queryFn: () => repo.countReviews(),
    select: (counts) => counts.pending,
    retry: false,
  });

  const sections = useMemo<readonly SidebarSection[]>(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.map((item) =>
          item.to === COUNT_ITEM_PATH && pending.data !== undefined
            ? { ...item, count: pending.data }
            : item,
        ),
      })),
    [pending.data],
  );

  const personas = useMemo(
    () => session.available().map((option) => personaOption(option, t)),
    [session, t],
  );
  const scopeLabel = persona === null ? undefined : personaScopeLabel(persona, t);

  return (
    <AppShell
      sidebar={<Sidebar sections={sections} LinkComponent={NavLink} />}
      topbar={{
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
          <PersonaSwitcher
            personas={personas}
            value={persona?.id ?? ""}
            onChange={(personaId) => {
              if (session.switchTo(personaId).ok) void queryClient.invalidateQueries();
            }}
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
          {faults.offline ? <OfflineBanner /> : null}
        </>
      }
    >
      <Outlet />
    </AppShell>
  );
}
