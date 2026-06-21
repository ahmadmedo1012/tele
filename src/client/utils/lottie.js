/* ── Lottie animation utility ── */
// Simple inline Lottie JSON generators for common animations
// Avoids needing external .json files

export function createLottieContainer(size = 80) {
  const div = document.createElement('div');
  div.style.cssText = `width:${size}px;height:${size}px;margin:0 auto`;
  return div;
}

// Loading spinner animation as inline Lottie JSON
export const loadingAnimation = {
  v: "5.5.7", fr: 30, ip: 0, op: 60, w: 100, h: 100,
  nm: "Loading", ddd: 0,
  assets: [],
  layers: [{
    ddd: 0, ind: 1, ty: 4, nm: "Spinner", sr: 1, ks: {
      o: { a: 0, k: 100 },
      r: { a: 1, k: [{ t: 0, s: [0], o: { x: [0.67], y: [1] }, i: { x: [0.33], y: [1] } }, { t: 60, s: [360] }] },
      p: { a: 0, k: [50, 50, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] }
    },
    shapes: [{
      ty: "el", nm: "Oval", d: 1,
      ks: { a: 0, k: { s: [60, 60], p: [0, 0], r: 30 } },
      s: [{
        ty: "gr", d: 1,
        it: [
          { ty: "st", c: { a: 0, k: [0.05, 0.59, 0.53, 1] }, w: { a: 0, k: 6 }, o: { a: 0, k: 100 }, lc: 2, lj: 1 },
          { ty: "tm", s: { a: 1, k: [{ t: 0, s: [0] }, { t: 60, s: [100] }] }, e: { a: 1, k: [{ t: 0, s: [30] }, { t: 60, s: [70] }] }, o: { a: 0, k: 0 } },
          { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
        ]
      }]
    }],
    ef: [], w: 100, h: 100
  }]
};

// Checkmark done animation
export const doneAnimation = {
  v: "5.5.7", fr: 30, ip: 0, op: 45, w: 100, h: 100,
  nm: "Done", ddd: 0, assets: [],
  layers: [{
    ddd: 0, ind: 1, ty: 4, nm: "Checkmark", sr: 1, ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [50, 50, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 1, k: [{ t: 0, s: [0, 0, 100] }, { t: 15, s: [110, 110, 100] }, { t: 20, s: [100, 100, 100] }] }
    },
    shapes: [{
      ty: "el", nm: "Circle", d: 1,
      ks: { a: 0, k: { s: [60, 60], p: [0, 0], r: 30 } },
      s: [{
        ty: "gr", d: 1,
        it: [
          { ty: "st", c: { a: 0, k: [0.05, 0.59, 0.53, 1] }, w: { a: 0, k: 4 }, o: { a: 0, k: 100 }, lc: 1, lj: 1 },
          { ty: "fl", c: { a: 0, k: [0.05, 0.59, 0.53, 0.1] }, o: { a: 0, k: 100 } },
          { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
        ]
      }]
    }, {
      ty: "sh", nm: "Check", d: 1,
      ks: { a: 1, k: [{ t: 0, s: [{ c: false, i: [[0,0],[0,0],[0,0]], o: [[0,0],[0,0],[0,0]], v: [[-15,0],[-5,10],[15,-8]] }] }, { t: 30, s: [{ c: false, i: [[0,0],[0,0],[0,0]], o: [[0,0],[0,0],[0,0]], v: [[-15,0],[-5,10],[15,-8]] }] }] },
      s: [{
        ty: "gr", d: 1,
        it: [{ ty: "st", c: { a: 0, k: [0.05, 0.59, 0.53, 1] }, w: { a: 0, k: 4 }, o: { a: 0, k: 100 }, lc: 2, lj: 1 }]
      }]
    }],
    ef: [], w: 100, h: 100
  }]
};

export function playAnimation(container, animationData, loop = false) {
  if (typeof lottie === 'undefined') return null;
  try {
    return lottie.loadAnimation({
      container,
      animationData,
      loop,
      autoplay: true,
    });
  } catch (e) {
    console.warn('Lottie error:', e);
    return null;
  }
}
