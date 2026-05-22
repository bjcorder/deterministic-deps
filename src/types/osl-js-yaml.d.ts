// Type shim for the osl-js-yaml fork.
//
// `osl-js-yaml` is the package name inside Ozark-Security-Labs/osl-js-yaml; it
// ships the same runtime as upstream js-yaml. Type definitions still live in
// @types/js-yaml (keyed by the original module name), so we re-declare them
// under the osl-* module name here.

declare module 'osl-js-yaml' {
  export * from 'js-yaml'
  import yaml from 'js-yaml'
  export default yaml
}
