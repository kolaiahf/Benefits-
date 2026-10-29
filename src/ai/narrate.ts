import { narrativeKeepsSourceNumbers, templateNarrative } from "../domain/recommend.js";
import type { Recommendation, RecommendPreferences } from "../domain/types.js";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export async function narrateRecommendation(
  recommendation: Recommendation,
  preferences: RecommendPreferences,
  ai: AiConfig,
): Promise<Recommendation> {
  const template = templateNarrative(recommendation, preferences);
  if (!ai.apiKey) {
    return { ...recommendation, narrative: { text: template, source: "template" } };
  }
  try {
    const fetchImpl = ai.fetchImpl ?? fetch;
    const response = await fetchImpl(`${ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ai.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You write a short benefits recommendation for a broker. Use only facts present in the JSON. Do not invent rates, carriers, networks, or savings. Every dollar amount must match a number in the JSON. Two or three paragraphs. No headings.",
          },
          {
            role: "user",
            content: JSON.stringify({
              selections: recommendation.selections,
              combined: recommendation.combined,
              withinBudget: recommendation.withinBudget,
              prioritize: recommendation.prioritize,
            }),
          },
        ],
      }),
    });
    if (!response.ok) return withTemplate(recommendation, template);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text || !narrativeKeepsSourceNumbers(text, recommendation)) {
      return withTemplate(recommendation, template);
    }
    return { ...recommendation, narrative: { text, source: "model" } };
  } catch {
    return withTemplate(recommendation, template);
  }
}

function withTemplate(recommendation: Recommendation, template: string): Recommendation {
  return { ...recommendation, narrative: { text: template, source: "template" } };
}
