
export interface Answer {
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  text: string;
  answers: Answer[];
  shuffledAnswers: Answer[];
  correctIndex: number;
}

export type QuizMode = 'test' | 'preparation' | 'speedrun' | 'favorites';

export interface QuizState {
  allQuestions: Question[];
  currentSessionIndices: number[];
  solvedIndices: Set<number>;
  currentIndex: number;
  score: number;
  selectedAnswerIndex: number | null;
  isAnswerChecked: boolean;
  status: 'idle' | 'loading' | 'mode_selection' | 'quiz' | 'result';
  mode: QuizMode | null;
  fileName: string;
}
