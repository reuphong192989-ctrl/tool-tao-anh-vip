import { ImageUploader } from './src/components/ImageUploader';
import { ApiKeyModal } from './src/components/ApiKeyModal';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { ImageFile, Character, BulkResult } from './types';
import { generateImage } from './services/geminiService';
import { ImageUploader } from './components/ImageUploader';
import { ApiKeyModal } from './components/ApiKeyModal';

const initialCharacters: Character[] = [
  { id: 1, name: "Nhân vật 1", image: null, isSelected: false },
  { id: 2, name: "Nhân vật 2", image: null, isSelected: false },
  { id: 3, name: "Nhân vật 3", image: null, isSelected: false },
  { id: 4, name: "Nhân vật 4", image: null, isSelected: false },
];

const LoadingSpinner = () => (
    <div className="w-8 h-8 border-2 border-dashed rounded-full animate-spin border-indigo-400"></div>
);

const App: React.FC = () => {
  // API Key State
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // State
  const [characters, setCharacters] = useState<Character[]>(initialCharacters);
  const [background, setBackground] = useState<ImageFile | null>(null);
  const [useBackgroundImage, setUseBackgroundImage] = useState(true);
  const [keepBackground, setKeepBackground] = useState(true);
  const [prompt, setPrompt] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  
  // Single Mode State
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  
  // Bulk Mode State
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkData, setBulkData] = useState<BulkResult[]>([]);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [isZipping, setIsZipping] = useState(false);

  // Common State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize API Key
  useEffect(() => {
      const storedKey = localStorage.getItem('GEMINI_API_KEY');
      
      // FIX: Do not use process.env.API_KEY automatically.
      // This forces the modal to appear if no key is in localStorage.
      if (storedKey) {
          setApiKey(storedKey);
      } else {
          setShowApiKeyModal(true);
      }
  }, []);

  const handleSaveApiKey = (key: string) => {
      localStorage.setItem('GEMINI_API_KEY', key);
      setApiKey(key);
      setShowApiKeyModal(false);
  };

  const clearApiKey = () => {
      localStorage.removeItem('GEMINI_API_KEY');
      setApiKey('');
      setShowApiKeyModal(true);
  };

  // Handlers
  const handleImageUpload = useCallback((file: File, updater: React.Dispatch<React.SetStateAction<any>>, isCharacter: boolean, id?: number) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const newImageFile: ImageFile = {
        file,
        previewUrl: reader.result as string,
      };
      if (isCharacter && id) {
        updater((prev: Character[]) =>
          prev.map((char) =>
            char.id === id ? { ...char, image: newImageFile, isSelected: true } : char
          )
        );
      } else {
        updater(newImageFile);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCharacterSelect = (id: number) => {
    setCharacters((prev) =>
      prev.map((char) =>
        char.id === id ? { ...char, isSelected: !char.isSelected } : char
      )
    );
  };

  const handleCharacterNameChange = (id: number, newName: string) => {
    setCharacters((prev) =>
      prev.map((char) =>
        char.id === id ? { ...char, name: newName } : char
      )
    );
  };
  
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          
          const parsedResults: BulkResult[] = [];
          
          for (let i = 1; i < data.length; i++) {
              const row = data[i];
              if (row && row.length >= 2 && row[1]) {
                  parsedResults.push({
                      id: i,
                      prompt: row[1].toString(),
                      images: [],
                      status: 'pending'
                  });
              }
          }
          
          if (parsedResults.length === 0) {
              setError("Không tìm thấy dữ liệu hợp lệ. Cần cột STT và Prompt.");
          } else {
              setBulkData(parsedResults);
              setError(null);
          }
      };
      reader.readAsBinaryString(file);
  };

  const validateInputs = () => {
    if (!apiKey) {
        setShowApiKeyModal(true);
        return false;
    }
    if (useBackgroundImage && !background) {
        setError('Vui lòng tải lên ảnh bối cảnh.');
        return false;
    }
    if (!characters.some(c => c.isSelected && c.image)) {
        setError('Vui lòng chọn ít nhất một nhân vật đã được tải ảnh lên.');
        return false;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!validateInputs()) return;

    if (isBulkMode) {
        if (bulkData.length === 0) {
            setError("Vui lòng tải lên file Excel chứa danh sách câu lệnh.");
            return;
        }
        await generateBulk();
    } else {
        if (!prompt.trim()) {
            setError('Vui lòng nhập câu lệnh mô tả.');
            return;
        }
        await generateSingle();
    }
  };

  const generateSingle = async () => {
    setIsLoading(true);
    setError(null);
    setGeneratedImages([]);

    try {
        const generationPromises = Array(4).fill(null).map(() => 
            generateImage(apiKey, prompt, useBackgroundImage ? background : null, characters, keepBackground, aspectRatio)
        );
        const results = await Promise.all(generationPromises);
        const validResults = results.filter((res): res is string => res !== null);
        setGeneratedImages(validResults);
        if (validResults.length < 4) {
             setError('Một vài ảnh không thể tạo được. Vui lòng thử lại.');
        }

    } catch (err: any) {
        setError(err.message || 'An unknown error occurred.');
    } finally {
        setIsLoading(false);
    }
  };

  const generateBulk = async () => {
    setIsLoading(true);
    setError(null);
    
    for (let i = 0; i < bulkData.length; i++) {
        const item = bulkData[i];
        
        if (item.status === 'completed') continue;

        setBulkData(prev => prev.map(p => p.id === item.id ? { ...p, status: 'loading' } : p));
        
        try {
            const img = await generateImage(apiKey, item.prompt, useBackgroundImage ? background : null, characters, keepBackground, aspectRatio);
            
            setBulkData(prev => prev.map(p => 
                p.id === item.id 
                ? { ...p, status: img ? 'completed' : 'failed', images: img ? [img] : [] } 
                : p
            ));
        } catch (e) {
             console.error(e);
             setBulkData(prev => prev.map(p => p.id === item.id ? { ...p, status: 'failed' } : p));
        }
    }
    setIsLoading(false);
  };

  const handleRegenerateItem = async (id: number) => {
      if (!validateInputs()) return;
      const item = bulkData.find(p => p.id === id);
      if (!item) return;

      setBulkData(prev => prev.map(p => p.id === id ? { ...p, status: 'loading' } : p));
      
      try {
          const img = await generateImage(apiKey, item.prompt, useBackgroundImage ? background : null, characters, keepBackground, aspectRatio);
          setBulkData(prev => prev.map(p => 
              p.id === id 
              ? { ...p, status: img ? 'completed' : 'failed', images: img ? [img] : [] } 
              : p
          ));
      } catch (e) {
           setBulkData(prev => prev.map(p => p.id === id ? { ...p, status: 'failed' } : p));
      }
  };

  const handleBulkPromptChange = (id: number, newPrompt: string) => {
      setBulkData(prev => prev.map(p => p.id === id ? { ...p, prompt: newPrompt, status: 'pending' } : p));
  };

  const handleDownloadAll = async () => {
      const completedItems = bulkData.filter(item => item.status === 'completed' && item.images.length > 0);
      if (completedItems.length === 0) return;

      setIsZipping(true);
      const zip = new JSZip();
      const folder = zip.folder("generated_images");

      completedItems.forEach((item) => {
          const imgData = item.images[0].split(',')[1];
          // Filename: ID_PromptSnippet.png
          const safePrompt = item.prompt.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
          folder?.file(`${item.id}_${safePrompt}.png`, imgData, {base64: true});
      });

      const content = await zip.generateAsync({type: "blob"});
      const url = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = "all_images.zip";
      a.click();
      window.URL.revokeObjectURL(url);
      setIsZipping(false);
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen text-white font-sans">
      <ApiKeyModal isOpen={showApiKeyModal} onSave={handleSaveApiKey} />
      
      {/* Control Panel */}
      <aside className="w-full lg:w-1/3 xl:w-1/4 bg-gray-800 p-6 space-y-6 overflow-y-auto max-h-screen custom-scrollbar">
        <header className="flex justify-between items-start">
          <div>
             <h1 className="text-3xl font-bold text-indigo-400">Tạo ảnh nhất quán</h1>
             <p className="text-gray-400 mt-1 text-sm">Cung cấp bởi Thành IT & Gemini AI</p>
          </div>
          <button 
            onClick={clearApiKey} 
            className="text-xs text-gray-500 hover:text-indigo-400 underline mt-1"
            title="Đổi API Key"
          >
              Đổi Key
          </button>
        </header>

        {/* Characters Section */}
        <section>
          <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">1. Nhân vật</h2>
              <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">Đổi tên để khớp prompt</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {characters.map((char) => (
              <div key={char.id} className="space-y-2">
                <ImageUploader
                  id={`char-upload-${char.id}`}
                  label={`Upload NV ${char.id}`}
                  imagePreviewUrl={char.image?.previewUrl}
                  onImageUpload={(file) => handleImageUpload(file, setCharacters, true, char.id)}
                  isCharacter={true}
                  characterName={char.name}
                  onNameChange={(newName) => handleCharacterNameChange(char.id, newName)}
                />
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    id={`char-select-${char.id}`}
                    checked={char.isSelected}
                    onChange={() => handleCharacterSelect(char.id)}
                    disabled={!char.image}
                    className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500"
                  />
                  <label htmlFor={`char-select-${char.id}`} className="ml-2 text-sm text-gray-300">Sử dụng</label>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Background & Settings Section */}
        <section>
          <h2 className="text-xl font-semibold mb-4">2. Bối cảnh & Cài đặt</h2>
          
          {/* Aspect Ratio Selector */}
          <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-2">Tỷ lệ khung hình</label>
              <div className="flex bg-gray-700 rounded-lg p-1">
                  {['1:1', '16:9', '9:16'].map((ratio) => (
                      <button
                          key={ratio}
                          onClick={() => setAspectRatio(ratio)}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                              aspectRatio === ratio 
                              ? 'bg-indigo-600 text-white shadow-sm' 
                              : 'text-gray-400 hover:text-white'
                          }`}
                      >
                          {ratio}
                      </button>
                  ))}
              </div>
          </div>

          <div className="flex items-center mb-3">
            <input
              type="checkbox"
              id="use-bg"
              checked={useBackgroundImage}
              onChange={(e) => setUseBackgroundImage(e.target.checked)}
              className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500"
            />
            <label htmlFor="use-bg" className="ml-2 text-sm text-gray-300">Sử dụng ảnh bối cảnh</label>
          </div>
          
          {useBackgroundImage && (
            <>
              <ImageUploader
                id="bg-upload"
                label="Tải lên bối cảnh"
                imagePreviewUrl={background?.previewUrl}
                onImageUpload={(file) => handleImageUpload(file, setBackground, false)}
              />
              <div className="flex items-center mt-3">
                <input
                  type="checkbox"
                  id="keep-bg"
                  checked={keepBackground}
                  onChange={(e) => setKeepBackground(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500"
                />
                <label htmlFor="keep-bg" className="ml-2 text-sm text-gray-300">Giữ nguyên bối cảnh này</label>
              </div>
            </>
          )}
        </section>

        {/* Prompt Section */}
        <section>
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-xl font-semibold">3. Câu lệnh</h2>
               <div className="flex bg-gray-700 rounded-lg p-1 text-xs">
                   <button 
                    onClick={() => setIsBulkMode(false)}
                    className={`px-3 py-1 rounded-md transition ${!isBulkMode ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}
                   >
                       Đơn
                   </button>
                   <button 
                    onClick={() => setIsBulkMode(true)}
                    className={`px-3 py-1 rounded-md transition ${isBulkMode ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}
                   >
                       Excel
                   </button>
               </div>
            </div>
          
          {!isBulkMode ? (
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Mô tả hành động, ví dụ: Batman đang uống cà phê cùng Superman..."
                className="w-full h-32 p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-sm"
              />
          ) : (
              <div className="bg-gray-700 p-4 rounded-lg border border-gray-600 border-dashed text-center">
                  <p className="text-sm text-gray-300 mb-2">Tải file Excel (Cột A: STT, Cột B: Prompt)</p>
                  <input 
                    type="file" 
                    accept=".xlsx, .xls"
                    ref={excelInputRef}
                    onChange={handleExcelUpload}
                    className="block w-full text-sm text-gray-400
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-indigo-600 file:text-white
                      hover:file:bg-indigo-700
                    "
                  />
                  <div className="mt-2 text-xs text-gray-500 text-left">
                     {bulkData.length > 0 ? `Đã tải ${bulkData.length} câu lệnh.` : "Chưa có dữ liệu."}
                  </div>
              </div>
          )}
        </section>
        
        {error && <div className="text-red-400 bg-red-900/50 p-3 rounded-lg text-sm">{error}</div>}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-900 disabled:cursor-not-allowed disabled:text-gray-400 flex items-center justify-center transition-all duration-300"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {isBulkMode ? `Đang suy nghĩ & vẽ (${bulkData.filter(b => b.status === 'completed').length}/${bulkData.length})` : 'Đang suy nghĩ & vẽ...'}
            </>
          ) : (
            isBulkMode ? 'Bắt đầu tạo hàng loạt' : 'Tạo ảnh'
          )}
        </button>
      </aside>

      {/* Results Panel */}
      <main className="w-full lg:w-2/3 xl:w-3/4 bg-gray-900 p-6 flex flex-col h-screen overflow-y-auto">
        {!isBulkMode ? (
            // Single Mode Results
            <div className="flex-1 flex flex-col items-center justify-center">
                 {isLoading && generatedImages.length === 0 ? (
                    <div className="text-center">
                        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-indigo-400 mx-auto"></div>
                        <p className="mt-4 text-gray-300">AI đang suy nghĩ và sáng tạo...</p>
                    </div>
                ) : generatedImages.length > 0 ? (
                <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-6">
                    {generatedImages.map((src, index) => (
                    <div key={index} className="bg-gray-800 rounded-lg overflow-hidden shadow-lg group relative border border-gray-700">
                        <img src={src} alt={`Generated result ${index + 1}`} className="w-full h-auto object-contain bg-gray-950" />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex justify-end space-x-2">
                        <a href={src} download={`consistent_image_${index + 1}.png`} className="bg-indigo-600 text-white px-3 py-1 text-sm rounded-md hover:bg-indigo-700 transition-colors">Tải xuống</a>
                        </div>
                    </div>
                    ))}
                </div>
                ) : (
                <div className="text-center text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <h3 className="mt-4 text-xl font-semibold">Khu vực kết quả</h3>
                    <p>Kết quả tạo đơn sẽ xuất hiện tại đây.</p>
                </div>
                )}
            </div>
        ) : (
            // Bulk Mode Results
            <div className="w-full max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-6 sticky top-0 bg-gray-900 py-4 z-10 border-b border-gray-800">
                    <h3 className="text-2xl font-bold text-gray-300">
                        Danh sách tạo hàng loạt
                    </h3>
                    {bulkData.some(i => i.status === 'completed') && (
                        <button
                            onClick={handleDownloadAll}
                            disabled={isZipping}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-semibold transition flex items-center"
                        >
                            {isZipping ? 'Đang nén...' : 'Tải xuống tất cả (.zip)'}
                            {!isZipping && (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            )}
                        </button>
                    )}
                </div>
                
                {bulkData.length === 0 ? (
                     <div className="text-center text-gray-500 mt-20">
                        <p>Vui lòng tải lên file Excel để xem danh sách.</p>
                     </div>
                ) : (
                    <div className="space-y-6 pb-10">
                        {bulkData.map((item) => (
                            <div key={item.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex flex-col md:flex-row gap-4">
                                <div className="flex-1 min-w-0 flex flex-col">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs font-mono">#{item.id}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase
                                                ${item.status === 'pending' ? 'bg-yellow-900 text-yellow-200' : ''}
                                                ${item.status === 'loading' ? 'bg-blue-900 text-blue-200' : ''}
                                                ${item.status === 'completed' ? 'bg-green-900 text-green-200' : ''}
                                                ${item.status === 'failed' ? 'bg-red-900 text-red-200' : ''}
                                            `}>
                                                {item.status}
                                            </span>
                                        </div>
                                        <button 
                                            onClick={() => handleRegenerateItem(item.id)}
                                            disabled={item.status === 'loading'}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center border border-indigo-900 bg-indigo-900/20 px-2 py-1 rounded transition"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            Tạo lại
                                        </button>
                                    </div>
                                    
                                    {/* Editable Textarea for Prompt */}
                                    <textarea 
                                        value={item.prompt}
                                        onChange={(e) => handleBulkPromptChange(item.id, e.target.value)}
                                        className="w-full bg-gray-900 text-gray-300 text-sm p-2 rounded border border-gray-700 focus:border-indigo-500 focus:outline-none resize-none flex-1"
                                        rows={3}
                                    />
                                    
                                    {item.status === 'loading' && (
                                        <div className="mt-4 flex items-center text-indigo-400 text-sm">
                                            <LoadingSpinner />
                                            <span className="ml-2">Đang suy nghĩ & xử lý...</span>
                                        </div>
                                    )}
                                    {item.status === 'failed' && (
                                        <p className="text-red-400 text-xs mt-1">Gặp lỗi. Vui lòng sửa prompt và thử lại.</p>
                                    )}
                                </div>
                                <div className="w-full md:w-64 flex-shrink-0 bg-gray-900 rounded-lg min-h-[160px] flex items-center justify-center border border-gray-700 overflow-hidden">
                                    {item.images && item.images.length > 0 ? (
                                        <div className="relative group w-full h-full">
                                            <img src={item.images[0]} alt={`Result ${item.id}`} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                 <a href={item.images[0]} download={`bulk_${item.id}.png`} className="bg-indigo-600 text-white px-3 py-1 text-sm rounded hover:bg-indigo-700">Tải xuống</a>
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-gray-600 text-xs">
                                            {item.status === 'failed' ? 'Lỗi' : 'Chờ xử lý'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
