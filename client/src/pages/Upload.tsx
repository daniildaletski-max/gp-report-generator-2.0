import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Upload as UploadIcon, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  User,
  Calendar,
  Gamepad2,
  Star,
  Sparkles,
  Link2,
  Clipboard,
  Zap,
  RotateCcw,
  Trash2,
  ImageIcon,
  Clock,
  TrendingUp,
  ChevronRight,
  FileCheck,
  Keyboard,
  Heart,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  CloudUpload
} from "lucide-react";

// ============ TYPES ============

interface ExtractedData {
  presenterName: string;
  evaluatorName?: string;
  date?: string;
  game?: string;
  totalScore?: number;
  hair?: { score: number; maxScore: number; comment?: string };
  makeup?: { score: number; maxScore: number; comment?: string };
  outfit?: { score: number; maxScore: number; comment?: string };
  posture?: { score: number; maxScore: number; comment?: string };
  dealingStyle?: { score: number; maxScore: number; comment?: string };
  gamePerformance?: { score: number; maxScore: number; comment?: string };
}

interface AttitudeEntry {
  date: string;
  type: "POSITIVE" | "NEGATIVE";
  comment: string;
  score: number;
}

interface AttitudeData {
  gpName: string | null;
  entries: AttitudeEntry[];
  totalEntries: number;
  totalNegative: number;
  totalPositive: number;
}

interface ErrorData {
  presenterName: string;
  date?: string;
  errorType: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
}

interface MatchInfo {
  matchedName: string;
  similarity: number;
  isExactMatch: boolean;
  isNewGP: boolean;
}

interface FileWithPreview {
  id: string;
  file: File;
  preview: string;
  status: "pending" | "uploading" | "success" | "error";
  extractedData?: ExtractedData;
  attitudeData?: AttitudeData;
  errorData?: ErrorData;
  matchInfo?: MatchInfo;
  error?: string;
  progress?: number;
  processingTime?: number;
}

type UploadType = "evaluations" | "attitude";

// ============ UTILITIES ============

