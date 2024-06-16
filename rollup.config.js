import esbuild from "rollup-plugin-esbuild";

export default {
  input: {
    index: `./src/index.ts`,
    "recycle-item": `./src/recycle-item.ts`,
    "recycle-view": `./src/recycle-view.ts`,
  },

  output: {
    dir: "./dist",
    format: "esm",
    sourcemap: true,
  },

  plugins: [
    esbuild({
      charset: "utf8",
      target: "es2017",
      // minify: true,
    }),
  ],
  // treeshake: false,
  // preserveEntrySignatures: false,
  // strictDeprecations: true,
};
