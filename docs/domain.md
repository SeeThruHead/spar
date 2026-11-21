# Aggregates as stores

`@spar/domain` lets an [alchemy domain](https://github.com/alchemy-run/alchemy) aggregate be a
Spar store. It is opt-in: Spar itself has no dependency on alchemy.

An aggregate is a good store. Its commands are named and carry a Schema, `decide` says what each
one records or why it is refused, and `evolve` folds what was recorded into the state. That is
what a store is, with the rules of the domain written once, in the domain.

## The aggregate

<<< packages/domain/test/counter.ts#Increment

<<< packages/domain/test/counter.ts#Counter

## The store

`Aggregates.store(Aggregate, id)` gives a store over one instance:

- `state` is a reactive value of the aggregate's state. It is a slot in the one state, named
  `Counter/c-1`, so it is in snapshots, in the log and in the devtools like any store.
- `send(command)` sends the command to the aggregate. When the aggregate accepts it, the store
  folds the committed events into its state with the aggregate's own `evolve`, so it does not
  read the instance again. The slot is written under the command's name, with the
  events and the new version as what the write carried. When the aggregate refuses it, the
  Effect fails with the command's typed rejection, and nothing is written.

<<< packages/domain/test/store.test.ts#counting

A refusal is the domain's rule, not Spar's: Spar has no guards of its own. The test beside this
example sends `Increment` while a reset is running and checks that it fails with
`ResetInProgress` and the state is unchanged.

## In the browser or against a server

Where the aggregate runs is the alchemy layer the app is given, and the store does not change.
For an app with no backend, alchemy's in-memory runtime decides and folds in the page:

<<< packages/domain/test/store.test.ts#local

## Behind an Api

When the aggregate runs on a server, the page reaches it through the model's alchemy Api.
`Aggregates.remote` takes the aggregate, one of the model's views over it, and the Api client:

<<< packages/domain/test/remote.test.ts#counterOver

Each command goes to the Api by its name with a fresh `commandId`, so the server applies it once
however often it is retried. The Api answers with the stream and version it committed, not the
events, so the store then reads the view at that version and writes the slot with what it says.
A refusal fails `send` with the command's typed rejection, as it does in the browser.

The test gives the client alchemy's in-process protocol, which runs the real Api path in memory.
An app gives it `protocolHttp` or `protocolWebSocket` with the server's address instead:

<<< packages/domain/test/remote.test.ts#served

To see other people's commands as they land, run the store's `follow`, for as long as the page
shows it. It follows the view's live stream (pushed over a WebSocket by `protocolWebSocket`) and
writes the slot under the name `Watched`. The store keeps the newest version it has written, so
a snapshot older than a command it already applied is dropped, and one that says nothing new
writes nothing: each state reaches the log once. The test beside this page forks `follow`, has a
second client send `Increment`, and checks that the first store sees it.

## Not done yet

- Commands are sent at once. Sending them through an `Outbox.channel`, with the `commandId` as
  its key, would let a command survive a closed tab or a dropped connection.
