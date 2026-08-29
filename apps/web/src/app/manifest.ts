import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meadow",
    short_name: "Meadow",
    description: "Personal finance tracking, budgeting, and investment allocation.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fafbf2",
    theme_color: "#3A9979",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
