import { describe, expect, it } from "vitest";
import { computeTimbre, extractTva, taxConfig } from "./tax";

describe("extractTva", () => {
  it("extracts the TVA contained in a TTC total rather than adding it on top", () => {
    // 1190.00 TTC at 19% is 1000.00 HT + 190.00 TVA.
    expect(extractTva(1190_00, 1900)).toBe(190_00);
  });

  it("truncates like the Rust integer division", () => {
    // net_ht = floor(100 * 10000 / 11900) = 8; tva = 100 - 8 ... verified below.
    const total = 12345;
    const netHt = Math.floor((total * 10000) / 11900);
    expect(extractTva(total, 1900)).toBe(total - netHt);
  });

  it("is zero when no rate is configured", () => {
    expect(extractTva(1000_00, 0)).toBe(0);
  });

  it("is zero for a zero or negative total", () => {
    expect(extractTva(0, 1900)).toBe(0);
    expect(extractTva(-500, 1900)).toBe(0);
  });
});

describe("computeTimbre", () => {
  // Settings are stored as text, so the config parses strings.
  const cfg = taxConfig({
    tva_rate: "1900",
    timbre_rate: "100",
    timbre_min: String(5_00),
    timbre_max: String(25_00),
  });

  it("only applies to cash sales", () => {
    expect(computeTimbre(1000_00, cfg, false)).toBe(0);
    expect(computeTimbre(1000_00, cfg, true)).toBe(10_00);
  });

  it("respects the configured floor", () => {
    expect(computeTimbre(100_00, cfg, true)).toBe(5_00);
  });

  it("respects the configured cap", () => {
    expect(computeTimbre(100000_00, cfg, true)).toBe(25_00);
  });

  it("treats a zero cap as uncapped", () => {
    const uncapped = taxConfig({ tva_rate: "0", timbre_rate: "100", timbre_min: "0", timbre_max: "0" });
    expect(computeTimbre(100000_00, uncapped, true)).toBe(1000_00);
  });

  it("is zero without a configured rate", () => {
    const none = taxConfig({ tva_rate: "1900", timbre_rate: "0", timbre_min: "0", timbre_max: "0" });
    expect(computeTimbre(1000_00, none, true)).toBe(0);
  });
});

describe("taxConfig", () => {
  it("defaults every rate to zero when settings are missing", () => {
    expect(taxConfig(undefined)).toEqual({
      tvaRate: 0,
      timbreRate: 0,
      timbreMin: 0,
      timbreMax: 0,
    });
  });
});
