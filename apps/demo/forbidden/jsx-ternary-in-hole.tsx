export const PanelView = ({ open }: { readonly open: boolean }) => (
  <section>{open ? <p>Open</p> : <p>Closed</p>}</section>
)