async function compressImage(file: File, maxWidth: number = 1920, quality: number = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      let { width, height } = img;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// ============ MAIN COMPONENT ============

export default function UploadPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<UploadType>("evaluations");
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<FileWithPreview | null>(null);
  const [autoProcess, setAutoProcess] = useState(true);
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);
  const [selectedGpId, setSelectedGpId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const startTimeRef = useRef<number>(0);

  const { data: gpList } = trpc.gamePresenter.list.useQuery();

  const uploadEvaluationMutation = trpc.evaluation.uploadAndExtract.useMutation();
  const uploadAttitudeMutation = trpc.attitudeScreenshot.upload.useMutation();

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const stats = useMemo(() => {
    const successFiles = files.filter(f => f.status === "success");
    const avgTime = successFiles.length > 0 
      ? successFiles.reduce((sum, f) => sum + (f.processingTime || 0), 0) / successFiles.length 
      : 0;
    
    if (activeTab === "evaluations") {
      const avgScore = successFiles.length > 0
        ? successFiles.reduce((sum, f) => sum + (f.extractedData?.totalScore || 0), 0) / successFiles.length
        : 0;
      return {
        total: files.length,
        success: successFiles.length,
        pending: files.filter(f => f.status === "pending").length,
        uploading: files.filter(f => f.status === "uploading").length,
        error: files.filter(f => f.status === "error").length,
        avgTime: avgTime / 1000,
        avgScore,
        newGPs: successFiles.filter(f => f.matchInfo?.isNewGP).length,
      };
    } else {
      const positive = successFiles.reduce((sum, f) => sum + (f.attitudeData?.totalPositive || 0), 0);
      const negative = successFiles.reduce((sum, f) => sum + (f.attitudeData?.totalNegative || 0), 0);
      const totalEntries = successFiles.reduce((sum, f) => sum + (f.attitudeData?.totalEntries || 0), 0);
      return {
        total: files.length,
        success: successFiles.length,
        pending: files.filter(f => f.status === "pending").length,
        uploading: files.filter(f => f.status === "uploading").length,
        error: files.filter(f => f.status === "error").length,
        avgTime: avgTime / 1000,
        positive,
        negative,
        totalEntries,
      };
    }
  }, [files, activeTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedFile(null);
      } else if (e.key === 'Delete' && selectedFile) {
        removeFile(selectedFile.id);
      } else if (e.key === 'o' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        fileInputRef.current?.click();
      } else if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        setShowKeyboardHints(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            const newFile = new File([file], `screenshot-${Date.now()}.png`, { type: file.type });
            imageFiles.push(newFile);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        toast.success(`📋 Pasted ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} from clipboard`, {
          duration: 2000,
        });
        addFiles(imageFiles);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [autoProcess]);

  useEffect(() => {
    if (autoProcess && !processingRef.current) {
      const pendingFiles = files.filter(f => f.status === "pending");
      if (pendingFiles.length > 0) {
        processFiles();
      }
    }
  }, [files, autoProcess]);

  useEffect(() => {
    setFiles([]);
    setSelectedFile(null);
  }, [activeTab]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.type.startsWith("image/")
    );
    if (droppedFiles.length > 0) {
      toast.success(`📁 Dropped ${droppedFiles.length} file${droppedFiles.length > 1 ? 's' : ''}`, {
        duration: 2000,
      });
      addFiles(droppedFiles);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(
        (file) => file.type.startsWith("image/")
      );
      if (selectedFiles.length > 0) {
        toast.success(`📁 Selected ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`, {
          duration: 2000,
        });
        addFiles(selectedFiles);
      }
      e.target.value = "";
    }
  }, []);

  const addFiles = (newFiles: File[]) => {
    const filesWithPreview: FileWithPreview[] = newFiles.map((file) => ({
      id: generateId(),
      file,
      preview: URL.createObjectURL(file),
      status: "pending" as const,
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...filesWithPreview]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const file = prev.find(f => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== id);
    });
    if (selectedFile?.id === id) {
      setSelectedFile(null);
    }
  };

  const retryFile = (id: string) => {
    setFiles((prev) => prev.map(f => 
      f.id === id ? { ...f, status: "pending" as const, error: undefined, progress: 0 } : f
    ));
  };

  const processFiles = async () => {
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0 || processingRef.current) return;

    processingRef.current = true;
    setIsProcessing(true);
    setOverallProgress(0);
    startTimeRef.current = Date.now();

    let processed = 0;
    const total = pendingFiles.length;

    const batchSize = 3;
    for (let i = 0; i < pendingFiles.length; i += batchSize) {
      const batch = pendingFiles.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (pendingFile) => {
        const fileId = pendingFile.id;
        const fileStartTime = Date.now();
        
        setFiles((prev) => prev.map(f => 
          f.id === fileId ? { ...f, status: "uploading" as const, progress: 10 } : f
        ));

        try {
          setFiles((prev) => prev.map(f => 
            f.id === fileId ? { ...f, progress: 20 } : f
          ));
          
          const base64 = await compressImage(pendingFile.file, 1920, 0.85);
          
          setFiles((prev) => prev.map(f => 
            f.id === fileId ? { ...f, progress: 40 } : f
          ));
          
          let result: any;
          
          if (activeTab === "evaluations") {
            result = await uploadEvaluationMutation.mutateAsync({
              imageBase64: base64,
              filename: pendingFile.file.name,
              mimeType: 'image/jpeg',
            });
            
            setFiles((prev) => prev.map(f => 
              f.id === fileId ? { ...f, progress: 80 } : f
            ));

            const processingTime = Date.now() - fileStartTime;
            
            setFiles((prev) => prev.map(f => 
              f.id === fileId 
                ? { 
                    ...f, 
                    status: "success" as const, 
                    extractedData: result.extractedData,
                    matchInfo: result.matchInfo,
                    progress: 100,
                    processingTime,
                  } 
                : f
            ));
          } else if (activeTab === "attitude") {
            if (!selectedGpId) {
              throw new Error("Please select a Game Presenter before uploading");
            }
            result = await uploadAttitudeMutation.mutateAsync({
              imageBase64: base64,
              filename: pendingFile.file.name,
              mimeType: 'image/jpeg',
              gpId: selectedGpId,
            });
            
            setFiles((prev) => prev.map(f => 
              f.id === fileId ? { ...f, progress: 80 } : f
            ));

            const processingTime = Date.now() - fileStartTime;
            
            setFiles((prev) => prev.map(f => 
              f.id === fileId 
                ? { 
                    ...f, 
                    status: "success" as const, 
                    attitudeData: result.extractedData,
                    matchInfo: result.matchInfo,
                    progress: 100,
                    processingTime,
                  } 
                : f
            ));
          }
          
          processed++;
          setOverallProgress((processed / total) * 100);
          
        } catch (err: any) {
          console.error("Upload error:", err);
          setFiles((prev) => prev.map(f => 
            f.id === fileId 
              ? { 
                  ...f, 
                  status: "error" as const, 
                  error: err.message || "Failed to process",
                  progress: 0,
                } 
              : f
          ));
          processed++;
          setOverallProgress((processed / total) * 100);
        }
      }));
    }

    processingRef.current = false;
    setIsProcessing(false);
    
    const successCount = files.filter(f => f.status === "success").length + 
                        pendingFiles.filter(f => files.find(ff => ff.id === f.id)?.status === "success").length;
    
    if (successCount > 0) {
      toast.success(`✨ Processed ${successCount} ${activeTab} screenshot${successCount > 1 ? 's' : ''}!`, {
        duration: 3000,
      });
    }
  };

  const clearAll = () => {
    files.forEach(f => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setSelectedFile(null);
  };

  const clearCompleted = () => {
    setFiles(prev => {
      prev.filter(f => f.status === "success").forEach(f => URL.revokeObjectURL(f.preview));
      return prev.filter(f => f.status !== "success");
    });
    if (selectedFile?.status === "success") {
      setSelectedFile(null);
    }
  };

  const retryFailed = () => {
    setFiles(prev => prev.map(f => 
      f.status === "error" ? { ...f, status: "pending" as const, error: undefined, progress: 0 } : f
    ));
  };

  const getTabDescription = () => {
    switch (activeTab) {
      case "evaluations": return "Upload evaluation screenshots for AI extraction";
      case "attitude": return "Upload attitude entry screenshots (POSITIVE/NEGATIVE)";
      default: return "Upload screenshots for AI extraction";
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen bg-[#0a0906]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div className="page-header mb-0">
          <h1 className="page-title">Upload Screenshots</h1>
          <p className="page-subtitle">{getTabDescription()}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
            <Switch
              id="auto-process"
              checked={autoProcess}
              onCheckedChange={setAutoProcess}
            />
            <Label htmlFor="auto-process" className="text-sm cursor-pointer">
              Auto-process
            </Label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowKeyboardHints(prev => !prev)}
            className="bg-white/5 border border-white/10 rounded-xl text-white/70 hover:text-white hover:bg-white/10"
          >
            <Keyboard className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Shortcuts</span>
          </Button>
        </div>
      </div>

      {/* Keyboard Hints */}
      {showKeyboardHints && (
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
          <div className="flex flex-wrap gap-4 text-sm">
            {[
              { key: "Ctrl+V", desc: "Paste from clipboard" },
              { key: "Ctrl+O", desc: "Open file picker" },
              { key: "Esc", desc: "Deselect" },
              { key: "Del", desc: "Remove selected" },
              { key: "?", desc: "Toggle hints" },
            ].map(({ key, desc }) => (
              <div key={key} className="flex items-center gap-2">
                <kbd className="px-2 py-1 glass-strong rounded-lg text-xs font-mono">{key}</kbd>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UploadType)}>
        <TabsList className="bg-white/5 border border-white/10 rounded-xl p-1 w-full sm:w-auto">
          <TabsTrigger value="evaluations" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white/20 data-[state=active]:shadow-lg">
            <FileCheck className="h-4 w-4" />
            <span>Evaluations</span>
          </TabsTrigger>
          <TabsTrigger value="attitude" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white/20 data-[state=active]:shadow-lg">
            <Heart className="h-4 w-4" />
            <span>Attitude</span>
          </TabsTrigger>
        </TabsList>

        {/* Stats Cards */}
        {stats.success > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 animate-stagger">
            <div className="stat-card-enhanced green">
              <div className="flex items-center gap-3">
                <div className="icon-box icon-box-green">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold counter-value">{stats.success}</p>
                  <p className="text-xs text-white/40">Processed</p>
                </div>
              </div>
            </div>
            <div className="stat-card-enhanced violet">
              <div className="flex items-center gap-3">
                <div className="icon-box icon-box-violet">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold counter-value">{stats.avgTime.toFixed(1)}s</p>
                  <p className="text-xs text-white/40">Avg. Time</p>
                </div>
              </div>
            </div>
            {activeTab === "evaluations" && "avgScore" in stats && (
              <>
                <div className="stat-card-enhanced violet">
                  <div className="flex items-center gap-3">
                    <div className="icon-box icon-box-violet">
                      <Star className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold counter-value">{(stats as any).avgScore.toFixed(1)}</p>
                      <p className="text-xs text-white/40">Avg. Score</p>
                    </div>
                  </div>
                </div>
                <div className="stat-card-enhanced violet">
                  <div className="flex items-center gap-3">
                    <div className="icon-box icon-box-violet">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold counter-value">{(stats as any).newGPs}</p>
                      <p className="text-xs text-white/40">New GPs</p>
                    </div>
                  </div>
                </div>
              </>
            )}
            {activeTab === "attitude" && "positive" in stats && (
              <>
                <div className="stat-card-enhanced green">
                  <div className="flex items-center gap-3">
                    <div className="icon-box icon-box-green">
                      <ThumbsUp className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-400 counter-value">+{(stats as any).positive}</p>
                      <p className="text-xs text-white/40">Positive</p>
                    </div>
                  </div>
                </div>
                <div className="stat-card-enhanced red">
                  <div className="flex items-center gap-3">
                    <div className="icon-box icon-box-red">
                      <ThumbsDown className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-400 counter-value">-{(stats as any).negative}</p>
                      <p className="text-xs text-white/40">Negative</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Upload Area */}
          <div className="lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="unified-card overflow-hidden">
              <div className="unified-card-header">
                <div className="icon-box icon-box-violet">
                  <CloudUpload className="h-5 w-5" />
                </div>
                <div className="section-header">
                  <h3 className="section-title">Upload Area</h3>
                  <p className="section-subtitle">Drag & drop or paste screenshots</p>
                </div>
              </div>
              <div className="p-5">
                {/* GP Selector for Attitude Tab */}
                {activeTab === "attitude" && (
                  <div className="mb-5 p-4 glass-subtle rounded-xl">
                    <Label className="text-sm font-medium mb-2 block">Select Game Presenter</Label>
                    <select
                      className="w-full glass-input rounded-xl px-4 py-3 border-0 focus:ring-2 focus:ring-primary/50"
                      value={selectedGpId || ""}
                      onChange={(e) => setSelectedGpId(e.target.value ? Number(e.target.value) : null)}
                      style={{ color: 'rgba(255, 255, 255, 0.9)', backgroundColor: '#0e0d0a' }}
                    >
                      <option value="" style={{ backgroundColor: '#1a1a14', color: '#f0e6c8' }}>Choose a GP...</option>
                      {gpList?.map((gp) => (
                        <option key={gp.id} value={gp.id} style={{ backgroundColor: '#1a1a14', color: '#f0e6c8' }}>
                          {gp.name}
                        </option>
                      ))}
                    </select>
                    {!selectedGpId && (
                      <p className="text-xs text-[#d4af37] mt-2 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Please select a GP before uploading attitude screenshots
                      </p>
                    )}
                  </div>
                )}

                {/* Drop Zone */}
                <div
                  className={`upload-zone-enhanced ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept="image/*"
                    onChange={handleFileSelect}
                  />
                  <div className="flex flex-col items-center gap-4 relative z-10">
                    <div className="upload-icon-box">
                      <UploadIcon className={`h-10 w-10 transition-colors ${isDragging ? "text-[#d4af37]" : "text-[#d4af37]/70"}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-xl text-white/90">
                        {isDragging ? "Drop files here!" : "Drop screenshots or click to upload"}
                      </p>
                      <p className="text-sm text-white/40 mt-2">
                        PNG, JPG, WEBP • Multiple files • Paste with Ctrl+V
                      </p>
                    </div>
                  </div>
                </div>

                {/* Files List */}
                {files.length > 0 && (
                  <div className="mt-6 space-y-4">
                    {/* Stats Bar */}
                    <div className="flex items-center justify-between flex-wrap gap-3 p-3 glass-subtle rounded-xl">
                      <div className="flex gap-4 text-sm">
                        <span className="font-medium">
                          {files.length} file{files.length !== 1 ? "s" : ""}
                        </span>
                        {stats.uploading > 0 && (
                          <span className="text-blue-500 flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {stats.uploading} processing
                          </span>
                        )}
                        {stats.success > 0 && (
                          <span className="text-green-500 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            {stats.success} done
                          </span>
                        )}
                        {stats.error > 0 && (
                          <span className="text-red-500 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {stats.error} failed
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {stats.error > 0 && (
                          <Button variant="outline" size="sm" onClick={retryFailed} className="glass-button rounded-lg border-0">
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Retry Failed
                          </Button>
                        )}
                        {stats.success > 0 && (
                          <Button variant="outline" size="sm" onClick={clearCompleted} className="glass-button rounded-lg border-0">
                            Clear Done
                          </Button>
                        )}
                        {!autoProcess && stats.pending > 0 && (
                          <Button
                            onClick={processFiles}
                            disabled={isProcessing}
                            size="sm"
                            className="rounded-lg bg-gradient-to-r from-[#d4af37] to-[#b8860b]"
                          >
                            {isProcessing ? (
                              <>
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <Sparkles className="mr-1 h-3 w-3" />
                                Process {stats.pending}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Overall Progress */}
                    {isProcessing && (
                      <div className="space-y-2 p-3 glass-subtle rounded-xl">
                        <Progress value={overallProgress} className="h-2 rounded-full" />
                        <p className="text-xs text-muted-foreground text-center">
                          Processing... {Math.round(overallProgress)}%
                        </p>
                      </div>
                    )}

                    {/* File Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className={`relative group glass-card rounded-xl overflow-hidden cursor-pointer transition-all ${
                            selectedFile?.id === file.id ? "ring-2 ring-primary shadow-glow" : "hover:shadow-lg hover:scale-[1.02]"
                          }`}
                          onClick={() => file.status === "success" && setSelectedFile(file)}
                        >
                          <div className="aspect-[3/4] relative">
                            <img
                              src={file.preview}
                              alt={file.file.name}
                              className="w-full h-full object-cover"
                            />
                            {/* Status Overlay */}
                            <div
                              className={`absolute inset-0 flex items-center justify-center transition-all ${
                                file.status === "uploading"
                                  ? "bg-black/60 backdrop-blur-sm"
                                  : file.status === "success"
                                  ? "bg-green-500/20"
                                  : file.status === "error"
                                  ? "bg-red-500/30 backdrop-blur-sm"
                                  : "bg-black/20"
                              }`}
                            >
                              {file.status === "uploading" && (
                                <div className="text-center">
                                  <Loader2 className="h-10 w-10 text-white animate-spin mx-auto" />
                                  <p className="text-white text-sm mt-2 font-medium">{file.progress}%</p>
                                </div>
                              )}
                              {file.status === "success" && (
                                <div className="p-3 rounded-full bg-green-500/30 backdrop-blur-sm">
                                  <CheckCircle className="h-10 w-10 text-green-400" />
                                </div>
                              )}
                              {file.status === "error" && (
                                <div className="text-center p-3">
                                  <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
                                  <Button
                                    size="sm"
                                    className="mt-3 glass-button rounded-lg"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      retryFile(file.id);
                                    }}
                                  >
                                    <RotateCcw className="h-3 w-3 mr-1" />
                                    Retry
                                  </Button>
                                </div>
                              )}
                              {file.status === "pending" && (
                                <div className="p-3 glass-strong rounded-full">
                                  <UploadIcon className="h-8 w-8 text-white/80" />
                                </div>
                              )}
                            </div>
                            {/* Progress Bar for uploading */}
                            {file.status === "uploading" && (
                              <div className="absolute bottom-0 left-0 right-0">
                                <Progress value={file.progress} className="h-1.5 rounded-none" />
                              </div>
                            )}
                          </div>
                          {/* File Info */}
                          <div className="p-3 space-y-2">
                            <p className="text-sm truncate font-medium">
                              {file.extractedData?.presenterName || file.attitudeData?.gpName || file.errorData?.presenterName || file.file.name}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              {activeTab === "attitude" && file.attitudeData && (
                                <Badge className={`text-xs rounded-lg ${file.attitudeData.totalNegative > file.attitudeData.totalPositive ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
                                  {file.attitudeData.totalEntries} entries
                                </Badge>
                              )}
                              {file.matchInfo?.isNewGP && (
                                <Badge className="text-xs rounded-lg bg-[#d4af37]/20 text-[#d4af37]">
                                  New GP
                                </Badge>
                              )}
                              {file.processingTime && file.status === "success" && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {(file.processingTime / 1000).toFixed(1)}s
                                </span>
                              )}
                            </div>
                            {file.error && (
                              <p className="text-xs text-red-400 truncate">{file.error}</p>
                            )}
                          </div>
                          {/* Remove Button */}
                          {(file.status === "pending" || file.status === "error") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(file.id);
                              }}
                              className="absolute top-2 right-2 p-2 rounded-full glass-strong text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Details Panel */}
          <div className="lg:col-span-1 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <div className="unified-card sticky top-4 overflow-hidden">
              <div className="unified-card-header">
                <div className="icon-box icon-box-violet">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="section-header">
                  <h3 className="section-title">Extracted Data</h3>
                  <p className="section-subtitle">
                    {selectedFile ? `${selectedFile.extractedData?.presenterName || selectedFile.attitudeData?.gpName || 'Unknown'}` : "Select a file"}
                  </p>
                </div>
              </div>
              <div className="p-5">
                {selectedFile?.status === "success" ? (
                  <div className="space-y-5">
                    {/* Evaluation Details */}
                    {activeTab === "evaluations" && selectedFile.extractedData && (
                      <>
                        {/* GP Name & Match Info */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>Game Presenter</span>
                          </div>
                          <div className="pl-6">
                            <p className="font-semibold text-lg">{selectedFile.extractedData.presenterName}</p>
                            {selectedFile.matchInfo && !selectedFile.matchInfo.isExactMatch && !selectedFile.matchInfo.isNewGP && (
                              <div className="mt-2 p-3 glass-subtle rounded-xl">
                                <div className="flex items-center gap-2 text-sm">
                                  <Link2 className="h-4 w-4 text-primary" />
                                  <span>
                                    Matched to: <strong>{selectedFile.matchInfo.matchedName}</strong>
                                  </span>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                  <Progress value={selectedFile.matchInfo.similarity} className="h-2 flex-1 rounded-full" />
                                  <span className="text-xs font-medium">{selectedFile.matchInfo.similarity}%</span>
                                </div>
                              </div>
                            )}
                            {selectedFile.matchInfo?.isNewGP && (
                              <Badge className="mt-2 bg-green-500/20 text-green-400 rounded-lg">
                                New GP Created
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Date & Game */}
                        <div className="grid grid-cols-2 gap-4">
                          {selectedFile.extractedData.date && (
                            <div className="glass-subtle p-3 rounded-xl">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                <Calendar className="h-3 w-3" />
                                <span>Date</span>
                              </div>
                              <p className="text-sm font-medium">{selectedFile.extractedData.date}</p>
                            </div>
                          )}
                          {selectedFile.extractedData.game && (
                            <div className="glass-subtle p-3 rounded-xl">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                <Gamepad2 className="h-3 w-3" />
                                <span>Game</span>
                              </div>
                              <p className="text-sm font-medium">{selectedFile.extractedData.game}</p>
                            </div>
                          )}
                        </div>

                        {/* Total Score */}
                        {selectedFile.extractedData.totalScore !== undefined && (
                          <div className="p-4 rounded-xl bg-gradient-to-br from-[#d4af37]/20 to-[#b8860b]/20">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Total Score</span>
                              <div className="flex items-center gap-2">
                                <Star className="h-6 w-6 text-[#d4af37] fill-[#d4af37]" />
                                <span className="text-3xl font-bold">{selectedFile.extractedData.totalScore}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Scores Breakdown */}
                        <div className="space-y-3">
                          <p className="text-sm font-medium text-muted-foreground">Scores Breakdown</p>
                          <div className="space-y-3">
                            {[
                              { key: "hair", label: "Hair" },
                              { key: "makeup", label: "Makeup" },
                              { key: "outfit", label: "Outfit" },
                              { key: "posture", label: "Posture" },
                              { key: "dealingStyle", label: "Dealing Style" },
                              { key: "gamePerformance", label: "Game Performance" },
                            ].map(({ key, label }) => {
                              const data = selectedFile.extractedData?.[key as keyof ExtractedData] as { score: number; maxScore: number; comment?: string } | undefined;
                              if (!data) return null;
                              const percentage = (data.score / data.maxScore) * 100;
                              return (
                                <div key={key} className="glass-subtle p-3 rounded-xl space-y-2">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium">{label}</span>
                                    <span className={`font-bold ${percentage >= 80 ? "text-green-400" : percentage >= 60 ? "text-[#d4af37]" : "text-red-400"}`}>
                                      {data.score}/{data.maxScore}
                                    </span>
                                  </div>
                                  <Progress 
                                    value={percentage} 
                                    className={`h-2 rounded-full ${percentage >= 80 ? "[&>div]:bg-green-500" : percentage >= 60 ? "[&>div]:bg-[#d4af37]" : "[&>div]:bg-red-500"}`}
                                  />
                                  {data.comment && (
                                    <p className="text-xs text-muted-foreground italic">
                                      {data.comment}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Attitude Details */}
                    {activeTab === "attitude" && selectedFile.attitudeData && (
                      <>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>Game Presenter</span>
                          </div>
                          <p className="pl-6 font-semibold text-lg">{selectedFile.attitudeData.gpName || 'Unknown'}</p>
                        </div>

                        {/* Summary Stats */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="glass-subtle p-3 rounded-xl text-center">
                            <p className="text-2xl font-bold">{selectedFile.attitudeData.totalEntries}</p>
                            <p className="text-xs text-muted-foreground">Total</p>
                          </div>
                          <div className="p-3 rounded-xl text-center bg-green-500/20">
                            <p className="text-2xl font-bold text-green-400">+{selectedFile.attitudeData.totalPositive}</p>
                            <p className="text-xs text-muted-foreground">Positive</p>
                          </div>
                          <div className="p-3 rounded-xl text-center bg-red-500/20">
                            <p className="text-2xl font-bold text-red-400">-{selectedFile.attitudeData.totalNegative}</p>
                            <p className="text-xs text-muted-foreground">Negative</p>
                          </div>
                        </div>

                        {/* Entries List */}
                        <div className="space-y-3">
                          <p className="text-sm font-medium text-muted-foreground">Entries ({selectedFile.attitudeData.entries?.length || 0})</p>
                          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                            {selectedFile.attitudeData.entries?.map((entry, idx) => (
                              <div key={idx} className={`p-3 rounded-xl ${entry.type === 'POSITIVE' ? 'bg-green-500/10 border-l-2 border-green-500' : 'bg-red-500/10 border-l-2 border-red-500'}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <Badge className={`text-xs rounded-lg ${entry.type === "POSITIVE" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                                    {entry.type === "POSITIVE" ? (
                                      <><ThumbsUp className="h-3 w-3 mr-1" /> POSITIVE</>
                                    ) : (
                                      <><ThumbsDown className="h-3 w-3 mr-1" /> NEGATIVE</>
                                    )}
                                  </Badge>
                                  <span className={`font-bold ${entry.score > 0 ? "text-green-400" : "text-red-400"}`}>
                                    {entry.score > 0 ? "+" : ""}{entry.score}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mb-1">{entry.date}</p>
                                <p className="text-sm">{entry.comment}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Processing Time */}
                    {selectedFile.processingTime && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground glass-subtle p-3 rounded-xl">
                        <Clock className="h-4 w-4" />
                        <span>Processed in {(selectedFile.processingTime / 1000).toFixed(1)}s</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state py-12">
                    <div className="empty-state-icon">
                      <Sparkles className="h-8 w-8 text-[#d4af37]/50" />
                    </div>
                    <p className="empty-state-title">No data yet</p>
                    <p className="empty-state-description">
                      Upload and process screenshots to see extracted data
                    </p>
                    <p className="text-xs mt-4 text-white/30">
                      Tip: Press Ctrl+V to paste from clipboard
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
