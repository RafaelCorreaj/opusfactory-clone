const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

console.log('✅ FFmpeg configurado!');
console.log('📁 FFmpeg path:', ffmpegStatic);
console.log('📁 FFprobe path:', ffprobeStatic.path);