import { Option, Predicate, Schema } from "effect"

export type Field = Schema.Codec<unknown, unknown>

export type Fields = Readonly<Record<string, Field>>

export type Show = (value: unknown) => Option.Option<Schema.Json>

const shows = new WeakMap<object, Show>()

export const kind = <T>(is: (value: unknown) => value is T, show: Show): Schema.declare<T> => {
  const schema = Schema.declare(is)

  shows.set(schema, (value) => (is(value) ? show(value) : Option.none()))

  return schema
}

export const named =
  (name: string): Show =>
  () =>
    Option.some(name)

export const encoded =
  (schema: Field): Show =>
  (value) =>
    Option.flatten(
      Option.liftThrowable(() => Schema.encodeUnknownOption(Schema.toCodecJson(schema))(value))(),
    )

export const shown = (field: Field, value: unknown): Option.Option<Schema.Json> =>
  (shows.get(field) ?? encoded(field))(value)

export const allShown = (fields: Fields, props: unknown): Readonly<Record<string, Schema.Json>> =>
  Object.fromEntries(
    Object.entries(fields).flatMap(([name, field]) =>
      Option.toArray(
        Option.map(
          shown(field, Predicate.hasProperty(props, name) ? props[name] : undefined),
          (value) => [name, value] as const,
        ),
      ),
    ),
  )
