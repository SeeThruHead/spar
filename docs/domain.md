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
- `send(command)` sends the command to the aggregate. When the aggregate accepts it, the slot is
  written under the command's name, with the events it committed and the new version as what the
  write carried. When the aggregate refuses it, the Effect fails with the command's typed
  rejection, and nothing is written.

<<< packages/domain/test/store.test.ts#counting

A refusal is the domain's rule, not Spar's: Spar has no guards of its own. The test beside this
example sends `Increment` while a reset is running and checks that it fails with
`ResetInProgress` and the state is unchanged.

## In the browser or against a server

Where the aggregate runs is the alchemy layer the app is given, and the store does not change.
For an app with no backend, alchemy's in-memory runtime decides and folds in the page:

<<< packages/domain/test/store.test.ts#local

For an app with a server, give the model's layer over alchemy's API client instead, and the same
commands go to the server's aggregate.

## Not done yet

- After an accepted command the store reads the instance's state again. Folding the committed
  events with the aggregate's own `evolve` would save that read when the aggregate is remote.
- Commands are sent at once. For a remote aggregate, sending them through an `Outbox.channel`, so
  they survive a closed tab or a dropped connection, is next.
- A test against a real server, through alchemy's API client.
