// 🧠 Face engine — @vladmandic/face-api (swappable; AWS can replace later)
import * as tf from '@tensorflow/tfjs-node';
import * as faceapi from '@vladmandic/face-api';
import canvas from 'canvas';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(__dirname, '..', '..', 'models');

let ready = false;
async function init() {
  if (ready) return;
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);
  ready = true;
}

// Get all face descriptors (128-float vectors) from an image file
export async function getFaceDescriptors(imagePath) {
  await init();
  // canvas can't read webp → decode to JPEG buffer with sharp first
  const jpegBuf = await sharp(imagePath).jpeg().toBuffer();
  const img = await canvas.loadImage(jpegBuf);
  const results = await faceapi
    .detectAllFaces(img)
    .withFaceLandmarks()
    .withFaceDescriptors();
  return results.map(r => ({
    descriptor: Array.from(r.descriptor),   // 128 floats → JSON-safe
    box: r.detection.box,
    score: r.detection.score,
  }));
}

// Compare two descriptors → distance (lower = more similar). <0.5 ≈ match
export function faceDistance(a, b) {
  return faceapi.euclideanDistance(a, b);
}

// Given a query descriptor + list of {photo_id, descriptor}, return matches under threshold
export function findMatches(query, candidates, threshold = 0.5) {
  return candidates
    .map(c => ({ photo_id: c.photo_id, distance: faceDistance(query, c.descriptor) }))
    .filter(m => m.distance <= threshold)
    .sort((a, b) => a.distance - b.distance);
}
