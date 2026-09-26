// YAML files are turned into JSON modules by the `yaml-as-json` plugin in vite.config.ts.
declare module '*.yaml' {
  const value: unknown;
  export default value;
}
