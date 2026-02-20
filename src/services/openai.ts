import OpenAI from 'openai';

export class OpenAIService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true // Necessário para Electron
    });
  }

  /**
   * Transcreve áudio usando Whisper
   */
  async transcribeAudio(audioFile: File): Promise<string> {
    try {
      const response = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'pt',
        response_format: 'text'
      });
      
      return response as string;
    } catch (error) {
      console.error('Erro na transcrição:', error);
      throw error;
    }
  }

  /**
   * Analisa sentimento e encontra melhores momentos
   */
  async analyzeTranscript(text: string): Promise<any> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Você é um analisador de vídeos. Analise a transcrição e retorne UM JSON com:
              - sentiment: positivo/negativo/neutro
              - highlights: array dos 3 melhores trechos (máx 100 caracteres cada)
              - keywords: palavras-chave principais
              - duration: duração sugerida para clipes (15, 30 ou 60 segundos)`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      console.error('Erro na análise:', error);
      throw error;
    }
  }

  /**
   * Testa se a chave é válida
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.openai.models.list();
      return true;
    } catch {
      return false;
    }
  }
}