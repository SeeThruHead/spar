import { describe, expect, it } from "vitest"
import { sparJsx, wholeProgram } from "../src/transform/vite.ts"
import { unprovided } from "../src/transform/requirements.ts"

const store = {
  file: "/app/src/Notes.ts",
  source: `export class NotesStore extends Store.Tag<NotesStore>()("app/Notes", {}) {}`,
}

const label = {
  file: "/app/src/Label.tsx",
  source: `
import { NotesStore } from "./Notes.ts"
const withNotes = Effect.fnUntraced(function* () {
  const router = yield* Router.Router
  return { router }
})
export const Label = compose(withStore(NotesStore, (notes) => notes), withNotes)((props) => <p />)
`,
}

const shell = (layer: string) => ({
  file: "/app/src/main.tsx",
  source: `
import { Label } from "./Label"
import { Missing } from "./elsewhere"
import { Folder } from "./Folder.tsx"
import Whole from "./Label.tsx"
import * as Everything from "./Label.tsx"
const Page = compose(withHandlers(() => ({})))((props) => <main><Label /><Label /><Missing /><Folder /></main>)
const Shell = compose(withHandlers(() => ({ pages: Router.outlet({ routes: [Router.on(home, Page)] }) })))((props) => <div />)
const layer = ${layer}
App.mount(Shell, { target: document.body, layer })
`,
})

const folder = {
  file: "/app/src/Folder.tsx",
  source: `export const Folder = compose(withProps({}))((props) => <ul><Folder /></ul>)`,
}

const messages = (layer: string) =>
  unprovided([store, label, folder, shell(layer)]).map((found) => [
    found.file,
    found.line,
    found.message.split(". ")[0],
  ])

const mounted = (call: string) =>
  unprovided([
    store,
    label,
    {
      file: "/app/src/main.tsx",
      source: `
import { Label } from "./Label.tsx"
const Page = compose(withHandlers(() => ({})))((props) => <main><Label /></main>)
${call}
`,
    },
  ]).length

const shipped = (how: string) =>
  unprovided([
    store,
    label,
    {
      file: "/app/src/main.tsx",
      source: `
import { Label } from "./Label.tsx"
const Panel = compose(withHandlers(() => ({})))((props) => <section><Label /></section>)
const Notes = NotesStore.${how}(Panel)
const Page = compose(withHandlers(() => ({})))((props) => <main><Notes /></main>)
App.mount(Page, { target: document.body, layer: Layer.empty })
`,
    },
  ]).map((found) => found.message.split(". ")[0])

