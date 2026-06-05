import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "goal-score-game";
  const base = process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS ? `/${repoName}/` : "/");

  return {
    base,
    plugins: [react()],
    build: {
      target: "es2022",
    },
  };
});
