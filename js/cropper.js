/**
 * PR MARKETPLACE - IMAGE CROPPER
 *
 * Canvas cropper for the listing photo and the payment QR. Same interaction
 * as before - drag to move, corner handles to resize, aspect presets, rotate.
 * The difference is the output: it resolves with a Blob, so a cropped photo
 * can be uploaded to Storage rather than inlined as base64.
 */

import { showToast, loadImage, canvasToBlob, openModal, closeModal } from './ui.js';

const MIN_BOX = 48;

const state = {
  img: null,
  rotation: 0,
  aspectRatio: 'free',
  box: { x: 0, y: 0, w: 0, h: 0 },
  canvasRect: { x: 0, y: 0, w: 0, h: 0 },
  isDragging: false,
  dragHandle: null,
  dragStart: { x: 0, y: 0 },
  boxStart: { x: 0, y: 0, w: 0, h: 0 },
  resolve: null
};

let els = {};
let wired = false;

function cacheElements() {
  els = {
    modal: document.getElementById('cropModal'),
    title: document.getElementById('cropModalTitle'),
    viewport: document.getElementById('cropperViewportContainer'),
    canvas: document.getElementById('cropCanvas'),
    box: document.getElementById('cropSelectionBox'),
    closeBtn: document.getElementById('closeCropModalBtn'),
    cancelBtn: document.getElementById('cancelCropBtn'),
    applyBtn: document.getElementById('applyCropBtn'),
    rotateBtn: document.getElementById('btnRotateCrop'),
    resetBtn: document.getElementById('btnResetCrop')
  };
}

/**
 * Open the cropper on an image source. Resolves with a Blob, or null if the
 * user backs out.
 */
export function openCropper(src, { title = 'Crop & Adjust Photo', aspectRatio = 'free' } = {}) {
  cacheElements();
  if (!els.modal || !els.canvas) return Promise.resolve(null);

  wire();

  state.rotation = 0;
  state.aspectRatio = aspectRatio;

  if (els.title) els.title.textContent = title;
  document.querySelectorAll('.crop-aspect-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratio === aspectRatio);
  });

  openModal(els.modal);

  return loadImage(src)
    .then(img => {
      state.img = img;
      // Wait a frame so the modal has laid out and the viewport has a size.
      requestAnimationFrame(() => requestAnimationFrame(render));
      return new Promise(resolve => { state.resolve = resolve; });
    })
    .catch(err => {
      showToast(err.message);
      closeModal(els.modal);
      return null;
    });
}

function finish(blob) {
  const resolve = state.resolve;
  state.resolve = null;
  state.img = null;
  closeModal(els.modal);
  if (resolve) resolve(blob);
}

/* --------------------------------------------------------------- render --- */

function render() {
  if (!state.img || !els.canvas || !els.viewport) return;

  const ctx = els.canvas.getContext('2d');
  const vpW = els.viewport.clientWidth || 320;
  const vpH = els.viewport.clientHeight || 280;

  const srcW = state.img.naturalWidth || 600;
  const srcH = state.img.naturalHeight || 600;

  const turned = state.rotation % 180 !== 0;
  const rotW = turned ? srcH : srcW;
  const rotH = turned ? srcW : srcH;

  const scale = Math.min((vpW - 20) / rotW, (vpH - 20) / rotH, 1);
  const drawW = Math.max(1, Math.round(rotW * scale));
  const drawH = Math.max(1, Math.round(rotH * scale));

  els.canvas.width = drawW;
  els.canvas.height = drawH;
  els.canvas.style.width = `${drawW}px`;
  els.canvas.style.height = `${drawH}px`;

  ctx.save();
  ctx.clearRect(0, 0, drawW, drawH);
  ctx.translate(drawW / 2, drawH / 2);
  ctx.rotate((state.rotation * Math.PI) / 180);
  ctx.drawImage(state.img, (-srcW * scale) / 2, (-srcH * scale) / 2, srcW * scale, srcH * scale);
  ctx.restore();

  state.canvasRect = { x: (vpW - drawW) / 2, y: (vpH - drawH) / 2, w: drawW, h: drawH };
  resetBox();
}

function resetBox() {
  const c = state.canvasRect;
  let w = Math.round(c.w * 0.86);
  let h = Math.round(c.h * 0.86);

  const ratios = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };
  const ratio = ratios[state.aspectRatio];
  if (ratio) {
    h = Math.round(w / ratio);
    if (h > c.h) {
      h = Math.round(c.h * 0.86);
      w = Math.round(h * ratio);
    }
  }

  state.box = {
    x: c.x + (c.w - w) / 2,
    y: c.y + (c.h - h) / 2,
    w,
    h
  };
  paintBox();
}

function paintBox() {
  if (!els.box) return;
  els.box.style.left = `${state.box.x}px`;
  els.box.style.top = `${state.box.y}px`;
  els.box.style.width = `${state.box.w}px`;
  els.box.style.height = `${state.box.h}px`;
}