describe("what a component drawn inside another needs, checked at build time", () => {
  it("follows tags and pages across files, from the layer given to App.mount", () => {
    expect(messages("Layer.empty")).toEqual([
      ["/app/src/main.tsx", 7, "Label, drawn in Page, needs NotesStore, Router.Router"],
    ])
  })

  it("takes a service as provided when the layer names it, its namespace, or a value made from it", () => {
    expect(
      messages("Layer.mergeAll(NotesStore.layer(), Router.layerMemory('/'), config.extra)"),
    ).toEqual([])
    expect(
      messages(
        "Layer.mergeAll(Layer.succeed(NotesStore, {}), routes)\nconst routes = Router.Router.layerMemory('/')",
      ),
    ).toEqual([])
  })

  it("follows a layer made in another file", () => {
    const layers = {
      file: "/app/src/layers.ts",
      source: `export const appLayer = Layer.mergeAll(NotesStore.layer(), Router.layerMemory("/"))`,
    }
    const main = {
      file: "/app/src/main.tsx",
      source: `
import { Label } from "./Label.tsx"
import { appLayer } from "./layers.ts"
const Page = compose(withHandlers(() => ({})))((props) => <main><Label /></main>)
App.mount(Page, { target: document.body, layer: appLayer })
`,
    }

    expect(unprovided([store, label, layers, main])).toEqual([])
  })

  it("takes a store shipped beside a component as provided to everything drawn inside it", () => {
    const beside = {
      file: "/app/src/main.tsx",
      source: `
import { Label } from "./Label.tsx"
import { NotesStore } from "./Notes.ts"
const Panel = compose(withHandlers(() => ({})))((props) => <section><Label /></section>)
const Notes = NotesStore.with(Panel)
const Page = compose(withHandlers(() => ({})))((props) => <main><Notes /></main>)
App.hydrate(Page, { target: document.body, layer: Router.Router.layerBrowser })
`,
    }

    expect(unprovided([store, label, beside])).toEqual([])
  })

  it("reports each place once however many mounts reach it, and ignores calls it cannot read", () => {
    const twice = {
      file: "/app/src/server.tsx",
      source: `
import { Label } from "./Label.tsx"
const Page = compose(withHandlers(() => ({})))((props) => <main><Label /></main>)
Server.render(Page, { layer: Layer.empty })
Server.renderToString(Page, { layer: Layer.empty })
App.mount(Unknown, { layer: Layer.empty })
App.mount(Page)
`,
    }

    expect(unprovided([store, label, twice])).toHaveLength(1)

    const cycle = {
      file: "/app/src/cycle.tsx",
      source: `
const Ping = compose(withHandlers(() => ({})))((props) => <i><Pong /></i>)
const Pong = compose(withHandlers(() => ({})))((props) => <b><Ping /></b>)
App.mount(Ping, { target: document.body, layer: Layer.empty })
`,
    }

    expect(unprovided([cycle])).toEqual([])
  })

  it("reports where the child is drawn, by line and column, with its code and the fix", () => {
    const main = {
      file: "/app/src/main.tsx",
      source: `import { Label } from "./Label.tsx"
const Page = compose(withHandlers(() => ({})))((props) => <main><Label /></main>)
App.mount(Page, { target: document.body, layer: Layer.empty })
`,
    }
    const second = main.source.split("\n")[1] ?? ""

    expect(unprovided([store, label, main])).toEqual([
      {
        rule: "child-needs-a-service",
        code: "SPAR_CHILD_NEEDS_A_SERVICE",
        message: expect.stringContaining(
          "Label, drawn in Page, needs NotesStore, Router.Router. A component drawn inside another",
        ),
        file: "/app/src/main.tsx",
        line: 2,
        column: second.indexOf("<Label") + 2,
      },
    ])
  })

  it("reads every way to mount a page with a layer, and nothing else", () => {
    expect(
      [
        "App.mount",
        "App.hydrate",
        "Server.render",
        "Server.renderToString",
        "Server.renderToStream",
        "Server.renderInPieces",
      ].map((how) => mounted(`${how}(Page, { layer: Layer.empty })`)),
    ).toEqual([1, 1, 1, 1, 1, 1])
    expect(
      [
        "Other.mount(Page, { layer: Layer.empty })",
        "App.start(Page, { layer: Layer.empty })",
        "App.mount(Page, options)",
        "App.mount(pages.Page, { layer: Layer.empty })",
      ].map(mounted),
    ).toEqual([0, 0, 0, 0])
  })

  it("walks into a component a store is shipped beside, with .with or .beside", () => {
    expect(shipped("with")).toEqual(["Label, drawn in Panel, needs Router.Router"])
    expect(shipped("beside")).toEqual(["Label, drawn in Panel, needs Router.Router"])
    expect(shipped("wrap")).toEqual([])
  })

  it("reports each child once at its first place, and each different child", () => {
    const main = {
      file: "/app/src/main.tsx",
      source: `
import { Label } from "./Label.tsx"
const Lonely = compose(withStore(NotesStore, (notes) => notes))((props) => <i />)
const Page = compose(withHandlers(() => ({})))((props) => (
  <main>
    <Label />
    <Label />
    <Lonely />
  </main>
))
App.mount(Page, { target: document.body, layer: Layer.empty })
`,
    }

    expect(
      unprovided([store, label, main]).map((found) => [found.line, found.message.split(". ")[0]]),
    ).toEqual([
      [6, "Label, drawn in Page, needs NotesStore, Router.Router"],
      [8, "Lonely, drawn in Page, needs NotesStore"],
    ])
  })

  it("leaves the mounted component's own needs to the compiler, even when a child draws it again", () => {
    const cycle = {
      file: "/app/src/cycle.tsx",
      source: `
const Ping = compose(withStore(NotesStore, (notes) => notes))((props) => <i><Pong /></i>)
const Pong = compose(withHandlers(() => ({})))((props) => <b><Ping /></b>)
App.mount(Ping, { target: document.body, layer: Layer.empty })
`,
    }

    expect(unprovided([cycle])).toEqual([])
  })

  it("does not take a lowercase value as a child component", () => {
    const main = {
      file: "/app/src/main.tsx",
      source: `
const helper = compose(withStore(NotesStore, (notes) => notes))((props) => <i />)
const Page = compose(withHandlers(() => ({ helper })))((props) => <main />)
App.mount(Page, { target: document.body, layer: Layer.empty })
`,
    }

    expect(unprovided([main])).toEqual([])
  })

  it("follows a layer through files that import each other, and an import without its extension", () => {
    const main = {
      file: "/app/src/main.tsx",
      source: `
import { Label } from "./Label.tsx"
import { appLayer } from "./layers"
const Page = compose(withHandlers(() => ({})))((props) => <main><Label /></main>)
App.mount(Page, { target: document.body, layer: appLayer })
`,
    }
    const layers = {
      file: "/app/src/layers.ts",
      source: `
import { extra } from "./more.ts"
export const appLayer = Layer.merge(extra, NotesStore.layer())
`,
    }
    const more = {
      file: "/app/src/more.ts",
      source: `
import { appLayer } from "./layers.ts"
export const extra = Layer.merge(appLayer, Router.layerMemory("/"))
`,
    }

    expect(unprovided([store, label, main, layers, more])).toEqual([])
  })

  it("fails a Vite build that draws such a child, and passes one that provides it", () => {
    const proof = `${process.cwd()}/../../apps/demo/forbidden/child-needs-a-service.tsx?v=1`

    expect(wholeProgram([])).toBe("")
    expect(sparJsx.buildEnd.call({ getModuleIds: () => ["/app/styles.css"] })).toBeUndefined()
    expect(wholeProgram([proof])).toContain("[SPAR_CHILD_NEEDS_A_SERVICE]")
    expect(() => sparJsx.buildEnd.call({ getModuleIds: () => [proof] })).toThrow(
      "SPAR_CHILD_NEEDS_A_SERVICE",
    )
  })
})
