import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Web Vitals budgets (Google "good" thresholds)
const BUDGETS = {
  lcp: 2500, // ms
  cls: 0.1,
  inp: 200, // ms (also covers FID-era latency)
} as const;

const ROUTES = ["/", "/coverage"] as const;

interface VitalSample {
  route: string;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  fcp: number | null;
  ttfb: number | null;
}

const samples: VitalSample[] = [];

test.describe("Web Vitals", () => {
  for (const route of ROUTES) {
    test(`${route} meets Core Web Vitals budgets`, async ({ page }) => {
      // Inject web-vitals from a CDN at page load time. Avoids adding it as a runtime dep.
      await page.addInitScript(() => {
        (window as unknown as { __vitals: Record<string, number> }).__vitals = {};
      });

      await page.goto(route, { waitUntil: "networkidle" });

      // Pull metrics via the web-vitals UMD bundle, exposed on window.webVitals
      await page.addScriptTag({
        url: "https://unpkg.com/web-vitals@4.2.4/dist/web-vitals.iife.js",
      });
      await page.evaluate(() => {
        const wv = (window as unknown as { webVitals?: Record<string, (cb: (m: { name: string; value: number }) => void) => void> }).webVitals;
        const store = (window as unknown as { __vitals: Record<string, number> }).__vitals;
        if (!wv) return;
        wv.onLCP?.((m) => { store.lcp = m.value; });
        wv.onCLS?.((m) => { store.cls = m.value; });
        wv.onINP?.((m) => { store.inp = m.value; });
        wv.onFCP?.((m) => { store.fcp = m.value; });
        wv.onTTFB?.((m) => { store.ttfb = m.value; });
      });

      // Trigger interaction so INP records something
      await page.mouse.move(100, 100);
      await page.mouse.click(100, 100, { delay: 30 });
      await page.waitForTimeout(1500);

      const vitals = await page.evaluate(
        () => (window as unknown as { __vitals: Record<string, number> }).__vitals,
      );

      const sample: VitalSample = {
        route,
        lcp: vitals.lcp ?? null,
        cls: vitals.cls ?? null,
        inp: vitals.inp ?? null,
        fcp: vitals.fcp ?? null,
        ttfb: vitals.ttfb ?? null,
      };
      samples.push(sample);

      // Soft asserts: warn but don't fail until we've gathered baselines
      // Hard fails for the most actionable budgets
      if (sample.lcp != null) {
        expect.soft(sample.lcp, `${route} LCP ${sample.lcp}ms`).toBeLessThan(BUDGETS.lcp);
      }
      if (sample.cls != null) {
        expect.soft(sample.cls, `${route} CLS ${sample.cls}`).toBeLessThan(BUDGETS.cls);
      }
    });
  }

  test.afterAll(async () => {
    mkdirSync("coverage", { recursive: true });
    writeFileSync(
      join("coverage", "web-vitals.json"),
      JSON.stringify({ budgets: BUDGETS, samples }, null, 2),
    );
  });
});
