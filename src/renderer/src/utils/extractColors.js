function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s
  const l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s * 100, l * 100]
}

function colorDistance(c1, c2) {
  return (c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2
}

export function extractColors(imageUrl) {
  return new Promise((resolve) => {
    if (!imageUrl) {
      resolve({ primary: [30, 30, 40], secondary: [20, 20, 25], vibrant: [100, 100, 110] })
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const sampleW = 64
        const sampleH = 32
        canvas.width = sampleW
        canvas.height = sampleH
        ctx.drawImage(img, 0, 0, sampleW, sampleH)
        const imageData = ctx.getImageData(0, 0, sampleW, sampleH).data

        const pixels = []
        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i]
          const g = imageData[i + 1]
          const b = imageData[i + 2]
          if (r + g + b < 30) continue
          pixels.push([r, g, b])
        }

        if (pixels.length === 0) {
          resolve({ primary: [30, 30, 40], secondary: [20, 20, 25], vibrant: [100, 100, 110] })
          return
        }

        const k = 5
        let centroids = []
        for (let i = 0; i < k; i++) {
          centroids.push(pixels[Math.floor(Math.random() * pixels.length)].slice())
        }

        for (let iter = 0; iter < 10; iter++) {
          const clusters = Array.from({ length: k }, () => [])
          for (const p of pixels) {
            let minDist = Infinity
            let best = 0
            for (let c = 0; c < k; c++) {
              const d = colorDistance(p, centroids[c])
              if (d < minDist) { minDist = d; best = c }
            }
            clusters[best].push(p)
          }
          for (let c = 0; c < k; c++) {
            if (clusters[c].length === 0) continue
            centroids[c] = [0, 0, 0]
            for (const p of clusters[c]) {
              centroids[c][0] += p[0]
              centroids[c][1] += p[1]
              centroids[c][2] += p[2]
            }
            centroids[c] = centroids[c].map(v => Math.round(v / clusters[c].length))
          }
        }

        const sorted = centroids
          .map((c, i) => ({ color: c, brightness: (c[0] + c[1] + c[2]) / 3, index: i }))
          .sort((a, b) => b.brightness - a.brightness)

        const primary = sorted[0].color
        const secondary = sorted[1].color

        let bestVibrant = sorted[0].color
        let bestSat = 0
        for (const s of sorted) {
          const [, sat, lig] = rgbToHsl(s.color[0], s.color[1], s.color[2])
          const vividness = sat * (1 - Math.abs(50 - lig) / 50)
          if (vividness > bestSat) {
            bestSat = vividness
            bestVibrant = s.color
          }
        }

        resolve({
          primary,
          secondary,
          vibrant: bestVibrant
        })
      } catch {
        resolve({ primary: [30, 30, 40], secondary: [20, 20, 25], vibrant: [100, 100, 110] })
      }
    }
    img.onerror = () => {
      resolve({ primary: [30, 30, 40], secondary: [20, 20, 25], vibrant: [100, 100, 110] })
    }
    img.src = imageUrl
  })
}
