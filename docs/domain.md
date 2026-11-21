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

## Not done yet

- A store over a server's aggregate. Alchemy's API client sends a command by name
  (`api.Increment(input)`) and answers with the stream and version it committed, not the
  events, so a remote store has to take its state from one of the model's views
  (`api.CounterView.watch(id)`) rather than folding events itself.
- That remote store would send its commands through an `Outbox.channel` with alchemy's
  `commandId` as the idempotency key, so a command survives a closed tab or a dropped connection
  and is never applied twice.
