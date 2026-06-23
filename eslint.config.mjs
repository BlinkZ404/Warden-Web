import next from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "sample-app/**",
      "certs/**",
      ".warden/**",
    ],
  },
  ...next,
  {
    rules: {
      // The React Compiler lint rules added in eslint-plugin-react-hooks v7 are
      // opt-in. This app uses standard fetch-on-mount effects, so turn off the
      // two that flag that pattern.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default config;
