// @ts-nocheck - Ignora verificação de tipos neste arquivo
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

// Função para obter o diretório base de saída (pasta Videos do usuário)
function getBaseOutputDir(): string {
  const videosDir = app.getPath('videos'); // Retorna C:\Users\Rafael\Videos
  const baseDir = path.join(videosDir, 'OpusFactory');
  return baseDir;
}

// Função para garantir que uma pasta exista
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Pasta criada: ${dir}`);
  }
}

// Configurar caminhos
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

export class FFmpegService {
  /**
   * Extrai áudio de um vídeo
   */
  async extractAudio(videoPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .toFormat('mp3')
        .audioBitrate(128)
        .audioChannels(1)
        .audioFrequency(16000)
        .on('progress', (progress) => {
          console.log(`Extraindo áudio: ${progress.percent}%`);
        })
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  }

  /**
   * Obtém metadados do vídeo
   */
  async getMetadata(videoPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) reject(err);
        resolve(metadata);
      });
    });
  }

  /**
   * Obtém a duração do vídeo em segundos
   */
  async getDuration(videoPath: string): Promise<number> {
    try {
      const metadata = await this.getMetadata(videoPath);
      return metadata?.format?.duration || 0;
    } catch (error) {
      console.error('Erro ao obter duração:', error);
      return 0;
    }
  }

  /**
   * Corta um clipe do vídeo com resolução personalizada
   */
  async cutClip(
    videoPath: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    resolution?: string // 👈 NOVO PARÂMETRO OPCIONAL
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(videoPath)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac');

      // Aplicar resolução se fornecida
      if (resolution) {
        command = command.size(resolution);
      } else {
        // Fallback para formato vertical (padrão)
        command = command.size('1080x1920').autopad(true, 'black');
      }

      command
        .on('progress', (progress) => {
          console.log(`Cortando: ${progress.percent}%`);
        })
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Gera thumbnail do vídeo
   */

  async generateThumbnail(
    videoPath: string,
    timeInSeconds: number,
    outputPath: string
  ): Promise<string> {
    console.log('🎬 generateThumbnail - input:', { videoPath, timeInSeconds, outputPath });
    
    const dir = path.dirname(outputPath);
    console.log('📁 Diretório destino:', dir);
    
    if (!fs.existsSync(dir)) {
      console.log('📁 Criando diretório:', dir);
      fs.mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          '-ss', timeInSeconds.toString(),
          '-vframes', '1',
          '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2',
          '-strict', 'unofficial'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('🖼️ Comando FFmpeg:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`🖼️ Progresso: ${progress.percent}%`);
        })
        .on('end', () => {
          // Verifica se o arquivo foi criado
          setTimeout(() => {
            if (fs.existsSync(outputPath)) {
              const stats = fs.statSync(outputPath);
              console.log(`✅ Thumbnail gerada! Tamanho: ${stats.size} bytes`);
              resolve(outputPath);
            } else {
              console.error(`❌ Arquivo não encontrado: ${outputPath}`);
              reject(new Error('Arquivo não foi criado'));
            }
          }, 500);
        })
        .on('error', (err) => {
          console.error('❌ Erro no FFmpeg:', err);
          reject(err);
        })
        .run();
    });
  }
} 