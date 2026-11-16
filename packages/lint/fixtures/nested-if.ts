export const describe = (left: boolean, right: boolean) => {
  if (left) {
    if (right) return "both"
  }
  return "other"
}
