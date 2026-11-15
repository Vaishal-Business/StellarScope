import "server-only";

/**
 * Two OpenAI-compatible providers, load-balanced round-robin with automatic failover:
 *  - IFM (MBZUAI Institute of Foundation Models, UAE): K2 Horizon via api.ifm.ai/v1
 *  - NVIDIA NIM: Nemotron via integrate.api.nvidia.com/v1 (gpt-oss fallback)
 * Keys live only in server env (.env.local) and never reach the browser.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface Provider {
  id: "ifm" | "nvidia";
  label: string;
  base: string;
  key: string;
  models: string[];
  cooldownUntil: number;
}

const g = globalThis as unknown as { __llm?: { providers: Provider[]; rr: number } };

function state() {
  if (!g.__llm) {
    const providers: Provider[] = [];
    if (process.env.IFM_API_KEY)
      providers.push({ id: "ifm", label: "IFM K2 Horizon", base: process.env.IFM_BASE_URL ?? "https://api.ifm.ai/v1", key: process.env.IFM_API_KEY, models: [process.env.IFM_MODEL ?? "IFM/K2-Horizon-375B-A23B"], cooldownUntil: 0 });
    if (process.env.NVIDIA_API_KEY)
      providers.push({
        id: "nvidia", label: "NVIDIA Nemotron", base: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1", key: process.env.NVIDIA_API_KEY,
        models: [process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b", process.env.NVIDIA_FALLBACK_MODEL ?? "openai/gpt-oss-20b"], cooldownUntil: 0,
      });
    g.__llm = { providers, rr: 0 };
  }
  return g.__llm;
}

export function providersConfigured() {
  return state().providers.map((p) => ({ id: p.id, label: p.label, model: p.models[0], coolingDown: p.cooldownUntil > Date.now() }));
}

export interface Completion {
  message: ChatMessage;
  provider: string;
  model: string;
  ms: number;
}

export async function chat(messages: ChatMessage[], tools: ToolDef[], prefer?: "ifm" | "nvidia" | "auto"): Promise<Completion> {
  const s = state();
  if (!s.providers.length) throw new Error("No SI provider keys are configured on the server.");
  // Round-robin start point spreads load across both providers to stay under each rate limit.
  let order = [...s.providers];
  if (prefer && prefer !== "auto") order.sort((a) => (a.id === prefer ? -1 : 1));
  else {
    const start = s.rr++ % order.length;
    order = [...order.slice(start), ...order.slice(0, start)];
  }
  order.sort((a, b) => Number(a.cooldownUntil > Date.now()) - Number(b.cooldownUntil > Date.now()));
  const errors: string[] = [];
  for (const p of order) {
    for (const model of p.models) {
      const t0 = Date.now();
      try {
        const res = await fetch(`${p.base}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages, tools: tools.length ? tools : undefined, tool_choice: tools.length ? "auto" : undefined, temperature: 0.3, max_tokens: 1400 }),
          signal: AbortSignal.timeout(model.includes("gpt-oss") ? 70_000 : 35_000),
        });
        if (res.status === 429) {
          p.cooldownUntil = Date.now() + 30_000;
          errors.push(`${p.label}: rate limited`);
          break; // try the other provider
        }
        if (!res.ok) {
          errors.push(`${p.label}/${model}: HTTP ${res.status}`);
          if (res.status >= 500) p.cooldownUntil = Date.now() + 10_000;
          continue;
        }
        const j = (await res.json()) as { choices?: { message: ChatMessage & { reasoning_content?: string } }[] };
        const m = j.choices?.[0]?.message;
        if (!m) {
          errors.push(`${p.label}/${model}: empty response`);
          continue;
        }
        const content = typeof m.content === "string" ? m.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim() : null;
        return { message: { role: "assistant", content, tool_calls: m.tool_calls?.length ? m.tool_calls : undefined }, provider: p.label, model, ms: Date.now() - t0 };
      } catch (e) {
        errors.push(`${p.label}/${model}: ${(e as Error).name === "TimeoutError" ? "timeout" : (e as Error).message}`);
      }
    }
  }
  throw new Error(`All SI providers failed — ${errors.join("; ")}`);
}
