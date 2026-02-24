// @ts-nocheck - Ignora verificação de tipos neste arquivo
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBaseOutputDir(): string {
  const videosDir = app.getPath('videos'); // C:\Users\Rafael\Videos
  return path.join(videosDir, 'OpusFactory');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Pasta criada: ${dir}`);
  }
}

// ─── Configurar binários ───────────────────────────────────────────────────────
ffmpeg.setFfmpegPath(ffmpegStatic as string);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface CropParams {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Serviço ──────────────────────────────────────────────────────────────────
export class FFmpegService {

  // ═══════════════════════════════════════════════════════════════════════════
  // getDuration
  // ═══════════════════════════════════════════════════════════════════════════
  async getDuration(videoPath: string): Promise<number> {
    try {
      const metadata = await this.getMetadata(videoPath);
      const duration = metadata?.format?.duration ?? 0;
      console.log(`⏱️ Duração de "${path.basename(videoPath)}": ${duration.toFixed(2)}s`);
      return duration;
    } catch (error) {
      console.error('❌ Erro ao obter duração:', error);
      return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // getMetadata
  // ═══════════════════════════════════════════════════════════════════════════
  async getMetadata(videoPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.error('❌ ffprobe error:', err);
          reject(err);
        } else {
          resolve(metadata);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // getFileSize
  // ═══════════════════════════════════════════════════════════════════════════
  async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // extractAudio
  // ═══════════════════════════════════════════════════════════════════════════
  async extractAudio(videoPath: string, outputPath?: string): Promise<string> {
    const outPath = outputPath ?? videoPath.replace(/\.[^/.]+$/, '_audio.mp3');
    console.log(`🎵 Extraindo áudio: ${path.basename(videoPath)} → ${path.basename(outPath)}`);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .toFormat('mp3')
        .audioBitrate(128)
        .audioChannels(1)
        .audioFrequency(16000)
        .on('progress', (progress) => {
          if (progress.percent != null) {
            console.log(`   ⏳ Extração de áudio: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('end', () => {
          console.log(`   ✅ Áudio extraído: ${outPath}`);
          resolve(outPath);
        })
        .on('error', (err) => {
          console.error('   ❌ Erro na extração de áudio:', err);
          reject(err);
        })
        .save(outPath);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // cutClip  — resize simples para 9:16 sem crop manual
  // ═══════════════════════════════════════════════════════════════════════════
  async cutClip(
    videoPath: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    resolution?: string
  ): Promise<string> {
    const duration = endTime - startTime;

    console.log(`✂️ cutClip | ${path.basename(videoPath)} [${startTime}s→${endTime}s] dur=${duration}s`);

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Vídeo de origem não encontrado: ${videoPath}`);
    }

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset ultrafast',
          '-movflags +faststart',
          '-pix_fmt yuv420p',  // compatibilidade máxima
        ])
        .size(resolution ?? '1080x1920')
        .autopad(true, 'black')
        .on('start', (cmd) => console.log('   🎬 FFmpeg cutClip:', cmd))
        .on('progress', (p) => {
          if (p.percent != null) console.log(`   ⏳ Progresso: ${p.percent.toFixed(1)}%`);
        })
        .on('end', () => {
          console.log(`   ✅ Clipe gerado: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('   ❌ Erro FFmpeg cutClip:', err);
          reject(err);
        })
        .run();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // cutClipWithCrop  — crop na região definida pelo usuário + scale 1080×1920
  //
  // CORREÇÃO: adicionadas as mesmas flags de performance do cutClip
  // (-preset ultrafast, -movflags +faststart, -pix_fmt yuv420p)
  // e validação do crop para evitar valores fora dos limites do vídeo.
  // ═══════════════════════════════════════════════════════════════════════════
  async cutClipWithCrop(
    videoPath: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    crop: CropParams
  ): Promise<string> {
    const duration = endTime - startTime;

    console.log(`✂️ cutClipWithCrop | ${path.basename(videoPath)} [${startTime}s→${endTime}s]`);
    console.log(`   crop: x=${crop.x} y=${crop.y} w=${crop.width} h=${crop.height}`);

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Vídeo de origem não encontrado: ${videoPath}`);
    }

    // ─── Validar crop contra metadados reais do vídeo ───────────────────────
    // Evita erros silenciosos do FFmpeg quando o crop extrapola as dimensões
    try {
      const meta = await this.getMetadata(videoPath);
      const vStream = meta?.streams?.find((s: any) => s.codec_type === 'video');
      if (vStream) {
        const vw: number = vStream.width;
        const vh: number = vStream.height;

        // Clampeia crop dentro dos limites do vídeo
        const safeX      = Math.max(0, Math.min(crop.x, vw - 1));
        const safeY      = Math.max(0, Math.min(crop.y, vh - 1));
        const safeWidth  = Math.max(2, Math.min(crop.width,  vw - safeX));
        const safeHeight = Math.max(2, Math.min(crop.height, vh - safeY));

        if (safeX !== crop.x || safeY !== crop.y || safeWidth !== crop.width || safeHeight !== crop.height) {
          console.warn(`   ⚠️ Crop ajustado para caber no vídeo ${vw}×${vh}:`);
          console.warn(`      original:  x=${crop.x} y=${crop.y} w=${crop.width} h=${crop.height}`);
          console.warn(`      ajustado:  x=${safeX} y=${safeY} w=${safeWidth} h=${safeHeight}`);
        }

        crop = { x: safeX, y: safeY, width: safeWidth, height: safeHeight };
      }
    } catch (metaErr) {
      console.warn('   ⚠️ Não foi possível validar crop contra metadados:', metaErr);
    }

    // filtro FFmpeg: crop na região escolhida → scale para 1080×1920
    const vfFilter = `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=1080:1920`;

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-vf', vfFilter,
          '-preset ultrafast',      // ← adicionado (paridade com cutClip)
          '-movflags +faststart',   // ← adicionado (streaming-friendly)
          '-pix_fmt yuv420p',       // ← adicionado (compatibilidade)
        ])
        .output(outputPath)
        .on('start', (cmd) => console.log('   🎬 FFmpeg cutClipWithCrop:', cmd))
        .on('progress', (p) => {
          if (p.percent != null) console.log(`   ⏳ Progresso crop: ${p.percent.toFixed(1)}%`);
        })
        .on('end', () => {
          console.log(`   ✅ Clipe com crop salvo: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('   ❌ Erro FFmpeg cutClipWithCrop:', err);
          reject(err);
        })
        .run();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // cutClipWithFaceTracking  — detecta rosto e aplica crop automático
  // ═══════════════════════════════════════════════════════════════════════════
  async cutClipWithFaceTracking(
    videoPath: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    faceDetector: any
  ): Promise<string> {
    console.log(`🤖 cutClipWithFaceTracking | [${startTime}s→${endTime}s]`);

    const frames = await faceDetector.extractFrames(videoPath, 1); // 1 fps
    const facePositions: { time: number; crop: CropParams }[] = [];

    for (let i = 0; i < frames.length; i++) {
      const faces = await faceDetector.detectFaces(frames[i]);
      if (faces.length > 0) {
        const crop = faceDetector.getCropForFrame(640, 360, faces[0]);
        facePositions.push({ time: startTime + i, crop });
      }
    }

    if (facePositions.length === 0) {
      console.log('   ⚠️ Nenhum rosto detectado — usando crop central padrão');
      return this.cutClip(videoPath, startTime, endTime, outputPath, '1080x1920');
    }

    // Usa posição do primeiro rosto detectado
    const firstCrop = facePositions[0].crop;
    console.log(`   👤 Rosto detectado em: x=${firstCrop.x} y=${firstCrop.y} w=${firstCrop.width} h=${firstCrop.height}`);

    return this.cutClipWithCrop(videoPath, startTime, endTime, outputPath, firstCrop);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // generateThumbnail
  // ═══════════════════════════════════════════════════════════════════════════
  async generateThumbnail(
    videoPath: string,
    timeInSeconds: number,
    outputPath: string
  ): Promise<string> {
    console.log(`🖼️ generateThumbnail | t=${timeInSeconds}s → ${path.basename(outputPath)}`);

    const dir = path.dirname(outputPath);
    ensureDir(dir);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          '-ss', timeInSeconds.toString(),
          '-vframes', '1',
          '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2',
          '-strict', 'unofficial',
        ])
        .output(outputPath)
        .on('start', (cmd) => console.log('   🖼️ FFmpeg thumbnail:', cmd))
        .on('progress', (p) => {
          if (p.percent != null) console.log(`   ⏳ Thumbnail: ${p.percent.toFixed(1)}%`);
        })
        .on('end', () => {
          // Aguarda flush do sistema de arquivos
          setTimeout(() => {
            if (fs.existsSync(outputPath)) {
              const { size } = fs.statSync(outputPath);
              console.log(`   ✅ Thumbnail gerada! Tamanho: ${size} bytes | ${outputPath}`);
              resolve(outputPath);
            } else {
              const msg = `Thumbnail não encontrada após geração: ${outputPath}`;
              console.error(`   ❌ ${msg}`);
              reject(new Error(msg));
            }
          }, 500);
        })
        .on('error', (err) => {
          console.error('   ❌ Erro FFmpeg thumbnail:', err);
          reject(err);
        })
        .run();
    });
  }
}
