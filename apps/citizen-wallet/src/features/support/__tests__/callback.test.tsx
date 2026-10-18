/**
 * CTZ-08 callback request: translated inline validation (topic, time, note ≤ 300); a double tap
 * creates exactly ONE `callback_request` task + ONE `citizen.support.callback_requested`;
 * a server error keeps the key (Retry → still one task); disabled without consent.
 */
import { PERSONA_IDS } from "@laif/mock-data";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell, type ShellView } from "../../../test/harness.tsx";
import { resetRouter } from "../../../test/router-stub.tsx";
import { validateCallback } from "../callbackSchema.ts";
import { CallbackScreen } from "../CallbackScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const T = { timeout: 10_000 };
const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});

const callbackTasks = async (view: ShellView) =>
  (
    await view.store.getAll<{ kind: string; status: string; payload: Record<string, unknown> }>(
      "careTasks",
    )
  ).filter((t) => t.kind === "callback_request");

async function open(personaId: string = PERSONA_IDS.citizen2) {
  return renderShell(<CallbackScreen />, { ...as(personaId), readyTestId: "callback-form" });
}

describe("callback schema", () => {
  it("requires topic and time; note ≤ 300", () => {
    const empty = validateCallback({ topic: null, window: null, note: "" });
    expect(empty).toEqual({
      ok: false,
      errors: {
        topic: "citizen:validation.callback.topicRequired",
        window: "citizen:validation.callback.windowRequired",
      },
    });
    const long = validateCallback({ topic: "other", window: "morning", note: "x".repeat(301) });
    expect(long.ok ? null : long.errors.note).toBe("citizen:validation.callback.noteMax");
    expect(validateCallback({ topic: "other", window: "afternoon", note: " hi " })).toEqual({
      ok: true,
      value: { topic: "other", window: "afternoon", note: "hi" },
    });
  });
});

describe("callback request", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "more", "support", "callback"]));

  it("submit with nothing chosen → translated errors, nothing written", async () => {
    const view = await open();
    fireEvent.click(screen.getByTestId("callback-send"));
    expect(screen.getByTestId("error-topic").textContent).toBe(
      "Please choose what your question is about.",
    );
    expect(screen.getByTestId("error-window").textContent).toBe("Please choose a time of day.");
    fireEvent.click(screen.getByRole("radio", { name: "A problem with this app" }));
    expect(screen.getByTestId("error-topic").textContent).toBe("");
    expect(await callbackTasks(view)).toHaveLength(0);
  });

  it("double tap → one task + one audit; success copy says no one will call", async () => {
    const view = await open();
    fireEvent.click(screen.getByRole("radio", { name: "A question about an appointment" }));
    fireEvent.click(screen.getByRole("radio", { name: "Morning" }));
    fireEvent.change(screen.getByTestId("callback-note"), {
      target: { value: "Best after 9." },
    });
    const send = screen.getByTestId("callback-send");
    fireEvent.click(send);
    fireEvent.click(send);
    expect(await screen.findByTestId("callback-success", {}, T)).toBeTruthy();
    expect(screen.getByTestId("callback-success-body").textContent).toBe(
      "Your care team will try to call you. This is a demo — no one will actually call.",
    );
    const tasks = await callbackTasks(view);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      status: "open",
      payload: { topic: "appointment_question", window: "morning", note: "Best after 9." },
    });
    expect(await auditsOf(view.store, "citizen.support.callback_requested")).toHaveLength(1);
  });

  it("server error → banner + Retry with the same key → still one task", async () => {
    const view = await open();
    fireEvent.click(screen.getByRole("radio", { name: "Something else" }));
    fireEvent.click(screen.getByRole("radio", { name: "Afternoon" }));
    await view.repo().demo.setFaults({ serverErrorRate: 1 });
    fireEvent.click(screen.getByTestId("callback-send"));
    await waitFor(() =>
      expect(screen.getByTestId("callback-send-error").textContent).toBe(
        "Your request was not sent. Nothing was changed. Try again.",
      ),
    );
    expect(await callbackTasks(view)).toHaveLength(0);
    await view.repo().demo.setFaults({ serverErrorRate: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("callback-success", {}, T)).toBeTruthy();
    expect(await callbackTasks(view)).toHaveLength(1);
    expect(await auditsOf(view.store, "citizen.support.callback_requested")).toHaveLength(1);
  });

  it("consent withdrawn → form disabled with the reason, nothing can be sent", async () => {
    const view = await renderShell(<CallbackScreen />, {
      ...as(PERSONA_IDS.citizenWithdrawn),
      readyTestId: "callback-disabled",
    });
    expect(screen.getByTestId("callback-disabled").textContent).toBe(
      "Give consent to send requests. You can still read the help topics.",
    );
    expect(screen.getByTestId("callback-send").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByTestId("callback-send"));
    expect(await callbackTasks(view)).toHaveLength(0);
  });
});
