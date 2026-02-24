import * as tf from '@tensorflow/tfjs-node';
import * as faceDetection from '@tensorflow-models/face-detection';
import { createCanvas, loadImage } from 'canvas'; // necessário para manipular imagens
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import * as path from 'path';

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class FaceDetector {
  private detector: faceDetection.FaceDetector | null = null;

  async initialize() {
    const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
    const detectorConfig = {
    runtime: 'tfjs' as const,
    maxFaces: 1,
    };
    this.detector = await faceDetection.createDetector(model, detectorConfig);
    console.log('✅ Face detector initialized');
  }

  /**
   * Detecta rostos em um buffer de imagem (JPEG/PNG)
   */
  async detectFaces(imageBuffer: Buffer): Promise<FaceBox[]> {
    if (!this.detector) throw new Error('Detector not initialized. Call initialize() first.');

    // Carregar imagem usando canvas
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    
    // Executar detecção
    const faces = await this.detector.estimateFaces(canvas);
    
    // Converter para formato FaceBox
    return faces.map(face => {
      const box = face.box;
      return {
        x: box.xMin,
        y: box.yMin,
        width: box.xMax - box.xMin,
        height: box.yMax - box.yMin,
      };
    });
  }

  /**
   * Extrai frames de um vídeo usando FFmpeg
   */
  async extractFrames(videoPath: string, intervalSec: number = 1): Promise<Buffer[]> {
    return new Promise((resolve, reject) => {
      const frames: Buffer[] = [];
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-vf', `fps=1/${intervalSec}`,
        '-f', 'image2pipe',
        '-pix_fmt', 'rgb24',
        '-vcodec', 'rawvideo',
        '-s', '640x360',
        '-'
      ]);

      ffmpeg.stdout.on('data', (chunk) => frames.push(chunk));
      ffmpeg.stderr.on('data', () => {}); // ignorar logs
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve(frames);
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    });
  }

  /**
   * Calcula o crop ideal para um frame
   */
  getCropForFrame(frameWidth: number, frameHeight: number, face: FaceBox): { x: number, y: number, width: number, height: number } {
    const targetAspect = 9 / 16;
    const targetWidth = frameHeight * targetAspect;
    const targetHeight = frameHeight;

    const faceCenterX = face.x + face.width / 2;
    const faceCenterY = face.y + face.height / 2;

    let cropX = faceCenterX - targetWidth / 2;
    let cropY = faceCenterY - targetHeight / 2;

    cropX = Math.max(0, Math.min(cropX, frameWidth - targetWidth));
    cropY = Math.max(0, Math.min(cropY, frameHeight - targetHeight));

    return {
      x: Math.round(cropX),
      y: Math.round(cropY),
      width: Math.round(targetWidth),
      height: Math.round(targetHeight),
    };
  }
}