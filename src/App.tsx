import { GoogleGenAI } from '@google/genai';
import { FileText, Download, Scissors, UploadCloud, FileDown, Type, ChevronRight, RefreshCw, Music, Sparkles } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { motion } from "motion/react"

export interface Subtitle {
  id: string;
  startTime: string;
  endTime: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
}

const timeToSeconds = (timeStr: string) => {
  const [hours, minutes, secondsAndMs] = timeStr.split(':');
  const separator = secondsAndMs.includes('.') ? '.' : ',';
  const [seconds, ms] = secondsAndMs.split(separator);
  return (
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseInt(seconds, 10) +
    (parseInt(ms, 10) || 0) / 1000
  );
};

export default function App() {
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [audioName, setAudioName] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);
  const [splitCount, setSplitCount] = useState<number>(50); // Split by 50 lines 
  const [currentTime, setCurrentTime] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const parseSRT = (content: string) => {
    // Normalize newlines
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalizedContent.split(/\n\n+/);
    const parsedSubtitles: Subtitle[] = [];

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length >= 3) {
        const id = lines[0].trim();
        const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/);
        if (timeMatch) {
          const startTime = timeMatch[1].replace('.', ',');
          const endTime = timeMatch[2].replace('.', ',');
          const text = lines.slice(2).join('\n');
          parsedSubtitles.push({ 
            id, 
            startTime, 
            endTime, 
            text,
            startSeconds: timeToSeconds(startTime),
            endSeconds: timeToSeconds(endTime)
          });
        }
      }
    }
    setSubtitles(parsedSubtitles);
  };

  const processFile = (file: File) => {
    if (file.name.toLowerCase().endsWith('.srt')) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (content) parseSRT(content);
      };
      reader.readAsText(file);
    } else if (file.type.startsWith('audio/') || file.name.toLowerCase().endsWith('.mp3')) {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setAudioFile(file);
      setAudioName(file.name);
      setAudioUrl(URL.createObjectURL(file));
    } else {
      alert("Vui lòng tải lên tệp .srt hoặc .mp3 hợp lệ.");
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      Array.from(files).forEach(processFile);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files) {
      Array.from(files).forEach(processFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const generateSRT = (subs: Subtitle[]): string => {
    return subs.map(sub => `${sub.id}\n${sub.startTime} --> ${sub.endTime}\n${sub.text}`).join('\n\n');
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportTextOnly = () => {
    const textContent = subtitles.map(sub => sub.text).join('\n');
    downloadFile(textContent, fileName.replace('.srt', '_text.txt'));
  };

  const splitAndExport = () => {
    if (splitCount <= 0) return;
    const parts = Math.ceil(subtitles.length / splitCount);

    for (let i = 0; i < parts; i++) {
      const chunk = subtitles.slice(i * splitCount, (i + 1) * splitCount);
      // Re-index for the chunk
      const reindexedChunk = chunk.map((sub, idx) => ({ ...sub, id: (idx + 1).toString() }));
      const content = generateSRT(reindexedChunk);
      downloadFile(content, `${fileName.replace('.srt', '')}_part${i + 1}.srt`);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        let encoded = reader.result?.toString().replace(/^data:(.*,)?/, '');
        if ((encoded?.length || 0) % 4 > 0) {
          encoded += '='.repeat(4 - (encoded?.length || 0) % 4);
        }
        resolve(encoded || '');
      };
      reader.onerror = error => reject(error);
    });
  };

  const generateSubtitlesFromAudio = async () => {
    if (!audioFile) return;
    if (audioFile.size > 20 * 1024 * 1024) {
      alert("Tệp âm thanh quá lớn (vượt quá 20MB). Vui lòng chọn tệp dưới 20MB để dùng AI.");
      return;
    }
    setIsGenerating(true);
    try {
      const base64Audio = await fileToBase64(audioFile);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'You are a professional Chinese-to-Vietnamese translator and audio transcription expert. Listen to the entire audio clip and generate a complete SRT subtitle file from it.\n\nCRITICAL INSTRUCTIONS:\n- You must transcribe the Chinese audio explicitly.\n- Each subtitle block MUST contain EXACTLY 3 lines of text in this exact order:\n  1. Simplified Chinese characters (Hanzi)\n  2. Pinyin\n  3. Vietnamese translation\n- Your response must be ONLY the raw SRT text format (e.g., "1\\n00:00:00,000 --> 00:00:05,000\\n..."). Do NOT output any markdown code blocks like ```srt or conversational text.' },
              { inlineData: { mimeType: audioFile.type || 'audio/mp3', data: base64Audio } }
            ]
          }
        ]
      });
      let srtContent = response.text || "";
      srtContent = srtContent.replace(/```srt/g, '').replace(/```/g, '').trim();
      
      // Clean up any conversational prefix from the model
      const firstSrtIndex = srtContent.search(/\d+\s*\n\d{2}:\d{2}:\d{2}[.,]\d{3}/);
      if (firstSrtIndex > 0) {
         srtContent = srtContent.substring(firstSrtIndex);
      }

      if (srtContent) {
         parseSRT(srtContent);
         setFileName(audioFile.name.replace(/\.[^/.]+$/, "") + "_vi_zh.srt");
      }
    } catch (e: any) {
      alert("Lỗi khi tạo phụ đề bằng AI: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const clearFile = () => {
    setSubtitles([]);
    setFileName('');
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl('');
      setAudioName('');
      setAudioFile(null);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Không chặn Space nếu người dùng đang gõ phím trong ô input, textarea hoặc bấm button
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON')) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault(); // Ngăn trình duyệt cuộn trang xuống
        if (audio.paused) {
          audio.play().catch(console.error);
        } else {
          audio.pause();
        }
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [audioUrl]);

  const handleSubtitleClick = (startSeconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startSeconds;
      audioRef.current.play().catch(console.error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col overflow-hidden">
      <header className="h-16 border-b border-slate-800 px-6 sm:px-8 flex items-center justify-between bg-slate-900/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">SRT Reader & Splitter</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Công cụ xử lý phụ đề</p>
          </div>
        </div>
        {(subtitles.length > 0 || audioUrl) && (
          <button 
            onClick={clearFile}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Làm lại</span>
          </button>
        )}
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {subtitles.length === 0 && !audioUrl ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div 
              className={`max-w-xl w-full border-2 border-dashed rounded-2xl p-12 text-center transition-all ${isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-black/20">
                <Music className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2 tracking-tight">Tạo Phụ Đề từ File MP3</h2>
              <p className="text-slate-400 mb-8 max-w-sm mx-auto text-sm">
                Kéo thả file <b>MP3 tiếng Trung</b> vào đây để AI tự động nghe, tách và tạo ra phụ đề (hoặc tải lên file .srt có sẵn).
              </p>
              
              <input 
                type="file" 
                accept=".srt,audio/*" 
                multiple
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-transform focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                CHỌN TỆP TỪ XA
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col lg:flex-row w-full overflow-hidden">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/30 p-6 flex flex-col gap-8 overflow-y-auto shrink-0"
            >
               <div>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    Thông tin tệp
                  </h2>
                  <div className="space-y-4">
                    {fileName && (
                      <>
                        <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 flex justify-between items-center">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Tên SRT</p>
                          <p className="text-sm font-medium text-slate-200 truncate max-w-[150px]" title={fileName}>{fileName}</p>
                        </div>
                        <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 flex justify-between items-center">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Tổng số dòng</p>
                          <p className="text-sm font-medium text-slate-200">{subtitles.length}</p>
                        </div>
                      </>
                    )}
                    {audioName && (
                      <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 flex justify-between items-center">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Âm thanh</p>
                        <p className="text-sm font-medium text-slate-200 truncate max-w-[150px]" title={audioName}>{audioName}</p>
                      </div>
                    )}

                    {(!fileName || !audioName) && (
                      <div className="pt-2 border-t border-slate-800 border-dashed">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-xs text-indigo-400 font-medium transition-colors border border-slate-700/50 hover:border-indigo-500/30"
                        >
                          + Tải thêm tệp {(!fileName ? '.srt' : '.mp3')}
                        </button>
                        <input 
                          type="file" 
                          accept={(!fileName ? '.srt' : 'audio/*')} 
                          className="hidden" 
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                        />
                      </div>
                    )}
                  </div>
               </div>

               {subtitles.length > 0 && (
                 <div className="flex-1 flex flex-col">
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Download className="w-4 h-4 text-indigo-400" />
                      Công cụ xuất
                    </h2>
                    <div className="space-y-8 flex-1 flex flex-col">
                      <button 
                        onClick={exportTextOnly}
                        className="w-full flex items-center justify-between p-3 bg-slate-800/40 border border-slate-800 rounded-xl hover:border-indigo-500/40 hover:bg-slate-800/60 transition-all text-left group"
                      >
                        <span className="flex items-center gap-2 text-xs font-medium text-slate-300 group-hover:text-white transition-colors">
                          <Type className="w-4 h-4" />
                          Trích xuất thành vãn bản
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" />
                      </button>

                      <div className="space-y-4 pt-6 border-t border-slate-800 flex-1 flex flex-col">
                        <h4 className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-2">
                          <Scissors className="w-3.5 h-3.5" />
                          Tách thành nhiều file SRT
                        </h4>
                        <div className="space-y-3 flex flex-col flex-1">
                          <div className="flex items-center gap-4 bg-slate-800/50 p-2.5 rounded-xl border border-slate-800">
                            <input 
                              type="number" 
                              min="10" 
                              value={splitCount}
                              onChange={e => setSplitCount(Number(e.target.value))}
                              className="flex-1 bg-transparent text-center text-xl font-bold text-white outline-none w-full appearance-none"
                            />
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider shrink-0 pr-2">dòng / file</span>
                          </div>
                          <div className="mt-auto pt-6">
                            <button 
                              onClick={splitAndExport}
                              className="w-full py-4 bg-indigo-600 rounded-2xl font-bold text-white shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                            >
                              <FileDown className="w-5 h-5" />
                              TÁCH ({Math.ceil(subtitles.length / splitCount)} TỆP)
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                 </div>
               )}
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-900 bg-slate-950 shrink-0">
                <div className="flex gap-2 items-center">
                  <span className="px-3 py-1 bg-slate-800 rounded text-xs text-slate-300 font-medium tracking-wide">Trình Xem Phụ Đề</span>
                  {audioUrl && (
                    <audio 
                      ref={audioRef}
                      src={audioUrl} 
                      controls 
                      className="h-8 max-w-[200px] ml-2"
                    />
                  )}
                </div>
                <div className="flex gap-4 text-[11px] text-slate-500 font-medium tracking-wide">
                  <span>Tổng: <span className="text-indigo-400 font-mono">{subtitles.length}</span> blocks</span>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 scroll-smooth">
                {subtitles.length > 0 ? (
                  <div className="max-w-4xl mx-auto space-y-4 pb-12">
                    {subtitles.map((sub) => {
                      const isActive = audioUrl && currentTime >= sub.startSeconds && currentTime <= sub.endSeconds;
                      
                      return (
                        <div 
                          key={sub.id} 
                          onClick={() => handleSubtitleClick(sub.startSeconds)}
                          className={`group p-4 rounded-xl border transition-all cursor-pointer ${
                            isActive 
                              ? 'bg-indigo-600/20 border-indigo-500/50 ring-1 ring-indigo-500/30' 
                              : 'bg-slate-900/50 border-slate-800/50 hover:border-indigo-500/40 hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className={`text-xs font-mono px-2 py-0.5 rounded-md border ${
                              isActive ? 'text-indigo-300 bg-indigo-500/20 border-indigo-500/30' : 'text-slate-500 bg-slate-900 border-slate-800'
                            }`}>
                              {sub.id}
                            </span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border tracking-wider ${
                              isActive ? 'text-indigo-200 bg-indigo-500/30 border-indigo-400/30 font-bold' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
                            }`}>
                              {sub.startTime} {'-->'} {sub.endTime}
                            </span>
                          </div>
                          <p className={`leading-relaxed text-sm whitespace-pre-wrap mt-3 transition-colors ${
                              isActive ? 'text-white font-medium' : 'text-slate-300'
                          }`}>
                            {sub.text}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-6">
                     <Music className="w-16 h-16 text-indigo-500/50" />
                     <div className="text-center">
                       <h3 className="text-lg font-medium text-slate-300 mb-2">Đã có âm thanh - Chưa có phụ đề</h3>
                       <p className="text-sm max-w-sm">Tải lên tệp SRT kết hợp hoặc để AI tự động dịch và tạo phụ đề 3 thứ tiếng (Trung - Pinyin - Việt).</p>
                     </div>
                     <button 
                       onClick={generateSubtitlesFromAudio}
                       disabled={isGenerating || !audioFile}
                       className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                       {isGenerating ? (
                         <><RefreshCw className="w-5 h-5 animate-spin" /> Đang tạo (có thể mất 1-2 phút)...</>
                       ) : (
                         <><Sparkles className="w-5 h-5" /> Tự động tạo phụ đề bằng AI</>
                       )}
                     </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
