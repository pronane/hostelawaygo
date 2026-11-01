import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Anything behind a session, and anything that belongs to one person:
        // a share-my-night link is not for a crawler.
        disallow: [
          "/admin",
          "/hostel-admin",
          "/safe",
          "/booking",
          "/post",
          "/you",
          "/trips",
          "/login",
          "/signup",
          "/verify",
          "/auth/",
          "/api/",
          "/stay/",
        ],
      },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
