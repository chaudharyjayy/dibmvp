import { describe, expect, it } from "vitest";

import {
  TOPIC_QUERIES,
  articleMetaLine,
  articleUrl,
  parseSummary,
  topicForOrgan,
  type LiteratureTopic,
} from "../lib/pubmed";

describe("TOPIC_QUERIES", () => {
  it("covers every topic the walkthrough can name", () => {
    const expected: LiteratureTopic[] = [
      "whole-body",
      "gut",
      "blood",
      "lungs",
      "liver",
      "kidneys",
      "brain",
    ];
    expect(Object.keys(TOPIC_QUERIES).sort()).toEqual(expected.sort());
  });

  it("keeps every query reproducible: field-tagged, reviews, English", () => {
    for (const query of Object.values(TOPIC_QUERIES)) {
      // Fixed field tags (no free-text-only query), review type, English.
      expect(query).toMatch(/\[mh\]|\[majr\]/);
      expect(query).toContain("review[pt]");
      expect(query).toContain("english[la]");
    }
  });

  it("routes each organ to its topic and everything else to whole-body", () => {
    expect(topicForOrgan("gut")).toBe("gut");
    expect(topicForOrgan("heart")).toBe("blood");
    expect(topicForOrgan("lungs")).toBe("lungs");
    expect(topicForOrgan("liver")).toBe("liver");
    expect(topicForOrgan("kidneys")).toBe("kidneys");
    expect(topicForOrgan("brain")).toBe("brain");
    expect(topicForOrgan(null)).toBe("whole-body");
    expect(topicForOrgan("unknown-organ")).toBe("whole-body");
  });
});

/** A trimmed esummary payload, as E-utilities returns it. */
const SUMMARY_FIXTURE = {
  result: {
    uids: ["27842765", "40721658", "19514965", "99999999"],
    "27842765": {
      title: "Drug Metabolism in the Liver",
      source: "Clin Liver Dis",
      pubdate: "2017 Feb",
    },
    "40721658": {
      title: "Liver, ageing and disease. ",
      source: "Nat Rev Gastroenterol Hepatol",
      pubdate: "2025 Oct",
    },
    "19514965": {
      title: "Pharmacokinetics and drug metabolism in the elderly",
      source: "Drug Metab Rev",
      pubdate: "2009",
    },
  },
};

describe("parseSummary", () => {
  it("reads an esummary payload into at most three articles", () => {
    const result = parseSummary("liver", SUMMARY_FIXTURE);
    expect(result.topic).toBe("liver");
    expect(result.error).toBeNull();
    expect(result.articles).toHaveLength(3);
    expect(result.articles[0]).toEqual({
      pmid: "27842765",
      title: "Drug Metabolism in the Liver",
      journal: "Clin Liver Dis",
      pubDate: "2017 Feb",
    });
  });

  it("trims trailing punctuation from titles", () => {
    const result = parseSummary("liver", SUMMARY_FIXTURE);
    expect(result.articles[1].title).toBe("Liver, ageing and disease");
  });

  it("skips records without a title", () => {
    const payload = {
      result: {
        uids: ["1", "2"],
        "1": { title: "", source: "J", pubdate: "2020" },
        "2": { title: "A real paper", source: "J", pubdate: "2021" },
      },
    };
    const result = parseSummary("liver", payload);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].pmid).toBe("2");
  });

  it("returns no articles for an empty or malformed payload", () => {
    expect(parseSummary("liver", {}).articles).toEqual([]);
    expect(parseSummary("liver", null).articles).toEqual([]);
  });
});

describe("article helpers", () => {
  it("links to the pubmed page", () => {
    expect(articleUrl("27842765")).toBe(
      "https://pubmed.ncbi.nlm.nih.gov/27842765/"
    );
  });

  it("joins journal and year for the meta line", () => {
    expect(
      articleMetaLine({
        pmid: "1",
        title: "t",
        journal: "Clin Liver Dis",
        pubDate: "2017 Feb",
      })
    ).toBe("Clin Liver Dis · 2017");
    // A bare year still renders.
    expect(
      articleMetaLine({ pmid: "1", title: "t", journal: "J", pubDate: "2009" })
    ).toBe("J · 2009");
  });
});
