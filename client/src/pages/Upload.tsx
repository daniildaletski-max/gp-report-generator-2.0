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
  MessageSquare
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
  score: number; // +1 or -1
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

type UploadType = "evaluations" | "attitude" | "errors";

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

  // Fetch list of GPs for dropdown
  const { data: gpList } = trpc.gamePresenter.list.useQuery();

  const uploadEvaluationMutation = trpc.evaluation.uploadAndExtract.useMutation();
  const uploadAttitudeMutation = trpc.attitudeScreenshot.upload.useMutation();
  const uploadErrorMutation = trpc.errorScreenshot.upload.useMutation();

  const generateId = () => Math.random().toString(36).substring(2, 9);

  // Statistics based on active tab
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
    } else if (activeTab === "attitude") {
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
    } else {
      const critical = successFiles.filter(f => f.errorData?.severity === "critical").length;
      const high = successFiles.filter(f => f.errorData?.severity === "high").length;
      return {
        total: files.length,
        success: successFiles.length,
        pending: files.filter(f => f.status === "pending").length,
        uploading: files.filter(f => f.status === "uploading").length,
        error: files.filter(f => f.status === "error").length,
        avgTime: avgTime / 1000,
        critical,
        high,
      };
    }
  }, [files, activeTab]);

  // Keyboard shortcuts
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

  // Handle paste from clipboard
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

  // Auto-process when files are added
  useEffect(() => {
    if (autoProcess && !processingRef.current) {
      const pendingFiles = files.filter(f => f.status === "pending");
      if (pendingFiles.length > 0) {
        processFiles();
      }
    }
  }, [files, autoProcess]);

  // Clear files when switching tabs
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
          } else if (activeTab === "errors") {
            if (!selectedGpId) {
              throw new Error("Please select a Game Presenter before uploading");
            }
            result = await uploadErrorMutation.mutateAsync({
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
                    errorData: result.extractedData,
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

  const getTabIcon = () => {
    switch (activeTab) {
      case "evaluations": return <FileCheck className="h-4 w-4" />;
      case "attitude": return <Heart className="h-4 w-4" />;
      case "errors": return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getTabDescription = () => {
    switch (activeTab) {
      case "evaluations": return "Upload evaluation screenshots for AI extraction";
      case "attitude": return "Upload attitude entry screenshots (POSITIVE/NEGATIVE)";
      case "errors": return "Upload error screenshots for tracking";
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Upload Screenshots</h1>
          <p className="text-muted-foreground">{getTabDescription()}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
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
            className="text-muted-foreground"
          >
            <Keyboard className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Shortcuts</span>
          </Button>
        </div>
      </div>

      {/* Keyboard Hints */}
      {showKeyboardHints && (
        <Card className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-white dark:bg-slate-800 rounded border text-xs">Ctrl+V</kbd>
                <span className="text-muted-foreground">Paste from clipboard</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-white dark:bg-slate-800 rounded border text-xs">Ctrl+O</kbd>
                <span className="text-muted-foreground">Open file picker</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-white dark:bg-slate-800 rounded border text-xs">Esc</kbd>
                <span className="text-muted-foreground">Deselect</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-white dark:bg-slate-800 rounded border text-xs">Del</kbd>
                <span className="text-muted-foreground">Remove selected</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-white dark:bg-slate-800 rounded border text-xs">?</kbd>
                <span className="text-muted-foreground">Toggle hints</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UploadType)}>
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="evaluations" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Evaluations</span>
          </TabsTrigger>
          <TabsTrigger value="attitude" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            <span className="hidden sm:inline">Attitude</span>
          </TabsTrigger>
          <TabsTrigger value="errors" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Errors</span>
          </TabsTrigger>
        </TabsList>

        {/* Stats Cards */}
        {stats.success > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
              <CardContent className="py-3 flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.success}</p>
                  <p className="text-xs text-green-600 dark:text-green-500">Processed</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <CardContent className="py-3 flex items-center gap-3">
                <Clock className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.avgTime.toFixed(1)}s</p>
                  <p className="text-xs text-blue-600 dark:text-blue-500">Avg. Time</p>
                </div>
              </CardContent>
            </Card>
            {activeTab === "evaluations" && "avgScore" in stats && (
              <>
                <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                  <CardContent className="py-3 flex items-center gap-3">
                    <Star className="h-8 w-8 text-amber-600" />
                    <div>
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{(stats as any).avgScore.toFixed(1)}</p>
                      <p className="text-xs text-amber-600 dark:text-amber-500">Avg. Score</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
                  <CardContent className="py-3 flex items-center gap-3">
                    <User className="h-8 w-8 text-purple-600" />
                    <div>
                      <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">{(stats as any).newGPs}</p>
                      <p className="text-xs text-purple-600 dark:text-purple-500">New GPs</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
            {activeTab === "attitude" && "positive" in stats && (
              <>
                <Card className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
                  <CardContent className="py-3 flex items-center gap-3">
                    <ThumbsUp className="h-8 w-8 text-emerald-600" />
                    <div>
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{(stats as any).positive}</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-500">Positive</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                  <CardContent className="py-3 flex items-center gap-3">
                    <ThumbsDown className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-2xl font-bold text-red-700 dark:text-red-400">{(stats as any).negative}</p>
                      <p className="text-xs text-red-600 dark:text-red-500">Negative</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
            {activeTab === "errors" && "critical" in stats && (
              <>
                <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                  <CardContent className="py-3 flex items-center gap-3">
                    <AlertCircle className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-2xl font-bold text-red-700 dark:text-red-400">{(stats as any).critical}</p>
                      <p className="text-xs text-red-600 dark:text-red-500">Critical</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
                  <CardContent className="py-3 flex items-center gap-3">
                    <AlertTriangle className="h-8 w-8 text-orange-600" />
                    <div>
                      <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{(stats as any).high}</p>
                      <p className="text-xs text-orange-600 dark:text-orange-500">High</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
          {/* Upload Area */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {getTabIcon()}
                      Upload {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Screenshots
                    </CardTitle>
                    <CardDescription>
                      Drag, drop, paste, or click to add screenshots
                    </CardDescription>
                  </div>
                  {files.length > 0 && (
                    <Button variant="outline" size="sm" onClick={clearAll}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Clear All
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* GP Selector for Attitude and Errors tabs */}
                {(activeTab === "attitude" || activeTab === "errors") && (
                  <div className="mb-4">
                    <Label htmlFor="gp-select" className="text-sm font-medium mb-2 block">
                      Select Game Presenter <span className="text-destructive">*</span>
                    </Label>
                    <select
                      id="gp-select"
                      value={selectedGpId || ""}
                      onChange={(e) => setSelectedGpId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full p-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="">-- Select a Game Presenter --</option>
                      {gpList?.map((gp) => (
                        <option key={gp.id} value={gp.id}>
                          {gp.name}
                        </option>
                      ))}
                    </select>
                    {selectedGpId && (
                      <div className="mt-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-700 dark:text-green-400">
                            Uploading for: {gpList?.find(gp => gp.id === selectedGpId)?.name || 'Unknown'}
                          </span>
                        </div>
                      </div>
                    )}
                    {!selectedGpId && (
                      <p className="text-sm text-amber-600 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Please select a GP before uploading screenshots
                      </p>
                    )}
                  </div>
                )}

                {/* Drop Zone */}
                <div
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all ${
                    isDragging
                      ? "border-primary bg-primary/10 scale-[1.02]"
                      : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                  }`}
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
                  <div className="cursor-pointer flex flex-col items-center gap-3">
                    <div className={`p-4 rounded-full transition-colors ${isDragging ? "bg-primary/20" : "bg-primary/10"}`}>
                      <UploadIcon className={`h-10 w-10 transition-colors ${isDragging ? "text-primary" : "text-primary/70"}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">
                        {isDragging ? "Drop files here!" : "Drop screenshots or click to upload"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        PNG, JPG, WEBP • Multiple files • Paste with Ctrl+V
                      </p>
                    </div>
                  </div>
                </div>

                {/* Files List */}
                {files.length > 0 && (
                  <div className="mt-6 space-y-4">
                    {/* Stats Bar */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex gap-3 text-sm">
                        <span className="text-muted-foreground font-medium">
                          {files.length} file{files.length !== 1 ? "s" : ""}
                        </span>
                        {stats.uploading > 0 && (
                          <span className="text-blue-600 flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {stats.uploading} processing
                          </span>
                        )}
                        {stats.success > 0 && (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            {stats.success} done
                          </span>
                        )}
                        {stats.error > 0 && (
                          <span className="text-red-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {stats.error} failed
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {stats.error > 0 && (
                          <Button variant="outline" size="sm" onClick={retryFailed}>
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Retry Failed
                          </Button>
                        )}
                        {stats.success > 0 && (
                          <Button variant="outline" size="sm" onClick={clearCompleted}>
                            Clear Done
                          </Button>
                        )}
                        {!autoProcess && stats.pending > 0 && (
                          <Button
                            onClick={processFiles}
                            disabled={isProcessing}
                            size="sm"
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
                      <div className="space-y-1">
                        <Progress value={overallProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground text-center">
                          Processing... {Math.round(overallProgress)}%
                        </p>
                      </div>
                    )}

                    {/* File Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className={`relative group border rounded-lg overflow-hidden bg-card cursor-pointer transition-all ${
                            selectedFile?.id === file.id ? "ring-2 ring-primary shadow-lg" : "hover:border-primary/50 hover:shadow-md"
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
                                  ? "bg-black/60"
                                  : file.status === "success"
                                  ? "bg-green-500/20"
                                  : file.status === "error"
                                  ? "bg-red-500/30"
                                  : "bg-black/20"
                              }`}
                            >
                              {file.status === "uploading" && (
                                <div className="text-center">
                                  <Loader2 className="h-8 w-8 text-white animate-spin mx-auto" />
                                  <p className="text-white text-xs mt-1">{file.progress}%</p>
                                </div>
                              )}
                              {file.status === "success" && (
                                <CheckCircle className="h-10 w-10 text-green-500 drop-shadow-lg" />
                              )}
                              {file.status === "error" && (
                                <div className="text-center p-2">
                                  <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="mt-2 h-7 text-xs"
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
                                <div className="p-2 bg-black/50 rounded-full">
                                  <UploadIcon className="h-6 w-6 text-white/80" />
                                </div>
                              )}
                            </div>
                            {/* Progress Bar for uploading */}
                            {file.status === "uploading" && (
                              <div className="absolute bottom-0 left-0 right-0">
                                <Progress value={file.progress} className="h-1 rounded-none" />
                              </div>
                            )}
                          </div>
                          {/* File Info */}
                          <div className="p-2 space-y-1">
                            <p className="text-xs truncate font-medium">
                              {file.extractedData?.presenterName || file.attitudeData?.gpName || file.errorData?.presenterName || file.file.name}
                            </p>
                            {activeTab === "attitude" && file.attitudeData && (
                              <Badge variant={file.attitudeData.totalNegative > file.attitudeData.totalPositive ? "destructive" : "default"} className="text-[10px] h-5">
                                {file.attitudeData.totalEntries} entries
                              </Badge>
                            )}
                            {activeTab === "errors" && file.errorData && (
                              <Badge 
                                variant="outline" 
                                className={`text-[10px] h-5 ${
                                  file.errorData.severity === "critical" ? "bg-red-100 text-red-700 border-red-300" :
                                  file.errorData.severity === "high" ? "bg-orange-100 text-orange-700 border-orange-300" :
                                  file.errorData.severity === "medium" ? "bg-yellow-100 text-yellow-700 border-yellow-300" :
                                  "bg-green-100 text-green-700 border-green-300"
                                }`}
                              >
                                {file.errorData.severity}
                              </Badge>
                            )}
                            {file.matchInfo?.isNewGP && (
                              <Badge variant="outline" className="text-[10px] h-5 bg-green-50 text-green-700 border-green-200">
                                New GP
                              </Badge>
                            )}
                            {file.processingTime && file.status === "success" && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span className="text-[10px]">{(file.processingTime / 1000).toFixed(1)}s</span>
                              </div>
                            )}
                            {file.error && (
                              <p className="text-[10px] text-red-500 truncate">{file.error}</p>
                            )}
                          </div>
                          {/* Remove Button */}
                          {(file.status === "pending" || file.status === "error") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(file.id);
                              }}
                              className="absolute top-1 right-1 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Details Panel */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">Extracted Data</CardTitle>
                <CardDescription>
                  {selectedFile ? `Viewing: ${selectedFile.extractedData?.presenterName || selectedFile.attitudeData?.gpName || selectedFile.errorData?.presenterName || 'Unknown'}` : "Click a processed file to view details"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedFile?.status === "success" ? (
                  <div className="space-y-4">
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
                            <p className="font-medium">{selectedFile.extractedData.presenterName}</p>
                            {selectedFile.matchInfo && !selectedFile.matchInfo.isExactMatch && !selectedFile.matchInfo.isNewGP && (
                              <div className="mt-1 p-2 bg-blue-50 dark:bg-blue-950 rounded-md">
                                <div className="flex items-center gap-2 text-sm">
                                  <Link2 className="h-4 w-4 text-blue-500" />
                                  <span className="text-blue-700 dark:text-blue-300">
                                    Matched to: <strong>{selectedFile.matchInfo.matchedName}</strong>
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <Progress value={selectedFile.matchInfo.similarity} className="h-1.5 flex-1" />
                                  <span className="text-xs text-blue-600">{selectedFile.matchInfo.similarity}%</span>
                                </div>
                              </div>
                            )}
                            {selectedFile.matchInfo?.isNewGP && (
                              <Badge className="mt-1 bg-green-100 text-green-800 hover:bg-green-100">
                                New GP Created
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Date & Game */}
                        <div className="grid grid-cols-2 gap-4">
                          {selectedFile.extractedData.date && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                <span>Date</span>
                              </div>
                              <p className="pl-6 text-sm">{selectedFile.extractedData.date}</p>
                            </div>
                          )}
                          {selectedFile.extractedData.game && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Gamepad2 className="h-4 w-4" />
                                <span>Game</span>
                              </div>
                              <p className="pl-6 text-sm">{selectedFile.extractedData.game}</p>
                            </div>
                          )}
                        </div>

                        {/* Total Score */}
                        {selectedFile.extractedData.totalScore !== undefined && (
                          <div className="p-3 bg-primary/5 rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Total Score</span>
                              <div className="flex items-center gap-1">
                                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                                <span className="text-2xl font-bold">{selectedFile.extractedData.totalScore}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Scores Breakdown */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Scores Breakdown</p>
                          <div className="space-y-2">
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
                                <div key={key} className="space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <span>{label}</span>
                                    <span className="font-medium">{data.score}/{data.maxScore}</span>
                                  </div>
                                  <Progress 
                                    value={percentage} 
                                    className={`h-1.5 ${percentage >= 80 ? "[&>div]:bg-green-500" : percentage >= 60 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"}`}
                                  />
                                  {data.comment && (
                                    <p className="text-xs text-muted-foreground italic pl-2 border-l-2 border-muted">
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
                          <p className="pl-6 font-medium">{selectedFile.attitudeData.gpName || 'Unknown'}</p>
                        </div>

                        {/* Summary Stats */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="p-2 rounded-lg bg-muted/50 text-center">
                            <p className="text-lg font-bold">{selectedFile.attitudeData.totalEntries}</p>
                            <p className="text-xs text-muted-foreground">Total</p>
                          </div>
                          <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950 text-center">
                            <p className="text-lg font-bold text-green-600">{selectedFile.attitudeData.totalPositive}</p>
                            <p className="text-xs text-muted-foreground">Positive</p>
                          </div>
                          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950 text-center">
                            <p className="text-lg font-bold text-red-600">{selectedFile.attitudeData.totalNegative}</p>
                            <p className="text-xs text-muted-foreground">Negative</p>
                          </div>
                        </div>

                        {/* Entries List */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Entries ({selectedFile.attitudeData.entries?.length || 0})</p>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {selectedFile.attitudeData.entries?.map((entry, idx) => (
                              <div key={idx} className="p-3 rounded-lg bg-muted/50 border-l-2 border-l-transparent" style={{ borderLeftColor: entry.type === 'POSITIVE' ? '#22c55e' : '#ef4444' }}>
                                <div className="flex items-center justify-between mb-1">
                                  <Badge 
                                    variant={entry.type === "POSITIVE" ? "default" : "destructive"}
                                    className="text-xs"
                                  >
                                    {entry.type === "POSITIVE" ? (
                                      <><ThumbsUp className="h-3 w-3 mr-1" /> POSITIVE</>
                                    ) : (
                                      <><ThumbsDown className="h-3 w-3 mr-1" /> NEGATIVE</>
                                    )}
                                  </Badge>
                                  <span className={`font-bold ${entry.score > 0 ? "text-green-600" : "text-red-600"}`}>
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

                    {/* Error Details */}
                    {activeTab === "errors" && selectedFile.errorData && (
                      <>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>Game Presenter</span>
                          </div>
                          <p className="pl-6 font-medium">{selectedFile.errorData.presenterName}</p>
                        </div>

                        {selectedFile.errorData.date && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span>Date</span>
                            </div>
                            <p className="pl-6 text-sm">{selectedFile.errorData.date}</p>
                          </div>
                        )}

                        <div className="p-4 rounded-lg bg-muted/50">
                          <div className="flex items-center justify-between mb-3">
                            <Badge 
                              variant="outline"
                              className={`text-sm ${
                                selectedFile.errorData.severity === "critical" ? "bg-red-100 text-red-700 border-red-300" :
                                selectedFile.errorData.severity === "high" ? "bg-orange-100 text-orange-700 border-orange-300" :
                                selectedFile.errorData.severity === "medium" ? "bg-yellow-100 text-yellow-700 border-yellow-300" :
                                "bg-green-100 text-green-700 border-green-300"
                              }`}
                            >
                              {selectedFile.errorData.severity.toUpperCase()}
                            </Badge>
                            <span className="text-sm font-medium text-muted-foreground">
                              {selectedFile.errorData.errorType}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MessageSquare className="h-4 w-4" />
                              <span>Description</span>
                            </div>
                            <p className="text-sm pl-6">{selectedFile.errorData.description}</p>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Processing Time */}
                    {selectedFile.processingTime && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-slate-50 dark:bg-slate-900 p-2 rounded">
                        <Clock className="h-4 w-4" />
                        <span>Processed in {(selectedFile.processingTime / 1000).toFixed(1)}s</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">
                      Upload and process screenshots to see extracted data
                    </p>
                    <p className="text-xs mt-2 text-muted-foreground/70">
                      Tip: Press Ctrl+V to paste from clipboard
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
