import { describe, expect, it } from "vitest";
import { ApiError } from "./api";

describe("ApiError", () => {
  it("preserves the HTTP status", () => {
    expect(new ApiError(503).status).toBe(503);
  });
});