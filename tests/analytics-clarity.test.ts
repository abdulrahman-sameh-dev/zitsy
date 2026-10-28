import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeScript {
  id: string;
  async: boolean;
  src: string;
  listeners: Map<string, () => void>;
  addEventListener(type: string, listener: () => void): void;
}

function installBrowserHarness(cookie = "zitsy_consent=granted") {
  const scripts: FakeScript[] = [];
  const clarity = vi.fn();
  const fakeWindow: { clarity?: typeof clarity } = {};

  const fakeDocument = {
    cookie,
    getElementById(id: string) {
      return scripts.find((script) => script.id === id) ?? null;
    },
    createElement() {
      const listeners = new Map<string, () => void>();
      const script: FakeScript = {
        id: "",
        async: false,
        src: "",
        listeners,
        addEventListener(type, listener) {
          listeners.set(type, listener);
        },
      };
      return script;
    },
    head: {
      appendChild(script: FakeScript) {
        scripts.push(script);
      },
    },
  };

  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("window", fakeWindow);

  return { scripts, clarity, fakeWindow };
}

async function loadClient() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "test-project");
  return import("@/lib/analytics/client");
}

async function loadUnconfiguredClient() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "");
  vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "");
  return import("@/lib/analytics/client");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Clarity route privacy", () => {
  it("does not inject Clarity before consent", async () => {
    const harness = installBrowserHarness("");
    const { initClarity } = await loadClient();

    initClarity();

    expect(harness.scripts).toHaveLength(0);
  });

  it("does not inject scripts when no provider is configured", async () => {
    const harness = installBrowserHarness();
    const { initClarity, initGa4, trackEvent } = await loadUnconfiguredClient();

    initGa4();
    initClarity();
    trackEvent("page_view");

    expect(harness.scripts).toHaveLength(0);
    expect(harness.fakeWindow).not.toHaveProperty("gtag");
  });

  it("does not inject Clarity while on a private route", async () => {
    const harness = installBrowserHarness();
    const { initClarity, syncClarityRoute } = await loadClient();

    syncClarityRoute("/checkout");
    initClarity();

    expect(harness.scripts).toHaveLength(0);
  });

  it("stops a script that loads after entering a private route", async () => {
    const harness = installBrowserHarness();
    const { initClarity, syncClarityRoute } = await loadClient();

    initClarity();
    expect(harness.scripts).toHaveLength(1);

    syncClarityRoute("/admin");
    expect(harness.clarity).not.toHaveBeenCalled();

    harness.fakeWindow.clarity = harness.clarity;
    harness.scripts[0]?.listeners.get("load")?.();
    expect(harness.clarity).toHaveBeenCalledWith("stop");
  });

  it("starts again after leaving a private route and stops again on the next one", async () => {
    const harness = installBrowserHarness();
    const { initClarity, syncClarityRoute } = await loadClient();

    initClarity();
    harness.fakeWindow.clarity = harness.clarity;
    harness.scripts[0]?.listeners.get("load")?.();
    expect(harness.clarity).not.toHaveBeenCalled();

    syncClarityRoute("/checkout");
    expect(harness.clarity).toHaveBeenLastCalledWith("stop");

    syncClarityRoute("/shop");
    expect(harness.clarity).toHaveBeenLastCalledWith("start");

    syncClarityRoute("/track-order/token");
    expect(harness.clarity).toHaveBeenLastCalledWith("stop");
  });

  it("maps public and private routes to the expected command", async () => {
    const { clarityCommandForPath } = await loadClient();

    expect(clarityCommandForPath("/")).toBe("start");
    expect(clarityCommandForPath("/shop")).toBe("start");
    expect(clarityCommandForPath("/admin/analytics")).toBe("stop");
    expect(clarityCommandForPath("/checkout/success")).toBe("stop");
    expect(clarityCommandForPath("/track-order/token")).toBe("stop");
  });
});
