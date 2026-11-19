import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import type { HttpClientRequest } from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"
import type { Rpc, RpcGroup } from "effect/rpc"
import { Socket } from "effect/socket"
import * as Timeline from "./Timeline.ts"

const pathOf = (request: HttpClientRequest.HttpClientRequest): string =>
  URL.canParse(request.url) ? new URL(request.url).pathname : request.url

const logged = (client: HttpClient.HttpClient): HttpClient.HttpClient =>
  HttpClient.transform(client, (answer, request) =>
    Effect.andThen(
      Timeline.note("call", `${request.method} ${pathOf(request)}`, () => ({
        method: request.method,
        url: request.url,
      })),
      answer,
    ),
  )

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
