
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { parseDocxFile } from './services/docxParser';
import { Question, QuizState, QuizMode } from './types';
import { Button } from './components/Button';
import { GoogleGenAI } from "@google/genai";
import { 
  CheckCircle2, 
  XCircle, 
  FileText, 
  ChevronRight, 
  Trophy, 
  RefreshCcw, 
  LogOut, 
  Download, 
  BrainCircuit, 
  ClipboardList, 
  Lightbulb, 
  Zap, 
  Moon, 
  Sun, 
  Flame, 
  Sparkles, 
  Loader2, 
  User, 
  Trash2, 
  Star, 
  History, 
  Clock, 
  Monitor
} from 'lucide-react';

const SESSION_SIZE = 25;

interface SavedFile {
  id: string;
  name: string;
  questions: Question[];
  timestamp: number;
}

interface TestHistory {
  fileName: string;
  date: number;
  score: number;
  total: number;
  mode: string;
}

interface ExtendedQuizState extends QuizState {
  currentStreak: number;
  bookmarkedIds: Set<string>;
}

// Функция для правильного склонения слова "очко"
const getScorePlural = (n: number) => {
  const lastDigit = n % 10;
  const lastTwoDigits = n % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'очков';
  if (lastDigit === 1) return 'очко';
  if (lastDigit >= 2 && lastDigit <= 4) return 'очка';
  return 'очков';
};

