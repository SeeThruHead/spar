import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import type { HttpClientRequest } from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"
import type { Rpc, RpcGroup } from "effect/rpc"
import { Socket } from "effect/socket"
import * as Cell from "./internal/cell.ts"
import { noticed } from "./internal/notice.ts"
import * as Timeline from "./Timeline.ts"

const pathOf = (request: HttpClientRequest.HttpClientRequest): string =>
  URL.canParse(request.url) ? new URL(request.url).pathname : request.url

const readsOnly: ReadonlySet<string> = new Set(["GET", "HEAD"])

const counted = (
  flying: Cell.Cell<ReadonlyMap<string, number>>,
  name: string,
  by: number,
): number => {
  const next = (flying.read().get(name) ?? 0) + by

  flying.write(new Map([...flying.read(), [name, next]]))

  return next
}

const logged = (client: HttpClient.HttpClient): HttpClient.HttpClient => {
  const flying = Cell.make<ReadonlyMap<string, number>>(new Map())
  const again = (request: HttpClientRequest.HttpClientRequest) => {
    if (!readsOnly.has(request.method)) return Effect.void
    if (counted(flying, `${request.method} ${request.url}`, 1) === 1) return Effect.void

    return noticed(
      "SPAR_DUPLICATE_CALL",
      `${request.method} ${pathOf(request)}`,
      `${request.method} ${request.url} was asked for again while the same request was still on its way.`,
    )
  }
  const landed = (request: HttpClientRequest.HttpClientRequest) =>
    Effect.sync(() => {
      if (readsOnly.has(request.method)) counted(flying, `${request.method} ${request.url}`, -1)
    })

  return HttpClient.transform(client, (answer, request) =>
    Effect.andThen(
      Timeline.note("call", `${request.method} ${pathOf(request)}`, () => ({
        method: request.method,
        url: request.url,
      })),
      Effect.andThen(again(request), Effect.ensuring(answer, landed(request))),
    ),
  )
}

export const layerFrom = <E, R>(
  client: Layer.Layer<HttpClient.HttpClient, E, R>,
): Layer.Layer<HttpClient.HttpClient, E, R> =>
  Layer.provide(
    Layer.effect(HttpClient.HttpClient, Effect.map(Effect.service(HttpClient.HttpClient), logged)),
    client,
  )

export const layer: Layer.Layer<HttpClient.HttpClient> = layerFrom(FetchHttpClient.layer)

export const layerTelemetry: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer

export const beacon = (url: string, body: string): Effect.Effect<boolean> =>
  Effect.sync(() => navigator.sendBeacon(url, body))

const pathOfUrl = (url: string): string => (URL.canParse(url) ? new URL(url).pathname : url)

export const heard = (url: string, socket: Socket.Socket): Socket.Socket =>
  Socket.make({
    reader: Effect.map(socket.reader, (reader) => ({
      upgrade: reader.upgrade,
      pull: Effect.tap(reader.pull, (frames) =>
        Timeline.note("call", `socket ${pathOfUrl(url)} received`, () => ({
          url,
          frames: frames.length,
        })),
      ),
    })),
    writer: Effect.map(socket.writer, (writer) => ({
      write: (chunk) =>
        Effect.andThen(
          Timeline.note("call", `socket ${pathOfUrl(url)} sent`, () => ({ url, frames: 1 })),
          writer.write(chunk),
        ),
      writeAll: (chunks) =>
        Effect.andThen(
          Timeline.note("call", `socket ${pathOfUrl(url)} sent`, () => ({
            url,
            frames: chunks.length,
          })),
          writer.writeAll(chunks),
        ),
    })),
  })

export const socket = (
  url: string,
): Effect.Effect<Socket.Socket, never, Socket.WebSocketConstructor> =>
  Effect.map(Socket.makeWebSocket(url), (made) => heard(url, made))

export const layerSocket = (url: string): Layer.Layer<Socket.Socket> =>
  Layer.provide(Layer.effect(Socket.Socket, socket(url)), Socket.layerWebSocketConstructorGlobal)

export const rpc = <Rpcs extends Rpc.Any>(group: RpcGroup.RpcGroup<Rpcs>, url: string) =>
  Effect.flatMap(
    Layer.build(Layer.provide(RpcClient.layerProtocolHttp({ url }), RpcSerialization.layerNdjson)),
    (protocol) => Effect.provide(RpcClient.make(group), protocol),
  )
