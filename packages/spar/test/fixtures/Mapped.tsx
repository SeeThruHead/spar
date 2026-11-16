export const MappedView = ({ items }: { readonly items: ReadonlyArray<string> }) => (
  <ul>
    {items.map((item) => (
      <li>{item}</li>
    ))}
  </ul>
)
