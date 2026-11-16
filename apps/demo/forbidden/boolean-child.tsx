export const BadgeView = ({ unread }: { readonly unread: boolean }) => (
  <span>{unread && "New"}</span>
)