/* -------------------------------------------------------------- dragging --- */

function ratioOf() {
  const ratios = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };
  return ratios[state.aspectRatio] || null;
}

function clampBox(box) {
  const c = state.canvasRect;
  box.w = Math.max(MIN_BOX, Math.min(box.w, c.w));
  box.h = Math.max(MIN_BOX, Math.min(box.h, c.h));
  box.x = Math.max(c.x, Math.min(box.x, c.x + c.w - box.w));
  box.y = Math.max(c.y, Math.min(box.y, c.y + c.h - box.h));
  return box;
}

function onPointerDown(event) {
  const handle = event.target.closest('.crop-handle');
  const insideBox = event.target.closest('.crop-selection-box');
  if (!handle && !insideBox) return;

  event.preventDefault();
  state.isDragging = true;
  state.dragHandle = handle ? handle.dataset.handle : 'move';
  state.dragStart = { x: event.clientX, y: event.clientY };
  state.boxStart = { ...state.box };
  els.viewport.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!state.isDragging) return;
  event.preventDefault();

  const dx = event.clientX - state.dragStart.x;
  const dy = event.clientY - state.dragStart.y;
  const s = state.boxStart;
  const ratio = ratioOf();
  const next = { ...s };

  if (state.dragHandle === 'move') {
    next.x = s.x + dx;
    next.y = s.y + dy;
  } else {
    const east = state.dragHandle.includes('e');
    const south = state.dragHandle.includes('s');

    let w = east ? s.w + dx : s.w - dx;
    let h = south ? s.h + dy : s.h - dy;

    w = Math.max(MIN_BOX, w);
    h = Math.max(MIN_BOX, h);
    if (ratio) h = w / ratio;

    next.w = w;
    next.h = h;
    next.x = east ? s.x : s.x + s.w - w;
    next.y = south ? s.y : s.y + s.h - h;
  }

  state.box = clampBox(next);
  paintBox();
}

function onPointerUp() {
  state.isDragging = false;
  state.dragHandle = null;
}

/* ---------------------------------------------------------------- apply --- */

async function apply() {
  if (!state.img) return;

  const c = state.canvasRect;
  const b = state.box;

  const relX = Math.max(0, b.x - c.x);
  const relY = Math.max(0, b.y - c.y);
  const relW = Math.min(b.w, c.w - relX);
  const relH = Math.min(b.h, c.h - relY);

  if (relW <= 10 || relH <= 10) {
    showToast('That crop area is too small — drag the corners out a bit.');
    return;
  }

  const srcW = state.img.naturalWidth;
  const srcH = state.img.naturalHeight;
  const turned = state.rotation % 180 !== 0;
  const rotW = turned ? srcH : srcW;
  const rotH = turned ? srcW : srcH;

  // Draw the rotated image at full resolution, then take the crop from it.
  const rotated = document.createElement('canvas');
  rotated.width = rotW;
  rotated.height = rotH;
  const rctx = rotated.getContext('2d');
  rctx.imageSmoothingEnabled = true;
  rctx.imageSmoothingQuality = 'high';
  rctx.translate(rotW / 2, rotH / 2);
  rctx.rotate((state.rotation * Math.PI) / 180);
  rctx.drawImage(state.img, -srcW / 2, -srcH / 2, srcW, srcH);

  const scale = rotW / c.w;
  const cropX = Math.round(relX * scale);
  const cropY = Math.round(relY * scale);
  const cropW = Math.max(1, Math.round(relW * scale));
  const cropH = Math.max(1, Math.round(relH * scale));

  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(rotated, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  try {
    const blob = await canvasToBlob(out, window.PRConfig.IMAGE_QUALITY);
    finish(blob);
  } catch (err) {
    showToast(err.message);
  }
}

/* ----------------------------------------------------------------- wiring --- */

function wire() {
  if (wired) return;
  wired = true;

  els.viewport?.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  document.querySelectorAll('.crop-aspect-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.crop-aspect-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.aspectRatio = btn.dataset.ratio;
      resetBox();
    });
  });

  els.rotateBtn?.addEventListener('click', () => {
    state.rotation = (state.rotation + 90) % 360;
    render();
  });

  els.resetBtn?.addEventListener('click', () => {
    state.rotation = 0;
    render();
  });

  els.applyBtn?.addEventListener('click', apply);
  els.cancelBtn?.addEventListener('click', () => finish(null));
  els.closeBtn?.addEventListener('click', () => finish(null));

  window.addEventListener('resize', () => {
    if (state.img && els.modal && !els.modal.classList.contains('hidden')) render();
  });
}

/** Called by the back-button bridge so hardware back cancels the crop. */
export function cancelCropper() {
  if (state.resolve) {
    finish(null);
    return true;
  }
  return false;
}
