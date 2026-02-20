const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// 🎬 COLOQUE AQUI O CAMINHO DE UM VÍDEO QUE VOCÊ TEM
const videoPath = 'C:/Users/Rafael/Downloads/SEU-VIDEO.mp4'; // MUDE ISSO!

console.log('📽️ Testando vídeo:', videoPath);

// Testar se o FFmpeg consegue ler o vídeo
ffmpeg.ffprobe(videoPath, (err, metadata) => {
  if (err) {
    console.error('❌ Erro ao ler vídeo:');
    console.error(err);
    return;
  }
  
  console.log('✅ Vídeo lido com sucesso!');
  console.log('📊 Duração:', metadata.format.duration, 'segundos');
  console.log('🎬 Formato:', metadata.format.format_name);
  console.log('📏 Resolução:', metadata.streams[0].width, 'x', metadata.streams[0].height);
});