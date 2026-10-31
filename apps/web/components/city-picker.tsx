"use client";

import { useRef } from "react";
import { selectCityAction } from "@/app/actions/city";

export function CityPicker({
  cities,
  current,
  next = "/",
}: {
  cities: { slug: string; name: string }[];
  current: string;
  next?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={selectCityAction} ref={formRef} className="city-picker">
      <select
        name="city"
        defaultValue={current}
        aria-label="City"
        onChange={() => formRef.current?.requestSubmit()}
      >
        {cities.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      <input type="hidden" name="next" value={next} />
      <noscript>
        <button type="submit" className="btn small">
          Go
        </button>
      </noscript>
    </form>
  );
}
