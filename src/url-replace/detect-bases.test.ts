import { describe, expect, it } from "vitest";
import { collectUrlsForDetection, detectBases } from "./detect-bases";

describe("detectBases", () => {
  it("ranks origins by frequency", () => {
    const bases = detectBases([
      "http://localhost:3000/a",
      "http://localhost:3000/b",
      "http://localhost:3000/c",
      "https://api.example.com/x",
      "https://api.example.com/y",
      "http://127.0.0.1:8080/z",
    ]);
    expect(bases[0]).toEqual({ origin: "http://localhost:3000", count: 3 });
    expect(bases[1]).toEqual({ origin: "https://api.example.com", count: 2 });
    expect(bases[2]).toEqual({ origin: "http://127.0.0.1:8080", count: 1 });
  });

  it("respects limit", () => {
    expect(
      detectBases(
        [
          "http://a.com/1",
          "http://b.com/1",
          "http://c.com/1",
          "http://d.com/1",
        ],
        { limit: 2 },
      ),
    ).toHaveLength(2);
  });

  it("ignores template and relative urls", () => {
    expect(
      detectBases(["{{base_url}}/a", "/relative", "http://ok.com/x"]),
    ).toEqual([{ origin: "http://ok.com", count: 1 }]);
  });
});

describe("collectUrlsForDetection", () => {
  it("merges sources", () => {
    expect(
      collectUrlsForDetection({
        requestUrls: ["http://a/1"],
        folderBaseUrls: ["http://b", null],
        envValues: ["http://c"],
      }),
    ).toEqual(["http://a/1", "http://b", "http://c"]);
  });
});
