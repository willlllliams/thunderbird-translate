// esbuild plugin of the e2e build (scripts/build.mjs --e2e): every import of a module of src/hooks/ resolves to the
// module of the same name in src/e2e/hooks/. Production code imports only src/hooks/, whose hooks are undefined.
import { existsSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

/** The plugin for the sources under `root`. */
export function e2eHooks(root) {
  const hooks = join(root, "src", "hooks")
  const replacements = join(root, "src", "e2e", "hooks")
  return {
    name: "e2e-hooks",
    setup(build) {
      build.onResolve({ filter: /(^|\/)hooks\/[^/]+$/ }, (args) => {
        const target = resolve(args.resolveDir, args.path)
        if (dirname(target) !== hooks) return undefined
        const path = join(replacements, `${basename(target, ".ts")}.ts`)
        if (!existsSync(path)) return { errors: [{ text: `no e2e hook src/e2e/hooks/${basename(path)} for ${args.path}` }] }
        return { path }
      })
    },
  }
}
