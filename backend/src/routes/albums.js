import express from 'express';
import requestsRoutes from './albums/requests.js';
import listRoutes from './albums/list.js';
import albumRoutes from './albums/album.js';
import photoUploadsRoutes from './albums/photoUploads.js';
import videoUploadsRoutes from './albums/videoUploads.js';
import photoFilesRoutes from './albums/photoFiles.js';
import facesRoutes from './albums/faces.js';
import selectionRoutes from './albums/selection.js';

/**
 * 📸 Galleries — the vendor's side (mounted at /api/albums). Each part lives in routes/albums/; they are mounted
 * here in their original order, which matters: a fixed path such as /requests must be tried before /:id
 * (code audit #2, Raj 2026-11-11).
 */
const router = express.Router();
router.use(requestsRoutes);
router.use(listRoutes);
router.use(albumRoutes);
router.use(photoUploadsRoutes);
router.use(videoUploadsRoutes);
router.use(photoFilesRoutes);
router.use(facesRoutes);
router.use(selectionRoutes);

export default router;