const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  const [state, setState] = useState<ExtendedQuizState>({
    allQuestions: [],
    currentSessionIndices: [],
    solvedIndices: new Set(),
    currentIndex: 0,
    score: 0,
    selectedAnswerIndex: null,
    isAnswerChecked: false,
    status: 'idle',
    mode: null,
    fileName: '',
    currentStreak: 0,
    bookmarkedIds: new Set()
  });

  const [library, setLibrary] = useState<SavedFile[]>([]);
  const [history, setHistory] = useState<TestHistory[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const savedLib = localStorage.getItem('quiz_library');
    if (savedLib) setLibrary(JSON.parse(savedLib));

    const savedHistory = localStorage.getItem('quiz_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    const savedBookmarks = localStorage.getItem('quiz_bookmarks');
    if (savedBookmarks) {
      try {
        setState(s => ({ ...s, bookmarkedIds: new Set(JSON.parse(savedBookmarks)) }));
      } catch (e) {
        console.error("Error loading bookmarks", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('quiz_library', JSON.stringify(library));
  }, [library]);

  useEffect(() => {
    localStorage.setItem('quiz_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('quiz_bookmarks', JSON.stringify(Array.from(state.bookmarkedIds)));
  }, [state.bookmarkedIds]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setState(prev => ({ ...prev, status: 'loading', fileName: file.name }));
    try {
      const parsedQuestions = await parseDocxFile(file);
      if (parsedQuestions.length === 0) {
        alert("Вопросы не найдены.");
        setState(prev => ({ ...prev, status: 'idle' }));
        return;
      }

      if (!library.find(f => f.name === file.name)) {
        const newFile: SavedFile = {
          id: Date.now().toString(),
          name: file.name,
          questions: parsedQuestions,
          timestamp: Date.now()
        };
        setLibrary(prev => [newFile, ...prev].slice(0, 10));
      }

      setState(prev => ({
        ...prev,
        allQuestions: parsedQuestions,
        status: 'mode_selection'
      }));
    } catch (err) {
      alert("Ошибка: " + (err as Error).message);
      setState(prev => ({ ...prev, status: 'idle' }));
    }
  };

  const loadFromLibrary = (file: SavedFile) => {
    setShowUserMenu(false);
    setState(prev => ({
      ...prev,
      allQuestions: file.questions,
      fileName: file.name,
      status: 'mode_selection'
    }));
  };

  const deleteFromFileLibrary = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Удалить файл из библиотеки?")) {
      setLibrary(prev => prev.filter(f => f.id !== id));
    }
  };

  const startSession = (mode: QuizMode) => {
    setShowUserMenu(false);
    let indices: number[] = [];
    const allIndices = state.allQuestions.map((_, i) => i);
    
    if (mode === 'test') {
      indices = [...allIndices].sort(() => Math.random() - 0.5).slice(0, Math.min(SESSION_SIZE, state.allQuestions.length));
    } else if (mode === 'speedrun') {
      indices = [...allIndices].sort(() => Math.random() - 0.5);
    } else if (mode === 'favorites') {
      indices = allIndices.filter(i => state.bookmarkedIds.has(state.allQuestions[i].id));
      if (indices.length === 0) {
        alert("У вас еще нет избранных вопросов в этом файле!");
        return;
      }
    } else {
      const unsolved = allIndices.filter(i => !state.solvedIndices.has(i));
      if (unsolved.length === 0) {
        alert("Все вопросы изучены!");
        return;
      }
      indices = unsolved.sort(() => Math.random() - 0.5).slice(0, Math.min(SESSION_SIZE, unsolved.length));
    }

    setState(prev => ({
      ...prev,
      mode,
      currentSessionIndices: indices,
      currentIndex: 0,
      score: 0,
      selectedAnswerIndex: null,
      isAnswerChecked: false,
      status: 'quiz',
      currentStreak: 0
    }));
    setExplanation(null);
  };

  const toggleBookmark = (id: string) => {
    setState(prev => {
      const newBookmarks = new Set(prev.bookmarkedIds);
      if (newBookmarks.has(id)) newBookmarks.delete(id);
      else newBookmarks.add(id);
      return { ...prev, bookmarkedIds: newBookmarks };
    });
  };

  const checkAnswer = useCallback(() => {
    if (state.selectedAnswerIndex === null) return;
    const globalIdx = state.currentSessionIndices[state.currentIndex];
    const currentQuestion = state.allQuestions[globalIdx];
    const isCorrect = state.selectedAnswerIndex === currentQuestion.correctIndex;

    setState(prev => ({
      ...prev,
      isAnswerChecked: true,
      score: isCorrect ? prev.score + 1 : prev.score,
      currentStreak: isCorrect ? prev.currentStreak + 1 : 0
    }));
  }, [state.currentIndex, state.currentSessionIndices, state.allQuestions, state.selectedAnswerIndex]);

  const handleExplain = async () => {
    if (explanation || isExplaining) return;
    setIsExplaining(true);
    try {
      const q = state.allQuestions[state.currentSessionIndices[state.currentIndex]];
      const correctAns = q.answers[q.correctIndex].text;
      
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key missing");

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Вопрос: ${q.text}\nОтвет: ${correctAns}`,
        config: {
          systemInstruction: "Ты — профессиональный лаконичный преподаватель. Твоя задача: объяснить логику ответа. Отвечай максимально кратко, без приветствий. На русском языке.",
        }
      });
      setExplanation(response.text || "Нет данных.");
    } catch (err) {
      setExplanation("Ошибка ИИ. Проверьте соединение.");
    } finally { setIsExplaining(false); }
  };

  const nextQuestion = useCallback(() => {
    if (state.currentIndex + 1 >= state.currentSessionIndices.length) {
      const isCorrect = state.selectedAnswerIndex === state.allQuestions[state.currentSessionIndices[state.currentIndex]].correctIndex;
      const finalScore = state.score + (state.isAnswerChecked && isCorrect ? 1 : 0);
      
      const newHistory: TestHistory = {
        fileName: state.fileName,
        date: Date.now(),
        score: finalScore,
        total: state.currentSessionIndices.length,
        mode: state.mode || 'test'
      };
      setHistory(prev => [newHistory, ...prev].slice(0, 20));
      setState(prev => ({ ...prev, status: 'result' }));
    } else {
      setState(prev => ({
        ...prev,
        currentIndex: prev.currentIndex + 1,
        selectedAnswerIndex: null,
        isAnswerChecked: false,
      }));
      setExplanation(null);
    }
  }, [state.currentIndex, state.currentSessionIndices, state.score, state.fileName, state.mode, state.isAnswerChecked, state.selectedAnswerIndex, state.allQuestions]);

  const goHome = () => {
    setShowUserMenu(false);
    setState(s => ({ ...s, status: 'idle', allQuestions: [], fileName: '' }));
    setExplanation(null);
  };

  const renderContent = () => {
    switch (state.status) {
      case 'idle':
        return (
          <div className="max-w-4xl mx-auto py-12 px-4 animate-in fade-in duration-500 flex flex-col items-center">
            <div className="text-center mb-12">
               <div className="bg-indigo-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl rotate-3">
                 <FileText className="w-10 h-10 text-white" />
               </div>
               <h1 className="text-5xl font-black text-slate-900 dark:text-white mb-4 tracking-tighter">QuizMaster</h1>
               <p className="text-lg text-slate-500 dark:text-slate-400 max-w-md mx-auto">Готовьтесь к экзаменам быстрее с помощью умных тестов.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16 w-full">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                 <input type="file" accept=".docx" onChange={handleFileUpload} className="hidden" id="docx-upload" ref={fileInputRef} />
                 <label htmlFor="docx-upload" className="cursor-pointer group flex flex-col items-center">
                   <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-indigo-50 transition-all">
                     <Download className="w-8 h-8 text-slate-400 group-hover:text-indigo-600" />
                   </div>
                   <span className="text-xl font-bold text-slate-900 dark:text-white mb-2">Новый файл</span>
                   <span className="text-sm text-slate-400">Нажмите для выбора .docx</span>
                 </label>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="font-black text-xs uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Ваша библиотека
                </h3>
                {library.length > 0 ? (
                  <div className="space-y-3 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                    {library.map(file => (
                      <div key={file.id} onClick={() => loadFromLibrary(file)} className="group bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-500 cursor-pointer flex items-center justify-between shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="bg-indigo-50 dark:bg-indigo-900/30 p-2 rounded-lg text-indigo-600">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="truncate">
                            <p className="font-bold text-slate-900 dark:text-white truncate text-sm">{file.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">{file.questions.length} вопросов</p>
                          </div>
                        </div>
                        <button onClick={(e) => deleteFromFileLibrary(e, file.id)} className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-300 border border-slate-100 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/50 italic text-sm py-12">
                    Библиотека пуста
                  </div>
                )}
              </div>
            </div>

            <div className="max-w-md w-full bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-3xl p-8 shadow-sm mb-16">
              <div className="flex items-center gap-3 mb-4 text-amber-700 dark:text-amber-500 font-bold uppercase text-[10px] tracking-widest">
                <Lightbulb className="w-5 h-5" />
                <span>Загрузились не все вопросы?</span>
              </div>
              <p className="text-slate-800 dark:text-amber-200 mb-6 text-sm leading-relaxed">
                Если программа видит меньше вопросов, чем есть в файле, возможно в документе используются «мягкие переносы» вместо абзацев.
              </p>
              <div className="bg-white/60 dark:bg-slate-900/60 p-6 rounded-2xl border border-amber-200/50 dark:border-amber-900/30 space-y-4">
                <p className="text-sm font-bold text-slate-900 dark:text-white">Как исправить в Word:</p>
                <div className="space-y-3">
                  <div className="flex items-start gap-4">
                    <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-500 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                    <p className="text-sm">Нажмите <kbd className="bg-white dark:bg-slate-800 px-1.5 py-0.5 border rounded font-mono shadow-sm">Ctrl + H</kbd></p>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-500 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                    <p className="text-sm">В поле <b>Найти:</b> введите <code className="bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 font-bold rounded text-amber-900 dark:text-amber-400">^l</code> (маленькая L)</p>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-500 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                    <p className="text-sm">В поле <b>Заменить на:</b> введите <code className="bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 font-bold rounded text-amber-900 dark:text-amber-400">^p</code></p>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-500 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                    <p className="text-sm">Нажмите <b>Заменить всё</b> и сохраните файл.</p>
                  </div>
                </div>
              </div>
            </div>

            {history.length > 0 && (
              <div className="w-full">
                 <h3 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                   <History className="w-4 h-4" /> Последние результаты
                 </h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   {history.slice(0, 4).map((h, i) => (
                     <div key={i} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 flex justify-between items-center shadow-sm">
                        <div className="overflow-hidden">
                          <p className="font-bold text-sm truncate dark:text-white">{h.fileName}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{new Date(h.date).toLocaleDateString()} • {h.mode === 'test' ? 'Экзамен' : h.mode === 'favorites' ? 'Избранное' : h.mode === 'preparation' ? 'Тренировка' : 'Марафон'}</p>
                        </div>
                        <div className={`text-xl font-black ${h.score/h.total > 0.8 ? 'text-emerald-500' : 'text-indigo-500'}`}>
                          {h.score} {getScorePlural(h.score)}
                        </div>
                     </div>
                   ))}
                 </div>
              </div>
            )}
          </div>
        );

      case 'mode_selection':
        const favoritesCount = state.allQuestions.filter(q => state.bookmarkedIds.has(q.id)).length;

        return (
          <div className="max-w-5xl mx-auto py-12 px-4 animate-in zoom-in-95 duration-300">
            <h2 className="text-center text-3xl font-black mb-12 dark:text-white">Выберите режим обучения</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
               <button onClick={() => startSession('test')} className="group p-8 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-[35px] text-left hover:border-indigo-500 hover:shadow-xl transition-all h-full flex flex-col">
                  <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <ClipboardList className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Экзамен</h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-xs flex-grow">25 случайных вопросов для быстрой проверки знаний.</p>
               </button>

               <button onClick={() => startSession('preparation')} className="group p-8 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-[35px] text-left hover:border-emerald-500 hover:shadow-xl transition-all h-full flex flex-col">
                  <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <BrainCircuit className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Тренировка</h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-xs flex-grow">Только неизученные вопросы. Идеально для запоминания.</p>
               </button>

               <button onClick={() => startSession('speedrun')} className="group p-8 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-[35px] text-left hover:border-amber-500 hover:shadow-xl transition-all h-full flex flex-col">
                  <div className="w-14 h-14 bg-amber-50 dark:bg-amber-900/40 text-amber-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Zap className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Марафон</h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-xs flex-grow">Все вопросы файла подряд. Проверка на выносливость.</p>
               </button>

               <button 
                 onClick={() => startSession('favorites')} 
                 disabled={favoritesCount === 0}
                 className={`group p-8 border-2 rounded-[35px] text-left transition-all h-full flex flex-col ${favoritesCount === 0 ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 opacity-50 grayscale cursor-not-allowed' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-rose-400 hover:shadow-xl'}`}
               >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform ${favoritesCount === 0 ? 'bg-slate-200 text-slate-400' : 'bg-rose-50 dark:bg-rose-900/40 text-rose-500 group-hover:scale-110'}`}>
                    <Star className={`w-7 h-7 ${favoritesCount > 0 ? 'fill-current' : ''}`} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Избранное</h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-xs flex-grow">Ваши отмеченные вопросы ({favoritesCount}).</p>
               </button>
            </div>
            <div className="mt-12 text-center">
              <Button variant="outline" size="lg" className="rounded-2xl" onClick={goHome}>Выбрать другой файл</Button>
            </div>
          </div>
        );

      case 'quiz':
        const globalIdx = state.currentSessionIndices[state.currentIndex];
        const q = state.allQuestions[globalIdx];
        const isBookmarked = state.bookmarkedIds.has(q.id);

        return (
          <div className="max-w-3xl mx-auto py-8 px-4 animate-in slide-in-from-bottom-8 duration-500">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="bg-indigo-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-xl">
                  {state.currentIndex + 1}
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Вопрос {state.currentIndex + 1} из {state.currentSessionIndices.length}</p>
                  <p className="font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{state.fileName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {state.currentStreak >= 3 && (
                  <div className="flex items-center gap-1 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 px-3 py-1.5 rounded-xl text-sm font-black animate-bounce">
                    <Flame className="w-4 h-4 fill-current" /> {state.currentStreak}
                  </div>
                )}
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-4 py-2 rounded-xl text-sm font-black text-indigo-600 shadow-sm">
                  {state.score} {getScorePlural(state.score)}
                </div>
                <button onClick={() => toggleBookmark(q.id)} className={`p-2 rounded-xl border transition-all ${isBookmarked ? 'bg-rose-50 border-rose-200 text-rose-500' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-300'}`}>
                  <Star className={`w-6 h-6 ${isBookmarked ? 'fill-current' : ''}`} />
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-10 rounded-[40px] shadow-2xl border border-slate-50 dark:border-slate-800 mb-8 min-h-[160px] flex items-center">
               <p className="text-2xl font-bold text-slate-800 dark:text-white leading-tight">{q.text}</p>
            </div>

            <div className="space-y-3 mb-12">
              {q.shuffledAnswers.map((ans, idx) => {
                let btnStyle = "bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-100 transition-all";
                let icon = null;

                if (state.isAnswerChecked) {
                  if (idx === q.correctIndex) {
                    btnStyle = "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-900 dark:text-emerald-400 ring-4 ring-emerald-50 dark:ring-emerald-900/10";
                    icon = <CheckCircle2 className="w-6 h-6 text-emerald-600 ml-auto" />;
                  } else if (state.selectedAnswerIndex === idx) {
                    btnStyle = "bg-rose-50 dark:bg-rose-900/20 border-rose-500 text-rose-900 dark:text-rose-400 ring-4 ring-rose-50 dark:ring-rose-900/10";
                    icon = <XCircle className="w-6 h-6 text-rose-600 ml-auto" />;
                  } else {
                    btnStyle = "opacity-30 grayscale-[0.8]";
                  }
                } else if (state.selectedAnswerIndex === idx) {
                  btnStyle = "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-600 text-indigo-900 dark:text-white ring-4 ring-indigo-100 dark:ring-indigo-900/30";
                }

                return (
                  <button key={idx} disabled={state.isAnswerChecked} onClick={() => setState(s => ({ ...s, selectedAnswerIndex: idx }))} className={`w-full p-6 rounded-3xl flex items-center gap-4 text-left font-bold ${btnStyle}`}>
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black ${state.selectedAnswerIndex === idx ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-lg">{ans.text}</span>
                    {icon}
                  </button>
                );
              })}
            </div>

            {explanation && (
              <div className="mb-12 p-8 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-100 dark:border-indigo-900/30 rounded-[35px] animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest mb-4">
                  <Sparkles className="w-4 h-4" /> Пояснение ИИ
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed italic">{explanation}</p>
              </div>
            )}

            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg p-6 rounded-[35px] shadow-2xl border border-slate-100 dark:border-slate-800 flex justify-between items-center mt-auto">
               <div className="flex items-center gap-2">
                 <Button variant="outline" className="rounded-2xl" onClick={goHome}>
                   <LogOut className="w-4 h-4 mr-2" /> Выход
                 </Button>
                 {state.isAnswerChecked && (
                   <Button variant="secondary" className="rounded-2xl gap-2" onClick={handleExplain} disabled={isExplaining}>
                     {isExplaining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                     {explanation ? "Объяснено" : "Пояснить"}
                   </Button>
                 )}
               </div>
               
               {!state.isAnswerChecked ? (
                 <Button size="lg" className="rounded-2xl px-12 shadow-xl shadow-indigo-100 dark:shadow-none" disabled={state.selectedAnswerIndex === null} onClick={checkAnswer}>
                   Проверить
                 </Button>
               ) : (
                 <Button size="lg" className="rounded-2xl px-12 shadow-xl shadow-indigo-100 dark:shadow-none gap-2" onClick={nextQuestion}>
                   {state.currentIndex + 1 === state.currentSessionIndices.length ? "Результаты" : "Дальше"}
                   <ChevronRight className="w-5 h-5" />
                 </Button>
               )}
            </div>
          </div>
        );

      case 'result':
        return (
          <div className="max-w-2xl mx-auto py-16 px-4 text-center animate-in zoom-in-95 duration-500">
             <div className="w-32 h-32 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mx-auto mb-10 shadow-2xl">
               <Trophy className="w-16 h-16 text-indigo-600" />
             </div>
             <h1 className="text-5xl font-black mb-4 dark:text-white">Отлично!</h1>
             <p className="text-slate-400 font-bold uppercase tracking-widest text-sm mb-12">Сессия завершена</p>

             <div className="grid grid-cols-2 gap-6 mb-16">
               <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-xl">
                 <p className="text-4xl font-black text-indigo-600">{Math.round((state.score / state.currentSessionIndices.length) * 100)}%</p>
                 <p className="text-xs font-bold text-slate-400 uppercase mt-2">Точность</p>
               </div>
               <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-xl">
                 <p className="text-4xl font-black text-slate-900 dark:text-white">{state.score}/{state.currentSessionIndices.length}</p>
                 <p className="text-xs font-bold text-slate-400 uppercase mt-2">{getScorePlural(state.score)}</p>
               </div>
             </div>

             <div className="flex gap-4 justify-center">
                <Button size="lg" className="rounded-2xl px-10 gap-2 shadow-xl shadow-indigo-100 dark:shadow-none" onClick={() => startSession(state.mode!)}>
                  <RefreshCcw className="w-5 h-5" /> Повторить
                </Button>
                <Button variant="secondary" size="lg" className="rounded-2xl px-10" onClick={() => setState(s => ({ ...s, status: 'mode_selection' }))}>
                  К режимам
                </Button>
             </div>
          </div>
        );

      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center py-40">
            <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-8 shadow-xl"></div>
            <p className="text-xl font-black text-slate-600 dark:text-slate-400 animate-pulse uppercase tracking-widest">Анализируем документ...</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-500">
      <nav className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={goHome}>
            <div className="bg-indigo-600 p-2 rounded-xl group-hover:rotate-12 transition-transform shadow-lg">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter dark:text-white">QuizMaster</span>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={toggleTheme} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              {theme === 'light' ? <Moon className="w-5 h-5 text-slate-600" /> : <Sun className="w-5 h-5 text-amber-400" />}
            </button>
            
            <div className="relative" ref={userMenuRef}>
              <button 
                onClick={() => setShowUserMenu(!showUserMenu)} 
                className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
              >
                <User className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                {isLoggedIn && <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>}
              </button>
              
              {showUserMenu && (
                <div className="absolute right-0 mt-3 w-64 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-5 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="mb-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ваш сеанс</p>
                    <p className="text-sm font-bold dark:text-white">{isLoggedIn ? "Браузерный профиль" : "Гость"}</p>
                  </div>
                  {!isLoggedIn ? (
                    <Button fullWidth onClick={() => { setIsLoggedIn(true); setShowUserMenu(false); }} className="rounded-xl text-xs py-2.5 gap-2 shadow-sm">
                      <Monitor className="w-3 h-3" /> Вход через браузер
                    </Button>
                  ) : (
                    <Button variant="outline" fullWidth onClick={() => { setIsLoggedIn(false); setShowUserMenu(false); }} className="rounded-xl text-xs py-2.5">Выйти</Button>
                  )}
                  <p className="mt-3 text-[10px] text-slate-400 text-center leading-tight">Данные сохраняются в памяти браузера.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
      <main className="pb-32">{renderContent()}</main>
    </div>
  );
};

export default App;
