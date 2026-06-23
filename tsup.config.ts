import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  // react 는 소비 프로젝트의 것을 사용(peer). clsx/tailwind-merge 는 번들에 포함.
  external: ["react", "react-dom", "react/jsx-runtime"],
  noExternal: ["clsx", "tailwind-merge"],
  esbuildOptions(options) {
    options.jsx = "automatic"
  },
})
