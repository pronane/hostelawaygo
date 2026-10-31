"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TEMPLATES: { label: string; title: string; category: string; price: string }[] = [
  { label: "Family dinner", title: "Family dinner at the hostel", category: "food", price: "Free" },
  { label: "Pub crawl", title: "Pub crawl: Bairro Alto → Cais do Sodré", category: "nightlife", price: "12" },
  { label: "Walking tour", title: "Sunset walking tour of Alfama", category: "outdoors", price: "Free" },
  { label: "Beer Olympics", title: "Beer Olympics — teams drawn on the night", category: "social", price: "Free" },
  { label: "Live music", title: "Live music on the terrace", category: "music", price: "Free" },
];

export function PostForm({ audience, hostels }: { audience: number; hostels: number }) {
  const router = useRouter();
  const [title, setTitle] = useState("Family dinner: Mozambican curry");
  const [time, setTime] = useState("19:30");
  const [price, setPrice] = useState("Free");
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [openToAll, setOpenToAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    setTitle(t.title);
    setCategory(t.category);
    setPrice(t.price);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const priceCents = Math.round(Number(price.replace(/[^0-9.]/g, "")) * 100) || 0;

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, startsAt: time, priceCents, category, description, openToAll }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { id: number };
      router.push(`/event/${data.id}?posted=1`);
      router.refresh();
    } catch {
      setError("Couldn't publish that. Check the title and time, then try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form-wrap">
      <div className="templates">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            className="tpl"
            onClick={() => applyTemplate(t)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="field">
        <label htmlFor="title">What&apos;s on</label>
        <input
          id="title"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="twocol">
        <div className="field">
          <label htmlFor="time">Starts</label>
          <input
            id="time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="price">Price</label>
          <input
            id="price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Free or a number in €"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="category">Type</label>
        <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="food">Food &amp; drink</option>
          <option value="music">Music</option>
          <option value="social">Social / games</option>
          <option value="outdoors">Outdoors</option>
          <option value="culture">Culture</option>
          <option value="nightlife">Nightlife</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="description">Anything else? (optional)</label>
        <textarea
          id="description"
          value={description}
          maxLength={600}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Where to meet, what to bring, whether people can come alone…"
        />
      </div>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "14px 2px 0", fontSize: 13 }}>
        <input type="checkbox" checked={openToAll} onChange={(e) => setOpenToAll(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <b>Open to travellers from other hostels</b>
          <br />
          <span style={{ color: "#8b7d72" }}>Untick for guests-only events — only people staying with you will see it.</span>
        </span>
      </label>

      {error ? (
        <div className="notice warn" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>{error}</span>
        </div>
      ) : null}

      <button type="submit" className="publish" disabled={busy || !title.trim()}>
        {busy ? "Publishing…" : `Publish to ${audience} travellers in ${hostels} hostels`}
      </button>
      <p style={{ fontSize: 11.5, color: "#8b7d72", margin: "10px 2px 0", lineHeight: 1.5 }}>
        Goes live immediately in the HERE feed for every traveller staying in Lisbon, and on
        any hostel&apos;s public page. You can edit or cancel from the front desk at any time.
      </p>
    </form>
  );
}
