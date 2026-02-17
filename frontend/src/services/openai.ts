import OpenAI from 'openai';

export const createOpenAIClient = (apiKey: string) => {
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true // Necessário para Electron
  });
};

export const transcribeAudio = async (openai: OpenAI, audioFile: File) => {
  try {
    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'pt'
    });
    return response.text;
  } catch (error) {
    console.error('Erro na transcrição:', error);
    throw error;
  }
};