import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/constants";
import { getCityEvents, getLiveCities } from "@/lib/queries";
import { addDays, todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * The pull surface: one stable URL per live city, plus every public event we
 * are willing to put in front of a stranger. Guests-only nights are deliberately
 * absent — they are somebody's private party, not a search result.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const today = todayISO();

  const cities = (
    await Promise.all(
      (await getLiveCities()).map(async (city) => {
        const events = (await getCityEvents(city.slug, today, addDays(today, 21), null)).filter(
          (e) => e.open_to_all === 1
        );
        return [
          {
            url: `${base}/c/${city.slug}`,
            lastModified: new Date(),
            changeFrequency: "daily" as const,
            priority: 0.9,
          },
          ...events.map((event) => ({
            url: `${base}/event/${event.id}`,
            lastModified: new Date(event.starts_at),
            changeFrequency: "weekly" as const,
            priority: 0.6,
          })),
        ];
      })
    )
  ).flat();

  return [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "hourly", priority: 1 },
    { url: `${base}/explore`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    ...cities,
  ];
}
