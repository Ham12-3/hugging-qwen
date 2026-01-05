"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const RATIOS = {
  "1:1": { w: 1024, h: 1024, label: "Square" },
  "16:9": { w: 1216, h: 684, label: "Landscape" },
  "9:16": { w: 684, h: 1216, label: "Portrait" },
  "4:3": { w: 1152, h: 864, label: "Classic" },
  "3:4": { w: 864, h: 1152, label: "Tall" },
} as const;

type RatioKey = keyof typeof RATIOS;

type GeneratedItem = {
  id: string;
  url: string;
  prompt: string;
  negativePrompt: string;
  ratio: RatioKey;
  createdAt: number;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const PRESETS = [
  {
    name: "Gym promo poster",
    prompt:
      "A clean premium gym poster with clear readable text and strong layout. Title: 'JOIN THE GYM'. Subtitle: 'Stronger every week'. Add a small section: 'Free first session'. Modern typography, high contrast, neat spacing, premium look, no clutter.",
    negative:
      "blurry, low quality, distorted text, messy layout, watermark, extra logos, unreadable typography",
    ratio: "4:3" as const,
  },
  {
    name: "Personal trainer ad",
    prompt:
      "A modern social media advert for a personal trainer, clean and premium. Headline text: '1:1 PERSONAL TRAINING'. Sub text: 'Strength, fat loss, confidence'. Footer: 'Book a free consult'. Clear readable text, neat spacing, high contrast typography.",
    negative:
      "blurry, low quality, distorted text, messy layout, watermark, clutter, unreadable text",
    ratio: "1:1" as const,
  },
  {
    name: "Class timetable flyer",
    prompt:
      "A clean gym class timetable flyer with very readable text and grid layout. Title: 'CLASS TIMETABLE'. Include sections: 'HIIT', 'Strength', 'Spin', 'Yoga'. Minimal design, strong alignment, high contrast, clear typography, premium look.",
    negative:
      "blurry, distorted text, low quality, messy grid, misaligned typography, watermark",
    ratio: "3:4" as const,
  },
  {
    name: "Fitness challenge post",
    prompt:
      "A bold gym challenge poster for social media. Large headline: '30 DAY CHALLENGE'. Sub text: 'Train 4x per week'. Add: 'Prizes for top finishers'. Clean modern layout, high contrast typography, premium design, clear readable text.",
    negative:
      "blurry, low quality, distorted text, clutter, watermark, too many elements, unreadable",
    ratio: "9:16" as const,
  },
] as const;

const PROMPT_CHIPS = [
  "Make the text extremely clear and readable",
  "Use a minimal premium layout",
  "Use high contrast typography",
  "Add clean spacing and alignment",
  "No logos, no watermarks",
] as const;

export default function Page() {
  const [prompt, setPrompt] = useState(
    "A clean premium gym poster with clear readable text. Title: 'JOIN THE GYM'. Subtitle: 'Stronger every week'. Modern layout, high contrast typography."
  );
  const [negativePrompt, setNegativePrompt] = useState(
    "blurry, low quality, distorted text, messy layout, watermark"
  );
  const [ratio, setRatio] = useState<RatioKey>("4:3");

  const [count, setCount] = useState(1);

  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<GeneratedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const size = useMemo(() => RATIOS[ratio], [ratio]);
  const active = useMemo(
    () => items.find((i) => i.id === activeId) ?? null,
    [items, activeId]
  );

  const urlsToRevoke = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      urlsToRevoke.current.forEach((u) => URL.revokeObjectURL(u));
      urlsToRevoke.current = [];
    };
  }, []);

  function applyPreset(p: (typeof PRESETS)[number]) {
    setPrompt(p.prompt);
    setNegativePrompt(p.negative);
    setRatio(p.ratio);
    setError(null);
  }

  function addChip(text: string) {
    const trimmed = prompt.trim();
    const suffix = trimmed.endsWith(".") || trimmed.endsWith(",") ? " " : ". ";
    setPrompt(trimmed ? trimmed + suffix + text : text);
  }

  async function generateOne(): Promise<GeneratedItem> {
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        negative_prompt: negativePrompt,
        width: size.w,
        height: size.h,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Request failed");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    urlsToRevoke.current.push(url);

    return {
      id: uid(),
      url,
      prompt,
      negativePrompt,
      ratio,
      createdAt: Date.now(),
    };
  }

  async function onGenerate() {
    setLoading(true);
    setError(null);

    try {
      const safeCount = Math.max(1, Math.min(4, count));
      for (let i = 0; i < safeCount; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const item = await generateOne();
        setItems((prev) => [item, ...prev]);
        setActiveId(item.id);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function onPick(item: GeneratedItem) {
    setActiveId(item.id);
  }

  function onRemove(item: GeneratedItem) {
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    if (activeId === item.id) {
      const remaining = items.filter((x) => x.id !== item.id);
      setActiveId(remaining[0]?.id ?? null);
    }
    URL.revokeObjectURL(item.url);
    urlsToRevoke.current = urlsToRevoke.current.filter((u) => u !== item.url);
  }

  function downloadActive() {
    if (!active) return;
    const a = document.createElement("a");
    a.href = active.url;
    a.download = `gym-image-${active.ratio}-${active.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Gym Creative Studio
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Qwen Image Generator
            </h1>
            <p className="mt-2 text-sm text-white/60">
              Create gym posters, adverts, and class flyers with clean presets and a gallery.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyPrompt}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
              type="button"
            >
              Copy prompt
            </button>
            <button
              onClick={onGenerate}
              disabled={loading}
              className={cx(
                "rounded-xl px-4 py-2 text-sm font-medium",
                "bg-white text-neutral-950 hover:bg-white/90",
                loading && "opacity-60 cursor-not-allowed"
              )}
              type="button"
            >
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-medium text-white/90">Presets</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10"
                  type="button"
                >
                  <div className="font-medium text-white/90">{p.name}</div>
                  <div className="mt-0.5 text-xs text-white/50">
                    {RATIOS[p.ratio].label}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm font-medium text-white/90">Prompt</div>
              <div className="text-xs text-white/40">{prompt.length} chars</div>
            </div>

            <textarea
              className="mt-3 w-full rounded-xl border border-white/10 bg-neutral-950/40 p-3 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-white/20"
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to generate..."
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {PROMPT_CHIPS.map((t) => (
                <button
                  key={t}
                  onClick={() => addChip(t)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
                  type="button"
                >
                  + {t}
                </button>
              ))}
            </div>

            <div className="mt-6 text-sm font-medium text-white/90">
              Negative prompt
            </div>
            <input
              className="mt-3 w-full rounded-xl border border-white/10 bg-neutral-950/40 p-3 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-white/20"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="What should the model avoid?"
            />

            <div className="mt-6 text-sm font-medium text-white/90">
              Aspect ratio
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {(Object.keys(RATIOS) as RatioKey[]).map((k) => {
                const isActive = ratio === k;
                return (
                  <button
                    key={k}
                    onClick={() => setRatio(k)}
                    className={cx(
                      "rounded-xl border px-3 py-2 text-left",
                      isActive
                        ? "border-white/30 bg-white text-neutral-950"
                        : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                    )}
                    type="button"
                  >
                    <div
                      className={cx(
                        "text-sm font-medium",
                        isActive ? "text-neutral-950" : "text-white/90"
                      )}
                    >
                      {k}
                    </div>
                    <div
                      className={cx(
                        "text-xs",
                        isActive ? "text-neutral-950/70" : "text-white/50"
                      )}
                    >
                      {RATIOS[k].label} · {RATIOS[k].w}×{RATIOS[k].h}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm font-medium text-white/90">Variations</div>
              <div className="text-xs text-white/50">1 to 4</div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                disabled={loading}
              >
                -
              </button>
              <div className="flex-1 rounded-xl border border-white/10 bg-neutral-950/40 px-3 py-2 text-sm text-white/80">
                {count}
              </div>
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                onClick={() => setCount((c) => Math.min(4, c + 1))}
                disabled={loading}
              >
                +
              </button>
            </div>

            {error && (
              <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}
          </section>

          <section className="grid gap-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-white/90">Preview</div>
                <button
                  type="button"
                  onClick={downloadActive}
                  disabled={!active}
                  className={cx(
                    "rounded-xl border px-3 py-2 text-sm",
                    active
                      ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                      : "border-white/10 bg-white/5 text-white/40 opacity-60 cursor-not-allowed"
                  )}
                >
                  Download
                </button>
              </div>

              <div className="mt-4 flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-neutral-950/30 p-3">
                {active ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={active.url}
                    alt="Generated"
                    className="max-h-[560px] w-auto rounded-xl"
                  />
                ) : (
                  <div className="text-center">
                    <div className="text-sm text-white/60">
                      No image selected yet
                    </div>
                    <div className="mt-2 text-xs text-white/40">
                      Generate an image and it will appear here
                    </div>
                  </div>
                )}
              </div>

              {active && (
                <div className="mt-4 rounded-xl border border-white/10 bg-neutral-950/30 p-3">
                  <div className="text-xs text-white/40">Prompt used</div>
                  <div className="mt-1 text-sm text-white/80">{active.prompt}</div>
                  <div className="mt-3 text-xs text-white/40">Negative prompt</div>
                  <div className="mt-1 text-sm text-white/70">
                    {active.negativePrompt || "None"}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-white/90">Gallery</div>
                <div className="text-xs text-white/40">
                  {items.length} image{items.length === 1 ? "" : "s"}
                </div>
              </div>

              {items.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-neutral-950/30 p-8 text-center">
                  <div className="text-sm text-white/60">
                    Your gym creatives will appear here
                  </div>
                  <div className="mt-2 text-xs text-white/40">
                    Try a preset, then click Generate
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {items.map((it) => {
                    const selected = it.id === activeId;
                    return (
                      <button
                        key={it.id}
                        onClick={() => onPick(it)}
                        className={cx(
                          "group relative overflow-hidden rounded-2xl border text-left",
                          selected ? "border-white/30" : "border-white/10 hover:border-white/20"
                        )}
                        type="button"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={it.url}
                          alt="Generated thumbnail"
                          className="h-40 w-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                          <div className="text-xs text-white/70">
                            {it.ratio} · {new Date(it.createdAt).toLocaleTimeString()}
                          </div>
                        </div>

                        <div className="absolute right-2 top-2 flex gap-2">
                          <span className="rounded-full border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80">
                            {RATIOS[it.ratio].label}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemove(it);
                            }}
                            className="rounded-full border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 hover:bg-black/60"
                            aria-label="Remove"
                            title="Remove"
                          >
                            Remove
                          </button>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {loading && (
                <div className="mt-4 rounded-xl border border-white/10 bg-neutral-950/30 p-3 text-sm text-white/70">
                  Generating, please keep this tab open.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
