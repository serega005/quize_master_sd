
import { Question, Answer } from '../types';

declare const mammoth: any;

function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Простая функция хеширования для стабильных ID
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export async function parseDocxFile(file: File): Promise<Question[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value;
    
    const rawLines = text.split('\n').map(l => l.trimEnd());
    const questions: Question[] = [];
    let currentQuestionText = "";
    let currentAnswers: { text: string; isCorrect: boolean }[] = [];
    let lastCorrectText: string | null = null;
    
    const regexQuestion = /^\s*(?:<question>|(\d+[\.\)]+))\s*(.*)/i;
    const regexAnswer = /^\s*(?:<variant>|([a-eа-д][\.\)]+))\s*(.*)/i;

    const finalizeQuestion = () => {
      if (currentQuestionText && currentAnswers.length > 0) {
        const answers: Answer[] = currentAnswers.map(a => ({
          text: a.text,
          isCorrect: a.text === lastCorrectText
        }));
        
        const shuffled = shuffle(answers);
        // ID теперь зависит от текста вопроса, чтобы сохраняться при повторной загрузке
        const qId = `q-${simpleHash(currentQuestionText.trim())}`;
        
        questions.push({
          id: qId,
          text: currentQuestionText.trim(),
          answers: answers,
          shuffledAnswers: shuffled,
          correctIndex: shuffled.findIndex(a => a.isCorrect)
        });
      }
    };

    for (const line of rawLines) {
      if (!line.trim()) continue;
      const matchQ = line.match(regexQuestion);
      const matchA = line.match(regexAnswer);

      if (matchQ) {
        finalizeQuestion();
        currentQuestionText = matchQ[2] || ""; 
        currentAnswers = [];
        lastCorrectText = null;
      } else if (matchA) {
        const answerText = (matchA[2] || "").trim();
        if (answerText) {
          if (currentAnswers.length === 0) lastCorrectText = answerText;
          currentAnswers.push({ text: answerText, isCorrect: false });
        }
      } else {
        if (currentAnswers.length > 0) {
          const lastIdx = currentAnswers.length - 1;
          const updatedText = (currentAnswers[lastIdx].text + " " + line.trim()).trim();
          if (lastIdx === 0) lastCorrectText = updatedText;
          currentAnswers[lastIdx].text = updatedText;
        } else if (currentQuestionText !== null) {
          currentQuestionText = (currentQuestionText + " " + line.trim()).trim();
        }
      }
    }

    finalizeQuestion();
    return questions;
  } catch (error) {
    console.error("Error parsing docx:", error);
    throw new Error("Не удалось прочитать файл. Проверьте формат .docx");
  }
}
