// @ts-nocheck - Ignora verificação de tipos neste arquivo
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

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
   * Corta um clipe do vídeo
   */
  async cutClip(
    videoPath: string,
    startTime: number,
    endTime: number,
    outputPath: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size('1080x1920')
        .autopad()
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
    return new Promise((resolve, reject) => {
      const filename = outputPath.split('\\').pop() || 'thumbnail.jpg';
      const folder = outputPath.substring(0, outputPath.lastIndexOf('\\'));
      
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [timeInSeconds],
          filename,
          folder,
          size: '320x180'
        })
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err));
    });
  }
}