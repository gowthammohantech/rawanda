// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  expectAllTouchTargets,
  expectMinTouchTarget,
  hitArea,
  queryPressables,
  walkAllRoutes,
} from "./a11y.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

function button(style: string, label = "Save"): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", label);
  el.setAttribute("style", style);
  document.body.append(el);
  return el;
}

describe("expectMinTouchTarget", () => {
  it("passes on a 44 × 44 floor (min-* or explicit size)", () => {
    expectMinTouchTarget(button("min-width:44px;min-height:44px"));
    expectMinTouchTarget(button("width:48px;height:60px"));
    expect(hitArea(button("min-width:20px;width:50px;min-height:44px"))).toEqual({
      width: 50,
      height: 44,
    });
  });

  it("fails on a small target or a missing accessible name", () => {
    expect(() => expectMinTouchTarget(button("width:30px;height:44px"))).toThrow(/width/u);
    expect(() => expectMinTouchTarget(button("width:44px;height:44px", ""))).toThrow(
      /accessible name/u,
    );
  });

  it("expectAllTouchTargets checks every pressable role", () => {
    button("width:44px;height:44px");
    const link = document.createElement("a");
    link.setAttribute("role", "link");
    link.textContent = "Help";
    link.setAttribute("style", "min-width:44px;min-height:44px");
    document.body.append(link);
    expect(queryPressables()).toHaveLength(2);
    expect(expectAllTouchTargets()).toBe(2);
  });
});

describe("walkAllRoutes", () => {
  it("visits every route and reports all failures at once", async () => {
    const seen: string[] = [];
    await expect(
      walkAllRoutes([{ route: "/a" }, { route: "/b" }, { route: "/c" }], ({ route }) => {
        seen.push(route);
        if (route !== "/b") throw new Error(`broken ${route}`);
      }),
    ).rejects.toThrow(/\/a: broken \/a[\s\S]*\/c: broken \/c/u);
    expect(seen).toEqual(["/a", "/b", "/c"]);
    expect(await walkAllRoutes([{ route: "/ok" }], () => undefined)).toEqual(["/ok"]);
  });
});
