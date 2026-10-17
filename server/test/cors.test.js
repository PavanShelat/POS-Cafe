import { describe, expect, it } from "vitest";
import { createCorsOriginCheck } from "../cors.js";

function allows(check, origin) {
  return new Promise((resolve) => check(origin, (_err, ok) => resolve(ok)));
}

describe("createCorsOriginCheck", () => {
  it("allows every origin when CORS_ORIGIN is unset", () => {
    expect(createCorsOriginCheck(undefined)).toBe(true);
    expect(createCorsOriginCheck("")).toBe(true);
  });

  it("allows only listed origins", async () => {
    const check = createCorsOriginCheck("https://pos.example.com, https://admin.example.com/");
    expect(await allows(check, "https://pos.example.com")).toBe(true);
    expect(await allows(check, "https://admin.example.com")).toBe(true);
    expect(await allows(check, "https://evil.example.com")).toBe(false);
  });

  it("supports wildcards for Vercel preview deploys", async () => {
    const check = createCorsOriginCheck("https://pos-cafe-*.vercel.app");
    expect(await allows(check, "https://pos-cafe-git-main-team.vercel.app")).toBe(true);
    expect(await allows(check, "https://pos-cafe-abc.vercel.app.evil.com")).toBe(false);
    expect(await allows(check, "https://other.vercel.app")).toBe(false);
  });

  it("lets through requests without an Origin header (webhooks, curl)", async () => {
    const check = createCorsOriginCheck("https://pos.example.com");
    expect(await allows(check, undefined)).toBe(true);
  });
});
