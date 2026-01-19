import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  Keyboard
} from "lucide-react";

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
  matchInfo?: MatchInfo;
  error?: string;
  progress?: number;
  processingTime?: number;
}

// Image compression utility
async function compressImage(file: File, maxWidth: number = 1920, quality: number = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      let { width, height } = img;
      
      // Only resize if image is larger than maxWidth
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

export default function UploadPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<FileWithPreview | null>(null);
  const [autoProcess, setAutoProcess] = useState(true);
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const startTimeRef = useRef<number>(0);

  const uploadMutation = trpc.evaluation.uploadAndExtract.useMutation();

  // Generate unique ID for each file
  const generateId = () => Math.random().toString(36).substring(2, 9);

  // Statistics
  const stats = useMemo(() => {
    const successFiles = files.filter(f => f.status === "success");
    const avgTime = successFiles.length > 0 
      ? successFiles.reduce((sum, f) => sum + (f.processingTime || 0), 0) / successFiles.length 
      : 0;
    const avgScore = successFiles.length > 0
      ? successFiles.reduce((sum, f) => sum + (f.extractedData?.totalScore || 0), 0) / successFiles.length
      : 0;
    return {
      total: files.length,
      success: successFiles.length,
      pending: files.filter(f => f.status === "pending").length,
      uploading: files.filter(f => f.status === "uploading").length,
      error: files.filter(f => f.status === "error").length,
      avgTime: avgTime / 1000, // Convert to seconds
      avgScore,
      newGPs: successFiles.filter(f => f.matchInfo?.isNewGP).length,
    };
  }, [files]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+V is handled separately
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

  // Handle paste from clipboard (Ctrl+V)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            // Create a new file with a proper name
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
      // Reset input so same file can be selected again
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

    // Process files in parallel (up to 3 at a time for speed)
    const batchSize = 3;
    for (let i = 0; i < pendingFiles.length; i += batchSize) {
      const batch = pendingFiles.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (pendingFile) => {
        const fileId = pendingFile.id;
        const fileStartTime = Date.now();
        
        // Set uploading status
        setFiles((prev) => prev.map(f => 
          f.id === fileId ? { ...f, status: "uploading" as const, progress: 10 } : f
        ));

        try {
          // Compress image for faster upload
          setFiles((prev) => prev.map(f => 
            f.id === fileId ? { ...f, progress: 20 } : f
          ));
          
          const base64 = await compressImage(pendingFile.file, 1920, 0.85);
          
          // Upload and extract
          setFiles((prev) => prev.map(f => 
            f.id === fileId ? { ...f, progress: 40 } : f
          ));
          
          const result = await uploadMutation.mutateAsync({
            imageBase64: base64,
            filename: pendingFile.file.name,
            mimeType: 'image/jpeg', // After compression it's always JPEG
          });

          setFiles((prev) => prev.map(f => 
            f.id === fileId ? { ...f, progress: 90 } : f
          ));

          // Determine match info
          const extractedName = result.extractedData.presenterName;
          const matchedName = result.gamePresenter.name;
          const isExactMatch = extractedName.toLowerCase().trim() === matchedName.toLowerCase().trim();
          const isNewGP = !result.gamePresenter.createdAt || 
            (new Date().getTime() - new Date(result.gamePresenter.createdAt).getTime()) < 5000;
          const similarity = isExactMatch ? 100 : calculateDisplaySimilarity(extractedName, matchedName);

          const processingTime = Date.now() - fileStartTime;

          setFiles((prev) => prev.map(f => 
            f.id === fileId ? {
              ...f,
              status: "success" as const,
              progress: 100,
              extractedData: result.extractedData,
              processingTime,
              matchInfo: {
                matchedName,
                similarity,
                isExactMatch,
                isNewGP,
              },
            } : f
          ));

          // Show appropriate toast
          if (isNewGP) {
            toast.success(`✨ New GP: ${matchedName}`, { duration: 2000 });
          } else if (!isExactMatch) {
            toast.success(`🔗 Matched: ${extractedName} → ${matchedName}`, { duration: 2000 });
          }
        } catch (error: any) {
          setFiles((prev) => prev.map(f => 
            f.id === fileId ? {
              ...f,
              status: "error" as const,
              progress: 0,
              error: error.message || "Failed to process",
            } : f
          ));
          toast.error(`Failed: ${pendingFile.file.name.substring(0, 20)}...`);
        }

        processed++;
        setOverallProgress((processed / total) * 100);
      }));
    }

    processingRef.current = false;
    setIsProcessing(false);
    
    const totalTime = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
    const successCount = files.filter(f => f.status === "success").length + processed;
    if (processed > 0) {
      toast.success(`✅ Processed ${processed} screenshot${processed > 1 ? 's' : ''} in ${totalTime}s`, { 
        duration: 3000,
        description: `Average: ${(Number(totalTime) / processed).toFixed(1)}s per file`
      });
    }
  };

  const calculateDisplaySimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2) return 100;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 100;
    
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) matches++;
    }
    
    return Math.round((matches / longer.length) * 100);
  };

  const clearCompleted = () => {
    setFiles((prev) => {
      prev.filter(f => f.status === "success").forEach(f => URL.revokeObjectURL(f.preview));
      return prev.filter((f) => f.status !== "success");
    });
    setSelectedFile(null);
  };

  const clearAll = () => {
    files.forEach(f => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setSelectedFile(null);
  };

  const retryFailed = () => {
    setFiles((prev) => prev.map(f => 
      f.status === "error" ? { ...f, status: "pending" as const, error: undefined, progress: 0 } : f
    ));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Upload Evaluations</h1>
          <p className="text-muted-foreground">
            Upload screenshots for automatic AI-powered data extraction
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-process"
              checked={autoProcess}
              onCheckedChange={setAutoProcess}
            />
            <Label htmlFor="auto-process" className="text-sm cursor-pointer">
              <Zap className="h-4 w-4 inline mr-1 text-yellow-500" />
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
            Shortcuts
          </Button>
        </div>
      </div>

      {/* Keyboard Shortcuts Panel */}
      {showKeyboardHints && (
        <Card className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">Keyboard Shortcuts:</span>
                <div className="flex items-center gap-4">
                  <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border rounded text-xs">Ctrl+V</kbd> Paste</span>
                  <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border rounded text-xs">Ctrl+O</kbd> Open files</span>
                  <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border rounded text-xs">Esc</kbd> Deselect</span>
                  <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border rounded text-xs">Del</kbd> Remove selected</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowKeyboardHints(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Tips */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Clipboard className="h-5 w-5 text-blue-500 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-700 dark:text-blue-300">Quick Upload Tips</p>
            <ul className="mt-1 text-blue-600 dark:text-blue-400 space-y-1">
              <li>• <strong>Paste</strong>: Press <kbd className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs">Ctrl+V</kbd> to paste screenshots directly from clipboard</li>
              <li>• <strong>Drag & Drop</strong>: Drop multiple files at once for batch processing</li>
              <li>• <strong>Auto-process</strong>: Enable to automatically extract data as files are added</li>
              <li>• <strong>Optimized</strong>: Images are compressed automatically for faster uploads</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Processing Stats Summary */}
      {stats.success > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <CardContent className="py-3 flex items-center gap-3">
              <FileCheck className="h-8 w-8 text-green-600" />
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
          <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
            <CardContent className="py-3 flex items-center gap-3">
              <Star className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.avgScore.toFixed(1)}</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">Avg. Score</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
            <CardContent className="py-3 flex items-center gap-3">
              <User className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">{stats.newGPs}</p>
                <p className="text-xs text-purple-600 dark:text-purple-500">New GPs</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Area */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Upload Screenshots
                  </CardTitle>
                  <CardDescription>
                    Drag, drop, paste, or click to add evaluation screenshots
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
                            {file.extractedData?.presenterName || file.file.name}
                          </p>
                          {file.matchInfo && !file.matchInfo.isExactMatch && !file.matchInfo.isNewGP && (
                            <div className="flex items-center gap-1">
                              <Link2 className="h-3 w-3 text-blue-500 flex-shrink-0" />
                              <span className="text-xs text-blue-600 truncate">
                                → {file.matchInfo.matchedName}
                              </span>
                            </div>
                          )}
                          {file.matchInfo?.isNewGP && (
                            <Badge variant="outline" className="text-[10px] h-5 bg-green-50 text-green-700 border-green-200">
                              New GP
                            </Badge>
                          )}
                          {file.extractedData?.totalScore !== undefined && (
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                              <span className="text-xs font-medium">{file.extractedData.totalScore}</span>
                            </div>
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
                {selectedFile ? `Viewing: ${selectedFile.extractedData?.presenterName}` : "Click a processed file to view details"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedFile?.extractedData ? (
                <div className="space-y-4">
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

                  {/* Processing Time */}
                  {selectedFile.processingTime && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-slate-50 dark:bg-slate-900 p-2 rounded">
                      <Clock className="h-4 w-4" />
                      <span>Processed in {(selectedFile.processingTime / 1000).toFixed(1)}s</span>
                    </div>
                  )}

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
    </div>
  );
}
