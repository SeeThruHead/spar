const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true })

const rgbaOf = (color) => {
  canvas.clearRect(0, 0, 1, 1)
  Reflect.set(canvas, "fillStyle", color)
  canvas.fillRect(0, 0, 1, 1)

  return [...canvas.getImageData(0, 0, 1, 1).data]
}

const light = (value) => {
  const part = value / 255

  return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
}

const luminance = ([red, green, blue]) =>
  0.2126 * light(red) + 0.7152 * light(green) + 0.0722 * light(blue)

const backgroundOf = (element) => {
  if (element === null) return [255, 255, 255, 255]

  const color = rgbaOf(getComputedStyle(element).backgroundColor)

  return color[3] > 230 ? color : backgroundOf(element.parentElement)
}

const ratioOf = (element) => {
  const front = luminance(rgbaOf(getComputedStyle(element).color))
  const back = luminance(backgroundOf(element))

  return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05)
}

const hasText = (element) => (element.textContent ?? "").trim().length > 0

const isShown = (element) => element.getBoundingClientRect().width > 0

const describe = (element) =>
  `${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 30)}" at ${ratioOf(element).toFixed(2)}:1`

Reflect.set(globalThis, "lowContrast", () =>
  [...document.querySelectorAll("h1, h2, p, li, a, td, th, label, output, button")]
    .filter(hasText)
    .filter(isShown)
    .filter((element) => ratioOf(element) < 4.5)
    .slice(0, 5)
    .map(describe),
)
