import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  envDir: "..",
  envPrefix: "BACKEND_",
  resolve: {
    alias: {
      $lib: path.resolve("./src/lib"),
    },
  },
});
